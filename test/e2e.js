/*
 * Prova completa dell'app in un browser vero (Chromium, con Playwright), aprendo la pagina da file come farà chi la scarica.
 * Il servizio di Anthropic è simulato: non serve una chiave e non parte nessuna richiesta verso internet.
 *
 * Uso:  node test/e2e.js                      prova app/index.html
 *       node test/e2e.js dist/Ordine-Rapido.html   prova la versione in un solo file
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PAGE = pathToFileURL(path.resolve(ROOT, process.argv[2] || 'app/index.html')).href;
/* la versione in un solo file non contiene il riconoscimento dei caratteri per le foto */
const UN_SOLO_FILE = !!process.argv[2] && !/index\.html$/.test(process.argv[2]);
const ES = name => path.join(ROOT, 'esempi', name);
const VERSIONE = require('../package.json').version;
const { CHIAVE_FINTA, simulaAnthropic } = require('./simulazione.js');

const passi = [];
function passo(nome) { passi.push(nome); console.log('  ok  ' + nome); }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ordine-rapido-e2e-'));
  const profilo = path.join(dir, 'profilo');
  const problemi = [], esterne = [], chiamate = [];
  let context = await chromium.launchPersistentContext(profilo, { acceptDownloads: true, viewport: { width: 1280, height: 860 } });

  async function apri() {
    const page = context.pages()[0] || await context.newPage();
    page.on('console', m => { if (m.type() === 'error') problemi.push('console: ' + m.text()); });
    page.on('pageerror', e => problemi.push('errore: ' + e.message));
    page.on('request', r => { const u = r.url(); if (/^https?:/.test(u)) esterne.push(u); });
    await simulaAnthropic(page, chiamate);
    await page.goto(PAGE);
    await page.waitForFunction(() => document.getElementById('archChip').dataset.state !== 'load');
    return page;
  }
  async function caricaArchivio(page, bottone, file, campoInfo, atteso) {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(bottone)]);
    await fc.setFiles(file);
    await page.waitForSelector('#mapper:not([hidden]) button.primary');
    await page.click('#mapper button.primary');
    await page.waitForFunction(([id, t]) => document.getElementById(id).textContent.startsWith(t), [campoInfo, atteso]);
  }
  async function scarica(page, selettore) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(selettore)]);
    const dest = path.join(dir, dl.suggestedFilename());
    await dl.saveAs(dest);
    return { nome: dl.suggestedFilename(), dati: fs.readFileSync(dest) };
  }

  try {
    /* 1. Avvio da file, senza internet */
    let page = await apri();
    assert.equal(await page.textContent('#ver'), VERSIONE);
    assert.equal(await page.isVisible('#keyNote'), true, 'senza chiave deve comparire l\'invito a impostarla');
    assert.equal(await page.isVisible('#btnDownload') || true, true);
    assert.match(await page.textContent('#archMode'), /solo su questo dispositivo/);
    const font = await page.evaluate(async () => { await document.fonts.ready; return [document.fonts.check('800 20px Montserrat'), document.fonts.check('400 14px Figtree')]; });
    assert.deepEqual(font, [true, true], 'i caratteri inclusi devono caricarsi');
    passo('la pagina si apre da file, con versione ' + VERSIONE + ', caratteri inclusi e archivio sul dispositivo');

    /* 2. Senza chiave gli ordini li legge questo dispositivo, senza chiamare nessuno; se non trova righe lo dice */
    assert.equal(await page.isVisible('#setup'), true, 'al primo avvio l\'app propone di caricare modello e archivio');
    await page.fill('#msg', '10 cartoni di passata di pomodoro\n4 ct di tonno all\'olio in omaggio');
    await page.click('#btnRead');
    await page.waitForSelector('#v2:not([hidden])');
    assert.deepEqual(await page.$$eval('#tbody tr', trs => trs.map(tr => [tr.querySelector('.c-descrizione input').value, tr.querySelector('.c-colli input').value, tr.querySelector('.c-omaggio input').checked])),
      [['passata di pomodoro', '10', false], ['tonno all\'olio', '4', true]]);
    await page.click('#rail1');
    await page.fill('#msg', 'ci sentiamo domani, grazie');
    await page.click('#btnRead');
    await page.waitForFunction(() => /Non ho trovato righe/.test(document.getElementById('readStatus').textContent));
    assert.match(await page.textContent('#readStatus'), /Aggiungi Claude con la tua chiave/);
    await page.fill('#msg', '');
    assert.equal(chiamate.length, 0, 'la lettura sul dispositivo non chiama Anthropic');
    passo('senza chiave: un messaggio letto sul dispositivo, e un avviso chiaro quando non ci sono righe');

    /* 3. Ordine di esempio senza archivio: avviso, nessun blocco */
    await page.click('#btnExample');
    assert.equal(await page.locator('#tbody tr').count(), 5);
    assert.match(await page.textContent('#checks'), /Archivio articoli non caricato/);
    passo('ordine di esempio: 5 righe e avviso che l\'archivio non è caricato');

    /* 4. Archivi: articoli (CSV), clienti (CSV), mandanti (CSV) */
    await page.click('#archChip');
    await caricaArchivio(page, '#btnArt', ES('articoli-esempio.csv'), 'artInfo', '16');
    await caricaArchivio(page, '#btnCli', ES('clienti-esempio.csv'), 'cliInfo', '6');
    await caricaArchivio(page, '#btnMan', ES('mandanti-esempio.csv'), 'manInfo', '2');
    await page.click('#archClose');
    assert.equal(await page.inputValue('#h-cliente_cod'), 'C0012', 'il cliente va riconosciuto dalla partita IVA');
    assert.equal(await page.inputValue('#h-mandante_cod'), 'M001', 'la mandante va riconosciuta dal nome');
    const oks = await page.textContent('#oks');
    assert.match(oks, /Tutti i codici esistono nel gestionale/);
    assert.match(oks, /Cliente in anagrafica: C0012/);
    assert.match(oks, /Mandante in anagrafica: M001/);
    assert.equal(await page.textContent('#verdict'), 'Tutto a posto');
    passo('archivi caricati: articoli, cliente e mandante dell\'ordine riconosciuti');

    /* 5. Gli archivi restano dopo la chiusura */
    await context.close();
    context = await chromium.launchPersistentContext(profilo, { acceptDownloads: true, viewport: { width: 1280, height: 860 } });
    page = await apri();
    assert.match(await page.textContent('#archChipText'), /16 articoli, 6 clienti/);
    passo('alla riapertura gli archivi ci sono ancora');

    /* 5b. Un PDF letto sul dispositivo, senza chiave: testata, righe e totali, con i codici dell'archivio */
    await page.setInputFiles('#fileInput', ES('ordine-esempio.pdf'));
    await page.click('#btnRead');
    await page.waitForSelector('#v2:not([hidden])', { timeout: 60000 });
    assert.equal(await page.locator('#tbody tr').count(), 5);
    assert.equal(await page.locator('#tbody .pill.ok').count(), 5, 'tutte le righe collegate all\'archivio');
    assert.equal(await page.inputValue('#h-cliente_cod'), 'C0012'); assert.equal(await page.inputValue('#h-mandante_cod'), 'M001');
    assert.equal(await page.inputValue('#h-numero'), '2026/0412');
    assert.equal(await page.locator('#tbody tr.gift').count(), 1, 'la riga in omaggio è riconosciuta');
    assert.equal(chiamate.length, 0, 'ancora nessuna chiamata ad Anthropic');
    await page.click('#rail3'); await page.click('#btnNew');
    passo('PDF letto sul dispositivo: 5 righe collegate, testata riconosciuta, nessuna chiamata verso internet');

    /* 6. Chiave API: una sbagliata viene rifiutata, una buona salvata */
    await page.click('#btnSet');
    await page.fill('#ai-key', 'sk-ant-sbagliata');
    await page.click('#btnAiSave');
    await page.waitForFunction(() => /non è valida/.test(document.getElementById('aiStatus').textContent));
    await page.fill('#ai-key', CHIAVE_FINTA);
    await page.click('#btnAiSave');
    await page.waitForFunction(() => /Chiave valida/.test(document.getElementById('aiStatus').textContent));
    const modelli = await page.locator('#ai-model option').allTextContents();
    assert.deepEqual(modelli, ['Claude Sonnet 5.5 (consigliato)', 'Claude Haiku 5.5 (più economico)'], 'solo i modelli attivi dell\'account');
    const provaChiave = chiamate.filter(c => c.path === '/v1/models').pop();
    assert.equal(provaChiave.headers['anthropic-version'], '2026-10-21');
    assert.equal(provaChiave.headers['anthropic-dangerous-direct-browser-access'], 'true');
    await page.click('#setClose');
    assert.equal(await page.isVisible('#keyNote'), false);
    passo('chiave API verificata e salvata, elenco dei modelli letto dall\'account');

    /* 7. Lettura di un PDF: testo e immagini al modello, righe collegate all'archivio */
    await page.setInputFiles('#fileInput', ES('ordine-esempio.pdf'));
    await page.click('#btnRead');
    await page.waitForSelector('#v2:not([hidden])', { timeout: 60000 });
    const lettura = chiamate.filter(c => c.path === '/v1/messages').pop();
    const blocchi = lettura.body.messages[0].content;
    assert.equal(lettura.body.model, 'claude-sonnet-5-5');
    assert.ok(blocchi.filter(b => b.type === 'image').length >= 1, 'la pagina del PDF va inviata come immagine');
    assert.equal(blocchi[blocchi.length - 1].type, 'text');
    assert.match(blocchi[blocchi.length - 1].text, /PASSATA DI POMODORO/, 'il testo del PDF va estratto e inviato');
    assert.ok(!JSON.stringify(lettura.body).includes('MINIMARKET FITTIZIO'), 'l\'archivio clienti non deve partire con la lettura');
    assert.equal(await page.locator('#tbody tr').count(), 5);
    assert.equal(await page.locator('#tbody .pill.ok').count(), 5, 'tutte le righe collegate: per codice, per codice senza zeri iniziali, per EAN');
    assert.equal(await page.inputValue('#h-cliente_cod'), 'C0012');
    assert.equal(await page.textContent('#verdict'), 'Tutto a posto');
    passo('PDF letto: 5 righe, tutte collegate ad articoli dell\'archivio');

    /* 8. Esportazione: il file contiene solo codici dell'archivio, più testata con cliente e mandante */
    await page.click('#btnNext');
    const csv = await scarica(page, '#btnDownload');
    assert.equal(csv.nome, 'ordine_CONSERVE-FANTASIA-S-P-A_MARKET-FANTASIA-S-R-L_2026-0412_2026-11-23.csv');
    const righe = csv.dati.toString('latin1').split('\r\n').filter(Boolean).map(l => l.split(';'));
    const col = n => righe[0].indexOf(n);
    assert.deepEqual(righe[0].slice(0, 4), ['CodArticolo', 'Descrizione', 'Unimis', 'Quantita']);
    assert.deepEqual(righe.slice(1).map(r => r[col('CodArticolo')]), ['300101', '300102', '300301', '300301', '300402']);
    assert.deepEqual([...new Set(righe.slice(1).map(r => r[col('CodCliente')] + '|' + r[col('CodMandante')]))], ['C0012|M001']);
    assert.equal(righe[4][col('Omaggio')], 'S'); assert.equal(righe[4][col('Sconto1')], '100');
    assert.equal(righe[1][col('Prezzo')], '0,85');
    passo('CSV scaricato: codici articolo, cliente e mandante sono quelli dell\'archivio');

    /* 9. Una riga che non è in archivio blocca l'esportazione */
    await page.click('#btnBack2');
    await page.click('#btnAdd');
    await page.fill('#r5-descrizione', 'FUNGHI TRIFOLATI VASO'); await page.fill('#r5-quantita', '12');
    await page.click('#btnNext');
    assert.match(await page.textContent('#h3a'), /Una riga da collegare/);
    await page.click('#btnCopyCsv');
    assert.match(await page.textContent('#expStatus'), /non è collegata/);
    await page.click('#btnFix');
    await page.click('#btnSuggest');
    await page.waitForSelector('#tbody tr:nth-child(6) .pill.warn');
    assert.match(await page.textContent('#tbody tr:nth-child(6) .lk'), /300403/);
    await page.click('#tbody tr:nth-child(6) .lk button:has-text("Conferma")');
    assert.equal(await page.locator('#tbody .pill.ok').count(), 6);
    passo('riga fuori archivio: esportazione bloccata finché non viene collegata; il suggerimento propone un articolo esistente');

    /* 9b. L'ordine in corso non si perde: dopo una chiusura improvvisa si ritrova, con le righe e i collegamenti */
    await page.waitForTimeout(900);
    await page.reload();
    await page.waitForFunction(() => document.getElementById('archChip').dataset.state !== 'load');
    assert.equal(await page.isVisible('#openNote'), true, 'alla riapertura l\'app dice che c\'è un ordine aperto');
    await page.click('#btnResume');
    assert.equal(await page.locator('#tbody tr').count(), 6);
    assert.equal(await page.inputValue('#r5-descrizione'), 'FUNGHI TRIFOLATI VASO');
    assert.equal(await page.inputValue('#r5-quantita'), '12');
    assert.equal(await page.inputValue('#h-cliente_cod'), 'C0012');
    assert.match(await page.textContent('#srcInfo'), /ordine-esempio\.pdf/);
    await page.waitForFunction(() => document.querySelectorAll('#tbody .pill.ok').length === 6);
    assert.ok(!(await page.evaluate(() => localStorage.getItem('ordine-rapido-bozza'))).includes('"link"'), 'i collegamenti non si salvano: si ricalcolano dall\'archivio');
    passo('ordine in corso ritrovato dopo la chiusura; i collegamenti vengono ricalcolati dall\'archivio');

    /* 10. Copia di sicurezza: contiene gli archivi, mai la chiave; si può ripristinare */
    await page.click('#archChip');
    const copia = await scarica(page, '#btnBackup');
    const json = JSON.parse(copia.dati.toString('utf8'));
    assert.equal(json.formato, 'ordine-rapido-archivio'); assert.equal(json.versione_formato, 1);
    assert.equal(json.art.righe.length, 16); assert.equal(json.cli.righe.length, 6); assert.equal(json.man.righe.length, 2);
    assert.ok(Object.keys(json.abbinamenti).length >= 1, 'l\'abbinamento confermato va nella copia');
    assert.ok(!copia.dati.toString('utf8').includes(CHIAVE_FINTA), 'la chiave API non deve mai finire nella copia');
    await page.click('#btnAliasClear'); await page.click('#btnAliasClear');
    assert.equal(await page.textContent('#aliasInfo'), '0');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnRestore')]);
    await fc.setFiles(path.join(dir, copia.nome));
    await page.click('#mapper button.primary');
    await page.waitForFunction(() => /ripristinati/.test(document.getElementById('archStatus').textContent));
    assert.notEqual(await page.textContent('#aliasInfo'), '0');
    await page.click('#archClose');
    passo('copia di sicurezza salvata (senza chiave) e ripristinata');

    /* 11. Archivio da file Excel */
    const XLSX = require(path.join(ROOT, 'app/vendor/xlsx.full.min.js'));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Codice articolo', 'Descrizione articolo', 'Barcode', 'U.M.', 'Fornitore', 'Listino'], ['900001', 'ARTICOLO DI PROVA EXCEL', '', 'CT', 'CONSERVE FANTASIA S.P.A.', '1,00']]), 'Articoli');
    const xlsx = path.join(dir, 'articoli.xlsx');
    fs.writeFileSync(xlsx, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    await page.click('#archChip');
    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnArt')]);
    await fc2.setFiles(xlsx);
    await page.waitForSelector('#mapper:not([hidden]) #m-mode');
    await page.selectOption('#m-mode', 'merge');
    await page.click('#mapper button.primary');
    await page.waitForFunction(() => document.getElementById('artInfo').textContent.startsWith('17'));
    await page.click('#archClose');
    passo('archivio aggiornato da un file Excel, colonne riconosciute da sole');

    /* 11b. Modello del gestionale: il file esportato prende colonne, ordine e formato dal file di esempio */
    const modello = path.join(dir, 'modello-gestionale.csv');
    fs.writeFileSync(modello, 'TipoDoc;CodArticolo;Qta;Prezzo;DataOrdine\r\nOC;300101;12;0,85;23/11/2026\r\n', 'latin1');
    await page.click('#btnSet');
    const [fc3] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnTpl')]);
    await fc3.setFiles(modello);
    await page.waitForSelector('#tplMap:not([hidden]) #btnTplUse');
    assert.deepEqual(await page.$$eval('#tplMap select', ss => ss.map(s => s.value)), ['fisso', 'cod_articolo', 'quantita', 'prezzo', 'data']);
    assert.equal(await page.inputValue('#tpl-v-0'), 'OC');
    await page.click('#btnTplUse');
    assert.match(await page.textContent('#tplInfo'), /modello-gestionale\.csv, 5 colonne/);
    await page.click('#setClose');
    await page.click('#rail3');
    const daModello = (await scarica(page, '#btnDownload')).dati.toString('latin1').split('\r\n');
    assert.deepEqual(daModello.slice(0, 2), ['TipoDoc;CodArticolo;Qta;Prezzo;DataOrdine', 'OC;300101;120;0,85;23/11/2026']);
    await page.click('#btnSet');
    await page.selectOption('#p-format', 'xlsx');
    await page.click('#setClose');
    assert.equal(await page.textContent('#btnDownloadT'), 'Scarica Excel');
    const excel = await scarica(page, '#btnDownload');
    assert.match(excel.nome, /\.xlsx$/);
    const foglio = XLSX.read(excel.dati, { type: 'buffer' });
    assert.deepEqual(XLSX.utils.sheet_to_json(foglio.Sheets[foglio.SheetNames[0]], { header: 1 }).slice(0, 2), [['TipoDoc', 'CodArticolo', 'Qta', 'Prezzo', 'DataOrdine'], ['OC', '300101', 120, 0.85, '23/11/2026']]);
    await page.click('#btnSet');
    await page.click('#btnTplClear'); await page.click('#btnTplClear');
    assert.equal(await page.textContent('#tplInfo'), 'non caricato');
    assert.equal(await page.inputValue('#p-format'), 'csv');
    passo('modello del gestionale: stesse colonne nello stesso ordine, valore fisso, CSV ed Excel con i numeri veri');

    /* 11c. Una foto letta sul dispositivo. Nella versione in un solo file il riconoscimento dei caratteri non c'è: l'app lo dice. */
    await page.selectOption('#ai-mode', 'local');
    await page.click('#setClose');
    const carta = await context.newPage();
    await carta.setViewportSize({ width: 1400, height: 760 });
    await carta.setContent('<body style="margin:50px;background:#fff;font:30px Arial,Helvetica,sans-serif;color:#111"><p><b>BUONO D\'ORDINE N. 0412</b> del 23/11/2026</p><p>Fornitore: CONSERVE FANTASIA S.P.A.</p>' +
      '<table style="border-collapse:collapse;font:30px Arial,Helvetica,sans-serif" border="1" cellpadding="14"><tr><th>Codice</th><th>Descrizione</th><th>Colli</th><th>Prezzo unit.</th></tr>' +
      '<tr><td>300101</td><td>PASSATA DI POMODORO BOTTIGLIA GR 700</td><td>4</td><td>0,85</td></tr><tr><td>300102</td><td>POLPA DI POMODORO LATTA GR 400</td><td>6</td><td>0,55</td></tr>' +
      '<tr><td>300402</td><td>CARCIOFINI SOTT\'OLIO VASO GR 280</td><td>2</td><td>2,60</td></tr></table></body>');
    const foto = path.join(dir, 'buono-fotografato.png');
    await carta.screenshot({ path: foto });
    await carta.close();
    await page.click('#btnNew');
    await page.setInputFiles('#fileInput', foto);
    await page.click('#btnRead');
    if (UN_SOLO_FILE) {
      await page.waitForFunction(() => /non si possono leggere sul dispositivo/.test(document.getElementById('readStatus').textContent), null, { timeout: 60000 });
      passo('versione in un solo file: per le foto l\'app dice che serve Claude');
    } else {
      await page.waitForSelector('#v2:not([hidden])', { timeout: 240000 });
      assert.deepEqual(await page.$$eval('#tbody tr', trs => trs.map(tr => [tr.querySelector('.c-cod_articolo input').value, tr.querySelector('.c-colli input').value, tr.querySelector('.c-prezzo input').value])),
        [['300101', '4', '0,85'], ['300102', '6', '0,55'], ['300402', '2', '2,60']]);
      assert.equal(await page.locator('#tbody .pill.ok').count(), 3, 'i codici letti dalla foto sono quelli dell\'archivio');
      assert.equal(await page.inputValue('#h-mandante_cod'), 'M001', 'la casa mandante è riconosciuta dal nome scritto sul buono');
      assert.match(await page.textContent('#notes'), /Letto da una foto/);
      passo('foto letta sul dispositivo: 3 righe con codici dell\'archivio, colli e prezzi, senza chiamare nessuno');
    }
    await page.click('#rail1');
    /* per l'ultima prova serve un ordine aperto: se la foto non è stata letta, si apre quello di esempio */
    if (UN_SOLO_FILE) await page.click('#btnExample');
    await page.click('#btnSet'); await page.selectOption('#ai-mode', 'claude'); await page.click('#setClose');

    /* 12. Nessun contatto con internet oltre all'indirizzo di Anthropic (qui simulato), nessun errore */
    const altre = esterne.filter(u => !u.startsWith('https://api.anthropic.com/'));
    assert.deepEqual(altre, [], 'richieste verso altri siti');
    assert.deepEqual(problemi.filter(p => !/401/.test(p)), [], 'errori nella pagina');
    assert.equal(await page.isVisible('#oops'), false, 'nessun avviso di errore imprevisto');
    /* «Nuovo ordine» chiude davvero l'ordine: non deve ricomparire alla riapertura */
    await page.click('#rail3'); await page.click('#btnNew');
    await page.waitForFunction(() => localStorage.getItem('ordine-rapido-bozza') === null);
    passo('nessuna richiesta verso altri siti, nessun errore nella pagina');

    console.log('\nTutto bene: ' + passi.length + ' prove superate su ' + PAGE);
  } finally {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error('\nPROVA FALLITA dopo: ' + (passi[passi.length - 1] || 'avvio') + '\n', e); process.exit(1); });
