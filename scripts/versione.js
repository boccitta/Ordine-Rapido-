/*
 * Tiene allineato il numero di versione in tutto il progetto.
 *
 * L'unica fonte è il campo "version" di package.json. Da lì:
 *   - scripts/compila.js scrive la versione dentro l'app al momento della costruzione;
 *   - questo script verifica che CHANGELOG.md abbia una sezione per quella versione, con la data.
 *
 * Uso:  node scripts/versione.js      controlla (usato dai test e dal rilascio)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

function leggi() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  /* Indirizzo del codice sorgente: "homepage" di package.json oppure, durante un rilascio su GitHub, la repository stessa. */
  const sorgente = pkg.homepage || (process.env.GITHUB_REPOSITORY ? (process.env.GITHUB_SERVER_URL || 'https://github.com') + '/' + process.env.GITHUB_REPOSITORY : '');
  return { versione: pkg.version, sorgente };
}
/* Restituisce l'elenco dei problemi trovati: vuoto se è tutto allineato. */
function controlla() {
  const info = leggi(), problemi = [];
  if (!SEMVER.test(info.versione)) problemi.push('package.json: "' + info.versione + '" non è una versione nel formato MAGGIORE.MINORE.CORREZIONE.');
  const log = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const titolo = new RegExp('^## \\[' + info.versione.replace(/[.+-]/g, '\\$&') + '\\] - \\d{4}-\\d{2}-\\d{2}\\s*$', 'm');
  if (!titolo.test(log)) problemi.push('CHANGELOG.md non ha la sezione "## [' + info.versione + '] - AAAA-MM-GG".');
  if (!/^## \[Non rilasciato\]\s*$/m.test(log)) problemi.push('CHANGELOG.md deve avere in cima la sezione "## [Non rilasciato]".');
  const etichetta = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : '';
  if (etichetta && etichetta !== 'v' + info.versione) problemi.push('L\'etichetta ' + etichetta + ' non corrisponde alla versione ' + info.versione + ' di package.json.');
  return problemi;
}

if (require.main === module) {
  const info = leggi();
  const problemi = controlla();
  if (problemi.length) { console.error('Versione non allineata:\n- ' + problemi.join('\n- ')); process.exit(1); }
  console.log('Versione ' + info.versione + ': package.json e CHANGELOG sono allineati.');
}
module.exports = { leggi, controlla, SEMVER };
