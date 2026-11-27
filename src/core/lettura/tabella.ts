/*
 * Ordine Rapido - lettura sul dispositivo: le tabelle d'ordine. Si cerca la riga con i nomi delle colonne
 * (codice, descrizione, colli, quantità, prezzo, sconti…), poi ogni riga sotto viene incolonnata guardando
 * la posizione di ogni valore rispetto a quei nomi. Nessuna intelligenza artificiale: solo regole.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { bare, cellNumber } from './testo.ts';
import type { Cell, Line } from './testo.ts';

/** Una riga d'ordine così come esce dalla lettura: gli stessi campi che restituisce Claude. */
export interface ReadRow {
  cod_articolo: string | null; cod_cliente: string | null; ean: string | null; descrizione: string; um: string | null;
  colli: number | null; quantita: number | null; prezzo: number | null; sconti: number[]; omaggio: boolean;
  prezzo_netto: number | null; totale: number | null; nota: string | null;
}
export function emptyReadRow(): ReadRow {
  return { cod_articolo: null, cod_cliente: null, ean: null, descrizione: '', um: null, colli: null, quantita: null, prezzo: null, sconti: [], omaggio: false, prezzo_netto: null, totale: null, nota: null };
}

type Field = 'riga' | 'ean' | 'pzcollo' | 'cod_cliente' | 'cod_articolo' | 'articolo' | 'descrizione' | 'um' | 'colli' | 'quantita'
  | 'netto' | 'sconto' | 'prezzo' | 'totale' | 'iva' | 'nota' | 'altro';
interface Column { field: Field; x0: number; x1: number }

/*
 * Come i clienti chiamano le colonne nei loro ordini. Ogni nome deve corrispondere per intero: è questo che permette
 * di dividere due intestazioni finite attaccate, come «Sc.3 % Prezzo netto» o «IMPORTO IVA».
 * «Ns.» è il codice di chi scrive, cioè del cliente; «Vs.» è il codice del fornitore, cioè della casa mandante.
 */
const HEAD: readonly (readonly [Field, RegExp])[] = [
  ['riga', /^(riga|rigo|pos|posizione|n|nr|num|prog|progr)$/],
  ['ean', /^(ean|ean ?13|barcode|cod\w* a barre|cod\w* barre|cod\w* ean)$/],
  ['pzcollo', /^(pz|pezzi|qta|q ta|conf|n pz)( x| per| a)? ?(collo|cartone|ct|cart|conf|confezione|imballo)$|^(imballo|pz conf|pezzi conf\w*)$/],
  ['cod_cliente', /^ns (cod\w*|art\w*|rif\w*)( art\w*)?$|^(cod\w*|art\w*) (ns|nostro|interno|cliente)$|^cod\w* art\w* (ns|interno|cliente)$/],
  ['cod_articolo', /^vs (cod\w*|art\w*|rif\w*)( art\w*)?$|^(cod\w*|art\w*|rif\w*)( art\w*)? (forn\w*|vs|vostro|mandante|produttore)$|^(codice|cod|sku|cod\w* art\w*|art\w* cod\w*|cod\w* prodotto|rif|riferimento)$/],
  ['articolo', /^(articolo|art)$/],
  ['um', /^(u m|um|udm|unita( di)? mis\w*|unita|mis)$/],
  ['colli', /^(n |nr |num\w* )?(colli|cartoni|ct|crt|cart|casse|confezioni|imballi|cf)( ord\w*)?$/],
  ['quantita', /^(q ta|qta|q|qt|quantita|quant|pezzi|pz|n pezzi|kg)( ord\w*| rich\w*)?$/],
  ['netto', /^(prezzo |prz |p )?netto( unit\w*)?$/],
  ['sconto', /^(sc|sconto|sconti)( \d)?( perc\w*)?$/],
  ['prezzo', /^(prezzo|prz|listino|costo)( unit\w*| lordo| listino| di listino| vendita| acq\w*)?$|^(p unit\w*|unitario)$/],
  ['totale', /^(importo|totale|tot|valore|imp)( riga| netto| merce| eur\w*)?$/],
  ['iva', /^(c )?(iva|aliq\w*|aliquota iva|cod\w* iva)$/],
  ['nota', /^(note|nota|annotazioni|osservazioni|note riga)$/],
  ['descrizione', /^(descrizione|descr|desc|prodotto|denominazione|merce)( articolo| prodotto| merce| art)?$|^art\w* descr\w*$/]
];
function fieldOf(text: string): Field | null {
  const b = bare(text);
  if (!b) return null;
  for (const [f, re] of HEAD) if (re.test(b)) return f;
  return null;
}

