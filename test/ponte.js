/*
 * Prova dell'interfaccia in «modalità desktop» dentro un browser vero (Chromium, con Playwright), senza Electron:
 * al posto del processo principale c'è un ponte simulato che rispetta il contratto di src/desktop/contratto.ts.
 * Controlla che la pagina usi solo il ponte per chiave, lettura e archivi, e che chi arriva da una versione
 * precedente ritrovi archivi e chiave, spostati al posto giusto.
 * Insieme a test/principale.test.mjs (l'altro lato del ponte) copre l'app desktop dove Electron non si può avviare.
 *
 * Uso:  node test/ponte.js      (dopo "npm run compila")
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PAGE = pathToFileURL(path.join(ROOT, 'app/index.html')).href;
const ES = name => path.join(ROOT, 'esempi', name);
const { CHIAVE_FINTA, ORDINE_LETTO, simulaAnthropic } = require('./simulazione.js');

/* Il ponte simulato: gira nella pagina prima del codice dell'app. Tiene chiavi e archivi come farebbe il processo principale. */
function ponteSimulato({ chiaveGiusta, ordine }) {
  const P = window.__ponte = { chiamate: [], archivi: { art: null, cli: null, man: null, alias: null } };
  const chiavi = { anthropic: '', gemini: '', openai: '' };
  let salvata = false;
  const ok = value => Promise.resolve({ ok: true, value });
  const stati = () => { const o = {}; for (const k in chiavi) o[k] = { present: !!chiavi[k], hint: chiavi[k].slice(-4), stored: salvata && !!chiavi[k], canEncrypt: true }; return o; };
  window.ordineRapido = {
    key: {
      state: () => ok(stati()),
      verify(fornitore, testo, ricorda) {
        const candidata = testo || chiavi[fornitore];
        P.chiamate.push({ canale: 'chiave:verifica', fornitore, conChiave: !!testo, ricorda });
        if (fornitore !== 'anthropic' || candidata !== chiaveGiusta) return Promise.resolve({ ok: false, code: 'bad_key', message: '', status: 401 });
        chiavi[fornitore] = candidata; salvata = !!ricorda;
        return ok({ models: [['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5']], state: stati() });
      },
      remember(ricorda) { salvata = !!ricorda; return ok(stati()); },
      forget(fornitore) { chiavi[fornitore] = ''; return ok(stati()); }
    },
    read: {
      ask(id, fornitore, modello, richiesta, immagini) {
        P.chiamate.push({ canale: 'lettura:chiedi', id, fornitore, modello, inizio: richiesta.slice(0, 30), immagini: immagini.length,
          valide: immagini.every(i => typeof i.data === 'string' && i.data.length > 100 && /^image\//.test(i.media_type)), testo: richiesta });
        if (!chiavi[fornitore]) return Promise.resolve({ ok: false, code: 'no_key', message: '' });
        return ok(/^Abbina ogni riga/.test(richiesta) ? [] : ordine);
      },
      stop(id) { P.chiamate.push({ canale: 'lettura:ferma', id }); }
    },
    archives: {
      load: () => ok(JSON.parse(JSON.stringify(P.archivi))),
      save(tipo, archivio) { P.chiamate.push({ canale: 'archivi:salva', tipo, righe: archivio.rows.length }); P.archivi[tipo] = archivio; return ok(null); },
      saveAlias(righe) { P.archivi.alias = righe; return ok(null); }
    }
  };
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ordine-rapido-ponte-'));
  const problemi = [], esterne = [];
  const context = await chromium.launchPersistentContext(path.join(dir, 'profilo'), { viewport: { width: 1280, height: 860 } });
  const page = context.pages()[0] || await context.newPage();
  page.on('console', m => { if (m.type() === 'error') problemi.push('console: ' + m.text()); });
  page.on('pageerror', e => problemi.push('errore: ' + e.message));
  page.on('request', r => { if (/^https?:/.test(r.url())) esterne.push(r.url()); });
  const apri = async () => {
    await page.goto(PAGE);
    await page.waitForFunction(() => document.getElementById('archChip').dataset.state !== 'load');
  };
  const carica = async (bottone, file, info, atteso) => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(bottone)]);
    await fc.setFiles(ES(file));
    await page.click('#mapper button.primary');
    await page.waitForFunction(([id, t]) => document.getElementById(id).textContent.startsWith(t), [info, atteso]);
    await page.waitForFunction(() => /in archivio/.test(document.getElementById('archStatus').textContent));
  };
  const ponte = () => page.evaluate(() => window.__ponte);

  try {
    /* 1. Una versione precedente: archivi nel database del browser e chiave nella memoria della pagina */
    await simulaAnthropic(page, []);
    await apri();
    await page.click('#archChip');
    await carica('#btnArt', 'articoli-esempio.csv', 'artInfo', '16');
    await page.click('#archClose');
    await page.click('#btnSet');
    await page.fill('#ai-key', CHIAVE_FINTA);
    await page.click('#btnAiSave');
    await page.waitForFunction(() => /Chiave valida/.test(document.getElementById('aiStatus').textContent));
    assert.ok((await page.evaluate(() => localStorage.getItem('ordine-rapido-lettura'))).includes(CHIAVE_FINTA));
    esterne.length = 0;
    console.log('  ok  situazione di partenza: archivi e chiave salvati come in una versione senza ponte');

    /* 2. La stessa cartella dati, ora con il ponte: archivi e chiave passano al processo principale */
    await page.unroute('https://api.anthropic.com/**');
    await context.addInitScript(ponteSimulato, { chiaveGiusta: CHIAVE_FINTA, ordine: ORDINE_LETTO });
    await apri();
    assert.match(await page.textContent('#archMode'), /nella cartella dati dell'app/);
    assert.match(await page.textContent('#archChipText'), /16 articoli/, 'gli archivi della versione precedente si ritrovano');
    await page.waitForFunction(() => window.__ponte.archivi.art && window.__ponte.archivi.art.rows.length === 16);
    await page.waitForFunction(() => document.getElementById('keyNote').hidden);
    let P = await ponte();
    assert.deepEqual(P.chiamate.find(c => c.canale === 'chiave:verifica'), { canale: 'chiave:verifica', fornitore: 'anthropic', conChiave: true, ricorda: true }, 'la chiave trovata nella pagina passa al processo principale');
    assert.ok(!(await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)))).includes(CHIAVE_FINTA), 'e sparisce dalla memoria della pagina');
    console.log('  ok  passaggio dalla versione precedente: archivi riscritti su file, chiave spostata e tolta dalla pagina');

    /* 3. Chiave: una sbagliata è rifiutata; quella salvata non si rivede, se ne mostrano gli ultimi caratteri */
    await page.click('#btnSet');
    assert.equal(await page.inputValue('#ai-key'), '');
    assert.equal(await page.getAttribute('#ai-key', 'placeholder'), 'Chiave salvata (termina con ' + CHIAVE_FINTA.slice(-4) + ')');
    await page.fill('#ai-key', 'sk-ant-sbagliata');
    await page.click('#btnAiSave');
    await page.waitForFunction(() => /non è valida/.test(document.getElementById('aiStatus').textContent));
    await page.fill('#ai-key', CHIAVE_FINTA);
    await page.click('#btnAiSave');
    await page.waitForFunction(() => /cifrata dal sistema/.test(document.getElementById('aiStatus').textContent));
    assert.equal(await page.inputValue('#ai-key'), '');
    await page.click('#btnAiForget');
    await page.waitForFunction(() => /Chiave di Anthropic rimossa/.test(document.getElementById('aiStatus').textContent));
    assert.equal(await page.isVisible('#btnAiForget'), false);
    await page.click('#setClose');
    assert.equal(await page.isVisible('#keyNote'), true, 'senza chiave torna l\'invito a impostarla');
    await page.fill('#msg', 'dieci cartoni di passata');
    await page.click('#btnRead');
    /* senza chiave legge questo dispositivo: qui non ci sono righe, e l'app propone di aggiungere Claude */
    await page.waitForFunction(() => /Non ho trovato righe/.test(document.getElementById('readStatus').textContent));
    assert.match(await page.textContent('#readStatus'), /Aggiungi Claude, Gemini o GPT/);
    await page.fill('#msg', '');
    await page.click('#btnKeyNote');
    await page.fill('#ai-key', CHIAVE_FINTA);
    await page.click('#btnAiSave');
    await page.waitForFunction(() => /Chiave valida/.test(document.getElementById('aiStatus').textContent));
    await page.click('#setClose');
    console.log('  ok  chiave gestita solo attraverso il ponte: mai rimostrata, rimossa e reinserita');

    /* 4. Archivi e lettura passano dal ponte */
    await page.click('#archChip');
    await carica('#btnCli', 'clienti-esempio.csv', 'cliInfo', '6');
    await carica('#btnMan', 'mandanti-esempio.csv', 'manInfo', '2');
    await page.click('#archClose');
    /* qui si prova la lettura con il servizio: in automatico il PDF lo leggerebbe già il dispositivo */
    await page.click('#btnSet'); await page.selectOption('#ai-mode', 'ai'); await page.click('#setClose');
    await page.setInputFiles('#fileInput', ES('ordine-esempio.pdf'));
    await page.click('#btnRead');
    await page.waitForSelector('#v2:not([hidden])', { timeout: 60000 });
    assert.equal(await page.locator('#tbody tr').count(), 5);
    assert.equal(await page.locator('#tbody .pill.ok').count(), 5);
    assert.equal(await page.inputValue('#h-cliente_cod'), 'C0012');
    P = await ponte();
    assert.deepEqual(P.chiamate.filter(c => c.canale === 'archivi:salva').map(c => c.tipo + ':' + c.righe).slice(-2), ['cli:6', 'man:2']);
    const lettura = P.chiamate.filter(c => c.canale === 'lettura:chiedi').pop();
    assert.deepEqual([lettura.fornitore, lettura.modello], ['anthropic', 'claude-sonnet-5-5']);
    assert.ok(lettura.immagini >= 1 && lettura.valide, 'le immagini del PDF arrivano al ponte già codificate');
    assert.match(lettura.testo, /PASSATA DI POMODORO/, 'il testo del PDF va estratto e inviato');
    assert.ok(!lettura.testo.includes('MINIMARKET FITTIZIO'), 'l\'archivio clienti non deve partire con la lettura');
    console.log('  ok  archivi salvati e PDF letto attraverso il ponte, righe collegate all\'archivio');

    /* 5. Dalla pagina non è partita nessuna richiesta di rete: in questa modalità parla solo il processo principale */
    assert.deepEqual(esterne, [], 'richieste di rete partite dalla pagina');
    assert.deepEqual(problemi.filter(p => !/401/.test(p)), [], 'errori nella pagina');
    console.log('  ok  nessuna richiesta di rete dalla pagina, nessun errore');
    console.log('\nInterfaccia con il ponte: tutto bene.');
  } finally {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error('\nPROVA DELL\'INTERFACCIA CON IL PONTE FALLITA\n', e); process.exit(1); });
