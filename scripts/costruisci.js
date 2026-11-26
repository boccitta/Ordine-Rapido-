/*
 * Costruisce la versione portatile: tutta l'app in un solo file HTML, da aprire con un doppio clic.
 * Stile, codice, caratteri e librerie per PDF ed Excel finiscono dentro il file: non serve nient'altro.
 *
 * Uso:  node scripts/costruisci.js      scrive dist/Ordine-Rapido.html
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app');
const VENDOR = ['pdf.min.js', 'pdf.worker.min.js', 'xlsx.full.min.js'];

const leggi = file => fs.readFileSync(path.join(APP, file), 'utf8');
/* Dentro un blocco <script> la sequenza "</script" chiuderebbe il blocco: va spezzata. */
const sicuro = js => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
function unaVolta(testo, cerca, metti) {
  if (testo.split(cerca).length !== 2) throw new Error('app/index.html: atteso esattamente un "' + cerca + '"');
  return testo.replace(cerca, () => metti);
}

function costruisci() {
  const versione = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  let html = leggi('index.html');

  /* stile, con i caratteri incorporati */
  const css = leggi('style.css').replace(/url\((vendor\/fonts\/[^)]+\.woff2)\)/g, (_, file) =>
    'url(data:font/woff2;base64,' + fs.readFileSync(path.join(APP, file)).toString('base64') + ')');
  if (/url\(vendor\//.test(css)) throw new Error('style.css: è rimasto un riferimento a vendor/');
  html = unaVolta(html, '<link rel="stylesheet" href="style.css">', '<style>\n' + css + '</style>');

  /* codice dell'app */
  ['versione.js', 'core.js', 'app.js'].forEach(file => {
    html = unaVolta(html, '<script src="' + file + '"></script>', '<script>\n' + sicuro(leggi(file)) + '</script>');
  });

  /* librerie: in base64, lette dall'app solo quando servono (vedi vendorUrl in app.js) */
  const blocchi = VENDOR.map(file =>
    '<script type="application/octet-stream" id="vendor:' + file + '">' + fs.readFileSync(path.join(APP, 'vendor', file)).toString('base64') + '</script>').join('\n');
  html = unaVolta(html, '</body>', blocchi + '\n</body>');
  html = unaVolta(html, '<html lang="it">', '<!-- Versione ' + versione + ' in un solo file, costruita da scripts/costruisci.js. Librerie incluse e relative licenze: vedi THIRD_PARTY_NOTICES.md nella repository. -->\n<html lang="it">');

  if (/(src|href)="(?!https:\/\/www\.gesacom\.it|#)[^"]+"/.test(html.replace(/<script type="application\/octet-stream"[\s\S]*?<\/script>/g, '')))
    throw new Error('nel file unico è rimasto un riferimento a un file esterno');

  const dist = path.join(ROOT, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  const out = path.join(dist, 'Ordine-Rapido.html');
  fs.writeFileSync(out, html);
  return { file: out, versione, byte: Buffer.byteLength(html) };
}

if (require.main === module) {
  const r = costruisci();
  console.log('Creato ' + path.relative(ROOT, r.file) + ' - versione ' + r.versione + ', ' + (r.byte / 1048576).toFixed(1) + ' MB');
}
module.exports = { costruisci };
