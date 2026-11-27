/*
 * Ordine Rapido - risposta del modello: da testo a dati.
 * La risposta è trattata come un dato da controllare, mai come un'istruzione.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { str } from './anagrafiche.ts';
import { AppError } from './tipi.ts';

function tryParse(s: string): { ok: true; value: unknown } | { ok: false } {
  try { return { ok: true, value: JSON.parse(s) }; } catch { return { ok: false }; }
}

/** Estrae l'oggetto o l'array JSON anche se è incorniciato da altro testo. */
export function extractJson(text: unknown): unknown {
  const s = str(text).trim();
  const whole = tryParse(s);
  if (whole.ok) return whole.value;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) { const inFence = tryParse((fence[1] || '').trim()); if (inFence.ok) return inFence.value; }
  const a = s.search(/[\[{]/);
  if (a < 0) throw new AppError('invalid_json');
  const b = s.lastIndexOf(s.charAt(a) === '{' ? '}' : ']');
  if (b <= a) throw new AppError('invalid_json');
  const part = tryParse(s.slice(a, b + 1));
  if (!part.ok) throw new AppError('invalid_json');
  return part.value;
}
