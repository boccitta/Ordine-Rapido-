/*
 * Prove delle ricette dei clienti (src/core/ricette.ts): da un ordine esportato l'app impara com'è fatto il documento
 * di quel cliente, e il suo ordine successivo viene letto allo stesso modo. Si eseguono con: npm test
 * Usano solo dati di fantasia.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../src/core/indice.ts';

const art = (cod, desc, conf) => ({ cod, desc, ean: '', um: 'PZ', mand: 'CONSERVE FANTASIA S.P.A.', prezzo: '', conf: conf || '' });
const ARTICOLI = [art('300101', 'PASSATA DI POMODORO BOTTIGLIA GR 700', '12'), art('300102', 'POLPA DI POMODORO LATTA GR 400', '24'), art('300201', 'CECI LESSATI LATTA GR 400'),
  art('300301', 'TONNO ALL\'OLIO DI OLIVA GR 80 X 3'), art('PA0201', 'MALLOREDDUS GR 500'), art('PA0210', 'LASAGNE ALL\'UOVO GR 250')];
const CLIENTI = [{ cod: 'C0020', nome: 'MINIMARKET FITTIZIO DI BIANCHI L.', piva: '01234500101' }, { cod: 'C0021', nome: 'HOTEL BELVEDERE DI PROVA S.R.L.', piva: '01234500099' }];
const ctx = alias => ({ ix: Core.buildIndex(ARTICOLI), cli: CLIENTI, man: [], today: '2026-11-27', alias });
const link = (cod, desc) => ({ cod, desc, um: 'PZ', mand: 'CONSERVE FANTASIA S.P.A.', ok: true, via: 'codice' });
const riga = o => Object.assign({ cod_articolo: '', cod_cliente: '', ean: '', descrizione: '', um: '', colli: '', quantita: '', prezzo: '', sc1: '', sc2: '', sc3: '', omaggio: false, netto_doc: '', totale_doc: '', nota: '', link: null }, o);
const ordine = (righe, chi = CLIENTI[0]) => ({ mandante: 'CONSERVE FANTASIA S.P.A.', mandante_cod: '', mandante_piva: '', cliente: chi.nome, cliente_cod: chi.cod, piva: chi.piva, numero: '', data: '', consegna: '', pagamento: '', destinazione: '', note: '', tot_imponibile: '', tot_colli: '', tot_pezzi: '', righe });

/* il foglio di un cliente che scrive le colonne a modo suo: «Rif.», «Merce», «N», «Cf», «Euro», «Annotazioni» */
const foglio = n => Core.fromGrid('ordine-' + n + '.xlsx', [
  ['MINIMARKET FITTIZIO DI BIANCHI L.'], ['Ordine n. 7' + n, null, '2' + n + '/11/2026'],
  ['Rif.', 'Merce', 'N', 'Cf', 'Euro', 'Annotazioni'],
  ['300101', 'PASSATA BOTTIGLIA 700', 12 + n, 2, 0.85, null],
  ['300102', 'POLPA LATTA 400', 24, 1, 0.55, null],
  ['300201', 'CECI LESSATI', 6, 1, 0.62, 'urgente']
]);

