/*
 * Prove della lettura sul dispositivo (src/core/lettura): dal contenuto di un foglio, di una pagina o di un messaggio
 * all'ordine, senza intelligenza artificiale. Si eseguono con: npm test
 * Usano solo dati di fantasia.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../src/core/indice.ts';

const art = (cod, desc, ean, conf) => ({ cod, desc, ean: ean || '', um: 'PZ', mand: 'CONSERVE FANTASIA S.P.A.', prezzo: '', conf: conf || '' });
const ARTICOLI = [
  art('300101', 'PASSATA DI POMODORO BOTTIGLIA GR 700', '2000900012958', '12'), art('300102', 'POLPA DI POMODORO LATTA GR 400', '2000900013320', '24'),
  art('300103', 'POMODORI PELATI LATTA GR 400', '', '24'), art('300201', 'CECI LESSATI LATTA GR 400'), art('300202', 'FAGIOLI BORLOTTI LATTA GR 400'),
  art('300301', 'TONNO ALL\'OLIO DI OLIVA GR 80 X 3'), art('300302', 'TONNO AL NATURALE GR 80 X 3'), art('300401', 'OLIVE VERDI DENOCCIOLATE VASO GR 290'), art('300410', 'BURRO PANETTO GR 250')
];
const CLIENTI = [{ cod: 'C0012', nome: 'MARKET FANTASIA S.R.L.', piva: '01234500033' }, { cod: 'C0020', nome: 'MINIMARKET FITTIZIO DI BIANCHI L.', piva: '01234500101' }];
const MANDANTI = [{ cod: 'M001', nome: 'CONSERVE FANTASIA S.P.A.', piva: '09876500012' }];
const ctx = (conArchivio = true) => ({ ix: conArchivio ? Core.buildIndex(ARTICOLI) : null, cli: conArchivio ? CLIENTI : [], man: conArchivio ? MANDANTI : [], today: '2026-11-27' });
/** Un pezzo di testo su una pagina: x, y (dall'alto), testo. La larghezza è proporzionale alla lunghezza. */
const p = (x, y, s) => ({ s, x, y, w: s.length * 5, h: 9 });
const righe = a => a.righe.map(r => [r.cod_articolo, r.colli, r.quantita, r.prezzo, r.sconti.join('+'), r.omaggio]);

test('numeri e date scritti all\'italiana', () => {
  const numeri = { '1.016,35': 1016.35, '12,450': 12.45, '4.388': 4388, '0.85': 0.85, '0,7500': 0.75, '24': 24, '1.5': 1.5, '€ 3,40': 3.4, '5%': 5, 'KG.3': null, '12/5': null, '1,2,3': null };
  for (const [s, n] of Object.entries(numeri)) assert.equal(Core.readNumber(s), n, s);
  const date = { 'del 27/11/2026': '2026-11-27', '[27/11/26, 08:41]': '2026-11-27', '2026-12-03': '2026-12-03', 'entro sabato 5 dicembre': '2026-12-05', 'consegna giovedì mattina': '2026-12-03',
    'venerdì prossimo': '2026-12-04', 'domani': '2026-11-28', '3 gennaio': '2027-01-03', 'quando puoi': '', '5 margherite': '' };
  for (const [s, d] of Object.entries(date)) assert.equal(Core.findDate(s, '2026-11-27'), d, s);
});

