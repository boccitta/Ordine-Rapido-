/*
 * Ordine Rapido - calcoli e controlli sull'ordine: netto e totale di riga, totali, confronto con il documento.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { num, round, show } from './numeri.ts';
import type { Check, CheckContext, Order, Row } from './tipi.ts';

export interface RowCalc { netto: number | null; totale: number | null }
export interface Totals { righe: number; colli: number; pezzi: number; merce: number; omaggi: number; incompleti: number }

/** Oltre queste differenze il netto o il totale calcolato si considera diverso da quello scritto sul documento. */
export const TOLLERANZA_NETTO = 0.0051;
export const TOLLERANZA_TOTALE = 0.011;

/** Prezzo netto (sconti in cascata) e totale di una riga. L'omaggio vale zero. */
export function rowCalc(r: Row): RowCalc {
  const p = num(r.prezzo), q = num(r.quantita);
  let f = 1;
  for (const k of ['sc1', 'sc2', 'sc3'] as const) { const s = num(r[k]); if (s) f *= (1 - s / 100); }
  const netto = p === null ? null : round(p * f, 5);
  const totale = r.omaggio ? 0 : (netto === null || q === null ? null : round(q * netto, 5));
  return { netto, totale };
}

export function totals(order: Order): Totals {
  const t: Totals = { righe: order.righe.length, colli: 0, pezzi: 0, merce: 0, omaggi: 0, incompleti: 0 };
  for (const r of order.righe) {
    const c = rowCalc(r);
    t.colli += num(r.colli) || 0;
    t.pezzi += num(r.quantita) || 0;
    if (r.omaggio) t.omaggi++;
    if (c.totale === null) t.incompleti++; else t.merce += c.totale;
  }
  t.merce = round(t.merce, 5);
  return t;
}

/** Quante righe non sono collegate a un articolo dell'archivio. */
export function unlinked(order: Order): number {
  return order.righe.filter(r => !(r.link && r.link.ok)).length;
}

/** true se il netto o il totale calcolato è diverso da quello scritto sul documento. */
export function rowDiff(r: Row, c: RowCalc): { netto: boolean; totale: boolean } {
  const nd = num(r.netto_doc), td = num(r.totale_doc);
  return {
    netto: !r.omaggio && nd !== null && c.netto !== null && Math.abs(nd - c.netto) > TOLLERANZA_NETTO,
    totale: !r.omaggio && td !== null && c.totale !== null && Math.abs(td - c.totale) > TOLLERANZA_TOTALE
  };
}

/** I controlli mostrati nella schermata «Controlla»: prima l'archivio, poi le righe, poi i totali del documento. */
export function checks(order: Order, ctx?: CheckContext | null): Check[] {
  const out: Check[] = [], t = totals(order);
  if (!t.righe) return [{ level: 'warn', text: 'Nessuna riga' }];
  if (ctx && ctx.hasArt) {
    let sug = 0, none = 0;
    for (const r of order.righe) { const l = r.link; if (l && l.ok) continue; if (l && l.cod) sug++; else none++; }
    if (none) out.push({ level: 'bad', text: none + (none === 1 ? ' riga non in anagrafica' : ' righe non in anagrafica') });
    if (sug) out.push({ level: 'warn', text: sug + (sug === 1 ? ' abbinamento da confermare' : ' abbinamenti da confermare') });
    if (!none && !sug) out.push({ level: 'ok', text: 'Tutti i codici esistono nel gestionale' });
  } else if (ctx) out.push({ k: 'noarch', level: 'warn', text: 'Archivio articoli non caricato: i codici non sono verificati.' });
  if (ctx && ctx.hasMan) out.push(ctx.manOk ? { level: 'ok', text: 'Mandante in anagrafica: ' + String(order.mandante_cod).trim() } : { level: 'warn', text: 'Casa mandante non trovata in anagrafica' });
  if (ctx && ctx.hasCli) out.push(ctx.cliOk ? { level: 'ok', text: 'Cliente in anagrafica: ' + String(order.cliente_cod).trim() } : { level: 'warn', text: 'Cliente non trovato in anagrafica' });
  let noCode = 0, noQty = 0;
  const diff: number[] = [];
  order.righe.forEach((r, i) => {
    if (!String(r.cod_articolo || '').trim() && !(r.link && r.link.ok)) noCode++;
    if (num(r.quantita) === null) noQty++;
    const d = rowDiff(r, rowCalc(r));
    if (d.netto || d.totale) diff.push(i + 1);
  });
  if (noQty) out.push({ level: 'bad', text: noQty + (noQty === 1 ? ' riga senza quantità' : ' righe senza quantità') });
  if (noCode) out.push({ level: 'warn', text: noCode + (noCode === 1 ? ' riga senza codice articolo' : ' righe senza codice articolo') });
  if (diff.length) out.push({ level: 'warn', text: 'Netto o totale diverso dal documento: riga ' + diff.join(', ') });
  const ti = num(order.tot_imponibile), tc = num(order.tot_colli), tp = num(order.tot_pezzi);
  if (ti !== null) {
    /* con righe senza prezzo o quantità l'importo calcolato è parziale: dirlo, invece di mostrare due cifre da confrontare */
    if (t.incompleti) out.push({ k: 'imp', level: 'warn', text: 'Importo merce non confrontabile con il documento: ' + t.incompleti + (t.incompleti === 1 ? ' riga senza prezzo o quantità' : ' righe senza prezzo o quantità') });
    else out.push(Math.abs(ti - t.merce) <= 0.02 ? { k: 'imp', level: 'ok', text: 'Importo merce ' + show(ti, 'money') + ' come sul documento' }
                 : { k: 'imp', level: 'bad', text: 'Importo merce ' + show(round(t.merce, 2), 'money') + ', sul documento ' + show(ti, 'money') });
  }
  if (tc !== null) out.push(Math.abs(tc - t.colli) < 0.001 ? { k: 'colli', level: 'ok', text: show(tc, 'qty') + ' colli come sul documento' }
                 : { k: 'colli', level: 'bad', text: show(t.colli, 'qty') + ' colli, sul documento ' + show(tc, 'qty') });
  if (tp !== null) out.push(Math.abs(tp - t.pezzi) < 0.001 ? { k: 'pezzi', level: 'ok', text: show(tp, 'qty') + ' pezzi come sul documento' }
                 : { k: 'pezzi', level: 'bad', text: show(t.pezzi, 'qty') + ' pezzi, sul documento ' + show(tp, 'qty') });
  if (t.omaggi) out.push({ level: 'info', text: t.omaggi + (t.omaggi === 1 ? ' riga omaggio' : ' righe omaggio') });
  if (ti === null && tc === null && tp === null) out.push({ level: 'info', text: 'Nessun totale sul documento da confrontare' });
  return out;
}
