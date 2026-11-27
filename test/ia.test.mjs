/*
 * Prove dei tre servizi di intelligenza artificiale (src/ia): come si compone la richiesta, come si legge la risposta,
 * come si traducono gli errori. Il servizio è simulato: nessuna richiesta parte davvero. Si eseguono con: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as IA from '../src/ia/indice.ts';

const risposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
/* un servizio finto: risponde con `corpo` e ricorda le richieste */
function finto(status, corpo) {
  const viste = [];
  const send = (url, req) => { viste.push({ url, req, body: req.body ? JSON.parse(req.body) : null }); return Promise.resolve(risposta(status, typeof corpo === 'function' ? corpo(url) : corpo)); };
  return { send, viste };
}
const IMG = [{ media_type: 'image/jpeg', data: 'QUJD' }];
const codice = async p => { try { await p; return 'nessun errore'; } catch (e) { return e.code; } };

test('servizi: tre, ognuno con il suo indirizzo e i modelli consigliati', () => {
  assert.deepEqual(IA.PROVIDER_IDS, ['anthropic', 'gemini', 'openai']);
  assert.deepEqual(IA.HOSTS, ['https://api.anthropic.com', 'https://generativelanguage.googleapis.com', 'https://api.openai.com']);
  assert.ok(IA.allowedUrl('https://api.openai.com/v1/responses'));
  assert.ok(!IA.allowedUrl('https://api.openai.com.esempio.it/v1/responses'), 'un nome che comincia allo stesso modo non basta');
  assert.ok(!IA.allowedUrl('https://googleapis.com/'));
  assert.equal(IA.pickModel('openai', '', [['gpt-6.1-terra', 'x'], ['gpt-6.2-sol', 'y']]), 'gpt-6.2-sol', 'il consigliato, se l\'account lo ha');
  assert.equal(IA.pickModel('openai', 'gpt-6.1-terra', [['gpt-6.1-terra', 'x'], ['gpt-6.2-sol', 'y']]), 'gpt-6.1-terra', 'quello già scelto resta');
  assert.equal(IA.pickModel('gemini', 'vecchio', [['gemini-9', 'x']]), 'gemini-9');
});

test('Claude: richiesta, risposta, rifiuto e risposta troncata', async () => {
  const c = IA.PROVIDERS.anthropic, f = finto(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Ecco:\n```json\n{"righe":[]}\n```' }] });
  assert.deepEqual(await c.askJson(f.send, 'k', 'claude-sonnet-5-5', 'Trascrivi in JSON', IMG, null, true), { righe: [] });
  assert.equal(f.viste[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(f.viste[0].req.headers['anthropic-dangerous-direct-browser-access'], 'true', 'dal browser serve questa intestazione');
  assert.deepEqual(f.viste[0].body.messages[0].content.map(b => b.type), ['image', 'text']);
  assert.equal(await codice(c.askJson(finto(200, { stop_reason: 'refusal', content: [] }).send, 'k', 'm', 'x', [], null, false)), 'refused');
  assert.equal(await codice(c.askJson(finto(200, { stop_reason: 'max_tokens', content: [] }).send, 'k', 'm', 'x', [], null, false)), 'too_long');
});

test('GPT: API Responses, immagini come data URL, testo preso dal messaggio e non dal ragionamento', async () => {
  const o = IA.PROVIDERS.openai;
  const f = finto(200, { status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: '{"righe":[{"descrizione":"A"}]}' }] }] });
  assert.deepEqual(await o.askJson(f.send, 'sk-x', 'gpt-6.2-sol', 'Trascrivi in JSON', IMG, null, true), { righe: [{ descrizione: 'A' }] });
  const v = f.viste[0];
  assert.equal(v.url, 'https://api.openai.com/v1/responses');
  assert.equal(v.req.headers.authorization, 'Bearer sk-x');
  assert.deepEqual([v.body.model, v.body.store, v.body.text.format.type], ['gpt-6.2-sol', false, 'json_object']);
  assert.deepEqual(v.body.input[0].content, [{ type: 'input_text', text: 'Trascrivi in JSON' }, { type: 'input_image', image_url: 'data:image/jpeg;base64,QUJD', detail: 'high' }]);
  assert.equal(await codice(o.askJson(finto(200, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }).send, 'k', 'm', 'x', [], null, true)), 'refused');
  assert.equal(await codice(o.askJson(finto(200, { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }).send, 'k', 'm', 'x', [], null, true)), 'too_long');
  const l = await o.listModels(finto(200, { data: [{ id: 'gpt-6.1-terra' }, { id: 'gpt-6-realtime' }, { id: 'gpt-6.2-sol' }, { id: 'tts-2' }, { id: 'gpt-6-image' }, { id: 'gpt-6.2-astra' }] }).send, 'k', true);
  assert.deepEqual(l, [['gpt-6.2-sol', 'GPT-6.2 Sol'], ['gpt-6.1-terra', 'GPT-6.1 Terra'], ['gpt-6.2-astra', 'GPT-6.2 Astra']]);
});