/** Divide un'intestazione che contiene più nomi di colonna, dando a ognuno la sua parte di larghezza. */
function splitHead(c: Cell): Column[] | null {
  const whole = fieldOf(c.s);
  if (whole) return [{ field: whole, x0: c.x0, x1: c.x1 }];
  /* un segno da solo, come «%», resta attaccato alla parola che lo precede */
  const words: string[] = [];
  for (const w of c.s.split(/\s+/).filter(Boolean)) {
    if (words.length && !/[A-Za-z0-9]/.test(w)) words[words.length - 1] += ' ' + w; else words.push(w);
  }
  if (words.length < 2 || words.length > 8) return null;
  /* la divisione con meno pezzi in cui ogni pezzo è un nome di colonna */
  const best: (Column[] | null)[] = [];
  const at: number[] = [];
  let p = 0;
  for (const w of words) { at.push(c.s.indexOf(w.split(' ')[0] as string, p)); p = (at[at.length - 1] as number) + w.length; }
  const len = Math.max(1, c.s.length), unit = (c.x1 - c.x0) / len;
  for (let end = 1; end <= words.length; end++) {
    best[end] = null;
    for (let start = 0; start < end; start++) {
      const before = start === 0 ? [] : best[start];
      if (!before) continue;
      const f = fieldOf(words.slice(start, end).join(' '));
      if (!f) continue;
      const a = at[start] as number, b = (at[end - 1] as number) + (words[end - 1] as string).length;
      const cand = before.concat([{ field: f, x0: c.x0 + a * unit, x1: c.x0 + b * unit }]);
      const cur = best[end];
      if (!cur || cand.length < cur.length) best[end] = cand;
    }
  }
  return best[words.length] || null;
}

/** Le colonne di una riga di intestazione; null se la riga non è l'intestazione di una tabella d'ordine. */
function headerOf(l: Line): Column[] | null {
  if (l.cells.length < 2 && !(l.cells[0] && /\s/.test(l.cells[0].s))) return null;
  const cols: Column[] = [];
  let known = 0;
  for (const c of l.cells) {
    const parts = splitHead(c);
    if (parts) { known += parts.length; for (const part of parts) cols.push(part); }
    else cols.push({ field: 'altro', x0: c.x0, x1: c.x1 });
  }
  const has = (...fs: Field[]) => cols.some(c => fs.indexOf(c.field) >= 0);
  if (known < 2 || known < cols.length / 2) return null;
  if (!has('cod_articolo', 'cod_cliente', 'descrizione', 'articolo', 'ean') || !has('colli', 'quantita')) return null;
  /* «Articolo» da solo è la descrizione, se una colonna per la descrizione non c'è; altrimenti è il codice */
  for (const c of cols) if (c.field === 'articolo') c.field = has('descrizione') ? (has('cod_articolo') ? 'altro' : 'cod_articolo') : 'descrizione';
  return cols;
}

const overlap = (a: { x0: number; x1: number }, b: { x0: number; x1: number }) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
/** La colonna sotto cui sta un pezzo di testo: quella con cui si sovrappone di più, oppure la più vicina se è a un passo. */
function columnAt(cols: readonly Column[], c: { x0: number; x1: number }, near: number): number {
  let best = -1, bestO = 0;
  cols.forEach((col, k) => { const o = overlap(col, c); if (o > bestO) { bestO = o; best = k; } });
  if (best >= 0) return best;
  let bestD = near;
  cols.forEach((col, k) => { const d = Math.max(col.x0 - c.x1, c.x0 - col.x1); if (d < bestD) { bestD = d; best = k; } });
  return best;
}

