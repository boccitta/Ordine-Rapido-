/*
 * Ordine Rapido - archivi del gestionale: lettura dei file esportati, normalizzazione di codici e nomi,
 * forma compatta in cui gli archivi vengono salvati.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import type { Archive, Article, Item, ItemByKind, Kind } from './tipi.ts';

export const KINDS: readonly Kind[] = ['art', 'cli', 'man'];

/* ----- Normalizzazione ----- */
export function str(s: unknown): string { return s === null || s === undefined ? '' : String(s); }
/** Codice senza spazi e in maiuscolo: «300 101» e «300101» sono lo stesso codice. */
export function normCode(s: unknown): string { return str(s).trim().toUpperCase().replace(/\s+/g, ''); }
export function noZeros(s: string): string { return s.replace(/^0+(?=.)/, ''); }
export function digits(s: unknown): string { return str(s).replace(/\D/g, ''); }
/** Testo senza accenti e punteggiatura, in maiuscolo. */
export function normText(s: unknown): string {
  return str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
const LEGAL: Record<string, 1> = { SPA: 1, SRL: 1, SRLS: 1, SNC: 1, SAS: 1, SAPA: 1, SCARL: 1, COOP: 1, SOC: 1, ARL: 1, UNIPERSONALE: 1 };
/** Ragione sociale ridotta alle parole che la distinguono, senza la forma societaria. */
export function companyKey(s: unknown): string {
  return normText(s).split(' ').filter(t => t.length > 1 && !Object.prototype.hasOwnProperty.call(LEGAL, t)).join(' ');
}
/** Due chiavi indicano la stessa azienda se sono uguali o una contiene l'altra come parole intere. */
export function keyMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || (' ' + a + ' ').indexOf(' ' + b + ' ') >= 0 || (' ' + b + ' ').indexOf(' ' + a + ' ') >= 0;
}
export function tokens(s: unknown): string[] { return normText(s).split(' ').filter(t => t.length > 1 || /\d/.test(t)); }

/* ----- Forma compatta: una riga di testo per elemento, campi separati da tabulazione ----- */
export const PACK: { readonly [K in Kind]: readonly (keyof ItemByKind[K] & string)[] } = {
  /* i campi nuovi si aggiungono in fondo: un archivio salvato da una versione precedente si legge lo stesso */
  art: ['cod', 'desc', 'ean', 'um', 'mand', 'prezzo', 'conf'],
  cli: ['cod', 'nome', 'piva'],
  man: ['cod', 'nome', 'piva']
};
function fields(kind: Kind): readonly string[] { return PACK[kind]; }
/** I campi che un elemento ha solo quando il gestionale li esporta. */
const OPTIONAL: Readonly<Record<string, 1>> = { conf: 1 };

export function pack<K extends Kind>(kind: K, it: ItemByKind[K]): string {
  const o = it as unknown as Record<string, unknown>;
  return fields(kind).map(f => str(o[f]).replace(/[\t\r\n]+/g, ' ')).join('\t');
}
export function unpack<K extends Kind>(kind: K, line: unknown): ItemByKind[K] {
  const p = str(line).split('\t'), o: Record<string, string> = {};
  fields(kind).forEach((f, i) => { if (p[i] || !OPTIONAL[f]) o[f] = p[i] || ''; });
  return o as unknown as ItemByKind[K];
}
/** Due articoli sono lo stesso se hanno stesso codice e stessa casa mandante; clienti e mandanti se hanno lo stesso codice. */
function itemKey(kind: Kind, it: Item): string {
  return kind === 'art' ? companyKey((it as Article).mand) + '|' + normCode(it.cod) : normCode(it.cod);
}
/** Unisce due elenchi: un elemento già presente viene sostituito da quello nuovo, restando al suo posto. */
export function mergeItems<K extends Kind>(kind: K, old: readonly ItemByKind[K][], items: readonly ItemByKind[K][]): ItemByKind[K][] {
  const pos: Record<string, number> = Object.create(null), out: ItemByKind[K][] = [];
  for (const it of old.concat(items)) {
    const k = itemKey(kind, it), at = pos[k];
    if (at !== undefined) out[at] = it; else { pos[k] = out.length; out.push(it); }
  }
  return out;
}

/** Quale colonna del file contiene ogni campo: indice della colonna, a partire da zero. */
export type ColumnMap = Record<string, number | undefined>;

