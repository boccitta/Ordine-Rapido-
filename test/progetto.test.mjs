/*
 * Prove sul progetto nel suo insieme: versione allineata, librerie di terzi intatte, dati di esempio davvero finti,
 * pagina che non dipende da internet, struttura del codice rispettata. Si eseguono con: npm test
 * Non richiedono installazioni: non usano il codice compilato.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import versione from '../scripts/versione.js';
import dati from '../scripts/controlla-dati.js';
import rilascio from '../scripts/note-rilascio.js';
import * as Core from '../src/core/indice.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const leggi = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { controlla: controllaVersione } = versione;
const { controlla: controllaDati, pivaValida } = dati;
const { note } = rilascio;

/* Tutti i file TypeScript di src/ (o di una sua cartella), con il percorso relativo alla radice. */
function sorgenti(cartella) {
  const out = [];
  (function visita(dir) {
    for (const v of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir + '/' + v.name;
      if (v.isDirectory()) visita(rel); else if (rel.endsWith('.ts')) out.push(rel);
    }
  })(cartella ? 'src/' + cartella : 'src');
  return out;
}
/* I moduli importati da un file: percorsi relativi risolti rispetto alla radice, gli altri così come sono scritti. */
function importati(file) {
  return [...leggi(file).matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map(m =>
    m[1].startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])) : m[1]);
}

test('versione: package.json e CHANGELOG dicono la stessa cosa', () => {
  assert.deepEqual(controllaVersione(), []);
  const numero = JSON.parse(leggi('package.json')).version;
  assert.ok((note(numero) || '').length > 200, 'la sezione del CHANGELOG per la versione corrente deve essere descrittiva');
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

test('pagina: nessuna risorsa presa da internet, solo gli indirizzi dei tre servizi di lettura', () => {
  const html = leggi('app/index.html'), css = leggi('app/style.css');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src https:\/\/api\.anthropic\.com https:\/\/generativelanguage\.googleapis\.com https:\/\/api\.openai\.com(;|$)/);
  assert.ok(!/<(script|link|img)[^>]+(src|href)="https?:/.test(html), 'la pagina non deve caricare nulla da altri siti');
  assert.ok(!/url\(\s*["']?https?:/.test(css), 'lo stile non deve caricare nulla da altri siti');
  /* app.js non è nella repository: lo genera «npm run compila» a partire da src/ui/avvio.ts */
  const GENERATI = { 'app.js': 'src/ui/avvio.ts' };
  for (const f of [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1]))
    assert.ok(fs.existsSync(path.join(ROOT, GENERATI[f] || 'app/' + f)), 'manca ' + (GENERATI[f] || 'app/' + f));
});

test('codice: in tutto il progetto sono nominati solo gli indirizzi dei tre servizi di lettura', () => {
  const codice = sorgenti().map(leggi).join('\n');
  const indirizzi = [...new Set((codice.match(/https?:\/\/[^\s"'`)]+/g) || []).filter(u => !u.startsWith('http://www.w3.org/')))];
  assert.deepEqual(indirizzi.sort(), ['https://api.anthropic.com', 'https://api.openai.com', 'https://generativelanguage.googleapis.com'], 'il codice può nominare solo gli indirizzi di Anthropic, OpenAI e Google');
  /* e ogni indirizzo sta solo nel modulo del suo servizio */
  for (const f of sorgenti()) for (const u of new Set(leggi(f).match(/https?:\/\/[^\s"'`)]+/g) || [])) if (!u.startsWith('http://www.w3.org/')) assert.ok(f.startsWith('src/ia/'), f + ' nomina ' + u);
});

test('struttura: la logica non tocca pagina, rete o disco; solo il processo principale usa Electron e il disco', () => {
  for (const f of sorgenti('core')) {
    const testo = leggi(f);
    for (const m of importati(f)) assert.ok(m.startsWith('src/core/'), f + ' importa ' + m + ': la logica pura non dipende dal resto dell\'app');
    assert.ok(!/\b(document|window|localStorage|indexedDB|fetch|navigator)\b\s*[.(]/.test(testo), f + ' non deve usare la pagina, la rete o la memoria del browser');
  }
  for (const f of sorgenti('ia')) {
    for (const m of importati(f)) assert.ok(m.startsWith('src/core/') || m.startsWith('src/ia/'), f + ' importa ' + m + ': il colloquio con i servizi non dipende da pagina o desktop');
    assert.ok(!/\b(document|window|localStorage|indexedDB|fetch|navigator)\b\s*[.(]/.test(leggi(f)), f + ' non spedisce niente da solo: riceve la funzione che lo fa');
  }
  for (const f of [...sorgenti('ui'), ...sorgenti('piattaforma')]) {
    for (const m of importati(f)) {
      assert.ok(m !== 'electron' && !m.startsWith('node:'), f + ' importa ' + m + ': la pagina non ha accesso a Electron né a Node');
      assert.ok(!m.startsWith('src/desktop/') || m === 'src/desktop/contratto.ts', f + ' importa ' + m + ': dal desktop la pagina conosce solo il contratto del ponte');
    }
  }
  /* La chiave API non passa mai dalla memoria della pagina nell'app desktop: lo garantisce il fatto che il ponte non offre modo di rileggerla. */
  const contratto = leggi('src/desktop/contratto.ts');
  assert.ok(!/\bget(Key)?\s*\(\s*\)\s*:\s*Promise<(Reply<)?string/.test(contratto), 'il ponte non deve restituire la chiave alla pagina');
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
