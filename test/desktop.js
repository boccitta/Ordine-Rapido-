/*
 * Prova dell'app desktop: la avvia davvero (Electron guidato da Playwright) e controlla che funzioni da sola.
 * Uso:  node test/desktop.js                                    prova il codice della repository (dopo "npm run compila")
 *       node test/desktop.js dist/linux-unpacked/ordine-rapido    prova l'app impacchettata
 * Su Linux senza schermo va messo davanti: xvfb-run -a
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

const ROOT = path.join(__dirname, '..');
const ES = name => path.join(ROOT, 'esempi', name);
const VERSIONE = require('../package.json').version;
const { CHIAVE_FINTA, simulaAnthropicDesktop, chiamateDesktop } = require('./simulazione.js');

(async () => {
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), 'ordine-rapido-desktop-'));
  const fileChiave = path.join(dati, 'chiave-api.bin');
  /* Senza argomenti prova il codice della repository; con il percorso di un eseguibile prova l'app già impacchettata. */
  const impacchettata = process.argv[2] ? path.resolve(process.argv[2]) : '';
  if (!impacchettata && !fs.existsSync(path.join(ROOT, 'desktop', 'main.js'))) throw new Error('manca desktop/main.js: esegui prima "npm run compila"');
  const avvia = () => electron.launch(impacchettata
    ? { executablePath: impacchettata, args: ['--no-sandbox', '--user-data-dir=' + dati] }
    : { executablePath: require(path.join(ROOT, 'node_modules', 'electron')), args: [ROOT, '--no-sandbox', '--user-data-dir=' + dati] });
  const pronta = async app => {
    const page = await app.firstWindow();
    await page.waitForFunction(() => document.getElementById('archChip') && document.getElementById('archChip').dataset.state !== 'load');
    return page;
  };
  let app = await avvia();
  try {
    let page = await pronta(app);
    const errori = [];
    page.on('pageerror', e => errori.push(e.message));
    assert.equal(await page.title(), 'Ordine Rapido');
    assert.equal(await page.textContent('#ver'), VERSIONE);
    assert.match(await page.textContent('#archMode'), /solo su questo dispositivo, nella cartella dati dell'app/);
    assert.equal(await page.evaluate(() => typeof window.require + '/' + typeof window.process), 'undefined/undefined', 'la pagina non ha accesso a Node');
    console.log('  ok  la finestra si apre e mostra la versione ' + VERSIONE);

    await page.click('#archChip');
    for (const [bottone, file, info, atteso] of [['#btnArt', 'articoli-esempio.csv', 'artInfo', '16'], ['#btnCli', 'clienti-esempio.csv', 'cliInfo', '6'], ['#btnMan', 'mandanti-esempio.csv', 'manInfo', '2']]) {
      const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(bottone)]);
      await fc.setFiles(ES(file));
      await page.click('#mapper button.primary');
      await page.waitForFunction(([id, t]) => document.getElementById(id).textContent.startsWith(t), [info, atteso]);
    }
    /* un file Excel fa caricare la libreria inclusa nella cartella vendor */
    const XLSX = require(path.join(ROOT, 'app/vendor/xlsx.full.min.js'));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Codice', 'Ragione sociale', 'Partita IVA'], ['C0099', 'CLIENTE DI PROVA EXCEL S.R.L.', '']]), 'Clienti');
    const xlsx = path.join(dati, 'clienti.xlsx');
    fs.writeFileSync(xlsx, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btnCli')]);
    await fc.setFiles(xlsx);
    await page.selectOption('#m-mode', 'merge');
    await page.click('#mapper button.primary');
    await page.waitForFunction(() => document.getElementById('cliInfo').textContent.startsWith('7'));
    await page.waitForFunction(() => /in archivio/.test(document.getElementById('archStatus').textContent));
    await page.click('#archClose');
    await page.click('#btnExample');
    assert.equal(await page.textContent('#verdict'), 'Tutto a posto');
    assert.equal(await page.inputValue('#h-mandante_cod'), 'M001');
    /* gli archivi sono file nella cartella dati dell'app, scritti dal processo principale */
    const suDisco = JSON.parse(fs.readFileSync(path.join(dati, 'archivi', 'cli.json'), 'utf8'));
    assert.equal(suDisco.formato, 'ordine-rapido-archivio-locale'); assert.equal(suDisco.rows.length, 7);
    assert.ok(fs.existsSync(path.join(dati, 'archivi', 'art.json')) && fs.existsSync(path.join(dati, 'archivi', 'man.json')));
    console.log('  ok  archivi caricati da CSV ed Excel, salvati su file, ordine di esempio riconosciuto');

    /* chiave API: passa al processo principale e non torna più nella pagina; su disco, se c'è, è cifrata */
    await simulaAnthropicDesktop(app);
    await page.click('#btnSet');
    await page.fill('#ai-key', 'sk-ant-sbagliata');
    await page.click('#btnAiSave');
    await page.waitForFunction(() => /non è valida/.test(document.getElementById('aiStatus').textContent));
    await page.fill('#ai-key', CHIAVE_FINTA);
    await page.click('#btnAiSave');
    await page.waitForFunction(() => /Chiave valida/.test(document.getElementById('aiStatus').textContent));
    assert.equal(await page.inputValue('#ai-key'), '', 'la chiave non resta nel campo');
    assert.match(await page.getAttribute('#ai-key', 'placeholder'), /Chiave salvata \(termina con /);
    const memoria = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
    assert.ok(!memoria.includes(CHIAVE_FINTA), 'la chiave non deve restare nella memoria della pagina');
    const cifrata = fs.existsSync(fileChiave);
    if (cifrata) assert.ok(!fs.readFileSync(fileChiave).includes(CHIAVE_FINTA), 'su disco la chiave deve essere cifrata');
    assert.match(await page.textContent('#aiStatus'), cifrata ? /cifrata dal sistema/ : /non offre un portachiavi/);
    for (const f of fs.readdirSync(dati, { recursive: true, withFileTypes: true }))
      if (f.isFile() && fs.statSync(path.join(f.parentPath, f.name)).size < 5e6)
        assert.ok(!fs.readFileSync(path.join(f.parentPath, f.name)).includes(CHIAVE_FINTA), 'chiave in chiaro in ' + f.name);
    const modelli = await page.locator('#ai-model option').allTextContents();
    assert.deepEqual(modelli, ['Claude Sonnet 5.5 (consigliato)', 'Claude Haiku 5.5 (più economico)']);
    await page.click('#setClose');
    console.log('  ok  chiave API verificata dal processo principale, ' + (cifrata ? 'salvata cifrata' : 'non scritta su disco perché manca un portachiavi') + ', mai in chiaro');

    /* lettura di un PDF con il servizio simulato: la libreria per i PDF viaggia con l'app, la richiesta parte dal processo principale */
    await page.click('#rail1');
    await page.setInputFiles('#fileInput', ES('ordine-esempio.pdf'));
    await page.click('#btnRead');
    await page.waitForSelector('#v2:not([hidden])', { timeout: 60000 });
    assert.equal(await page.locator('#tbody .pill.ok').count(), 5);
    const chiamate = await chiamateDesktop(app);
    const lettura = chiamate.filter(c => c.path === '/v1/messages').pop();
    assert.ok(lettura.body.messages[0].content.some(b => b.type === 'image'), 'la pagina del PDF va inviata come immagine');
    assert.equal(lettura.body.model, 'claude-sonnet-5-5');
    assert.equal(lettura.headers['anthropic-version'], '2026-10-21');
    assert.ok(!JSON.stringify(lettura.body).includes('MINIMARKET FITTIZIO'), 'l\'archivio clienti non deve partire con la lettura');
    assert.deepEqual([...new Set(chiamate.map(c => c.host))], ['api.anthropic.com']);
    console.log('  ok  PDF letto e righe collegate all\'archivio');

    /* «Scarica CSV»: nell'app desktop apre la finestra «Salva con nome»; qui il file viene salvato senza chiedere */
    const csv = path.join(dati, 'ordine-di-prova.csv');
    const salvato = app.evaluate(({ session }, destinazione) => new Promise(fatto => {
      session.defaultSession.once('will-download', (evento, file) => {
        file.setSavePath(destinazione);
        file.once('done', (e, stato) => fatto(stato));
      });
    }), csv);
    await page.click('#btnNext');
    await page.click('#btnDownload');
    assert.equal(await salvato, 'completed');
    const righe = fs.readFileSync(csv, 'latin1').split('\r\n').filter(Boolean);
    assert.equal(righe.length, 6);
    assert.ok(righe[1].startsWith('300101;PASSATA DI POMODORO BOTTIGLIA GR 700;PZ;120;10;0,85;5;'));
    console.log('  ok  CSV salvato su disco con i codici dell\'archivio');

    /* dalla finestra non esce nulla: né una richiesta di rete, nemmeno verso Anthropic, né una nuova finestra */
    const bloccate = await page.evaluate(() => Promise.all(['https://example.com/', 'https://api.anthropic.com/v1/models']
      .map(u => fetch(u).then(() => false, () => true))));
    assert.deepEqual(bloccate, [true, true]);
    await page.evaluate(() => { window.open('https://example.com/'); });
    assert.equal(app.windows().length, 1);
    console.log('  ok  nessuna richiesta di rete e nessuna finestra partono dalla pagina');

    await app.close();
    app = await avvia();
    page = await pronta(app);
    assert.match(await page.textContent('#archChipText'), /16 articoli, 7 clienti/);
    /* la chiave cifrata si ritrova alla riapertura; senza portachiavi va inserita di nuovo */
    await page.waitForFunction(attesa => document.getElementById('keyNote').hidden === attesa, cifrata);
    assert.deepEqual(errori, []);
    console.log('  ok  alla riapertura gli archivi ci sono ancora' + (cifrata ? ', e anche la chiave' : ''));
    console.log('\nApp desktop: tutto bene.');
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(dati, { recursive: true, force: true });
  }
})().catch(e => { console.error('\nPROVA DELL\'APP DESKTOP FALLITA\n', e); process.exit(1); });
