/*
 * Ordine Rapido - interfaccia: l'ordine in lavorazione non si perde.
 * A ogni modifica l'ordine aperto viene salvato sul dispositivo; se l'app viene chiusa per sbaglio, o il computer
 * si spegne, alla riapertura è ancora lì. Sparisce quando si preme «Nuovo ordine» o si apre l'ordine di esempio.
 * I collegamenti con l'archivio non si salvano: si ricalcolano dall'archivio, che resta l'unica fonte dei codici.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import type { Order, OrderText, Row, RowText } from '../core/tipi.ts';
import { S, emptyOrder, emptyRow } from './stato.ts';

/* Cambiare questo nome fa perdere l'ordine in corso a chi aggiorna: vedi docs/SVILUPPO.md. */
const KEY = 'ordine-rapido-bozza';
const VERSION = 1;
const MAX_ROWS = 5000, MAX_NOTES = 50;

const ORDER_TEXT = Object.keys(emptyOrder()).filter(k => k !== 'righe') as OrderText[];
const ROW_TEXT = Object.keys(emptyRow()).filter(k => k !== 'omaggio') as RowText[];

let timer: ReturnType<typeof setTimeout> | undefined;

/** Salva l'ordine aperto; se non c'è un ordine aperto, toglie quello salvato. */
export function saveDraft(): void {
  clearTimeout(timer);
  try {
    if (S.stage !== 'order') { localStorage.removeItem(KEY); return; }
    const righe = S.order.righe.map(r => { const copy: Row = { ...r }; delete copy.link; return copy; });
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, order: { ...S.order, righe }, notes: S.notes, src: S.src, exported: S.exported }));
  } catch { /* qui non si può salvare: l'ordine vale fino alla chiusura */ }
}
/** Salva poco dopo l'ultima modifica, per non scrivere a ogni tasto. */
export function saveDraftSoon(): void {
  clearTimeout(timer);
  timer = setTimeout(saveDraft, 400);
}

/** Rimette in lavorazione l'ordine salvato, se c'è. Tutto ciò che legge viene ricontrollato campo per campo. */
export function restoreDraft(): boolean {
  let saved: unknown = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* bozza illeggibile: come se non ci fosse */ }
  if (!saved || typeof saved !== 'object') return false;
  const d = saved as { v?: unknown; order?: unknown; notes?: unknown; src?: unknown; exported?: unknown };
  if (d.v !== VERSION || !d.order || typeof d.order !== 'object') return false;
  const from = d.order as Record<string, unknown>;
  if (!Array.isArray(from.righe)) return false;
  const order: Order = emptyOrder();
  for (const k of ORDER_TEXT) { const v = from[k]; if (typeof v === 'string') order[k] = v; }
  order.man_auto = from.man_auto === true; order.cli_auto = from.cli_auto === true;
  order.righe = (from.righe as unknown[]).slice(0, MAX_ROWS).filter(r => r && typeof r === 'object').map(raw => {
    const r = raw as Record<string, unknown>, row = emptyRow();
    for (const k of ROW_TEXT) { const v = r[k]; if (typeof v === 'string') row[k] = v; }
    row.omaggio = r.omaggio === true;
    return row;
  });
  S.order = order; S.isExample = false; S.stage = 'order'; S.exported = d.exported === true;
  S.src = typeof d.src === 'string' ? d.src : '';
  S.notes = Array.isArray(d.notes) ? (d.notes as unknown[]).filter((n): n is string => typeof n === 'string').slice(0, MAX_NOTES) : [];
  return true;
}

/** Salva subito quando la pagina sta per chiudersi o passa in secondo piano: l'ultima modifica non resta in sospeso. */
export function wireDraft(): void {
  window.addEventListener('pagehide', saveDraft);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraft(); });
}
