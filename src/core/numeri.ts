/*
 * Ordine Rapido - numeri e date: lettura del formato italiano e scrittura nel formato scelto.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */

/** Legge un numero scritto all'italiana (1.016,35) o con il punto (12.5). Restituisce null se non è un numero. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[\s€%]/g, '');
  if (!s) return null;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

export function round(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round((n + Number.EPSILON) * f) / f;
}

function trimNum(n: number, min: number, max: number): string {
  let s = n.toFixed(max);
  if (s.indexOf('.') >= 0) {
    const parts = s.split('.');
    let d = (parts[1] ?? '').replace(/0+$/, '');
    while (d.length < min) d += '0';
    s = d ? parts[0] + '.' + d : String(parts[0]);
  }
  if (s === '-0') s = '0';
  return s;
}

/** Quanti decimali mostrare, al minimo e al massimo, per ogni tipo di numero. */
const KIND = { qty: [0, 3], price: [2, 5], pct: [0, 2], money: [2, 2] } as const;
export type NumKind = keyof typeof KIND;

/** Scrive un numero senza zeri inutili, con il separatore decimale indicato (la virgola, se manca). */
export function show(n: number | null | undefined, kind?: NumKind | string, dec?: string): string {
  if (n === null || n === undefined) return '';
  const k = (kind && kind in KIND ? KIND[kind as NumKind] : KIND.qty);
  return trimNum(n, k[0], k[1]).replace('.', dec || ',');
}

/** Data dal formato AAAA-MM-GG a quello scelto: 'iso', 'compact' (GGMMAAAA) oppure GG/MM/AAAA. */
export function fmtDate(iso: string | null | undefined, style?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  if (style === 'iso') return iso || '';
  if (style === 'compact') return String(m[3]) + m[2] + m[1];
  return m[3] + '/' + m[2] + '/' + m[1];
}
