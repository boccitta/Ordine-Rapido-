/*
 * Ordine Rapido - quello che hanno in comune i servizi di intelligenza artificiale che possono leggere gli ordini
 * (Claude di Anthropic, Gemini di Google, GPT di OpenAI). Qui non c'è nessun accesso alla rete: chi usa questi
 * moduli passa la funzione che spedisce la richiesta. Così la stessa logica serve sia alla versione che gira nel
 * browser sia all'app desktop, dove le chiavi restano nel processo principale e la pagina non le vede mai.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { AppError } from '../core/tipi.ts';

/** Quante immagini al massimo accompagnano una lettura. */
export const MAX_IMAGES = 12;
/** Quanto può essere lunga la risposta: un ordine di qualche centinaio di righe ci sta. */
export const MAX_TOKENS = 16000;

/** Un modello: identificativo e nome da mostrare. */
export type Model = [id: string, name: string];
/** Un'immagine già codificata in base64, pronta per la richiesta. */
export interface EncodedImage { media_type: string; data: string }

/** Il minimo che serve di una risposta HTTP. */
export interface HttpReply { ok: boolean; status: number; json(): Promise<unknown> }
export interface HttpRequest { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: AbortSignal }
/** La funzione che spedisce davvero la richiesta: fetch nel browser, la sessione di rete dedicata nell'app desktop. */
export type Send = (url: string, request: HttpRequest) => Promise<HttpReply>;

/** Una chiave API non può contenere spazi né caratteri fuori dall'ASCII stampabile. */
export function keyLooksValid(key: string): boolean { return !!key && !/[^\x21-\x7E]/.test(key); }

export const wait = (ms: number) => new Promise<void>(r => { setTimeout(r, ms); });

/** L'errore descritto dal servizio: il messaggio, più codice, tipo e stato quando ci sono. Google a volte lo chiude in un elenco. */
function errorInfo(body: unknown): { message: string; sig: string } {
  const b = Array.isArray(body) ? body[0] : body;
  const o = b && typeof b === 'object' ? b as Record<string, unknown> : {};
  const er = o.error && typeof o.error === 'object' ? o.error as Record<string, unknown> : {};
  const message = String(er.message || o.message || '').slice(0, 600);
  const reasons = Array.isArray(er.details) ? (er.details as unknown[]).map(d => (d && typeof d === 'object' ? String((d as { reason?: unknown }).reason || '') : '')).join(' ') : '';
  return { message, sig: [message, er.code, er.type, er.status, reasons].filter(x => typeof x === 'string' && x).join(' ') };
}
export function errorMessage(body: unknown): string { return errorInfo(body).message; }

/**
 * Traduce uno stato HTTP e l'errore descritto dal servizio in un codice che l'interfaccia sa spiegare.
 * I tre servizi usano quasi sempre gli stessi stati per le stesse cose; le differenze stanno nelle parole.
 */
export function httpError(status: number, body: unknown): AppError {
  const { message: msg, sig } = errorInfo(body);
  let code = status === 401 ? 'bad_key' : status === 402 ? 'billing' : status === 403 ? 'no_permission' : status === 404 ? 'bad_model'
    : status === 413 ? 'prompt_too_large' : status === 429 ? 'rate_limited' : status >= 500 ? 'overloaded' : 'api_invalid';
  if (status === 400 || status === 403) {
    if (/api.?key.*(invalid|not valid|expired|leaked)|invalid.*api.?key|incorrect api key|API_KEY_INVALID|invalid_api_key/i.test(sig)) code = 'bad_key';
    else if (/too long|too large|maximum context|context length|exceed.*(token|limit)/i.test(sig)) code = 'prompt_too_large';
    else if (/credit|billing|spend|quota|insufficient|FAILED_PRECONDITION|payment/i.test(sig)) code = 'billing';
    else if (/safety|blocked/i.test(sig)) code = 'refused';
    else if (/image/i.test(sig)) code = 'image_rejected';
    else if (/model/i.test(sig) && status === 400) code = 'bad_model';
  }
  if (status === 429 && /credit_balance|insufficient_quota|spend_limit|usage_limit|billing|credit/i.test(sig)) code = 'billing';
  return new AppError(code, msg, { status, detail: msg.slice(0, 300) });
}

/** Una richiesta HTTP con risposta JSON: un errore di rete diventa «offline», uno del servizio il suo codice. */
export async function callJson(send: Send, url: string, request: HttpRequest): Promise<Record<string, unknown>> {
  let res: HttpReply, data: unknown = null;
  try { res = await send(url, request); }
  catch { throw new AppError(request.signal && request.signal.aborted ? 'cancelled' : 'offline'); }
  try { data = await res.json(); } catch { /* corpo assente o non JSON: si decide dallo stato */ }
  if (!res.ok) throw httpError(res.status, data);
  if (!data || typeof data !== 'object') throw new AppError('overloaded', '', { status: res.status });
  return data as Record<string, unknown>;
}

/** Riprova una volta, dopo una breve attesa, se il servizio è momentaneamente sovraccarico. */
export async function once<T>(fn: () => Promise<T>, signal?: AbortSignal | null): Promise<T> {
  try { return await fn(); }
  catch (e) {
    if (!(e instanceof AppError) || (e.status !== 529 && e.status !== 503)) throw e;
    await wait(2500);
    if (signal && signal.aborted) throw new AppError('cancelled');
    return fn();
  }
}

/** Che cosa sa fare un servizio: dire quali modelli ha l'account, e leggere un ordine rispondendo in JSON. */
export interface Provider {
  /** chi è: identificativo, nome del servizio e dell'azienda che lo offre */
  id: string; name: string; company: string;
  /** l'indirizzo a cui si collega: l'unico, per questo servizio */
  base: string;
  /** come cominciano le sue chiavi, per suggerirlo nel campo */
  keyStart: string;
  /** i modelli proposti finché l'elenco non viene letto dall'account, il primo è quello consigliato */
  models: readonly Model[];
  hints: Readonly<Record<string, string>>;
  listModels(send: Send, key: string, browser: boolean): Promise<Model[]>;
  askJson(send: Send, key: string, model: string, prompt: string, images: readonly EncodedImage[], signal: AbortSignal | null, browser: boolean): Promise<unknown>;
}
