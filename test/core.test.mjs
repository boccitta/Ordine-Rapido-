/*
 * Prove della logica dell'app (src/core/). Si eseguono con: npm test
 * Node legge direttamente i file TypeScript: non serve compilare né installare nulla.
 * Usano solo dati di fantasia.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../src/core/indice.ts';

const ARTICOLI = [
  { cod: '300101', desc: 'PASSATA DI POMODORO BOTTIGLIA GR 700', ean: '2000003001019', um: 'PZ', mand: 'CONSERVE FANTASIA S.P.A.', prezzo: '0,85' },
  { cod: '300301', desc: "TONNO ALL'OLIO DI OLIVA GR 80 X 3", ean: '2000003003013', um: 'PZ', mand: 'CONSERVE FANTASIA S.P.A.', prezzo: '2,95' },
  { cod: '000777', desc: 'ARTICOLO CON ZERI INIZIALI', ean: '', um: 'CT', mand: 'CONSERVE FANTASIA S.P.A.', prezzo: '' },
  { cod: 'AB12', desc: 'BURRO PANETTO GR 250', ean: '', um: 'PZ', mand: 'LATTERIA VALFINTA S.P.A.', prezzo: '2,40' },
  { cod: 'AB12', desc: 'OLIVE VERDI VASO GR 290', ean: '', um: 'PZ', mand: 'CONSERVE FANTASIA S.P.A.', prezzo: '1,80' }
];
const riga = o => Object.assign({ cod_articolo: '', cod_cliente: '', ean: '', descrizione: '', um: '', colli: '', quantita: '', prezzo: '', sc1: '', sc2: '', sc3: '', omaggio: false, netto_doc: '', totale_doc: '', nota: '' }, o);
const ordine = o => Object.assign({ mandante: 'CONSERVE FANTASIA S.P.A.', mandante_cod: '', mandante_piva: '', cliente: 'MARKET FANTASIA S.R.L.', cliente_cod: '', piva: '01234500033', numero: '2026/0412', data: '2026-11-23', consegna: '2026-11-30', pagamento: '', destinazione: '', note: '', tot_imponibile: '', tot_colli: '', tot_pezzi: '', righe: [] }, o);

test('numeri: formato italiano e formato con il punto', () => {
  assert.equal(Core.num('1.016,35'), 1016.35);
  assert.equal(Core.num('7,20000'), 7.2);
  assert.equal(Core.num('12.5'), 12.5);
  assert.equal(Core.num(' 30 % '), 30);
  assert.equal(Core.num(''), null);
  assert.equal(Core.num('abc'), null);
  assert.equal(Core.show(7.2, 'price'), '7,20');
  assert.equal(Core.show(0.8075, 'price'), '0,8075');
  assert.equal(Core.show(120, 'qty'), '120');
  assert.equal(Core.show(7.2, 'price', '.'), '7.20');
});

test('riga: sconti in cascata, netto e totale; l\'omaggio vale zero', () => {
  assert.deepEqual(Core.rowCalc(riga({ quantita: '120', prezzo: '0,85', sc1: '5' })), { netto: 0.8075, totale: 96.9 });
  assert.deepEqual(Core.rowCalc(riga({ quantita: '10', prezzo: '100', sc1: '10', sc2: '5' })), { netto: 85.5, totale: 855 });
  assert.equal(Core.rowCalc(riga({ quantita: '16', prezzo: '2,95', omaggio: true })).totale, 0);
  assert.equal(Core.rowCalc(riga({ quantita: '', prezzo: '2,95' })).totale, null);
});

test('totali e confronto con i totali scritti sul documento', () => {
  const o = ordine({ tot_imponibile: '276,26', tot_colli: '15', tot_pezzi: '200', righe: [
    riga({ cod_articolo: '300101', colli: '10', quantita: '120', prezzo: '0,85', sc1: '5' }),
    riga({ cod_articolo: '300301', colli: '4', quantita: '64', prezzo: '2,95', sc1: '5' }),
    riga({ cod_articolo: '300301', colli: '1', quantita: '16', prezzo: '2,95', omaggio: true })] });
  const t = Core.totals(o);
  assert.deepEqual([t.righe, t.colli, t.pezzi, t.merce, t.omaggi], [3, 15, 200, 276.26, 1]);
  const esiti = Core.checks(o, null);
  assert.ok(esiti.some(c => c.k === 'imp' && c.level === 'ok'));
  o.tot_colli = '14';
  assert.ok(Core.checks(o, null).some(c => c.k === 'colli' && c.level === 'bad'));
});

test('abbinamento con l\'archivio: per codice, senza zeri iniziali, per EAN, per abbinamento imparato', () => {
  const ix = Core.buildIndex(ARTICOLI), o = ordine();
  assert.deepEqual([Core.matchRow(ix, riga({ cod_articolo: '300101' }), o).cod, Core.matchRow(ix, riga({ cod_articolo: '300101' }), o).via], ['300101', 'codice']);
  assert.equal(Core.matchRow(ix, riga({ cod_articolo: ' 300 101 ' }), o).ok, true, 'spazi nel codice');
  assert.equal(Core.matchRow(ix, riga({ cod_articolo: '777' }), o).cod, '000777', 'zeri iniziali mancanti sul documento');
  assert.equal(Core.matchRow(ix, riga({ cod_articolo: '0300101' }), o).cod, '300101', 'zeri iniziali in più sul documento');
  assert.deepEqual([Core.matchRow(ix, riga({ ean: '2000003003013' }), o).cod, Core.matchRow(ix, riga({ ean: '2000003003013' }), o).via], ['300301', 'ean']);
  assert.equal(Core.matchRow(ix, riga({ cod_articolo: '2000003003013' }), o).cod, '300301', 'EAN scritto nella colonna del codice');
  const r = riga({ cod_cliente: 'A1101', descrizione: 'Passata 700' }), alias = {};
  Core.aliasKeys(o, r).forEach(k => { alias[k] = '300101'; });
  assert.deepEqual([Core.matchRow(ix, r, o, alias).cod, Core.matchRow(ix, r, o, alias).via], ['300101', 'storico']);
});

test('abbinamento: mai un codice inventato', () => {
  const ix = Core.buildIndex(ARTICOLI), o = ordine();
  const nessuno = Core.matchRow(ix, riga({ cod_articolo: '999999', descrizione: 'ARTICOLO SCONOSCIUTO' }), o);
  assert.deepEqual([nessuno.ok, nessuno.cod], [false, '']);
  assert.equal(Core.matchRow(null, riga({ cod_articolo: '300101' }), o), null, 'senza archivio non si abbina nulla');
});

test('stesso codice in due mandanti: sceglie quello della mandante dell\'ordine, altrimenti chiede', () => {
  const ix = Core.buildIndex(ARTICOLI);
  assert.equal(Core.matchRow(ix, riga({ cod_articolo: 'AB12' }), ordine({ mandante: 'Latteria Valfinta spa' })).desc, 'BURRO PANETTO GR 250');
  assert.equal(Core.matchRow(ix, riga({ cod_articolo: 'AB12' }), ordine({ mandante: 'Conserve Fantasia' })).desc, 'OLIVE VERDI VASO GR 290');
  const dubbio = Core.matchRow(ix, riga({ cod_articolo: 'AB12' }), ordine({ mandante: '' }));
  assert.deepEqual([dubbio.ok, dubbio.via, dubbio.multi.length], [false, 'multi', 2]);
});

test('ricerca per descrizione: l\'articolo giusto in cima', () => {
  const ix = Core.buildIndex(ARTICOLI);
  assert.equal(Core.search(ix, 'tonno olio oliva 80 x 3', 'CONSERVE FANTASIA', 5)[0].art.cod, '300301');
  assert.equal(Core.search(ix, 'zzz', '', 5).length, 0);
});

test('cliente e mandante: per partita IVA, poi per ragione sociale senza forma societaria', () => {
  const clienti = [{ cod: 'C0012', nome: 'MARKET FANTASIA S.R.L.', piva: '01234500033' }, { cod: 'C0027', nome: 'SUPERMERCATI ESEMPIO S.R.L.', piva: '09876500013' }];
  assert.equal(Core.matchClient(clienti, ordine({ cliente: 'altro nome', piva: 'IT 01234500033' })).cod, 'C0012');
  assert.equal(Core.matchClient(clienti, ordine({ cliente: 'Supermercati Esempio srl', piva: '' })).cod, 'C0027');
  assert.equal(Core.matchClient(clienti, ordine({ cliente: 'Sconosciuto', piva: '' })), null);
  const mandanti = [{ cod: 'M001', nome: 'CONSERVE FANTASIA S.P.A.', piva: '' }, { cod: 'M002', nome: 'LATTERIA VALFINTA S.P.A.', piva: '' }];
  assert.equal(Core.matchMandante(mandanti, ordine({ mandante: 'Conserve Fantasia SpA' })).cod, 'M001');
  assert.equal(Core.matchMandante(mandanti, ordine({ mandante: '' })), null);
  assert.equal(Core.matchMandante([], ordine()), null);
});

test('controlli: righe fuori archivio, cliente e mandante', () => {
  const ix = Core.buildIndex(ARTICOLI);
  const o = ordine({ righe: [riga({ cod_articolo: '300101', quantita: '1', prezzo: '1' }), riga({ cod_articolo: '999', quantita: '1', prezzo: '1' })] });
  o.righe.forEach(r => { r.link = Core.matchRow(ix, r, o); });
  assert.equal(Core.unlinked(o), 1);
  const testi = Core.checks(o, { hasArt: true, hasCli: true, cliOk: false, hasMan: true, manOk: true }).map(c => c.level + ': ' + c.text);
  assert.ok(testi.includes('bad: 1 riga non in anagrafica'));
  assert.ok(testi.includes('warn: Cliente non trovato in anagrafica'));
  assert.ok(testi.some(t => t.startsWith('ok: Mandante in anagrafica')));
  const linkata = ordine({ righe: [riga({ ean: '2000003001019', quantita: '1', prezzo: '1' })] });
  linkata.righe[0].link = Core.matchRow(ix, linkata.righe[0], linkata);
  assert.ok(!Core.checks(linkata, { hasArt: true }).some(c => /senza codice articolo/.test(c.text)), 'una riga collegata per EAN ha un codice');
});

test('file esportato: codice e descrizione dell\'archivio, testata ripetuta, omaggio, formati', () => {
  const ix = Core.buildIndex(ARTICOLI);
  const o = ordine({ mandante_cod: 'M001', cliente_cod: 'C0012', righe: [
    riga({ cod_articolo: '0300101', descrizione: 'passata 700 gr', colli: '10', quantita: '120', prezzo: '0,85', sc1: '5' }),
    riga({ cod_articolo: '300301', descrizione: 'tonno; "olio"', quantita: '16', prezzo: '2,95', omaggio: true })] });
  o.righe.forEach(r => { r.link = Core.matchRow(ix, r, o); });
  const p = Core.defaultProfile(), t = Core.buildTable(o, p), col = n => t.headers.indexOf(n);
  assert.equal(t.rows[0][col('CodArticolo')], '300101', 'si esporta il codice dell\'archivio, non quello scritto sul documento');
  assert.equal(t.rows[0][col('Descrizione')], 'PASSATA DI POMODORO BOTTIGLIA GR 700');
  assert.deepEqual([t.rows[0][col('CodMandante')], t.rows[1][col('CodMandante')], t.rows[0][col('CodCliente')]], ['M001', 'M001', 'C0012']);
  assert.deepEqual([t.rows[0][col('DataOrdine')], t.rows[0][col('Prezzo')], t.rows[0][col('Omaggio')]], ['23/11/2026', '0,85', 'N']);
  assert.deepEqual([t.rows[1][col('Omaggio')], t.rows[1][col('Sconto1')]], ['S', '100']);
  p.descSrc = 'doc'; p.dec = '.'; p.date = 'iso'; p.omaggi = 'prezzo0';
  const t2 = Core.buildTable(o, p);
  assert.deepEqual([t2.rows[1][col('Descrizione')], t2.rows[0][col('Prezzo')], t2.rows[0][col('DataOrdine')], t2.rows[1][col('Prezzo')]], ['tonno; "olio"', '0.85', '2026-11-23', '0.00']);
  const csv = Core.toDelimited(t2, ';', true);
  assert.ok(csv.includes('"tonno; ""olio"""'), 'separatore e virgolette nei testi vanno protetti');
  assert.ok(csv.endsWith('\r\n'));
  assert.equal(Core.toDelimited(t2, '\t', false).split('\r\n')[1].split('\t')[col('Descrizione')], 'tonno; "olio"');
});

test('tracciato: un profilo salvato da una versione precedente riceve le colonne nuove', () => {
  const vecchio = { sep: ',', cols: [{ id: 'cod_articolo', on: true, header: 'ART' }, { id: 'quantita', on: true, header: 'QTA' }, { id: 'inesistente', on: true, header: 'X' }] };
  const p = Core.mergeProfile(vecchio);
  assert.equal(p.sep, ',');
  assert.deepEqual(p.cols.slice(0, 2).map(c => c.header), ['ART', 'QTA']);
  assert.equal(p.cols.length, Core.COLS.length);
  assert.ok(p.cols.some(c => c.id === 'mandante_cod'));
  assert.equal(Core.mergeProfile(null).sep, ';');
});

test('lettura dei file esportati dal gestionale: separatore, virgolette, colonne riconosciute', () => {
  const testo = 'Codice articolo;Descrizione;Barcode;U.M.;Fornitore;Listino\r\n300101;"PASSATA; BOTTIGLIA";2000003001019;pz;CONSERVE FANTASIA S.P.A.;0,85\r\n;riga senza codice;;;;\r\n';
  assert.equal(Core.detectSep(testo), ';');
  const righe = Core.parseDelimited(testo, ';'), g = Core.guessMap('art', righe[0]);
  assert.deepEqual(g.map, { ean: 2, desc: 1, um: 3, prezzo: 5, mand: 4, cod: 0 });
  const articoli = Core.rowsToItems('art', righe, g.map, true, '');
  assert.deepEqual(articoli, [{ cod: '300101', desc: 'PASSATA; BOTTIGLIA', ean: '2000003001019', um: 'PZ', mand: 'CONSERVE FANTASIA S.P.A.', prezzo: '0,85' }]);
  assert.deepEqual(Core.guessMap('cli', ['Codice', 'Ragione sociale', 'Partita IVA', 'Cod. fiscale']).map, { piva: 2, cod: 0, nome: 1 });
  assert.deepEqual(Core.guessMap('man', ['Cod. mandante', 'Casa mandante', 'P.IVA']).map, { piva: 2, cod: 0, nome: 1 });
  assert.equal(Core.detectSep('a\tb\tc\n1\t2\t3'), '\t');
  const unito = Core.mergeItems('art', articoli, [{ cod: '300101', desc: 'NUOVA DESCRIZIONE', ean: '', um: 'PZ', mand: 'Conserve Fantasia spa', prezzo: '' }]);
  assert.deepEqual([unito.length, unito[0].desc], [1, 'NUOVA DESCRIZIONE']);
  assert.deepEqual(Core.unpack('art', Core.pack('art', articoli[0])), articoli[0]);
});

test('codifica Windows (ANSI) e nome del file', () => {
  assert.deepEqual(Array.from(Core.toCp1252('è€A中')), [0xE8, 0x80, 0x41, 0x3F]);
  assert.equal(Core.fileName(ordine()), 'ordine_CONSERVE-FANTASIA-S-P-A_MARKET-FANTASIA-S-R-L_2026-0412_2026-11-23.csv');
  assert.equal(Core.fileName(ordine({ mandante: 'Caffè Perché S.p.A.', cliente: '', numero: '', data: '' })), 'ordine_Caffe-Perche-S-p-A.csv');
});

test('risposta del modello: il JSON si ricava anche se è incorniciato da testo', () => {
  assert.deepEqual(Core.extractJson('{"righe":[]}'), { righe: [] });
  assert.deepEqual(Core.extractJson('Ecco:\n```json\n{"righe":[1]}\n```\nFatto.'), { righe: [1] });
  assert.deepEqual(Core.extractJson('Risultato: [{"riga":1,"cod":null}] fine'), [{ riga: 1, cod: null }]);
  assert.throws(() => Core.extractJson('nessun dato'), e => e.code === 'invalid_json');
  assert.throws(() => Core.extractJson('{"a": '), e => e.code === 'invalid_json');
});

test('copia di sicurezza: andata e ritorno, formato dichiarato, file estranei rifiutati', () => {
  const arch = Core.emptyArchive();
  arch.art = ARTICOLI.slice(0, 2); arch.artAt = '2026-11-26';
  arch.cli = [{ cod: 'C0012', nome: 'MARKET FANTASIA S.R.L.', piva: '01234500033' }];
  arch.man = [{ cod: 'M001', nome: 'CONSERVE FANTASIA S.P.A.', piva: '' }];
  arch.alias['d|01234500033|PASSATA 700'] = '300101';
  const copia = JSON.parse(JSON.stringify(Core.backupBuild(arch, Core.defaultProfile(), '1.0.0', '2026-11-26')));
  assert.deepEqual([copia.formato, copia.versione_formato, copia.app], ['ordine-rapido-archivio', 1, '1.0.0']);
  const letto = Core.backupParse(copia);
  assert.deepEqual(letto.art, arch.art);
  assert.deepEqual([letto.cli, letto.man, letto.artAt], [arch.cli, arch.man, '2026-11-26']);
  assert.equal(letto.alias['d|01234500033|PASSATA 700'], '300101');
  assert.equal(letto.profile.cols.length, Core.COLS.length);
  assert.throws(() => Core.backupParse({ formato: 'altro' }), e => e.code === 'local');
  assert.throws(() => Core.backupParse(Object.assign({}, copia, { versione_formato: 99 })), e => /più recente/.test(e.message));
  assert.throws(() => Core.backupParse(null), e => e.code === 'local');
});