const NUMERIC: Readonly<Partial<Record<Field, 1>>> = { colli: 1, pzcollo: 1, quantita: 1, prezzo: 1, sconto: 1, netto: 1, totale: 1, iva: 1, riga: 1 };
const GIFT = /\b(omaggio|omaggi|sconto merce|sc merce|in regalo|gratis|gratuit[oaie])\b/;
const TOTALS = /^(tot|totale|totali|imponibile|importo merce|totale merce|segue|riporto|a riportare)\b/;
/** Un codice è una parola sola con almeno una cifra, oppure breve e tutta maiuscola: «Totale colli» non lo è. */
function looksLikeCode(s: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9._\/-]{1,24}$/.test(s) && (/\d/.test(s) || s.length <= 10); }

interface Piece { s: string; x0: number; x1: number; n?: number }
/** Una riga di dati incolonnata sotto l'intestazione; null se non è una riga d'ordine. */
function rowOf(l: Line, cols: readonly Column[], near: number): ReadRow | null {
  const got: Piece[][] = cols.map(() => []), loose: string[] = [];
  /* la colonna in cui prosegue il testo di una cella divisa: la descrizione, se la tabella ne ha una */
  const descCol = cols.findIndex(c => c.field === 'descrizione');
  let lastText = descCol;
  for (const c of l.cells) {
    const over = cols.filter(col => overlap(col, c) > 0).length;
    /* una frase che attraversa mezza tabella non è una riga d'ordine: è testo scritto sotto */
    /* (una riga letta da una foto può arrivare tutta attaccata: quella comincia con un codice, e resta una riga) */
    const wordsIn = (c.s.match(/[A-Za-zÀ-ÿ]{2,}/g) || []).length;
    if (over >= 3 && (wordsIn >= 8 || (wordsIn >= 4 && !/^\S*\d/.test(c.s)))) return null;
    let pieces: Piece[] = [c];
    /* una cella che sta sotto più colonne (numeri finiti attaccati) si divide parola per parola */
    if (over > 1 && /\s/.test(c.s) && c.n === undefined) {
      const unit = (c.x1 - c.x0) / Math.max(1, c.s.length);
      pieces = [];
      const re = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(c.s))) pieces.push({ s: m[0], x0: c.x0 + m.index * unit, x1: c.x0 + (m.index + m[0].length) * unit });
    }
    const split = pieces.length > 1;
    for (const p of pieces) {
      let k = columnAt(cols, p, near);
      const col = cols[k];
      /* in una cella divisa, ciò che non sta sotto nessuna colonna e le parole finite sotto una colonna di numeri
         appartengono al testo che le precede: sono il seguito della descrizione */
      if (split && lastText >= 0 && (!col || (NUMERIC[col.field] && cellNumber(p) === null))) k = lastText;
      const target = got[k];
      if (target) { target.push(p); const f = (cols[k] as Column).field; if (f === 'descrizione' || f === 'nota' || f === 'altro') lastText = k; } else loose.push(p.s);
    }
  }
  /* sotto la colonna di un codice vale solo il primo pezzo che ha l'aspetto di un codice: il resto è l'inizio della descrizione */
  cols.forEach((col, k) => {
    const pieces = got[k] as Piece[], desc = got[descCol];
    if ((col.field !== 'cod_articolo' && col.field !== 'cod_cliente') || pieces.length < 2 || !desc || !looksLikeCode((pieces[0] as Piece).s)) return;
    const rest = pieces.splice(1);
    if (k < descCol) desc.unshift(...rest); else desc.push(...rest);
  });
  const r = emptyReadRow();
  let pz: number | null = null, anyNumber = false;
  const notes: string[] = [];
  cols.forEach((col, k) => {
    const pieces = got[k] as Piece[];
    if (!pieces.length) return;
    const text = pieces.map(p => p.s).join(' ').trim(), first = pieces[0] as Piece;
    let n = pieces.length === 1 ? cellNumber(first) : null;
    /* più pezzi sotto una colonna di numeri (un segno, una cifra corretta a penna): vale l'ultimo numero scritto */
    if (pieces.length > 1 && NUMERIC[col.field]) for (const p of pieces) { const v = cellNumber(p); if (v !== null) n = v; }
    switch (col.field) {
      case 'cod_articolo': if (r.cod_articolo === null && looksLikeCode(text)) r.cod_articolo = text; else notes.push(text); break;
      case 'cod_cliente': if (r.cod_cliente === null && looksLikeCode(text)) r.cod_cliente = text; else notes.push(text); break;
      case 'ean': { const d = text.replace(/\D/g, ''); if (d.length >= 8 && d.length <= 14) r.ean = d; break; }
      case 'descrizione': r.descrizione = (r.descrizione ? r.descrizione + ' ' : '') + text; break;
      case 'um': if (/^[A-Za-z.]{1,6}$/.test(text)) r.um = text.replace(/\./g, '').toUpperCase(); break;
      case 'colli': if (n !== null) { r.colli = n; anyNumber = true; } break;
      case 'pzcollo': if (n !== null) pz = n; break;
      case 'quantita': if (n !== null) { r.quantita = n; anyNumber = true; } break;
      case 'prezzo': if (n !== null) r.prezzo = n; break;
      case 'sconto': if (n !== null && n > 0 && n <= 100) r.sconti.push(n); break;
      case 'netto': if (n !== null) r.prezzo_netto = n; break;
      case 'totale': if (n !== null) r.totale = n; break;
      case 'nota': notes.push(text); break;
      default: if (col.field === 'altro' && n === null) notes.push(text);
    }
  });
  if (!anyNumber || (!r.cod_articolo && !r.cod_cliente && !r.ean && !/[A-Za-zÀ-ÿ]{3}/.test(r.descrizione))) return null;
  if (r.quantita === null && r.colli !== null && pz !== null) r.quantita = r.colli * pz;
  const extra = notes.concat(loose).join(' ').trim();
  if (extra) r.nota = extra;
  if (GIFT.test(bare(extra + ' ' + r.descrizione))) r.omaggio = true;
  return r;
}

