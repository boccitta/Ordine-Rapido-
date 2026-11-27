/*
 * Ordine Rapido - GPT, di OpenAI: come si compone la richiesta e come si legge la risposta (API Responses,
 * quella che OpenAI consiglia per i progetti nuovi). Documentazione verificata il 27 novembre 2026.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { extractJson } from '../core/risposta.ts';
import { AppError } from '../core/tipi.ts';
import { callJson, once } from './comune.ts';
import type { EncodedImage, HttpRequest, Model, Provider, Send } from './comune.ts';

export const API = 'https://api.openai.com';
/* i modelli che ragionano contano anche il ragionamento nel limite della risposta: OpenAI consiglia di lasciarne almeno 25.000 */
const MAX_OUTPUT = 32000;

function request(key: string, body: unknown, signal: AbortSignal | null): HttpRequest {
  const r: HttpRequest = { method: body ? 'POST' : 'GET', headers: { 'authorization': 'Bearer ' + key, 'content-type': 'application/json' } };
  if (body) r.body = JSON.stringify(body);
  if (signal) r.signal = signal;
  return r;
}

export function responsesBody(model: string, prompt: string, images: readonly EncodedImage[]): Record<string, unknown> {
  const content: unknown[] = [{ type: 'input_text', text: prompt }];
  for (const im of images) content.push({ type: 'input_image', image_url: 'data:' + (im.media_type || 'image/jpeg') + ';base64,' + im.data, detail: 'high' });
  /* store:false: OpenAI per impostazione conserva le risposte; un ordine non ha motivo di restare là */
  return { model, input: [{ role: 'user', content }], text: { format: { type: 'json_object' } }, max_output_tokens: MAX_OUTPUT, store: false };
}

/** Il nome da mostrare di un modello, ricavato dall'identificativo: gpt-6.2-astra diventa GPT-6.2 Astra. */
export function modelName(id: string): string {
  return id.split('-').map((w, i) => (i === 0 ? w.toUpperCase() : /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('-').replace(/-(?=[A-Z][a-z])/g, ' ');
}
/* l'elenco dell'account contiene anche modelli che non servono a leggere un documento */
const NOT_FOR_READING = /image|realtime|transcribe|tts|audio|search|live|cyber|embed|moderation|instruct|codex|preview/;

export const openai: Provider = {
  id: 'openai', name: 'GPT', company: 'OpenAI', base: API, keyStart: 'sk-',
  models: [['gpt-6.2-sol', 'GPT-6.2 Sol'], ['gpt-6.1-terra', 'GPT-6.1 Terra'], ['gpt-6.2-astra', 'GPT-6.2 Astra']],
  hints: { 'gpt-6.2-sol': ' (consigliato)', 'gpt-6.1-terra': ' (più economico)' },

  async listModels(send: Send, key: string): Promise<Model[]> {
    const data = await callJson(send, API + '/v1/models', request(key, null, null));
    const out: Model[] = [];
    for (const m of Array.isArray(data.data) ? data.data as unknown[] : []) {
      const id = m && typeof m === 'object' ? String((m as { id?: unknown }).id || '') : '';
      if (/^gpt-\d/.test(id) && !NOT_FOR_READING.test(id)) out.push([id, modelName(id)]);
    }
    /* prima quelli proposti, poi gli altri dal più recente */
    const rank = (id: string) => { const k = openai.models.findIndex(x => x[0] === id); return k < 0 ? 99 : k; };
    return out.sort((a, b) => rank(a[0]) - rank(b[0]) || (a[0] < b[0] ? 1 : -1));
  },

  async askJson(send, key, model, prompt, images, signal) {
    const body = responsesBody(model, prompt, images);
    const data = await once(() => callJson(send, API + '/v1/responses', request(key, body, signal)), signal);
    const reason = data.incomplete_details && typeof data.incomplete_details === 'object' ? (data.incomplete_details as { reason?: unknown }).reason : '';
    if (reason === 'content_filter') throw new AppError('refused');
    let text = '', refused = false;
    /* il testo sta nei messaggi dell'elenco output, nelle parti di tipo output_text: non per forza nel primo */
    for (const item of Array.isArray(data.output) ? data.output as unknown[] : []) {
      if (!item || typeof item !== 'object' || (item as { type?: unknown }).type !== 'message') continue;
      for (const part of Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : []) {
        const p = part && typeof part === 'object' ? part as { type?: unknown; text?: unknown } : {};
        if (p.type === 'output_text') text += String(p.text ?? '');
        else if (p.type === 'refusal') refused = true;
      }
    }
    if (!text && refused) throw new AppError('refused');
    if (data.status === 'incomplete' && reason === 'max_output_tokens') throw new AppError('too_long');
    return extractJson(text);
  }
};