test('foglio Excel: intestazioni riconosciute, numeri veri, quantità dai colli, omaggi, totali, testata', () => {
  const foglio = Core.fromGrid('ordine.xlsx', [
    ['MARKET FANTASIA S.R.L.'], ['VIA INVENTATA 22 - 07026 OLBIA (SS) - P.IVA 01234500033'],
    ['ORDINE DI ACQUISTO N.', null, 'ODA-77'], ['Data', null, new Date(2026, 10, 27)], ['Fornitore', null, 'CONSERVE FANTASIA S.P.A.'],
    ['Pagamento', null, 'RIBA 60 GG DF FM'], ['Consegna richiesta', null, '04/12/2026'], ['Luogo di consegna', null, 'Magazzino di Via Inventata 22'],
    ['Ns. Codice', 'Vs. Codice', 'EAN', 'Descrizione', 'Cartoni', 'Pz x cartone', 'Pezzi', 'Prezzo', 'Sconto 1 %', 'Sconto 2 %', 'Netto', 'Importo', 'Note'],
    [100231, '300101', 2000900012958, 'PASSATA DI POMODORO GR 700', 20, 12, 240, 0.85, 12, 3, 0.72556, 174.13, null],
    [100232, null, 2000900013320, 'POLPA DI POMODORO GR 400', 10, 24, null, 0.55, 8, null, 0.506, 121.44, null],
    [100231, '300101', null, 'PASSATA DI POMODORO GR 700', 2, 12, 24, 0.85, null, null, null, null, 'SCONTO MERCE'],
    [null, null, null, null, null, null, null, null, null, null, 'Totale cartoni', 32], [null, null, null, null, null, null, null, null, null, null, 'Totale pezzi', 504],
    [null, null, null, null, null, null, null, null, null, null, 'Imponibile', 295.57], ['Le righe con nota SCONTO MERCE sono in omaggio.']
  ]);
  const a = Core.readLocal([foglio], ctx());
  assert.deepEqual(righe(a), [['300101', 20, 240, 0.85, '12+3', false], [null, 10, 240, 0.55, '8', false], ['300101', 2, 24, 0.85, '', true]]);
  assert.deepEqual([a.righe[0].cod_cliente, a.righe[0].ean, a.righe[1].ean, a.righe[0].prezzo_netto, a.righe[0].totale], ['100231', '2000900012958', '2000900013320', 0.72556, 174.13]);
  assert.deepEqual(a.totali, { imponibile: 295.57, colli: 32, pezzi: 504 });
  assert.deepEqual([a.cliente.nome, a.cliente.piva, a.mandante.nome, a.mandante.piva], ['MARKET FANTASIA S.R.L.', '01234500033', 'CONSERVE FANTASIA S.P.A.', '09876500012']);
  assert.deepEqual([a.numero_ordine, a.data_ordine, a.data_consegna, a.pagamento, a.destinazione], ['ODA-77', '2026-11-27', '2026-12-04', 'RIBA 60 GG DF FM', 'Magazzino di Via Inventata 22']);
  assert.deepEqual(a.avvisi, []);
});

test('pagina PDF: colonne riconosciute dalla posizione, intestazioni attaccate, omaggio senza netto, fine tabella ai totali', () => {
  const y = n => 100 + n * 12;
  const pagina = Core.fromItems('ordine.pdf', [
    p(30, 20, 'MARKET FANTASIA S.R.L.'), p(400, 20, 'Spett.le fornitore'), p(400, 44, 'CONSERVE FANTASIA S.P.A.'),
    p(30, 44, 'Partita IVA 01234500033 - Ufficio acquisti'), p(30, 60, 'PROPOSTA D\'ORDINE N. 58/B'), p(250, 60, 'DATA 27/11/2026'),
    p(30, 76, 'Pagamento'), p(90, 76, 'RIBA 30 GG'), p(200, 76, 'Consegna richiesta'), p(300, 76, '03/12/2026'), p(380, 76, 'Destinazione'), p(450, 76, 'PUNTO VENDITA DI OLBIA'),
    p(30, y(0), 'Riga'), p(60, y(0), 'Cod. forn.'), p(130, y(0), 'Descrizione articolo'), p(330, y(0), 'UM'), p(360, y(0), 'Colli'), p(400, y(0), 'Pz/collo'), p(455, y(0), 'Quantità'),
    p(510, y(0), 'Prezzo'), { s: 'Sc.1 % Sc.2 % Prezzo netto', x: 550, y: y(0), w: 135, h: 9 }, p(700, y(0), 'IMPORTO IVA'),
    p(30, y(1), '10'), p(60, y(1), '300101'), p(130, y(1), 'PASSATA DI POMODORO BOTTIGLIA GR 700'), p(330, y(1), 'PZ'), p(370, y(1), '40'), p(425, y(1), '12'), p(480, y(1), '480'),
    p(510, y(1), '0,8500'), p(560, y(1), '8,00'), p(595, y(1), '3,00'), p(650, y(1), '0,75854'), p(705, y(1), '364,10'), p(745, y(1), '4'),
    p(30, y(2), '20'), p(60, y(2), '300103'), p(130, y(2), 'POMODORI PELATI LATTA GR 400'), p(330, y(2), 'PZ'), p(375, y(2), '3'), p(425, y(2), '24'), p(485, y(2), '72'), p(510, y(2), '0,5800'),
    p(30, y(3), '30'), p(130, y(3), 'TONNO AL NATURALE GR 80 X 3'), p(330, y(3), 'PZ'), p(370, y(3), '12'), p(425, y(3), '16'), p(480, y(3), '192'), p(510, y(3), '2,7500'),
    p(560, y(3), '4,00'), p(650, y(3), '2,64000'), p(705, y(3), '506,88'), p(745, y(3), '10'),
    p(60, y(5), 'Totale colli'), p(140, y(5), 'Totale pezzi'), p(230, y(5), 'Importo merce'), p(80, y(6), '55'), p(160, y(6), '744'), p(245, y(6), '870,98'),
    p(30, y(8), 'Note'), p(64, y(8), 'Scarico solo su appuntamento.'), p(64, y(9), 'Bancali a rendere.'), p(240, y(11), 'Documento di fantasia: 3 colli di prova')
  ]);
  const a = Core.readLocal([pagina], ctx());
  assert.deepEqual(righe(a), [['300101', 40, 480, 0.85, '8+3', false], ['300103', 3, 72, 0.58, '', true], [null, 12, 192, 2.75, '4', false]]);
  assert.deepEqual([a.righe[0].prezzo_netto, a.righe[0].totale, a.righe[2].descrizione, a.righe[2].totale], [0.75854, 364.1, 'TONNO AL NATURALE GR 80 X 3', 506.88]);
  assert.deepEqual(a.totali, { imponibile: 870.98, colli: 55, pezzi: 744 });
  assert.deepEqual([a.numero_ordine, a.data_ordine, a.data_consegna, a.pagamento, a.destinazione, a.note], ['58/B', '2026-11-27', '2026-12-03', 'RIBA 30 GG', 'PUNTO VENDITA DI OLBIA', 'Scarico solo su appuntamento. Bancali a rendere']);
  assert.deepEqual([a.cliente.nome, a.mandante.nome], ['MARKET FANTASIA S.R.L.', 'CONSERVE FANTASIA S.P.A.']);
  assert.equal(a.avvisi.length, 1); assert.match(a.avvisi[0], /^Riga 2: ha il prezzo ma né netto né importo/);
  /* senza archivio: il cliente è chi sta in cima a sinistra, la mandante quella dopo «Spett.le» */
  const b = Core.readLocal([pagina], ctx(false));
  assert.deepEqual([b.cliente.nome, b.cliente.piva, b.mandante.nome, b.righe.length], ['MARKET FANTASIA S.R.L.', '01234500033', 'CONSERVE FANTASIA S.P.A.', 3]);
});

