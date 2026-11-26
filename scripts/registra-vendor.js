/*
 * Ricalcola le impronte SHA-256 dei file in app/vendor e le scrive in app/vendor/VENDOR.json.
 * Va eseguito solo dopo aver aggiornato di proposito una libreria (vedi docs/SVILUPPO.md): le prove
 * automatiche confrontano i file con queste impronte, così una modifica accidentale viene notata.
 *
 * Uso:  node scripts/registra-vendor.js
 */
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VENDOR = path.join(__dirname, '..', 'app', 'vendor');
const file = path.join(VENDOR, 'VENDOR.json');
const registro = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const v of registro.file) v.sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(VENDOR, v.file))).digest('hex');
fs.writeFileSync(file, JSON.stringify(registro, null, 2) + '\n');
console.log('Impronte aggiornate per ' + registro.file.length + ' file in app/vendor/VENDOR.json');