test('ricetta da un foglio: le colonne che le regole non capiscono si imparano dall\'ordine esportato', () => {
  const alias = {};
  /* senza ricetta: «N» non si sa che cosa sia (è la quantità in pezzi), «Euro» nemmeno (è il prezzo) */
  const prima = Core.readLocal([foglio(1)], ctx(alias));
  assert.deepEqual(prima.righe.map(r => [r.cod_articolo, r.colli, r.quantita, r.prezzo]), [['300101', 2, null, null], ['300102', 1, null, null], ['300201', 1, null, null]]);
  assert.equal(prima.ricetta, null);
  /* chi usa l'app completa le righe, controlla ed esporta */
  const fatto = ordine([
    riga({ cod_articolo: '300101', descrizione: 'PASSATA BOTTIGLIA 700', quantita: '13', colli: '2', prezzo: '0,85', link: link('300101', 'PASSATA DI POMODORO BOTTIGLIA GR 700') }),
    riga({ cod_articolo: '300102', descrizione: 'POLPA LATTA 400', quantita: '24', colli: '1', prezzo: '0,55', link: link('300102', 'POLPA') }),
    riga({ cod_articolo: '300201', descrizione: 'CECI LESSATI', quantita: '6', colli: '1', prezzo: '0,62', nota: 'urgente', link: link('300201', 'CECI') })]);
  const l = Core.learnRecipe(alias, fatto, [foglio(1)], '2026-11-27');
  assert.equal(l.nuova, true);
  assert.deepEqual(l.recipe.formati[0].colonne, { rif: 'cod_articolo', merce: 'descrizione', n: 'quantita', cf: 'colli', euro: 'prezzo', annotazioni: 'nota' });
  assert.ok(Object.keys(alias).every(k => k.startsWith(Core.RECIPE)) && Core.aliasCount(alias) === 0, 'la ricetta sta tra gli abbinamenti, con la sua chiave');
  /* l'ordine successivo dello stesso cliente: letto per intero */
  const dopo = Core.readLocal([foglio(2)], ctx(alias));
  assert.deepEqual(dopo.righe.map(r => [r.cod_articolo, r.colli, r.quantita, r.prezzo, r.nota]), [['300101', 2, 14, 0.85, null], ['300102', 1, 24, 0.55, null], ['300201', 1, 6, 0.62, 'urgente']]);
  assert.deepEqual(dopo.ricetta, { cliente: 'MINIMARKET FITTIZIO DI BIANCHI L.', ordini: 1 });
  /* un secondo ordine esportato aggiorna la stessa ricetta, non ne crea un'altra */
  const ancora = Core.learnRecipe(alias, fatto, [foglio(2)], '2026-11-28');
  assert.deepEqual([ancora.nuova, ancora.recipe.ordini, ancora.recipe.formati.length, ancora.recipe.formati[0].volte, Core.recipes(alias).length], [false, 2, 1, 2, 1]);
  /* e quello che si è imparato aiuta anche l'intelligenza artificiale, se serve */
  const hints = Core.recipeHints([foglio(3)], ctx(alias));
  assert.match(hints.join('\n'), /«n» = quantita \(pezzi\); «cf» = colli \(cartoni\); «euro» = prezzo/);
});

test('ricetta da un messaggio: l\'unità sottintesa quando il cliente scrive solo un numero', () => {
  const alias = {}, msg = t => Core.fromText('Messaggio', 'Ciao, sono il Minimarket Fittizio di Bianchi L.\n' + t);
  const prima = Core.readLocal([msg('passata 700 10\npolpa 400 4')], ctx(alias));
  assert.deepEqual(prima.righe.map(r => [r.colli, r.quantita]), [[null, 10], [null, 4]], 'senza ricetta un numero da solo vale pezzi, e lo si segnala');
  assert.ok(prima.avvisi.some(w => /senza unità/.test(w)));
  Core.learnRecipe(alias, ordine([riga({ descrizione: 'passata 700', colli: '10', link: link('300101', 'PASSATA DI POMODORO BOTTIGLIA GR 700') }), riga({ descrizione: 'polpa 400', colli: '4', link: link('300102', 'POLPA DI POMODORO LATTA GR 400') })]),
    [msg('passata 700 10\npolpa 400 4')], '2026-11-27');
  const dopo = Core.readLocal([msg('ceci 3\ntonno 2')], ctx(alias));
  assert.deepEqual(dopo.righe.map(r => [r.descrizione, r.colli, r.quantita]), [['ceci', 3, null], ['tonno', 2, null]], 'per questo cliente un numero da solo sono cartoni');
  assert.ok(!dopo.avvisi.some(w => /senza unità/.test(w)), 'è l\'unità di sempre: niente da segnalare');
  assert.equal(dopo.ricetta.cliente, 'MINIMARKET FITTIZIO DI BIANCHI L.');
});