test('messaggio a parole: cartoni e pezzi, omaggio, giorno di consegna, cliente e mandante dall\'archivio', () => {
  const testo = 'Ciao, sono Luca del Minimarket Fittizio di Bianchi L.\nPer giovedì mi servono dalla Conserve Fantasia:\n6 cartoni di passata bottiglia 700\n2 ct polpa 400\ne 20 panetti di burro da 250\n' +
    'Se riesci mettimi anche 1 cartone di ceci in omaggio come l\'altra volta 😉\nPago alla consegna come sempre. Grazie!\nVia Inventata 22';
  const a = Core.readLocal([Core.fromText('Messaggio', testo)], ctx());
  assert.deepEqual(a.righe.map(r => [r.descrizione, r.colli, r.quantita, r.omaggio]), [['passata bottiglia 700', 6, null, false], ['polpa 400', 2, null, false], ['panetti di burro da 250', null, 20, false], ['ceci', 1, null, true]]);
  assert.deepEqual([a.cliente.nome, a.mandante.nome, a.data_consegna, a.pagamento], ['MINIMARKET FITTIZIO DI BIANCHI L.', 'CONSERVE FANTASIA S.P.A.', '2026-12-03', 'alla consegna']);
});

test('chat con correzioni: «fai 12» cambia la quantità, «togli» elimina la riga, e lo si dice', () => {
  const chat = '[27/11/26, 08:41:12] Luca: Buongiorno\n[27/11/26, 08:43:05] Luca: passata 700 gr 10 ct\npolpa 400 5 ct\nborlotti 3 ct\ntonno olio oliva 80x3  2 ct\n' +
    '[27/11/26, 08:44:17] Agente: ricevuto. Tonno al naturale niente?\n[27/11/26, 08:48:30] Luca: anzi la passata fai 12 e togli i borlotti che ne ho ancora\n[27/11/26, 08:49:02] Luca: aggiungi 1 ct olive verdi e 1 di ceci';
  const a = Core.readLocal([Core.fromText('Messaggio', chat)], ctx());
  assert.deepEqual(a.righe.map(r => [r.descrizione, r.colli]), [['passata 700 gr', 12], ['polpa 400', 5], ['tonno olio oliva 80x3', 2], ['olive verdi', 1], ['ceci', 1]]);
  assert.equal(a.data_ordine, '2026-11-27');
  assert.equal(a.avvisi.filter(w => /portata da 10 a 12|Tolta la riga «borlotti»/.test(w)).length, 2);
  /* la ricerca in archivio trova gli articoli anche da descrizioni abbreviate */
  const ix = Core.buildIndex(ARTICOLI);
  assert.deepEqual(a.righe.map(r => Core.search(ix, r.descrizione, '', 1)[0].art.cod), ['300101', '300102', '300301', '300401', '300201']);
  assert.equal(Core.search(ix, 'panetti di burro da 250', '', 1)[0].art.cod, '300410', '«panetti» trova «panetto»');
});

