/*
 * Controlla che nella repository non finiscano dati reali o credenziali.
 *
 * Cerca in tutti i file del progetto (esclusi quelli ignorati da git e le librerie di terzi):
 *   - chiavi e credenziali (chiavi API, token, chiavi private, password scritte in chiaro);
 *   - partite IVA valide, codici fiscali, IBAN, indirizzi email, numeri di telefono;
 *   - file di dati (CSV, Excel, PDF, immagini, copie di sicurezza) fuori dalla cartella esempi/.
 *
 * I dati di esempio superano il controllo perché sono costruiti apposta: le partite IVA di fantasia
 * hanno la cifra di controllo sbagliata, quindi non possono appartenere a nessuna azienda.
 *
 * Uso:  node scripts/controlla-dati.js      esce con errore se trova qualcosa
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SALTA_CARTELLE = new Set(['.git', 'node_modules', 'dist', 'privato', 'dati']);
const TERZI = ['app/vendor/', 'package-lock.json', 'LICENSE'];           // codice e testi di terzi: non contengono dati nostri
const DATI_PERMESSI = [/^esempi\//, /^docs\/img\/[^/]+\.png$/, /^build\/icon\.png$/, /^app\/vendor\//, /^sito\/img\/[^/]+\.png$/];   // le immagini del sito sono schermate dell'app con i dati di esempio
const ESTENSIONI_DATI = /\.(csv|tsv|xlsx?|xlsm|ods|pdf|eml|msg|jpe?g|png|gif|webp|heic|bmp|zip|sqlite|db|bak)$/i;
const EMAIL_PERMESSE = /@(example\.(com|org|it)|esempio\.it|anthropic\.com|users\.noreply\.github\.com)$/i;

function pivaValida(s) {
  if (!/^\d{11}$/.test(s) || /^0{11}$/.test(s)) return false;
  let t = 0;
  for (let i = 0; i < 10; i++) { let d = +s[i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } t += d; }
  return (10 - t % 10) % 10 === +s[10];
}

const REGOLE = [
  { nome: 'chiave API di Anthropic', re: /sk-ant-[A-Za-z0-9_-]{24,}/g },
  { nome: 'token di accesso', re: /\b(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}|\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{30,}|\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { nome: 'chiave privata', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { nome: 'password scritta in chiaro', re: /\b(password|passwd|pwd|secret)\b\s*[:=]\s*["'][^"'\s]{4,}["']/gi },
  { nome: 'partita IVA valida', re: /(?<![\d.,])\d{11}(?![\d.,])/g, filtro: pivaValida },
  { nome: 'codice fiscale', re: /\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b/g },
  { nome: 'IBAN', re: /\bIT\d{2}[A-Z]\d{10}[0-9A-Z]{12}\b/g },
  { nome: 'indirizzo email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, filtro: m => !EMAIL_PERMESSE.test(m) },
  { nome: 'numero di telefono', re: /(?<![\w.])(\+39[\s.]?)?(3\d{2}|0\d{1,3})[\s./-]\d{6,8}(?!\w)/g }
];

function elenca(dir, base, out) {
  for (const v of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + v.name : v.name;
    if (v.isDirectory()) { if (!SALTA_CARTELLE.has(v.name)) elenca(path.join(dir, v.name), rel, out); }
    else out.push(rel);
  }
  return out;
}

function controlla(root) {
  const problemi = [];
  for (const rel of elenca(root || ROOT, '', [])) {
    if (ESTENSIONI_DATI.test(rel) && !DATI_PERMESSI.some(p => p.test(rel)))
      problemi.push(rel + ': file di dati fuori dalla cartella esempi/');
    if (/^ordine-rapido-archivio_.*\.json$/i.test(path.basename(rel)))
      problemi.push(rel + ': copia di sicurezza degli archivi (contiene dati reali)');
    if (/^\.env(\..*)?$/.test(path.basename(rel)) && path.basename(rel) !== '.env.example')
      problemi.push(rel + ': file di configurazione con possibili credenziali');
    if (TERZI.some(p => rel === p || rel.startsWith(p))) continue;
    const buf = fs.readFileSync(path.join(root || ROOT, rel));
    if (buf.includes(0) || /\.pdf$/i.test(rel)) continue;                  // file binario: già valutato per nome ed estensione
    const testo = buf.toString('latin1');
    for (const regola of REGOLE) {
      for (const m of testo.matchAll(regola.re)) {
        if (regola.filtro && !regola.filtro(m[0])) continue;
        const riga = testo.slice(0, m.index).split('\n').length;
        problemi.push(rel + ':' + riga + ': ' + regola.nome + ' (' + m[0].slice(0, 6) + '…)');
      }
    }
  }
  return problemi;
}

if (require.main === module) {
  const problemi = controlla();
  if (problemi.length) {
    console.error('Trovati possibili dati reali o credenziali: toglili prima di pubblicare.\n- ' + problemi.join('\n- '));
    process.exit(1);
  }
  console.log('Controllo dati: nessun dato reale e nessuna credenziale nei file del progetto.');
}
module.exports = { controlla, pivaValida };
