/*
 * Ordine Rapido - i servizi di intelligenza artificiale tra cui scegliere per leggere gli ordini.
 * Ognuno con la sua chiave, i suoi modelli e il suo unico indirizzo. La lettura sul dispositivo non passa da qui.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { anthropic } from './anthropic.ts';
import type { Model, Provider } from './comune.ts';
import { gemini } from './gemini.ts';
import { openai } from './openai.ts';

export { MAX_IMAGES, keyLooksValid } from './comune.ts';
export type { EncodedImage, HttpReply, HttpRequest, Model, Provider, Send } from './comune.ts';

export type ProviderId = 'anthropic' | 'gemini' | 'openai';
/** Nell'ordine in cui compaiono nelle impostazioni. */
export const PROVIDER_IDS: readonly ProviderId[] = ['anthropic', 'gemini', 'openai'];
export const PROVIDERS: Readonly<Record<ProviderId, Provider>> = { anthropic, gemini, openai };

export function isProviderId(v: unknown): v is ProviderId { return typeof v === 'string' && PROVIDER_IDS.indexOf(v as ProviderId) >= 0; }
export function provider(id: ProviderId): Provider { return PROVIDERS[id]; }
/** Gli indirizzi a cui l'app può collegarsi: uno per servizio, nient'altro. */
export const HOSTS: readonly string[] = PROVIDER_IDS.map(id => PROVIDERS[id].base);
/** true se l'indirizzo è quello di uno dei servizi (e non, per esempio, un nome che comincia allo stesso modo). */
export function allowedUrl(url: string): boolean { return HOSTS.some(h => url.indexOf(h + '/') === 0); }

/**
 * Il modello da proporre dopo aver letto l'elenco dell'account: quello già scelto se c'è ancora, altrimenti
 * il primo dei consigliati che l'account offre, altrimenti il primo dell'elenco.
 */
export function pickModel(id: ProviderId, current: string, list: readonly Model[]): string {
  if (!list.length) return current || (PROVIDERS[id].models[0] || [''])[0];
  if (current && list.some(m => m[0] === current)) return current;
  for (const m of PROVIDERS[id].models) if (list.some(x => x[0] === m[0])) return m[0];
  return (list[0] as Model)[0];
}
