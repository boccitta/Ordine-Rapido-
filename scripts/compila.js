/*
 * Compila il codice TypeScript della cartella src/ nei tre file che l'app esegue:
 *   app/app.js          il codice della pagina (logica, interfaccia, ambienti);
 *   desktop/main.js     il processo principale dell'app desktop;
 *   desktop/preload.js  il ponte tra la finestra e il processo principale.
 * I file generati non si modificano a mano e non stanno nella repository: si rifanno con questo script.
 * Il codice non viene compresso, così chi vuole controllarlo lo può leggere.
 *
 * Uso:  node scripts/compila.js
 */
'use strict';
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const INTESTAZIONE = [
  '/*',
  ' * Ordine Rapido - file generato da scripts/compila.js a partire dal codice della cartella src/: non modificarlo a mano.',
  ' * Copyright (C) 2026 Roberto Murenu',
  ' * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),',
  ' * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.',
  ' */'
].join('\n');

async function compila() {
  const esbuild = require('esbuild');
  const { leggi } = require('./versione.js');
  const comune = { bundle: true, charset: 'utf8', target: 'es2022', logLevel: 'warning', legalComments: 'none', banner: { js: INTESTAZIONE } };
  const file = f => path.join(ROOT, f);

  /* La pagina: un solo file, caricato da un normale <script>, che funziona anche aperto da disco. */
  await esbuild.build({ ...comune, entryPoints: [file('src/ui/avvio.ts')], outfile: file('app/app.js'), platform: 'browser', format: 'iife',
    define: { __ORDINE_RAPIDO__: JSON.stringify(leggi()) } });
  /* L'app desktop: Electron resta esterno, tutto il resto finisce nel file. */
  for (const nome of ['main', 'preload'])
    await esbuild.build({ ...comune, entryPoints: [file('src/desktop/' + nome + '.ts')], outfile: file('desktop/' + nome + '.js'), platform: 'node', format: 'cjs', external: ['electron'] });
  await compilaOcr(esbuild, comune, file);
  return leggi();
}

/*
 * Il riconoscimento dei caratteri per foto e scansioni: app/vendor/ocr/ocr-dati.js.
 * Una pagina aperta da disco non può leggere altri file, ma può caricare uno script: per questo il motore
 * (src/ocr/motore.ts con le librerie ppu-paddle-ocr e onnxruntime-web), il suo WebAssembly e i modelli PP-OCRv6
 * finiscono in un solo script, scritti in base64. Pesa circa 28 MB e si carica soltanto alla prima foto.
 * Si rifà solo quando cambia qualcosa di ciò che contiene.
 */
const OCR_FILE = [
  ['wasm', 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'],
  ['rilevamento', 'terzi/ocr/PP-OCRv6_tiny_det.ort'],
  ['riconoscimento', 'terzi/ocr/PP-OCRv6_tiny_rec.ort'],
  ['dizionario', 'terzi/ocr/ppocrv6_tiny_dict.txt']
];
async function compilaOcr(esbuild, comune, file) {
  const fs = require('node:fs'), crypto = require('node:crypto');
  const uscita = file('app/vendor/ocr/ocr-dati.js');
  /* solo il motore WebAssembly di onnxruntime-web, senza le varianti per la scheda grafica: meno codice, stesso risultato */
  const motore = await esbuild.build({ ...comune, entryPoints: [file('src/ocr/motore.ts')], write: false, platform: 'browser', format: 'iife',
    alias: { 'onnxruntime-web': 'onnxruntime-web/wasm' }, logLevel: 'error' });
  const codice = motore.outputFiles[0].text, dati = OCR_FILE.map(([nome, percorso]) => [nome, fs.readFileSync(file(percorso))]);
  const impronta = crypto.createHash('sha256').update(codice);
  for (const [, d] of dati) impronta.update(d);
  const riga = '/* impronta: ' + impronta.digest('hex') + ' */';
  try {
    const fd = fs.openSync(uscita, 'r'), inizio = Buffer.alloc(riga.length);
    fs.readSync(fd, inizio, 0, riga.length, 0); fs.closeSync(fd);
    if (inizio.toString('utf8') === riga) return;
  } catch { /* il file non c'è ancora */ }
  fs.mkdirSync(path.dirname(uscita), { recursive: true });
  const parti = [riga, INTESTAZIONE, 'globalThis.ordineRapidoOcr = {', '  codice: ' + JSON.stringify(codice) + ','];
  for (const [nome, d] of dati) parti.push('  ' + nome + ': "' + d.toString('base64') + '",');
  parti.push('};', '');
  fs.writeFileSync(uscita, parti.join('\n'));
}

if (require.main === module) {
  compila().then(info => console.log('Compilati app/app.js, desktop/main.js e desktop/preload.js - versione ' + info.versione),
    e => { console.error('Compilazione non riuscita:\n', e && e.message ? e.message : e); process.exit(1); });
}
module.exports = { compila };
