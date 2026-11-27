/*
 * Prove del processo principale dell'app desktop, senza avviare Electron: il codice vero di src/desktop/ viene
 * compilato sostituendo Electron con un simulacro, poi si chiamano i canali del ponte come farebbe la finestra.
 * Controllano le garanzie che contano: le chiavi API non tornano mai alla pagina e su disco sono solo cifrate, dalla
 * finestra non parte nessuna richiesta di rete, si raggiungono solo i tre servizi di lettura, si risponde solo alla pagina dell'app, gli archivi si salvano interi.
 * La prova con Electron vero è test/desktop.js. Si eseguono con: npm run test:costruzione
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHIAVE = 'sk-' + 'ant-chiave-di-prova-non-valida', CHIAVE_GOOGLE = 'AIza' + 'chiave-di-prova-non-valida', CHIAVE_OPENAI = 'sk-' + 'proj-chiave-di-prova-non-valida';
const SENZA = { present: false, hint: '', stored: false, canEncrypt: true };
const lavoro = fs.mkdtempSync(path.join(os.tmpdir(), 'ordine-rapido-principale-'));
const dati = path.join(lavoro, 'dati');
fs.mkdirSync(dati);

/* Il simulacro di Electron: solo le parti che il processo principale usa, con lo stato leggibile dalle prove. */
const SIMULACRO = `
const { pathToFileURL } = require('node:url');
const S = globalThis.__electronFinto = { canali: new Map(), ascolti: new Map(), sessioni: new Map(), aperti: [], cifratura: true, backend: 'dpapi', richieste: [], rete: null, finestre: [] };
const cornice = { url: '' };
const contenuto = { mainFrame: cornice, setWindowOpenHandler(fn) { S.nuovaFinestra = fn; }, on(nome, fn) { S['contenuto:' + nome] = fn; } };
S.contenuto = contenuto; S.cornice = cornice;
class BrowserWindow {
  constructor(opzioni) { this.opzioni = opzioni; this.webContents = contenuto; S.finestre.push(this); }
  once() {} on() {} show() {} focus() {} restore() {} isMinimized() { return false; }
  loadFile(file) { cornice.url = pathToFileURL(file).href; return Promise.resolve(); }
  static getAllWindows() { return S.finestre; }
}
function sessione(nome) {
  if (!S.sessioni.has(nome)) S.sessioni.set(nome, { nome,
    webRequest: { onBeforeRequest(filtro, fn) { this.filtro = filtro; this.regola = fn; } },
    setPermissionRequestHandler(fn) { this.permessi = fn; },
    fetch(url, init) { S.richieste.push({ sessione: nome, url, init }); return S.rete(url, init); } });
  return S.sessioni.get(nome);
}
module.exports = {
  app: { requestSingleInstanceLock: () => true, on() {}, quit() {}, whenReady: () => Promise.resolve(), getPath: () => process.env.ORDINE_RAPIDO_PROVA_DATI },
  BrowserWindow,
  ipcMain: { handle(canale, fn) { S.canali.set(canale, fn); }, on(canale, fn) { S.ascolti.set(canale, fn); } },
  Menu: { buildFromTemplate: voci => voci, setApplicationMenu(menu) { S.menu = menu; } },
  session: { get defaultSession() { return sessione('finestra'); }, fromPartition: sessione },
  shell: { openExternal(u) { S.aperti.push(u); return Promise.resolve(); } },
  safeStorage: {
    isEncryptionAvailable: () => S.cifratura,
    getSelectedStorageBackend: () => S.backend,
    encryptString: s => Buffer.from('CIFRATO' + Buffer.from(s, 'utf8').toString('hex')),
    decryptString: b => { const t = b.toString(); if (!t.startsWith('CIFRATO')) throw new Error('non decifrabile'); return Buffer.from(t.slice(7), 'hex').toString('utf8'); }
  }
};`;

/* Compila un file di src/desktop/ mettendo il simulacro al posto di Electron. */
async function compila(sorgente, uscita) {
  const esbuild = require('esbuild');
  const simulacro = path.join(lavoro, 'electron-finto.cjs');
  fs.writeFileSync(simulacro, SIMULACRO);
  await esbuild.build({ entryPoints: [path.join(ROOT, sorgente)], outfile: path.join(lavoro, uscita), bundle: true, platform: 'node', format: 'cjs', alias: { electron: simulacro }, logLevel: 'silent' });
  return require(path.join(lavoro, uscita));
}

const risposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
/* I tre servizi, simulati: ognuno accetta solo la sua chiave di prova. */
function rete(url, init) {
  const u = new URL(url);
  if (u.hostname === 'generativelanguage.googleapis.com') {
    if (init.headers['x-goog-api-key'] !== CHIAVE_GOOGLE) return Promise.resolve(risposta(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }));
    if (u.pathname === '/v1beta/models') return Promise.resolve(risposta(200, { models: [{ name: 'models/gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-embedding-2', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] }] }));
    if (u.pathname.endsWith(':generateContent')) return Promise.resolve(risposta(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"righe":[{"descrizione":"G"}]}' }] } }] }));
  }
  if (u.hostname === 'api.openai.com') {
    if (init.headers.authorization !== 'Bearer ' + CHIAVE_OPENAI) return Promise.resolve(risposta(401, { error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' } }));
    if (u.pathname === '/v1/models') return Promise.resolve(risposta(200, { data: [{ id: 'gpt-6.2-sol' }, { id: 'gpt-6-image' }, { id: 'gpt-6.1-terra' }] }));
    if (u.pathname === '/v1/responses') return Promise.resolve(risposta(200, { status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: '{"righe":[{"descrizione":"O"}]}' }] }] }));
  }
  if (u.hostname !== 'api.anthropic.com' || init.headers.authorization !== 'Bearer ' + CHIAVE) return Promise.resolve(risposta(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
  if (u.pathname === '/v1/models') return Promise.resolve(risposta(200, { data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', lifecycle: 'active' }, { id: 'claude-vecchio-1', display_name: 'Vecchio', lifecycle: 'deprecated' }] }));
  if (u.pathname === '/v1/messages') return Promise.resolve(risposta(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Ecco:\n```json\n{"righe":[]}\n```' }] }));
  return Promise.resolve(risposta(404, {}));
}

let E, pagina, chiama;
test.before(async () => {
  process.env.ORDINE_RAPIDO_PROVA_DATI = dati;
  await compila('src/desktop/main.ts', 'main.cjs');
  await new Promise(fatto => setImmediate(fatto));
  E = globalThis.__electronFinto;
  E.rete = rete;
  pagina = { sender: E.contenuto, senderFrame: E.cornice };
  chiama = (canale, ...argomenti) => E.canali.get(canale)(pagina, ...argomenti);
});
test.after(() => { fs.rmSync(lavoro, { recursive: true, force: true }); });

test('finestra: isolata dalla pagina, con il solo ponte', () => {
  assert.equal(E.finestre.length, 1);
  const p = E.finestre[0].opzioni.webPreferences;
  assert.deepEqual([p.contextIsolation, p.nodeIntegration, p.sandbox, p.webviewTag], [true, false, true, false]);
  assert.equal(path.basename(p.preload), 'preload.js');
  assert.equal(E.nuovaFinestra({ url: 'https://example.com/' }).action, 'deny');
  E.nuovaFinestra({ url: 'https://github.com/qualcosa' });
  assert.deepEqual(E.aperti, ['https://github.com/qualcosa'], 'nel browser si aprono solo i siti previsti');
  let fermata = false;
  E['contenuto:will-navigate']({ preventDefault() { fermata = true; } }, 'https://example.com/');
  assert.equal(fermata, true, 'la finestra non naviga altrove');
});

test('rete: dalla finestra non parte nulla, dalla sessione dedicata si raggiungono solo i tre servizi', () => {
  const decide = (sessione, url) => { let esito; E.sessioni.get(sessione).webRequest.regola({ url }, r => { esito = r.cancel; }); return esito; };
  assert.deepEqual(E.sessioni.get('finestra').webRequest.filtro.urls.sort(), ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*']);
  assert.equal(decide('finestra', 'https://api.anthropic.com/v1/models'), true, 'nemmeno Anthropic dalla finestra');
  assert.equal(decide('finestra', 'https://example.com/'), true);
  assert.equal(decide('ordine-rapido-anthropic', 'https://api.anthropic.com/v1/messages'), false);
  assert.equal(decide('ordine-rapido-anthropic', 'https://example.com/'), true);
  assert.equal(decide('ordine-rapido-anthropic', 'https://api.anthropic.com.esempio.it/v1/messages'), true, 'un nome che comincia allo stesso modo non basta');
  assert.equal(decide('ordine-rapido-anthropic', 'https://api.openai.com/v1/responses'), false);
  assert.equal(decide('ordine-rapido-anthropic', 'https://generativelanguage.googleapis.com/v1beta/models'), false);
  assert.equal(decide('ordine-rapido-anthropic', 'https://googleapis.com/'), true);
  let concesso;
  E.sessioni.get('finestra').permessi(null, 'media', r => { concesso = r; });
  assert.equal(concesso, false, 'niente fotocamera né microfono');
});

test('ponte: si risponde solo alla pagina dell\'app', async () => {
  const stato = E.canali.get('chiave:stato');
  assert.deepEqual(await stato({ sender: {}, senderFrame: E.cornice }), { ok: false, code: 'forbidden', message: '' });
  assert.equal((await stato({ sender: E.contenuto, senderFrame: { url: E.cornice.url } })).code, 'forbidden', 'una cornice interna non è la pagina');
  const altrove = E.cornice.url;
  E.cornice.url = 'file:///C:/altro/index.html';
  assert.equal((await stato(pagina)).code, 'forbidden', 'un\'altra pagina aperta nella finestra non è l\'app');
  E.cornice.url = altrove;
  assert.equal((await stato(pagina)).ok, true);
});

test('chiave: verificata con Anthropic, mai restituita, su disco solo cifrata', async () => {
  const file = path.join(dati, 'chiave-api.bin');
  assert.deepEqual((await chiama('chiave:stato')).value, { anthropic: SENZA, gemini: SENZA, openai: SENZA });
  assert.equal((await chiama('chiave:verifica', 'anthropic', 'sk-ant-sbagliata', true)).code, 'bad_key');
  assert.equal((await chiama('chiave:verifica', 'anthropic', 'con spazi dentro', true)).code, 'bad_key_format');
  assert.equal((await chiama('chiave:verifica', 'altro', CHIAVE, true)).code, 'api_invalid', 'solo i tre servizi previsti');
  assert.equal((await chiama('chiave:stato')).value.anthropic.present, false, 'una chiave rifiutata non viene tenuta');

  const esito = await chiama('chiave:verifica', 'anthropic', '  ' + CHIAVE + '  ', true);
  assert.deepEqual(esito.value.models, [['claude-sonnet-5-5', 'Claude Sonnet 5.5']], 'solo i modelli attivi');
  assert.deepEqual(esito.value.state.anthropic, { present: true, hint: CHIAVE.slice(-4), stored: true, canEncrypt: true });
  assert.deepEqual(esito.value.state.gemini, SENZA, 'ogni servizio ha la sua chiave');
  assert.ok(!JSON.stringify(esito).includes(CHIAVE), 'la chiave non torna alla pagina');
  assert.ok(fs.existsSync(file) && !fs.readFileSync(file).includes(CHIAVE), 'su disco la chiave è cifrata');

  const richiesta = E.richieste.filter(r => r.url.endsWith('/v1/models?limit=100')).pop();
  assert.equal(richiesta.sessione, 'ordine-rapido-anthropic');
  assert.equal(richiesta.init.headers.authorization, 'Bearer ' + CHIAVE);
  assert.equal(richiesta.init.headers['anthropic-version'], '2026-10-21');
  assert.ok(!('anthropic-dangerous-direct-browser-access' in richiesta.init.headers), 'dal processo principale non serve l\'intestazione per le pagine');
  assert.deepEqual([richiesta.init.credentials, richiesta.init.cache], ['omit', 'no-store']);

  assert.deepEqual((await chiama('chiave:ricorda', false)).value.anthropic, { present: true, hint: CHIAVE.slice(-4), stored: false, canEncrypt: true });
  assert.ok(!fs.existsSync(file), 'se non va ricordata il file sparisce, ma la chiave resta valida fino alla chiusura');
  assert.equal((await chiama('chiave:ricorda', true)).value.anthropic.stored, true);
  assert.equal((await chiama('chiave:verifica', 'anthropic', '', true)).ok, true, 'con il campo vuoto si riprova la chiave già salvata');
});

test('chiavi di Google e OpenAI: verificate con il loro servizio, elenco dei modelli adatti, file separati e cifrati', async () => {
  assert.equal((await chiama('chiave:verifica', 'gemini', 'AIzasbagliata', true)).code, 'bad_key', 'Google risponde 400 a una chiave sbagliata: vale come chiave non valida');
  const g = await chiama('chiave:verifica', 'gemini', CHIAVE_GOOGLE, true);
  assert.deepEqual(g.value.models, [['gemini-4-hydrogen', 'Gemini 4 Hydrogen']], 'solo i modelli che generano testo');
  const rg = E.richieste.filter(r => r.url.indexOf('generativelanguage') >= 0).pop();
  assert.equal(rg.init.headers['x-goog-api-key'], CHIAVE_GOOGLE);
  assert.ok(!rg.url.includes(CHIAVE_GOOGLE), 'la chiave di Google non va nell\'indirizzo');
  assert.equal((await chiama('chiave:verifica', 'openai', 'sk-sbagliata', true)).code, 'bad_key');
  const o = await chiama('chiave:verifica', 'openai', CHIAVE_OPENAI, true);
  assert.deepEqual(o.value.models, [['gpt-6.2-sol', 'GPT-6.2 Sol'], ['gpt-6.1-terra', 'GPT-6.1 Terra']], 'senza i modelli che non leggono documenti, i consigliati per primi');
  assert.deepEqual([o.value.state.anthropic.present, o.value.state.gemini.present, o.value.state.openai.present], [true, true, true]);
  for (const [f, k] of [['chiave-gemini.bin', CHIAVE_GOOGLE], ['chiave-openai.bin', CHIAVE_OPENAI]]) assert.ok(fs.existsSync(path.join(dati, f)) && !fs.readFileSync(path.join(dati, f)).includes(k), f + ' cifrato');
  assert.ok(!JSON.stringify([g, o]).includes(CHIAVE_GOOGLE) && !JSON.stringify([g, o]).includes(CHIAVE_OPENAI), 'le chiavi non tornano alla pagina');

  assert.deepEqual(await chiama('lettura:chiedi', 'g1', 'gemini', 'gemini-4-hydrogen', 'Trascrivi in JSON', [{ media_type: 'image/jpeg', data: 'QUJD' }]), { ok: true, value: { righe: [{ descrizione: 'G' }] } });
  const cg = JSON.parse(E.richieste.filter(r => r.url.endsWith(':generateContent')).pop().init.body);
  assert.equal(cg.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(cg.contents[0].parts.map(x => Object.keys(x)[0]), ['inline_data', 'text']);
  assert.deepEqual(await chiama('lettura:chiedi', 'o1', 'openai', 'gpt-6.2-sol', 'Trascrivi in JSON', [{ media_type: 'image/jpeg', data: 'QUJD' }]), { ok: true, value: { righe: [{ descrizione: 'O' }] } });
  const co = JSON.parse(E.richieste.filter(r => r.url.endsWith('/v1/responses')).pop().init.body);
  assert.deepEqual([co.model, co.store, co.text.format.type], ['gpt-6.2-sol', false, 'json_object']);
  assert.deepEqual(co.input[0].content.map(x => x.type), ['input_text', 'input_image']);
  assert.ok(co.input[0].content[1].image_url.startsWith('data:image/jpeg;base64,'));

  await chiama('chiave:rimuovi', 'gemini');
  assert.deepEqual([fs.existsSync(path.join(dati, 'chiave-gemini.bin')), (await chiama('chiave:stato')).value.openai.present], [false, true], 'si toglie solo la chiave scelta');
  await chiama('chiave:rimuovi', 'openai');
});

test('chiave: senza portachiavi non viene scritta; alla riapertura si rilegge quella cifrata', async () => {
  const { KeyVault } = await compila('src/desktop/chiave.ts', 'chiave.cjs');
  const a = 'anthropic';
  /* questa compilazione porta con sé un simulacro proprio: è quello che la cassaforte interroga */
  const F = globalThis.__electronFinto;
  const dir = path.join(lavoro, 'cassaforte'), file = path.join(dir, 'chiave-api.bin');
  const prima = new KeyVault(dir);
  prima.set(a, CHIAVE, true);
  assert.equal(prima.states().anthropic.stored, true);
  const dopo = new KeyVault(dir);
  dopo.load();
  assert.equal(dopo.get(a), CHIAVE, 'alla riapertura la chiave salvata si ritrova');

  fs.writeFileSync(file, 'file rovinato');
  const rovinata = new KeyVault(dir);
  rovinata.load();
  assert.deepEqual([rovinata.get(a), fs.existsSync(file)], ['', false], 'un file che non si decifra viene tolto');

  for (const [cifratura, backend] of [[false, 'dpapi'], [true, 'basic_text']]) {
    F.cifratura = cifratura; F.backend = backend;
    const piattaforma = Object.getOwnPropertyDescriptor(process, 'platform');
    if (backend === 'basic_text') Object.defineProperty(process, 'platform', { value: 'linux' });
    try {
      const v = new KeyVault(dir);
      v.set(a, CHIAVE, true);
      const s = v.states().anthropic;
      assert.deepEqual([s.present, s.stored, s.canEncrypt, fs.existsSync(file)], [true, false, false, false], 'senza cifratura vera la chiave vale solo fino alla chiusura');
    } finally { Object.defineProperty(process, 'platform', piattaforma); }
  }
});

test('lettura: la richiesta parte dal processo principale con la chiave custodita, e si può fermare', async () => {
  const immagini = [{ media_type: 'image/jpeg', data: 'QUJD' }, { media_type: 'text/html', data: 'no' }, 'non valida'];
  const esito = await chiama('lettura:chiedi', 'l1', 'anthropic', 'claude-sonnet-5-5', 'Trascrivi', immagini);
  assert.deepEqual(esito, { ok: true, value: { righe: [] } });
  const corpo = JSON.parse(E.richieste.filter(r => r.url.endsWith('/v1/messages')).pop().init.body);
  assert.equal(corpo.model, 'claude-sonnet-5-5');
  assert.deepEqual(corpo.messages[0].content.map(b => b.type), ['image', 'text'], 'passano solo le immagini valide');
  assert.equal((await chiama('lettura:chiedi', 'l2', 'anthropic', 'modello con spazi', 'x', [])).code, 'api_invalid');
  assert.equal((await chiama('lettura:chiedi', 'l2b', 'sconosciuto', 'claude-sonnet-5-5', 'x', [])).code, 'api_invalid');

  E.rete = (url, init) => new Promise((_, rifiuta) => { init.signal.addEventListener('abort', () => rifiuta(new Error('interrotta'))); });
  const inCorso = chiama('lettura:chiedi', 'l3', 'anthropic', 'claude-sonnet-5-5', 'x', []);
  await new Promise(fatto => setImmediate(fatto));
  E.ascolti.get('lettura:ferma')({ sender: {}, senderFrame: E.cornice }, 'l3');
  E.ascolti.get('lettura:ferma')(pagina, 'l3');
  assert.equal((await inCorso).code, 'cancelled');
  E.rete = () => Promise.reject(new Error('rete assente'));
  assert.equal((await chiama('lettura:chiedi', 'l4', 'anthropic', 'claude-sonnet-5-5', 'x', [])).code, 'offline');
  E.rete = rete;

  await chiama('chiave:rimuovi', 'anthropic');
  assert.equal((await chiama('lettura:chiedi', 'l5', 'anthropic', 'claude-sonnet-5-5', 'x', [])).code, 'no_key');
  assert.ok(!fs.existsSync(path.join(dati, 'chiave-api.bin')), 'la chiave rimossa sparisce anche dal disco');
});

test('archivi: salvati interi su file, riletti uguali, richieste malformate rifiutate', async () => {
  assert.deepEqual((await chiama('archivi:leggi')).value, { art: null, cli: null, man: null, alias: null });
  const righe = ['300101\tPASSATA DI POMODORO\t2000003001019\tPZ\tCONSERVE FANTASIA S.P.A.\t0,85', 'AB12\tBURRO "PANETTO"\t\tPZ\tLATTERIA VALFINTA S.P.A.\t'];
  assert.deepEqual(await chiama('archivi:salva', 'art', { rows: righe, at: '2026-11-27' }), { ok: true, value: null });
  assert.equal((await chiama('archivi:salva-abbinamenti', ['d|x|PASSATA\t300101'])).ok, true);
  const letti = (await chiama('archivi:leggi')).value;
  assert.deepEqual(letti, { art: { rows: righe, at: '2026-11-27' }, cli: null, man: null, alias: ['d|x|PASSATA\t300101'] });
  const file = path.join(dati, 'archivi', 'art.json');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).formato, 'ordine-rapido-archivio-locale');
  assert.deepEqual(fs.readdirSync(path.join(dati, 'archivi')).sort(), ['abbinamenti.json', 'art.json'], 'non restano file provvisori');

  assert.equal((await chiama('archivi:salva', '../fuori', { rows: [], at: '' })).ok, false, 'il tipo di archivio non può diventare un percorso');
  assert.equal((await chiama('archivi:salva', 'cli', { rows: [1, 2], at: '' })).ok, false);
  assert.equal((await chiama('archivi:salva', 'cli', null)).ok, false);
  assert.equal((await chiama('archivi:salva-abbinamenti', 'non un elenco')).ok, false);
  assert.ok(!fs.existsSync(path.join(dati, 'archivi', 'cli.json')), 'una richiesta rifiutata non scrive nulla');

  /* più salvataggi insieme non si accavallano: resta l'ultimo, intero */
  await Promise.all([1, 2, 3, 4, 5].map(n => chiama('archivi:salva', 'man', { rows: ['M00' + n + '\tMANDANTE ' + n + '\t'], at: '2026-11-2' + n })));
  assert.deepEqual((await chiama('archivi:leggi')).value.man, { rows: ['M005\tMANDANTE 5\t'], at: '2026-11-25' });
  fs.writeFileSync(file, '{ non è JSON');
  assert.equal((await chiama('archivi:leggi')).ok, false, 'un archivio rovinato viene segnalato, non preso per vuoto');
});
