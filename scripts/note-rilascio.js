/*
 * Stampa la sezione di CHANGELOG.md della versione corrente (o di quella indicata): diventa il testo del rilascio su GitHub.
 * Uso:  node scripts/note-rilascio.js [versione]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function note(versione) {
  const righe = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').split(/\r?\n/);
  const inizio = righe.findIndex(r => r.startsWith('## [' + versione + ']'));
  if (inizio < 0) return null;
  let fine = righe.findIndex((r, i) => i > inizio && (/^## \[/.test(r) || /^\[[^\]]+\]:\s/.test(r)));
  if (fine < 0) fine = righe.length;
  let testo = righe.slice(inizio + 1, fine).join('\n').trim() + '\n';
  /* Nella pagina di un rilascio i collegamenti relativi non funzionano: diventano indirizzi completi verso i file di quella versione. */
  if (process.env.GITHUB_REPOSITORY) {
    const base = (process.env.GITHUB_SERVER_URL || 'https://github.com') + '/' + process.env.GITHUB_REPOSITORY + '/blob/v' + versione + '/';
    testo = testo.replace(/\]\((?!https?:|#|mailto:)([^)]+)\)/g, (_, percorso) => '](' + base + percorso + ')');
  }
  return testo;
}

if (require.main === module) {
  const versione = process.argv[2] || JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const testo = note(versione);
  if (!testo) { console.error('CHANGELOG.md non ha una sezione per la versione ' + versione + '.'); process.exit(1); }
  process.stdout.write(testo);
}
module.exports = { note };