test('ricette: si ritrovano per codice, partita IVA o nome; si tolgono senza toccare gli abbinamenti', () => {
  const alias = { 'd|01234500101|PASSATA': '300101' };
  Core.learnRecipe(alias, ordine([riga({ cod_articolo: '300101', descrizione: 'PASSATA BOTTIGLIA 700', quantita: '13', colli: '2', link: link('300101', 'PASSATA') }),
    riga({ cod_articolo: '300102', descrizione: 'POLPA LATTA 400', quantita: '24', colli: '1', link: link('300102', 'POLPA') })]), [foglio(1)], '2026-11-27');
  for (const chi of [{ nome: '', piva: '', cod: 'c0020' }, { nome: '', piva: '01234500101', cod: '' }, { nome: 'Minimarket Fittizio di Bianchi L. S.R.L.', piva: '', cod: '' }])
    assert.equal(Core.findRecipe(alias, chi).recipe.cod, 'C0020', JSON.stringify(chi));
  assert.equal(Core.findRecipe(alias, { nome: 'ALTRO CLIENTE', piva: '', cod: '' }), null);
  /* un formato si riconosce anche senza sapere chi l'ha mandato */
  assert.equal(Core.formatsFor(alias, null).length, 1);
  Core.clearLearned(alias, 'alias');
  assert.deepEqual([Core.aliasCount(alias), Core.recipes(alias).length], [0, 1]);
  Core.clearLearned(alias, 'recipes');
  assert.deepEqual(Object.keys(alias), []);
  /* una ricetta rovinata si ignora, non blocca niente */
  assert.deepEqual(Core.recipes({ 'r|c:X': '{non json' }), []);
});

test('niente da imparare: cliente sconosciuto, nessun documento, oppure righe che nel documento non si trovano', () => {
  const alias = {}, righe = [riga({ cod_articolo: '300101', descrizione: 'PASSATA', colli: '2', link: link('300101', 'PASSATA') })];
  assert.equal(Core.learnRecipe(alias, Object.assign(ordine(righe), { cliente: '', cliente_cod: '', piva: '' }), [foglio(1)], '2026-11-27'), null);
  assert.equal(Core.learnRecipe(alias, ordine(righe), [], '2026-11-27'), null);
  assert.equal(Core.learnRecipe(alias, ordine([riga({ cod_articolo: '999999', descrizione: 'ARTICOLO CHE NEL DOCUMENTO NON C\'E', colli: '2' })]), [foglio(1)], '2026-11-27'), null);
  assert.deepEqual(alias, {});
});

test('confronti tolleranti: parole con una lettera sbagliata, cliente letto male da una foto, descrizione già vista', () => {
  assert.equal(Core.distance('MALLOEDDUS', 'MALLOREDDUS'), 1);
  assert.equal(Core.distance('ABCDEF', 'UVWXYZ', 2), 3, 'oltre il massimo si smette di contare');
  assert.ok(Core.approxContains('HOTELBELVEDEREDAPROVASRL', 'HOTELBELVEDEREDIPROVA', 2));
  assert.ok(!Core.approxContains('HOTELBELVEDEREDAPROVASRL', 'MINIMARKETFITTIZIO', 2));
  const ix = Core.buildIndex(ARTICOLI);
  assert.equal(Core.search(ix, 'Malloeddus 500g', '', 1)[0].art.cod, 'PA0201', 'una lettera sbagliata e «500g» attaccato');
  assert.equal(Core.search(ix, 'lasagne alluovo', '', 1)[0].art.cod, 'PA0210', '«all\'uovo» scritto attaccato');
  /* un cliente con il nome letto male da una foto: riconosciuto lo stesso */
  const foto = Core.fromItems('buono.jpg', [{ s: 'HOTELBELVEDEREDAPROVA SRL', x: 200, y: 100, w: 600, h: 30 }, { s: 'Codice', x: 200, y: 300, w: 120, h: 30 }, { s: 'Descrizione', x: 400, y: 300, w: 200, h: 30 }, { s: 'Colli', x: 1100, y: 300, w: 90, h: 30 },
    { s: '300101', x: 200, y: 380, w: 120, h: 30 }, { s: 'PASSATA DI POMODORO', x: 400, y: 380, w: 400, h: 30 }, { s: '4', x: 1120, y: 380, w: 20, h: 30 }], { photo: true });
  const a = Core.readLocal([foto], ctx({}));
  assert.deepEqual([a.cliente.nome, a.righe.length], ['HOTEL BELVEDERE DI PROVA S.R.L.', 1]);
  /* la stessa descrizione dello stesso cliente con una lettera diversa: vale l'abbinamento già usato */
  const o = ordine([]), r = riga({ descrizione: 'TONNO ALL OLIO DI OLIVA 80X3 GR' });
  const l = Core.matchRow(ix, r, o, { ['d|01234500101|' + 'TONNO ALL OLIO DI OLIVA 80X3 GRR']: '300301' });
  assert.deepEqual([l.ok, l.cod, l.via], [true, '300301', 'storico']);
});