test('mail con una tabella scritta a spazi: la tabella finisce alla riga vuota, lo sconto su tutto va su ogni riga', () => {
  const mail = 'Da: Anna, ufficio ordini\nInviato: venerdì 27 novembre 2026 08:12\n\nBuongiorno, le invio l\'ordine per Conserve Fantasia, consegna entro sabato 5 dicembre.\n\n' +
    'Cod.     Articolo                      Cartoni\n300101   Passata 700 g                     5\n300102   Polpa 400 g                       4\n999999   Articolo che non esiste           2\n\n' +
    'Come concordato: sconto 8% su tutta la fornitura e, sui 5 cartoni di passata, 1 cartone in più in omaggio.\nPagamento con bonifico a 30 giorni fine mese, come sempre.\n\nMARKET FANTASIA S.R.L. - P.IVA 01234500033';
  const a = Core.readLocal([Core.fromText('Messaggio', mail)], ctx());
  assert.deepEqual(righe(a), [['300101', 5, null, null, '8', false], ['300102', 4, null, null, '8', false], ['999999', 2, null, null, '8', false]]);
  assert.deepEqual([a.data_ordine, a.data_consegna, a.pagamento, a.cliente.nome], ['2026-11-27', '2026-12-05', 'bonifico a 30 giorni fine mese', 'MARKET FANTASIA S.R.L.']);
  assert.ok(a.avvisi.some(w => /Fuori dalla tabella si parla di merce in omaggio/.test(w)) && a.avvisi.some(w => /sconto del 8%/.test(w)));
});

test('foto presa di sbieco: le righe che salgono restano righe, la cifra corretta a penna vince, i codici vengono dall\'archivio', () => {
  /* come li dà il riconoscimento dei caratteri: riquadri dritti, righe in salita verso destra, qualche pezzo attaccato */
  const su = (x, y) => y - x * 0.05;
  const o = (x, y, s, w) => ({ s, x, y: su(x, y), w: w || s.length * 22, h: 30 });
  const foto = Core.fromItems('buono.jpg', [
    o(220, 300, 'BUONO D\'ORDINE N.0412'), o(1210, 300, 'del 27/11/2026'), o(230, 380, 'Fornitore CONSERVEFANTASIA S.P.A.'),
    o(238, 700, 'Codice'), o(431, 700, 'Descrizione'), o(1150, 700, 'Colli'), o(1336, 700, 'Prezzo unit.'),
    o(236, 790, '300101 PASSATADI POMODORO GR 700 4', 960), o(1334, 790, '0,85'),
    o(233, 880, '300102'), o(425, 880, 'POLPA DI POMODORO GR 400'), o(1133, 880, 'K 5 0,55', 300),
    o(418, 970, 'ceci lessati'), o(1186, 970, '2')
  ], { photo: true });
  const a = Core.readLocal([foto], ctx());
  assert.deepEqual(righe(a), [['300101', 4, null, 0.85, '', false], ['300102', 5, null, 0.55, '', false], [null, 2, null, null, '', false]]);
  assert.deepEqual([a.numero_ordine, a.data_ordine, a.mandante.nome, a.cliente.nome], ['0412', '2026-11-27', 'CONSERVE FANTASIA S.P.A.', null], 'da una foto il cliente non si tira a indovinare');
});

test('niente righe d\'ordine: indirizzi, saluti e documenti che non sono ordini non diventano righe', () => {
  const a = Core.readLocal([Core.fromText('Messaggio', 'Buongiorno, ci vediamo martedì alle 10 in Via Inventata 22.\nCi sentiamo al solito numero, pagamento a 30 giorni.\nGrazie')], ctx());
  assert.deepEqual(a.righe, []);
  const b = Core.readLocal([Core.fromGrid('listino.xlsx', [['Codice', 'Descrizione', 'Prezzo'], ['300101', 'PASSATA', 0.85]])], ctx());
  assert.deepEqual(b.righe, [], 'un listino non ha colli né quantità');
});