/** Trasforma le righe di un file esportato dal gestionale in elementi dell'archivio. Le righe senza codice si saltano. */
export function rowsToItems<K extends Kind>(kind: K, rows: readonly (readonly unknown[])[], map: ColumnMap, hasHeader: boolean, fixedMand?: string): ItemByKind[K][] {
  const out: Item[] = [];
  function get(r: readonly unknown[], f: string): string {
    const i = map[f];
    return (i === undefined || i === null || i < 0) ? '' : str(r[i]).replace(/[\t\r\n]+/g, ' ').trim();
  }
  for (let k = hasHeader ? 1 : 0; k < rows.length; k++) {
    const r = rows[k] || [], cod = get(r, 'cod');
    if (!cod) continue;
    if (kind === 'art') {
      const a: Article = { cod, desc: get(r, 'desc'), ean: get(r, 'ean'), um: get(r, 'um').toUpperCase(), mand: get(r, 'mand') || str(fixedMand).trim(), prezzo: get(r, 'prezzo') };
      const conf = get(r, 'conf');
      if (conf) a.conf = conf;
      out.push(a);
    } else out.push({ cod, nome: get(r, 'nome'), piva: get(r, 'piva') });
  }
  return mergeItems(kind, [], out as ItemByKind[K][]);
}

/* ----- File di testo con separatore ----- */
/** Sceglie il separatore presente in tutte le prime righe il maggior numero di volte. */
export function detectSep(text: string): string {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 15);
  let best = ';', bestN = 0;
  for (const s of [';', '\t', ',', '|']) {
    const min = Math.min.apply(null, lines.map(l => l.split(s).length - 1));
    if (min > bestN) { bestN = min; best = s; }
  }
  return best;
}
/** Legge un testo con separatore, rispettando le virgolette. Le righe vuote si saltano. */
export function parseDelimited(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  const filled = (r: string[]) => r.some(v => v.trim());
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && cur === '') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (filled(row)) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur);
  if (filled(row)) rows.push(row);
  return rows;
}

/* ----- Riconoscimento delle colonne dal nome scritto nella prima riga ----- */
type Hint = readonly [field: string, yes: RegExp, no: RegExp | null];
const HINT: Record<Kind, readonly Hint[]> = {
  art: [['ean', /ean|barcode|barre/, null], ['conf', /confez|imballo|(pz|pezzi|q\.?t[aà]).{0,5}(collo|cart|conf|ct)|x\s*collo/, /descr|tipo|cod/], ['desc', /descr/, null], ['um', /^u\.?\s*m\.?$|unimis|unit.{1,2}\s*(di\s*)?mis/, null], ['prezzo', /prezzo|listino/, null],
        ['mand', /mandante|fornitore|ditta|marca|casa/, /cod/], ['cod', /cod|art|sku/, /forn|mand|client|ean|barre|iva|cat|fam|grup|descr|fisc/]],
  cli: [['piva', /p\.?\s*iva|partita/, null], ['cod', /cod/, /fisc|iva|cap|agent|zona|pag|dest|banc/], ['nome', /ragione|denominaz|nominativo|nome|cliente/, /cod/]],
  man: [['piva', /p\.?\s*iva|partita/, null], ['cod', /cod/, /fisc|iva|cap|agent|zona|pag|dest|banc/], ['nome', /ragione|denominaz|nominativo|nome|mandante|fornitore|ditta|casa/, /cod/]]
};
export function guessMap(kind: Kind, header: readonly unknown[]): { map: Record<string, number>; found: number } {
  const map: Record<string, number> = {}, used: Record<number, 1> = {};
  let n = 0;
  for (const [field, yes, no] of HINT[kind]) {
    for (let i = 0; i < header.length; i++) {
      const t = str(header[i]).trim().toLowerCase();
      if (!used[i] && t && yes.test(t) && !(no && no.test(t))) { map[field] = i; used[i] = 1; n++; break; }
    }
  }
  return { map, found: n };
}

export function emptyArchive(): Archive {
  return { art: [], cli: [], man: [], alias: Object.create(null), artAt: '', cliAt: '', manAt: '' };
}
/** La data dell'ultimo caricamento di un archivio. */
export function archiveDate(arch: Archive, kind: Kind): string { return arch[`${kind}At` as const]; }
export function setArchiveDate(arch: Archive, kind: Kind, date: string): void { arch[`${kind}At` as const] = date; }
/** Gli elementi di un archivio. Clienti e mandanti hanno la stessa forma, gli articoli una propria. */
export function archiveItems<K extends Kind>(arch: Archive, kind: K): ItemByKind[K][] { return arch[kind] as ItemByKind[K][]; }
export function setArchiveItems<K extends Kind>(arch: Archive, kind: K, items: ItemByKind[K][]): void {
  (arch as unknown as Record<Kind, Item[]>)[kind] = items;
}
