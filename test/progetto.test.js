/*
 * Prove sul progetto nel suo insieme: versione allineata, librerie di terzi intatte, dati di esempio davvero finti,
 * pagina che non dipende da internet. Si eseguono con: npm test
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const leggi = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { controlla: controllaVersione } = require('../scripts/versione.js');
const { controlla: controllaDati, pivaValida } = require('../scripts/controlla-dati.js');
const { note } = require('../scripts/note-rilascio.js');
const Core = require('../app/core.js');

test('versione: package.json, app e CHANGELOG dicono la stessa cosa', () => {
  assert.deepEqual(controllaVersione(), []);
  const versione = JSON.parse(leggi('package.json')).version;
  assert.ok((note(versione) || '').length > 200, 'la sezione del CHANGELOG per la versione corrente deve essere descrittiva');
});

test('librerie e caratteri di terzi: presenti e identici a quelli dichiarati in VENDOR.json', () => {
  const elenco = JSON.parse(leggi('app/vendor/VENDOR.json')).file;
  for (const v of elenco) {
    const impronta = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'app/vendor', v.file))).digest('hex');
    assert.equal(impronta, v.sha256, v.file + ' è diverso da quello registrato');
  }
  const presenti = fs.readdirSync(path.join(ROOT, 'app/vendor')).filter(f => f.endsWith('.js'))
    .concat(fs.readdirSync(path.join(ROOT, 'app/vendor/fonts')).map(f => 'fonts/' + f));
  assert.deepEqual(presenti.sort(), elenco.map(v => v.file).sort(), 'ogni file in app/vendor deve essere registrato');
});

test('pagina: nessuna risorsa presa da internet, un solo indirizzo permesso', () => {
  const html = leggi('app/index.html'), css = leggi('app/style.css'), js = leggi('app/app.js') + leggi('app/core.js');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src https:\/\/api\.anthropic\.com(;|$)/);
  assert.ok(!/<(script|link|img)[^>]+(src|href)="https?:/.test(html), 'la pagina non deve caricare nulla da altri siti');
  assert.ok(!/url\(\s*["']?https?:/.test(css), 'lo stile non deve caricare nulla da altri siti');
  const indirizzi = [...new Set((js.match(/https?:\/\/[^\s"'`)]+/g) || []).filter(u => !u.startsWith('http://www.w3.org/')))];
  assert.deepEqual(indirizzi, ['https://api.anthropic.com'], 'il codice può nominare solo l\'indirizzo di Anthropic');
  for (const f of [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1])) assert.ok(fs.existsSync(path.join(ROOT, 'app', f)), 'manca app/' + f);
});

test('dati di esempio: aziende inventate, partite IVA con cifra di controllo sbagliata, file leggibili dall\'app', () => {
  const tabella = f => Core.parseDelimited(leggi('esempi/' + f), ';');
  const art = tabella('articoli-esempio.csv'), cli = tabella('clienti-esempio.csv'), man = tabella('mandanti-esempio.csv');
  assert.equal(Core.guessMap('art', art[0]).found, 6);
  assert.equal(Core.guessMap('cli', cli[0]).found, 3);
  assert.equal(Core.guessMap('man', man[0]).found, 3);
  for (const r of cli.slice(1).concat(man.slice(1))) {
    assert.match(r[2], /^\d{11}$/);
    assert.equal(pivaValida(r[2]), false, r[1] + ': la partita IVA di esempio non deve essere valida');
  }
  for (const r of art.slice(1)) assert.match(r[2], /^20\d{11}$/, 'i codici a barre di esempio usano il prefisso 20, riservato all\'uso interno');
  assert.equal(pivaValida('01234500033'), false, 'la partita IVA dell\'ordine di esempio non deve essere valida');
});

test('controllo dati: la repository è pulita e il controllo riconosce davvero i dati veri', () => {
  assert.deepEqual(controllaDati(), []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ordine-rapido-dati-'));
  /* valori costruiti qui, a pezzi, perché questo stesso file deve superare il controllo */
  const piva = '0000000001', cifra = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find(c => pivaValida(piva + c));
  fs.writeFileSync(path.join(dir, 'note.txt'), 'cliente con partita IVA ' + piva + cifra + '\nchiave sk-' + 'ant-' + 'a'.repeat(30) + '\nscrivere a mario@' + 'azienda-vera.it\n');
  fs.writeFileSync(path.join(dir, 'listino.xlsx'), 'x');
  fs.writeFileSync(path.join(dir, 'ordine-rapido-archivio_2026-11-26.json'), '{}');
  const trovati = controllaDati(dir).join('\n');
  fs.rmSync(dir, { recursive: true, force: true });
  for (const atteso of ['partita IVA valida', 'chiave API di Anthropic', 'indirizzo email', 'file di dati fuori dalla cartella esempi', 'copia di sicurezza'])
    assert.ok(trovati.includes(atteso), 'il controllo deve segnalare: ' + atteso);
});

test('versione in un solo file: si costruisce e non ha riferimenti esterni', () => {
  const { costruisci } = require('../scripts/costruisci.js');
  const r = costruisci(), html = fs.readFileSync(r.file, 'utf8');
  assert.ok(html.includes("versione: '" + r.versione + "'"));
  assert.ok(!/<link[^>]+stylesheet/.test(html) && !/<script src=/.test(html));
  assert.equal((html.match(/<script type="application\/octet-stream" id="vendor:/g) || []).length, 3);
});