test('Gemini: chiave nell\'intestazione e non nell\'indirizzo, JSON richiesto, parti di ragionamento scartate', async () => {
  const g = IA.PROVIDERS.gemini;
  const f = finto(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ci penso', thought: true }, { text: '{"righe":[{"descrizione":"B"}]}' }] } }] });
  assert.deepEqual(await g.askJson(f.send, 'AIzaX', 'gemini-4-hydrogen', 'Trascrivi in JSON', IMG, null, true), { righe: [{ descrizione: 'B' }] });
  const v = f.viste[0];
  assert.equal(v.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent');
  assert.equal(v.req.headers['x-goog-api-key'], 'AIzaX');
  assert.ok(!v.url.includes('AIzaX') && !('api-revision' in v.req.headers), 'nessuna chiave nell\'indirizzo, nessuna intestazione in più');
  assert.equal(v.body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(v.body.contents[0].parts, [{ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } }, { text: 'Trascrivi in JSON' }]);
  assert.equal(await codice(g.askJson(finto(200, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"righe":[' }] } }] }).send, 'k', 'm', 'x', [], null, true)), 'too_long');
  assert.equal(await codice(g.askJson(finto(200, { promptFeedback: { blockReason: 'SAFETY' } }).send, 'k', 'm', 'x', [], null, true)), 'refused');
  assert.equal(await codice(g.askJson(finto(200, { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }).send, 'k', 'm', 'x', [], null, true)), 'refused');
  const l = await g.listModels(finto(200, { models: [{ name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-4-hydrogen', displayName: 'Gemini 4 Hydrogen', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-embedding-2', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/gemini-4-hydrogen-tts', supportedGenerationMethods: ['generateContent'] }] }).send, 'k', true);
  assert.deepEqual(l, [['gemini-4-hydrogen', 'Gemini 4 Hydrogen'], ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite']]);
});

test('errori: tradotti nello stesso modo per tutti e tre i servizi', async () => {
  const casi = [
    [IA.PROVIDERS.anthropic, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 'bad_key'],
    [IA.PROVIDERS.gemini, 400, [{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }], 'bad_key'],
    [IA.PROVIDERS.gemini, 403, { error: { code: 403, message: 'Your API key was reported as leaked. Please use another API key.', status: 'PERMISSION_DENIED' } }, 'bad_key'],
    [IA.PROVIDERS.gemini, 429, { error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } }, 'rate_limited'],
    [IA.PROVIDERS.gemini, 402, { error: { code: 'payment_required', message: 'Prepay credits depleted' } }, 'billing'],
    [IA.PROVIDERS.openai, 401, { error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' } }, 'bad_key'],
    [IA.PROVIDERS.openai, 429, { error: { message: 'You exceeded your current quota', type: 'insufficient_quota', code: 'credit_balance_exhausted' } }, 'billing'],
    [IA.PROVIDERS.openai, 429, { error: { message: 'Rate limit reached for requests', type: 'rate_limit_error', code: 'rate_limit_exceeded' } }, 'rate_limited'],
    [IA.PROVIDERS.openai, 404, { error: { message: 'The model does not exist', code: 'model_not_found' } }, 'bad_model'],
    [IA.PROVIDERS.openai, 500, {}, 'overloaded']
  ];
  for (const [p, status, corpo, atteso] of casi) assert.equal(await codice(p.askJson(finto(status, corpo).send, 'k', 'm', 'x', [], null, true)), atteso, p.name + ' ' + status);
  /* senza rete: «offline», per tutti */
  for (const id of IA.PROVIDER_IDS) assert.equal(await codice(IA.PROVIDERS[id].listModels(() => Promise.reject(new TypeError('Failed to fetch')), 'k', true)), 'offline');
  /* sovraccarico: si riprova una volta */
  let n = 0;
  const due = () => Promise.resolve(++n === 1 ? risposta(503, {}) : risposta(200, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"righe":[]}' }] }] }));
  assert.deepEqual(await IA.PROVIDERS.openai.askJson(due, 'k', 'm', 'x', [], null, true), { righe: [] });
  assert.equal(n, 2);
  assert.ok(IA.keyLooksValid('sk-abc') && !IA.keyLooksValid('con spazio') && !IA.keyLooksValid(''));
});
