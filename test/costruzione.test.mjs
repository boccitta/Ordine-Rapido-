/*
 * Prove sul codice compilato: i tre file generati esistono, la pagina contiene la versione giusta,
 * la versione portatile in un solo file si costruisce e non ha riferimenti esterni.
 * Richiedono gli strumenti installati (npm ci). Si eseguono con: npm run test:costruzione
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compilazione from '../scripts/compila.js';
import costruzione from '../scripts/costruisci.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const leggi = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const versione = JSON.parse(leggi('package.json')).version;

test('compilazione: pagina, processo principale e ponte', async () => {
  await compilazione.compila();
  const pagina = leggi('app/app.js'), principale = leggi('desktop/main.js'), ponte = leggi('desktop/preload.js');
  assert.ok(pagina.includes(versione), 'la versione di package.json deve finire dentro la pagina');
  assert.ok(!/\brequire\(/.test(pagina), 'il codice della pagina non usa moduli di Node');
  assert.ok(!pagina.includes('safeStorage') && !pagina.includes('node:fs'), 'nel codice della pagina non entra nulla del processo principale');
  assert.match(principale, /require\(["']electron["']\)/);
  assert.match(ponte, /contextBridge/);
  assert.ok(!ponte.includes('safeStorage'), 'il ponte non contiene la custodia della chiave');
});

test('versione in un solo file: si costruisce e non ha riferimenti esterni', () => {
  const r = costruzione.costruisci(), html = fs.readFileSync(r.file, 'utf8');
  assert.equal(r.versione, versione);
  assert.ok(html.includes(versione));
  assert.ok(!/<link[^>]+stylesheet/.test(html) && !/<script src=/.test(html));
  assert.equal((html.match(/<script type="application\/octet-stream" id="vendor:/g) || []).length, 3);
});
