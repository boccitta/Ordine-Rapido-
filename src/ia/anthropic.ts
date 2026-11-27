/*
 * Ordine Rapido - Claude, di Anthropic: come si compone la richiesta e come si legge la risposta (API Messages).
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { extractJson } from '../core/risposta.ts';
import { AppError } from '../core/tipi.ts';
import { MAX_TOKENS, callJson, once } from './comune.ts';
import type { EncodedImage, HttpRequest, Model, Provider, Send } from './comune.ts';

export const API = 'https://api.anthropic.com';
export const API_VERSION = '2026-10-21';
const PATH_MESSAGES = '/v1/messages', PATH_MODELS = '/v1/models?limit=100';

function request(key: string, body: unknown, signal: AbortSignal | null, browser: boolean): HttpRequest {
  const headers: Record<string, string> = { 'authorization': 'Bearer ' + key, 'anthropic-version': API_VERSION, 'content-type': 'application/json' };
  /* l'intestazione che il servizio chiede quando la richiesta parte direttamente da una pagina; dal processo principale non serve */
  if (browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
  const r: HttpRequest = { method: body ? 'POST' : 'GET', headers };
  if (body) r.body = JSON.stringify(body);
  if (signal) r.signal = signal;
  return r;
}

export function messageBody(model: string, prompt: string, images: readonly EncodedImage[]): Record<string, unknown> {
  const content: unknown[] = images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.media_type || 'image/jpeg', data: im.data } }));
  content.push({ type: 'text', text: prompt });
  return { model, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content }] };
}

export const anthropic: Provider = {
  id: 'anthropic', name: 'Claude', company: 'Anthropic', base: API, keyStart: 'sk-ant-',
  models: [['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5'], ['claude-opus-5-5', 'Claude Opus 5.5']],
  hints: { 'claude-sonnet-5-5': ' (consigliato)', 'claude-haiku-5-5': ' (più economico)' },

  /** L'elenco dei modelli attivi dell'account. Non consuma credito: serve anche a provare la chiave. */
  async listModels(send: Send, key: string, browser: boolean): Promise<Model[]> {
    const data = await callJson(send, API + PATH_MODELS, request(key, null, null, browser));
    const out: Model[] = [];
    for (const m of Array.isArray(data.data) ? data.data as unknown[] : []) {
      if (!m || typeof m !== 'object') continue;
      const o = m as { id?: unknown; display_name?: unknown; lifecycle?: unknown };
      if (o.id && (!o.lifecycle || o.lifecycle === 'active')) out.push([String(o.id), String(o.display_name || o.id)]);
    }
    return out;
  },

  /** Chiede al modello una risposta in JSON e la restituisce già letta. Se il servizio è sovraccarico riprova una volta. */
  async askJson(send, key, model, prompt, images, signal, browser) {
    const body = messageBody(model, prompt, images);
    const data = await once(() => callJson(send, API + PATH_MESSAGES, request(key, body, signal, browser)), signal);
    if (data.stop_reason === 'refusal') throw new AppError('refused');
    if (data.stop_reason === 'max_tokens') throw new AppError('too_long');
    const blocks = Array.isArray(data.content) ? data.content as unknown[] : [];
    const text = blocks.map(b => (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text') ? String((b as { text?: unknown }).text ?? '') : '').join('');
    return extractJson(text);
  }
};
