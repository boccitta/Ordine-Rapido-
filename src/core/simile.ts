/*
 * Ordine Rapido - confronti tolleranti tra testi. Servono quando un testo arriva con qualche lettera sbagliata,
 * come succede con le foto: «MALLOEDDUS» deve poter trovare «MALLOREDDUS».
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */

/**
 * Quante lettere bisogna cambiare, aggiungere o togliere per passare da un testo all'altro (distanza di Levenshtein).
 * Smette di contare appena supera `max`: in quel caso restituisce max + 1.
 */
export function distance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Array<number>(b.length + 1), cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let low = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur[j] = v;
      if (v < low) low = v;
    }
    if (low > max) return max + 1;
    const t = prev; prev = cur; cur = t;
  }
  return prev[b.length] as number;
}

/** Quanto si somigliano due testi, da 0 (niente) a 1 (uguali). */
export function ratio(a: string, b: string): number {
  const n = Math.max(a.length, b.length);
  return n ? 1 - distance(a, b) / n : 1;
}

/**
 * true se `pattern` compare dentro `text` con al massimo `maxErr` lettere diverse.
 * È la ricerca approssimata di Sellers: costa la lunghezza del testo per quella del pezzo cercato.
 */
export function approxContains(text: string, pattern: string, maxErr: number): boolean {
  const m = pattern.length;
  if (!m) return true;
  let col = new Array<number>(m + 1);
  for (let i = 0; i <= m; i++) col[i] = i;
  for (let j = 1; j <= text.length; j++) {
    const next = new Array<number>(m + 1);
    next[0] = 0;
    for (let i = 1; i <= m; i++) {
      next[i] = Math.min((col[i] as number) + 1, (next[i - 1] as number) + 1, (col[i - 1] as number) + (pattern[i - 1] === text[j - 1] ? 0 : 1));
    }
    if ((next[m] as number) <= maxErr) return true;
    col = next;
  }
  return false;
}

/** Quante parole hanno in comune due elenchi, rispetto al più corto: 1 se le parole dell'uno sono tutte nell'altro. */
export function overlapShare(a: readonly string[], b: readonly string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  let n = 0;
  for (const w of new Set(a)) if (sb.has(w)) n++;
  return n / Math.min(new Set(a).size, sb.size);
}
