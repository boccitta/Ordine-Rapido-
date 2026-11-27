/*
 * Ordine Rapido - colloquio con Anthropic: come si compone la richiesta e come si legge la risposta.
 * Qui non c'è nessun accesso alla rete: chi usa questo modulo passa la funzione che spedisce la richiesta.
 * Così la stessa logica serve sia alla versione che gira nel browser sia all'app desktop, dove la chiave
 * resta nel processo principale e la pagina non la vede mai.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { extractJson } from '../core/risposta.ts';
import { AppError } from '../core/tipi.ts';

/** L'unico indirizzo esterno a cui l'app si collega. */
export const API = 'https://api.anthropic.com';
export const API_VERSION = '2026-10-21';
/** Quante immagini al massimo accompagnano una lettura. */
export const MAX_IMAGES = 12;
export const MAX_TOKENS = 16000;
export const PATH_MESSAGES = '/v1/messages';
export const PATH_MODELS = '/v1/models?limit=100';

/** Un modello: identificativo e nome da mostrare. */
export type Model = [id: string, name: string];
/** Modelli proposti finché l'elenco non viene letto dall'account di chi usa l'app. */
export const MODELS: readonly Model[] = [['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5'], ['claude-opus-5-5', 'Claude Opus 5.5']];
export const MODEL_HINT: Readonly<Record<string, string>> = { 'claude-sonnet-5-5': ' (consigliato)', 'claude-haiku-5-5': ' (più economico)' };

/** Un'immagine già codificata in base64, pronta per la richiesta. */
export interface EncodedImage { media_type: string; data: string }

/** Il minimo che serve di una risposta HTTP. */
export interface HttpReply { ok: boolean; status: number; json(): Promise<unknown> }
export interface HttpRequest { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: AbortSignal }
/** La funzione che spedisce davvero la richiesta: fetch nel browser, la sessione di rete dedicata nell'app desktop. */
export type Send = (url: string, request: HttpRequest) => Promise<HttpReply>;

/** Una chiave API non può contenere spazi né caratteri fuori dall'ASCII stampabile. */
export function keyLooksValid(key: string): boolean { return !!key && !/[^\x21-\x7E]/.test(key); }

/** Traduce uno stato HTTP e il corpo dell'errore in un codice che l'interfaccia sa spiegare. */
export function apiError(status: number, body: unknown): AppError {
  const er = (body && typeof body === 'object' ? (body as { error?: unknown }).error : null) as { message?: unknown } | null | undefined;
  const msg = String((er && er.message) || '');
  let code = status === 401 ? 'bad_key' : status === 402 ? 'billing' : status === 403 ? 'no_permission' : status === 404 ? 'bad_model'
    : status === 413 ? 'prompt_too_large' : status === 429 ? 'rate_limited' : status >= 500 ? 'overloaded' : 'api_invalid';
  if (status === 400) {
    if (/too long|too large|maximum context|exceed/i.test(msg)) code = 'prompt_too_large';
    else if (/credit|billing|spend/i.test(msg)) code = 'billing';
    else if (/image/i.test(msg)) code = 'image_rejected';
    else if (/model/i.test(msg)) code = 'bad_model';
  }
  return new AppError(code, msg, { status, detail: msg.slice(0, 300) });
}

/**
 * Una richiesta ad Anthropic. `browser` aggiunge l'intestazione che il servizio chiede quando la richiesta
 * parte direttamente da una pagina; dal processo principale dell'app desktop non serve.
 */
export async function apiCall(send: Send, key: string, path: string, body: unknown, signal?: AbortSignal | null, browser = false): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { 'authorization': 'Bearer ' + key, 'anthropic-version': API_VERSION, 'content-type': 'application/json' };
  if (browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
  const request: HttpRequest = { method: body ? 'POST' : 'GET', headers };
  if (body) request.body = JSON.stringify(body);
  if (signal) request.signal = signal;
  let res: HttpReply, data: unknown = null;
  try { res = await send(API + path, request); }
  catch { throw new AppError(signal && signal.aborted ? 'cancelled' : 'offline'); }
  try { data = await res.json(); } catch { /* corpo assente o non JSON: si decide dallo stato */ }
  if (!res.ok) throw apiError(res.status, data);
  if (!data || typeof data !== 'object') throw new AppError('overloaded', '', { status: res.status });
  return data as Record<string, unknown>;
}

/** L'elenco dei modelli attivi dell'account. Non consuma credito: serve anche a provare la chiave. */
export async function listModels(send: Send, key: string, browser = false): Promise<Model[]> {
  const data = await apiCall(send, key, PATH_MODELS, null, null, browser);
  const list = Array.isArray(data.data) ? data.data as unknown[] : [];
  const out: Model[] = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const o = m as { id?: unknown; display_name?: unknown; lifecycle?: unknown };
    if (o.id && (!o.lifecycle || o.lifecycle === 'active')) out.push([String(o.id), String(o.display_name || o.id)]);
  }
  return out;
}

export function messageBody(model: string, prompt: string, images: readonly EncodedImage[]): Record<string, unknown> {
  const content: unknown[] = images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.media_type || 'image/jpeg', data: im.data } }));
  content.push({ type: 'text', text: prompt });
  return { model, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content }] };
}

const wait = (ms: number) => new Promise<void>(r => { setTimeout(r, ms); });

/**
 * Chiede al modello una risposta in JSON e la restituisce già letta.
 * Se il servizio è sovraccarico (stato 529) riprova una volta dopo una breve attesa.
 */
export async function askJson(send: Send, key: string, model: string, prompt: string, images: readonly EncodedImage[], signal?: AbortSignal | null, browser = false): Promise<unknown> {
  const body = messageBody(model, prompt, images);
  let data: Record<string, unknown>;
  try { data = await apiCall(send, key, PATH_MESSAGES, body, signal, browser); }
  catch (e) {
    if (!(e instanceof AppError) || e.status !== 529) throw e;
    await wait(2500);
    if (signal && signal.aborted) throw new AppError('cancelled');
    data = await apiCall(send, key, PATH_MESSAGES, body, signal, browser);
  }
  if (data.stop_reason === 'refusal') throw new AppError('refused');
  if (data.stop_reason === 'max_tokens') throw new AppError('too_long');
  const blocks = Array.isArray(data.content) ? data.content as unknown[] : [];
  const text = blocks.map(b => (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text') ? String((b as { text?: unknown }).text ?? '') : '').join('');
  return extractJson(text);
}
