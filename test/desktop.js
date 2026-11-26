/*
 * Prova dell'app desktop: la avvia davvero (Electron guidato da Playwright) e controlla che funzioni da sola.
 * Uso:  node test/desktop.js                                    prova il codice della repository
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
const { CHIAVE_FINTA, simulaAnthropic } = require('./simulazione.js');

(async () => {
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), 'ordine-rapido-desktop-'));
  /* Senza argomenti prova il codice della repository; con il percorso di un eseguibile prova l'app già impacchettata. */
  const impacchettata = process.argv[2] ? path.resolve(process.argv[2]) : '';
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
    assert.match(await page.textContent('#archMode'), /solo su questo dispositivo/);
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
    await page.click('#archClose');
    await page.click('#btnExample');
    assert.equal(await page.textContent('#verdict'), 'Tutto a posto');
    assert.equal(await page.inputValue('#h-mandante_cod'), 'M001');
    console.log('  ok  archivi caricati da CSV ed Excel, ordine di esempio riconosciuto');

    /* lettura di un PDF con il servizio simulato: la libreria per i PDF viaggia con l'app */
    const chiamate = [];
    await simulaAnthropic(page, chiamate);
    await page.click('#btnSet');
    await page.fill('#ai-key', CHIAVE_FINTA);
    await page.click('#btnAiSave');
    await page.waitForFunction(() => /Chiave valida/.test(document.getElementById('aiStatus').textContent));
    await page.click('#setClose');
    await page.click('#rail1');
    await page.setInputFiles('#fileInput', ES('ordine-esempio.pdf'));
    await page.click('#btnRead');
    await page.waitForSelector('#v2:not([hidden])', { timeout: 60000 });
    assert.equal(await page.locator('#tbody .pill.ok').count(), 5);
    assert.ok(chiamate.some(c => c.path === '/v1/messages' && c.body.messages[0].content.some(b => b.type === 'image')));
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

    /* nessun collegamento verso l'esterno: né una richiesta di rete né una nuova finestra */
    const bloccata = await page.evaluate(() => fetch('https://example.com/').then(() => false, () => true));
    assert.equal(bloccata, true);
    await page.evaluate(() => { window.open('https://example.com/'); });
    assert.equal(app.windows().length, 1);
    console.log('  ok  nessuna richiesta e nessuna finestra verso altri siti');

    await app.close();
    app = await avvia();
    page = await pronta(app);
    assert.match(await page.textContent('#archChipText'), /16 articoli, 7 clienti/);
    assert.deepEqual(errori, []);
    console.log('  ok  alla riapertura gli archivi ci sono ancora');
    console.log('\nApp desktop: tutto bene.');
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(dati, { recursive: true, force: true });
  }
})().catch(e => { console.error('\nPROVA DELL\'APP DESKTOP FALLITA\n', e); process.exit(1); });
