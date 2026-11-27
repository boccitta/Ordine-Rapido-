/*
 * Prove del modello del gestionale (src/core/modello.ts): da un file di esempio nel formato che il gestionale importa
 * si ricava il tracciato, e il file prodotto ha le stesse colonne nello stesso ordine. Si eseguono con: npm test
 * Usano solo dati di fantasia.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../src/core/indice.ts';

const riga = o => Object.assign({ cod_articolo: '', cod_cliente: '', ean: '', descrizione: '', um: '', colli: '', quantita: '', prezzo: '', sc1: '', sc2: '', sc3: '', omaggio: false, netto_doc: '', totale_doc: '', nota: '' }, o);
const ordine = o => Object.assign({ mandante: 'CONSERVE FANTASIA S.P.A.', mandante_cod: 'M001', mandante_piva: '', cliente: 'MARKET FANTASIA S.R.L.', cliente_cod: 'C0012', piva: '01234500033', numero: '2026/0412', data: '2026-11-23', consegna: '2026-11-30', pagamento: 'RIBA 30 GG', destinazione: '', note: '', tot_imponibile: '', tot_colli: '', tot_pezzi: '', righe: [] }, o);
const tabella = testo => Core.parseDelimited(testo, Core.detectSep(testo));

test('nomi delle colonne: riconosciuti come li scrivono i gestionali, anche con maiuscole, punti e accenti', () => {
  const attesi = {
    CodArticolo: 'cod_articolo', 'Codice articolo': 'cod_articolo', Articolo: 'cod_articolo', Descrizione: 'descrizione', Unimis: 'um', 'U.M.': 'um',
    Quantita: 'quantita', 'Q.tà': 'quantita', Pezzi: 'quantita', Colli: 'colli', Cartoni: 'colli', Prezzo: 'prezzo', 'Prezzo unit.': 'prezzo', PrezzoNetto: 'netto',
    Sconto1: 'sc1', 'Sc.2 %': 'sc2', Sconto3: 'sc3', Sconto: 'sc1', Omaggio: 'omaggio', Totale: 'totale', Importo: 'totale',
    CodArtCliente: 'cod_cliente', 'Ns. Codice': 'cod_cliente', EAN: 'ean', Barcode: 'ean', NotaRiga: 'nota', Riga: 'n_riga',
    NumOrdine: 'numero', 'N. ordine': 'numero', DataOrdine: 'data', Data: 'data', DataConsegna: 'consegna', CodCliente: 'cliente_cod', 'Codice cliente': 'cliente_cod',
    Cliente: 'cliente', 'Ragione sociale': 'cliente', PIvaCliente: 'piva', 'Partita IVA': 'piva', CodMandante: 'mandante_cod', 'Cod. fornitore': 'mandante_cod',
    Mandante: 'mandante', Fornitore: 'mandante', Pagamento: 'pagamento', Destinazione: 'destinazione', Note: 'note', TipoDocumento: '', Agente: ''
  };
  for (const [nome, campo] of Object.entries(attesi)) assert.equal(Core.guessField(nome), campo, nome);
});

test('modello con testata e righe: stesse colonne, stesso ordine, formato ricavato dagli esempi', () => {
  const modello = 'NumOrdine;DataOrdine;CodCliente;Cliente;CodMandante;Mandante;Pagamento;DataConsegna;Destinazione;Note;CodArticolo;Descrizione;Unimis;Quantita;Colli;Prezzo;Sconto1;Sconto2;Omaggio\r\n' +
    '0412;27/11/2026;C0009;HOTEL DI PROVA S.R.L.;M001;LATTERIA VALFINTA S.P.A.;BONIFICO 60 GG FM;01/12/2026;cucina;;7715052;MOZZARELLA PER PIZZA FILONE KG 1;PZ;40;4;5,95;0;0;N\r\n';
  const a = Core.analyzeTemplate(tabella(modello), { sep: ';', enc: 'cp1252', format: 'csv' });
  assert.equal(a.columns.length, 19); assert.equal(a.recognized, 19);
  assert.deepEqual([a.sep, a.dec, a.date, a.enc, a.format], [';', ',', 'dmy', 'cp1252', 'csv']);
  assert.deepEqual(a.columns.slice(0, 3).map(c => [c.header, c.field, c.sample]), [['NumOrdine', 'numero', '0412'], ['DataOrdine', 'data', '27/11/2026'], ['CodCliente', 'cliente_cod', 'C0009']]);

  const p = Core.profileFromTemplate(a, Core.defaultProfile(), 'modello-gestionale.csv');
  assert.equal(p.template, 'modello-gestionale.csv');
  const attive = p.cols.filter(c => c.on);
  assert.deepEqual(attive.map(c => c.header), tabella(modello)[0], 'il file avrà le colonne del modello, nello stesso ordine');
  assert.ok(p.cols.some(c => c.id === 'ean' && !c.on), 'i campi che il modello non usa restano disponibili, spenti');

  const o = ordine({ righe: [riga({ cod_articolo: '300101', descrizione: 'PASSATA', quantita: '120', colli: '10', prezzo: '0,85', sc1: '5' })] });
  const csv = Core.toDelimited(Core.buildTable(o, p), p.sep, p.header).split('\r\n');
  assert.equal(csv[0], tabella(modello)[0].join(';'));
  assert.equal(csv[1], '2026/0412;23/11/2026;C0012;MARKET FANTASIA S.R.L.;M001;CONSERVE FANTASIA S.P.A.;RIBA 30 GG;30/11/2026;;;300101;PASSATA;PZ;120;10;0,85;5;;N');
});

test('colonne che l\'app non conosce: valore fisso se nel modello è sempre uguale, altrimenti vuote; punto decimale e date ISO', () => {
  const modello = 'TipoDoc,Agente,Articolo,Qta,Prezzo,DataConsegna,Rif\n' + 'OC,017,300101,12,0.85,2026-12-01,a\n' + 'OC,017,300102,6,1.20,2026-12-01,b\n';
  const a = Core.analyzeTemplate(tabella(modello), { sep: ',', enc: 'utf8', format: 'csv' });
  assert.deepEqual(a.columns.map(c => [c.field, c.value]), [['fisso', 'OC'], ['fisso', '017'], ['cod_articolo', ''], ['quantita', ''], ['prezzo', ''], ['consegna', ''], ['vuoto', '']]);
  assert.deepEqual([a.dec, a.date, a.recognized], ['.', 'iso', 4]);
  const p = Core.profileFromTemplate(a, Core.defaultProfile(), 'm.csv');
  const o = ordine({ righe: [riga({ cod_articolo: '300101', quantita: '12', prezzo: '0,85' }), riga({ cod_articolo: '300102', quantita: '6', prezzo: '1,2' })] });
  assert.deepEqual(Core.toDelimited(Core.buildTable(o, p), p.sep, p.header).split('\r\n').slice(0, 3),
    ['TipoDoc,Agente,Articolo,Qta,Prezzo,DataConsegna,Rif', 'OC,017,300101,12,0.85,2026-11-30,', 'OC,017,300102,6,1.20,2026-11-30,']);
  /* il tracciato salvato e riletto conserva le colonne a valore fisso */
  const riletto = Core.mergeProfile(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(riletto.cols.filter(c => c.on).map(c => [c.id, c.header, c.value]).slice(0, 2), [['x1', 'TipoDoc', 'OC'], ['x2', 'Agente', '017']]);
  assert.equal(riletto.template, 'm.csv');
});

