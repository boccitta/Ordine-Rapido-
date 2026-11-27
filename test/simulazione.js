/*
 * Simulazione del servizio di Anthropic per le prove: risponde al posto del servizio vero,
 * così le prove non hanno bisogno di una chiave e non mandano nulla su internet.
 */
'use strict';

/* Chiave inventata, scritta a pezzi perché il controllo dei dati (scripts/controlla-dati.js) segnala tutto ciò che somiglia a una chiave vera. */
const CHIAVE_FINTA = 'sk-' + 'ant-chiave-di-prova-non-valida';

/* Quello che il modello risponderebbe leggendo esempi/ordine-esempio.pdf. Tre righe sono scritte apposta in modo "difficile":
   codice con uno zero in più, codice assente ma EAN presente, omaggio senza netto né totale. */
const ORDINE_LETTO = {
  mandante: { nome: 'CONSERVE FANTASIA S.P.A.', piva: null },
  cliente: { nome: 'MARKET FANTASIA S.R.L.', piva: '01234500033' },
  destinazione: 'MARKET FANTASIA S.R.L., VIA INVENTATA 22, 07026 Olbia (SS)',
  numero_ordine: '2026/0412', data_ordine: '2026-11-23', data_consegna: '2026-11-30', pagamento: 'RIBA 30 GG DF FM', note: null,
  righe: [
    { cod_articolo: '300101', cod_cliente: 'A1101', ean: null, descrizione: 'PASSATA DI POMODORO BOTTIGLIA GR 700', um: 'PZ', colli: 10, quantita: 120, prezzo: 0.85, sconti: [5], omaggio: false, prezzo_netto: 0.8075, totale: 96.9, nota: null },
    { cod_articolo: '0300102', cod_cliente: 'A1102', ean: null, descrizione: 'POLPA DI POMODORO LATTA GR 400', um: 'PZ', colli: 5, quantita: 120, prezzo: 0.55, sconti: [], omaggio: false, prezzo_netto: 0.55, totale: 66, nota: null },
    { cod_articolo: null, cod_cliente: 'A1310', ean: '2000003003013', descrizione: "TONNO ALL'OLIO DI OLIVA GR 80 X 3", um: 'PZ', colli: 4, quantita: 64, prezzo: 2.95, sconti: [5], omaggio: false, prezzo_netto: 2.8025, totale: 179.36, nota: null },
    { cod_articolo: '300301', cod_cliente: 'A1310', ean: null, descrizione: "TONNO ALL'OLIO DI OLIVA GR 80 X 3", um: 'PZ', colli: 1, quantita: 16, prezzo: 2.95, sconti: [], omaggio: true, prezzo_netto: null, totale: null, nota: null },
    { cod_articolo: '300402', cod_cliente: 'A1422', ean: null, descrizione: "CARCIOFINI SOTT'OLIO VASO GR 280", um: 'PZ', colli: 3, quantita: 36, prezzo: 2.6, sconti: [], omaggio: false, prezzo_netto: 2.6, totale: 93.6, nota: null }
  ],
  totali: { imponibile: 435.86, colli: 23, pezzi: 356 },
  avvisi: ['Riga 4 senza netto e totale: trattata come omaggio.']
};

/* Intercetta le richieste verso Anthropic fatte dalla pagina (o da tutto il contesto) e le annota in "chiamate". */
async function simulaAnthropic(bersaglio, chiamate) {
  await bersaglio.route('https://api.anthropic.com/**', async route => {
    const req = route.request(), url = new URL(req.url()), h = req.headers();
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    chiamate.push({ path: url.pathname, method: req.method(), headers: h, body: req.postDataJSON() });
    if (h.authorization !== 'Bearer ' + CHIAVE_FINTA)
      return route.fulfill({ status: 401, headers: cors, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
    if (url.pathname === '/v1/models')
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ data: [
        { type: 'model', id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', lifecycle: 'active' },
        { type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', lifecycle: 'active' },
        { type: 'model', id: 'claude-vecchio-1', display_name: 'Claude Vecchio', lifecycle: 'deprecated' }], has_more: false }) });
    if (url.pathname === '/v1/messages') {
      const testo = req.postDataJSON().messages[0].content.find(b => b.type === 'text').text;
      const risposta = /^Abbina ogni riga/.test(testo) ? '[{"riga":1,"cod":"300403"}]' : 'Ecco la trascrizione:\n```json\n' + JSON.stringify(ORDINE_LETTO) + '\n```';
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: risposta }] }) });
    }
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
}

/*
 * Come sopra, per l'app desktop. Lì le richieste non partono dalla finestra ma dal processo principale, in una sessione
 * di rete dedicata: si intercettano in quel punto, senza toccare il codice dell'app. Le richieste viste restano
 * annotate nel processo principale e si leggono con chiamateDesktop().
 */
async function simulaAnthropicDesktop(app) {
  await app.evaluate(({ session }, { chiave, ordine }) => {
    globalThis.__chiamateAnthropic = [];
    const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
    session.fromPartition('ordine-rapido-anthropic').protocol.handle('https', async richiesta => {
      const url = new URL(richiesta.url), h = Object.fromEntries(richiesta.headers);
      const corpo = richiesta.method === 'POST' ? await richiesta.json() : null;
      globalThis.__chiamateAnthropic.push({ host: url.host, path: url.pathname, method: richiesta.method, headers: h, body: corpo });
      if (url.host !== 'api.anthropic.com') return json(404, {});
      if (h.authorization !== 'Bearer ' + chiave) return json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      if (url.pathname === '/v1/models')
        return json(200, { data: [
          { type: 'model', id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', lifecycle: 'active' },
          { type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', lifecycle: 'active' },
          { type: 'model', id: 'claude-vecchio-1', display_name: 'Claude Vecchio', lifecycle: 'deprecated' }], has_more: false });
      if (url.pathname === '/v1/messages') {
        const testo = corpo.messages[0].content.find(b => b.type === 'text').text;
        const risposta = /^Abbina ogni riga/.test(testo) ? '[{"riga":1,"cod":"300403"}]' : 'Ecco la trascrizione:\n```json\n' + JSON.stringify(ordine) + '\n```';
        return json(200, { type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: risposta }] });
      }
      return json(404, {});
    });
  }, { chiave: CHIAVE_FINTA, ordine: ORDINE_LETTO });
}
const chiamateDesktop = app => app.evaluate(() => globalThis.__chiamateAnthropic || []);

module.exports = { CHIAVE_FINTA, ORDINE_LETTO, simulaAnthropic, simulaAnthropicDesktop, chiamateDesktop };