export interface TableResult {
  rows: ReadRow[];
  /** Le posizioni, nell'elenco delle righe della fonte, delle righe che fanno parte della tabella (intestazioni comprese). */
  used: Record<number, 1>;
  /** Le righe (posizione in `rows`) trattate come omaggio solo perché hanno il prezzo ma né netto né importo. */
  guessedGifts: number[];
}

/**
 * Cerca nelle righe di una fonte le tabelle d'ordine e ne ricava le righe. Una tabella finisce alla riga dei totali
 * e può ricominciare a ogni pagina, dove l'intestazione è ripetuta.
 */
export function readTables(lines: readonly Line[], kind: 'grid' | 'page' | 'text'): TableResult {
  const rows: ReadRow[] = [], used: Record<number, 1> = {}, guessedGifts: number[] = [];
  let cols: Column[] | null = null, near = 0;
  lines.forEach((l, i) => {
    const head = headerOf(l);
    if (head) {
      cols = head; used[i] = 1;
      /* quanto può stare lontano un valore dalla sua colonna: mezza larghezza della colonna più stretta; in un foglio, niente */
      near = kind === 'grid' ? 0 : Math.max(1, Math.min.apply(null, head.map(c => c.x1 - c.x0)) / 2);
      return;
    }
    if (!cols) return;
    /* la tabella finisce alla riga dei totali; in un messaggio, anche alla prima riga vuota */
    if (!l.cells.length || l.cells.some(c => TOTALS.test(bare(c.s)))) { cols = null; return; }
    const r = rowOf(l, cols, near);
    if (r) { rows.push(r); used[i] = 1; }
  });
  /* una riga con il prezzo ma senza netto né importo, quando le altre li hanno, è merce in omaggio */
  const priced = rows.filter(r => r.totale !== null).length;
  if (priced >= 2 && priced >= rows.length / 2) rows.forEach((r, i) => {
    if (!r.omaggio && r.prezzo !== null && r.totale === null && r.prezzo_netto === null) { r.omaggio = true; guessedGifts.push(i); }
  });
  return { rows, used, guessedGifts };
}