test('modello con la stessa colonna due volte, e senza righe di esempio', () => {
  const a = Core.analyzeTemplate([['Codice', 'Descrizione', 'Codice', '', '']], { format: 'xlsx' });
  assert.deepEqual(a.columns.map(c => c.field), ['cod_articolo', 'descrizione', 'vuoto'], 'un campo si usa una volta sola; le colonne vuote in coda si ignorano');
  assert.deepEqual([a.samples, a.dec, a.date, a.format], [0, ',', 'dmy', 'xlsx']);
});

test('numero di riga e foglio Excel: i numeri restano numeri, i codici restano testo', () => {
  const p = Core.defaultProfile();
  p.cols = [{ id: 'n_riga', on: true, header: 'Riga' }, { id: 'cod_articolo', on: true, header: 'Codice' }, { id: 'quantita', on: true, header: 'Qta' }, { id: 'prezzo', on: true, header: 'Prezzo' }, { id: 'x1', on: true, header: 'Tipo', value: 'OC' }];
  const o = ordine({ righe: [riga({ cod_articolo: '000777', quantita: '12,5', prezzo: '1.016,35' }), riga({ cod_articolo: 'AB12', quantita: '3', prezzo: '' })] });
  assert.deepEqual(Core.buildSheet(o, p), [['Riga', 'Codice', 'Qta', 'Prezzo', 'Tipo'], [1, '000777', 12.5, 1016.35, 'OC'], [2, 'AB12', 3, '', 'OC']]);
  assert.equal(Core.fileName(o, 'xlsx'), 'ordine_CONSERVE-FANTASIA-S-P-A_MARKET-FANTASIA-S-R-L_2026-0412_2026-11-23.xlsx');
});

test('codifica di un file di testo: UTF-8 riconosciuto dalle lettere accentate, altrimenti Windows', () => {
  const enc = new TextEncoder();
  assert.equal(Core.detectEncoding(enc.encode('Quantità;Città')), 'utf8');
  assert.equal(Core.detectEncoding(new Uint8Array([0xEF, 0xBB, 0xBF, 0x41])), 'utf8');
  assert.equal(Core.detectEncoding(new Uint8Array([0x51, 0x74, 0xE0, 0x3B])), 'cp1252', '«Qtà» scritto in codifica Windows');
  assert.equal(Core.detectEncoding(enc.encode('Codice;Descrizione')), 'cp1252', 'senza lettere accentate vale la codifica dei gestionali su Windows');
});
