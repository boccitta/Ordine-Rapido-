/*
 * Ordine Rapido - Gemini, di Google: come si compone la richiesta e come si legge la risposta (generateContent).
 * Google consiglia la nuova interfaccia «Interactions» per i progetti nuovi, ma dichiara generateContent pienamente
 * supportata e senza data di fine: qui si usa questa, che è la più collaudata. Documentazione verificata il 27 novembre 2026.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { extractJson } from '../core/risposta.ts';
import { AppError } from '../core/tipi.ts';
import { callJson, once } from './comune.ts';
import type { EncodedImage, HttpRequest, Model, Provider, Send } from './comune.ts';

export const API = 'https://generativelanguage.googleapis.com';
/* i modelli che ragionano contano anche il ragionamento nel limite della risposta */
const MAX_OUTPUT = 32768;

/* La chiave va nell'intestazione, non nell'indirizzo: così non finisce in nessun registro. Nessun'altra intestazione:
   una in più (per esempio Api-Revision) fa rifiutare la richiesta quando parte da una pagina. */
function request(key: string, body: unknown, signal: AbortSignal | null): HttpRequest {
  const r: HttpRequest = { method: body ? 'POST' : 'GET', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' } };
  if (body) r.body = JSON.stringify(body);
  if (signal) r.signal = signal;
  return r;
}

export function contentBody(prompt: string, images: readonly EncodedImage[]): Record<string, unknown> {
  const parts: unknown[] = images.map(im => ({ inline_data: { mime_type: im.media_type || 'image/jpeg', data: im.data } }));
  parts.push({ text: prompt });
  return { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: MAX_OUTPUT } };
}

/* l'elenco dell'account contiene anche modelli che non servono a leggere un documento */
const NOT_FOR_READING = /image|tts|live|transcribe|embed|omni|audio|robotics|computer-use|aqa|native/;
const BLOCKED = /SAFETY|PROHIBITED_CONTENT|RECITATION|BLOCKLIST|SPII|IMAGE_SAFETY|OTHER/;

export const gemini: Provider = {
  id: 'gemini', name: 'Gemini', company: 'Google', base: API, keyStart: 'AIza',
  models: [['gemini-4-hydrogen', 'Gemini 4 Hydrogen'], ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'], ['gemini-4-carbon', 'Gemini 4 Carbon']],
  hints: { 'gemini-4-hydrogen': ' (consigliato)', 'gemini-3.5-flash-lite': ' (più economico)' },

  /** L'elenco dei modelli. Una risposta valida dice solo che la chiave esiste: credito e permessi si scoprono alla prima lettura. */
  async listModels(send: Send, key: string): Promise<Model[]> {
    const data = await callJson(send, API + '/v1beta/models?pageSize=1000', request(key, null, null));
    const out: Model[] = [];
    for (const m of Array.isArray(data.models) ? data.models as unknown[] : []) {
      if (!m || typeof m !== 'object') continue;
      const o = m as { name?: unknown; displayName?: unknown; supportedGenerationMethods?: unknown };
      const id = String(o.name || '').replace(/^models\//, ''), methods = Array.isArray(o.supportedGenerationMethods) ? o.supportedGenerationMethods : [];
      if (/^gemini-/.test(id) && methods.indexOf('generateContent') >= 0 && !NOT_FOR_READING.test(id)) out.push([id, String(o.displayName || id)]);
    }
    const rank = (id: string) => { const k = gemini.models.findIndex(x => x[0] === id); return k < 0 ? 99 : k; };
    return out.sort((a, b) => rank(a[0]) - rank(b[0]) || (a[0] < b[0] ? 1 : -1));
  },

  async askJson(send, key, model, prompt, images, signal) {
    const body = contentBody(prompt, images), url = API + '/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    const data = await once(() => callJson(send, url, request(key, body, signal)), signal);
    const fb = data.promptFeedback && typeof data.promptFeedback === 'object' ? data.promptFeedback as { blockReason?: unknown } : {};
    if (fb.blockReason) throw new AppError('refused');
    const cand = Array.isArray(data.candidates) && data.candidates[0] && typeof data.candidates[0] === 'object' ? data.candidates[0] as Record<string, unknown> : null;
    if (!cand) throw new AppError('invalid_json');
    const finish = String(cand.finishReason || '');
    const content = cand.content && typeof cand.content === 'object' ? cand.content as { parts?: unknown } : {};
    /* le parti di ragionamento (thought) non sono la risposta */
    const text = (Array.isArray(content.parts) ? content.parts as unknown[] : [])
      .map(p => (p && typeof p === 'object' && !(p as { thought?: unknown }).thought ? String((p as { text?: unknown }).text ?? '') : '')).join('');
    if (finish === 'MAX_TOKENS') throw new AppError('too_long');
    if (!text && BLOCKED.test(finish)) throw new AppError('refused');
    return extractJson(text);
  }
};
