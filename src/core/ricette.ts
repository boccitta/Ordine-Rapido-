/*
 * Ordine Rapido - ricette dei clienti: quello che l'app impara dagli ordini esportati.
 * Quasi ogni cliente manda gli ordini sempre nello stesso formato. Quando un ordine è stato esportato, vuol dire che
 * chi usa l'app lo ha controllato e lo considera giusto: si confronta allora il documento originale con l'ordine finito
 * e ci si ricorda come è fatto quel formato (quale colonna contiene i colli, quale il codice, quale va ignorata) e
 * quale unità il cliente sottintende quando scrive una quantità senza dirlo. Al prossimo ordine dello stesso cliente
 * la lettura parte da lì, prima delle regole generali.
 *
 * Le ricette stanno insieme agli abbinamenti imparati (chiavi che cominciano con «r|»): viaggiano con gli archivi,
 * nelle copie di sicurezza e nell'app desktop su file, e non escono dal dispositivo.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { companyKey, digits, keyMatch, normCode, noZeros, str } from './anagrafiche.ts';
import { readFree } from './lettura/libera.ts';
import type { Unit } from './lettura/libera.ts';
import { FIELDS, NUMERIC, assign, columnNumber, fieldOf, headerColumns, looksLikeCode, nearFor } from './lettura/tabella.ts';
import type { Column, Field, Format, Piece } from './lettura/tabella.ts';
import { bare, cellNumber, lineText } from './lettura/testo.ts';
import type { Line, Source } from './lettura/testo.ts';
import { num } from './numeri.ts';
import { overlapShare, ratio } from './simile.ts';
import type { Order, Row } from './tipi.ts';

/** Le chiavi delle ricette, tra gli abbinamenti imparati, cominciano così. */
export const RECIPE = 'r|';
const MAX_FORMATS = 6;

export interface LearnedFormat extends Format { volte: number; at: string }
/** La ricetta di un cliente. */
export interface Recipe {
  v: 1;
  /** come riconoscere il cliente: ragione sociale, partita IVA, codice nel gestionale */
  nome: string; piva: string; cod: string;
  /** quanti ordini esportati ne hanno fatto parte, e l'ultimo quando */
  ordini: number; at: string;
  formati: LearnedFormat[];
  /** l'unità sottintesa nei messaggi quando il cliente scrive una quantità senza dire se sono colli o pezzi */
  unita?: 'colli' | 'pezzi';
}
/** Chi ha mandato l'ordine, per cercare la sua ricetta. */
export interface Who { nome: string; piva: string; cod: string }

/* ---------- Lettura e scrittura tra gli abbinamenti ---------- */
function parse(v: string | undefined): Recipe | null {
  if (!v) return null;
  try {
    const o = JSON.parse(v) as Partial<Recipe>;
    if (!o || o.v !== 1 || !Array.isArray(o.formati)) return null;
    const formati: LearnedFormat[] = [];
    for (const f of o.formati) {
      if (!f || !Array.isArray(f.firma) || !f.colonne || typeof f.colonne !== 'object') continue;
      const colonne: Record<string, string> = {};
      for (const k in f.colonne) { const field = (f.colonne as Record<string, unknown>)[k]; if (typeof field === 'string' && FIELDS.indexOf(field as Field) >= 0) colonne[k] = field; }
      formati.push({ firma: f.firma.map(str), colonne, volte: Number(f.volte) || 1, at: str(f.at) });
    }
    const r: Recipe = { v: 1, nome: str(o.nome), piva: str(o.piva), cod: str(o.cod), ordini: Number(o.ordini) || 0, at: str(o.at), formati };
    if (o.unita === 'colli' || o.unita === 'pezzi') r.unita = o.unita;
    return r;
  } catch { return null; }
}
/** Tutte le ricette salvate, con la loro chiave. */
export function recipes(alias: Readonly<Record<string, string>>): { key: string; recipe: Recipe }[] {
  const out: { key: string; recipe: Recipe }[] = [];
  for (const k in alias) if (k.indexOf(RECIPE) === 0) { const r = parse(alias[k]); if (r) out.push({ key: k, recipe: r }); }
  return out;
}
/** Quanti abbinamenti imparati ci sono, ricette escluse. */
export function aliasCount(alias: Readonly<Record<string, string>>): number {
  let n = 0;
  for (const k in alias) if (k.indexOf(RECIPE) !== 0) n++;
  return n;
}
/** Toglie tutti gli abbinamenti imparati, ma non le ricette; oppure solo le ricette. */
export function clearLearned(alias: Record<string, string>, what: 'alias' | 'recipes'): void {
  for (const k of Object.keys(alias)) if ((k.indexOf(RECIPE) === 0) === (what === 'recipes')) delete alias[k];
}

function keyOf(w: Who): string {
  const c = normCode(w.cod), p = digits(w.piva);
  return RECIPE + (c ? 'c:' + c : p.length >= 8 ? 'p:' + p : 'n:' + companyKey(w.nome));
}
/** La ricetta del cliente: per codice del gestionale, per partita IVA, poi per ragione sociale. */
export function findRecipe(alias: Readonly<Record<string, string>>, w: Who): { key: string; recipe: Recipe } | null {
  const c = normCode(w.cod), p = digits(w.piva), k = companyKey(w.nome);
  let best: { key: string; recipe: Recipe } | null = null, bestScore = 0;
  for (const it of recipes(alias)) {
    const r = it.recipe;
    const score = (c && normCode(r.cod) === c) ? 4 : (p.length >= 8 && digits(r.piva) === p) ? 3
      : (k && companyKey(r.nome) === k) ? 2 : (k.length >= 6 && keyMatch(companyKey(r.nome), k)) ? 1 : 0;
    if (score > bestScore) { best = it; bestScore = score; }
  }
  return best;
}
/**
 * I formati da provare in lettura: prima quelli del cliente, se lo si conosce, poi quelli degli altri clienti
 * (un formato si riconosce anche senza sapere chi l'ha mandato). Ognuno porta il nome del cliente da cui è stato imparato.
 */
export function formatsFor(alias: Readonly<Record<string, string>>, mine: Recipe | null): { format: Format; from: string }[] {
  const out: { format: Format; from: string }[] = [];
  if (mine) for (const f of mine.formati) out.push({ format: f, from: mine.nome });
  for (const { recipe } of recipes(alias)) if (recipe !== mine && (!mine || recipe.nome !== mine.nome || recipe.cod !== mine.cod)) for (const f of recipe.formati) out.push({ format: f, from: recipe.nome });
  return out;
}

/* ---------- Imparare da un ordine esportato ---------- */
const PRIORITY: readonly Field[] = ['cod_articolo', 'ean', 'cod_cliente', 'descrizione', 'colli', 'quantita', 'pzcollo', 'prezzo', 'sconto', 'netto', 'totale', 'um'];
/* i campi che possono stare in più colonne */
const MANY: Readonly<Partial<Record<Field, 1>>> = { sconto: 1, descrizione: 1, altro: 1, nota: 1 };

const words = (s: string) => bare(s).split(' ').filter(w => w.length >= 3);
function codeEq(raw: string, want: string): boolean {
  const a = normCode(raw), b = normCode(want);
  return !!a && !!b && (a === b || noZeros(a) === noZeros(b) || a.replace(/[^A-Z0-9]/g, '') === b.replace(/[^A-Z0-9]/g, ''));
}
function numEq(raw: number | null, want: unknown): boolean {
  const w = num(want);
  return raw !== null && w !== null && Math.abs(raw - w) < 0.0005 * Math.max(1, Math.abs(w));
}
/** Il codice dell'articolo che è finito nel file: quello dell'archivio, se la riga è collegata. */
function finalCode(r: Row): string { return r.link && r.link.ok ? r.link.cod : r.cod_articolo; }

/** Quanto una riga di testo somiglia a una riga dell'ordine finito: un codice in comune vale più di qualche parola. */
function lineScore(l: Line, r: Row): number {
  const codes = [finalCode(r), r.cod_cliente, r.cod_articolo].filter(Boolean), ean = digits(r.ean);
  for (const c of l.cells) for (const w of c.s.split(/\s+/)) {
    if (codes.some(code => codeEq(w, code))) return 3;
    if (ean.length >= 8 && digits(w) === ean) return 3;
  }
  const sim = Math.max(overlapShare(words(lineText(l)), words(r.descrizione)), r.link ? overlapShare(words(lineText(l)), words(r.link.desc)) : 0);
  return sim >= 0.6 ? 1 + sim : 0;
}

/** I valori di una colonna confrontati con un campo dell'ordine finito. */
function agrees(field: Field, pieces: readonly Piece[], r: Row): boolean {
  const text = pieces.map(p => p.s).join(' ').trim(), n = pieces.length === 1 ? cellNumber(pieces[0] as Piece) : columnNumber(pieces);
  switch (field) {
    case 'cod_articolo': return looksLikeCode(text) && codeEq(text, finalCode(r));
    case 'cod_cliente': return looksLikeCode(text) && codeEq(text, r.cod_cliente);
    case 'ean': return digits(text).length >= 8 && digits(text) === digits(r.ean);
    case 'descrizione': return /[A-Za-zÀ-ÿ]{3}/.test(text) && overlapShare(words(text), words(r.descrizione)) >= 0.6;
    case 'um': return /^[A-Za-z.]{1,6}$/.test(text) && bare(text) === bare(r.um);
    case 'colli': return numEq(n, r.colli);
    case 'quantita': return numEq(n, r.quantita);
    case 'pzcollo': { const c = num(r.colli), q = num(r.quantita); return !!c && q !== null && numEq(n, q / c); }
    case 'prezzo': return numEq(n, r.prezzo);
    case 'sconto': return n !== null && n > 0 && [r.sc1, r.sc2, r.sc3].some(s => numEq(n, s));
    case 'netto': return numEq(n, r.netto_doc);
    case 'totale': return numEq(n, r.totale_doc);
    default: return false;
  }
}

/**
 * Cerca in una fonte la tabella da cui vengono le righe dell'ordine finito e ne ricava il formato:
 * per ogni colonna, il campo dell'ordine con cui i suoi valori coincidono. Null se la fonte non contiene una tabella
 * riconoscibile (un messaggio scritto a parole, per esempio).
 */
export function discoverFormat(src: Source, rows: readonly Row[]): Format | null {
  const lines = src.lines, used = new Set<Row>(), matched: { i: number; r: Row }[] = [];
  lines.forEach((l, i) => {
    if (l.cells.length < 1) return;
    let best: Row | null = null, bestS = 1.5;
    for (const r of rows) { if (used.has(r)) continue; const s = lineScore(l, r); if (s > bestS) { best = r; bestS = s; } }
    if (best) { used.add(best); matched.push({ i, r: best }); }
  });
  if (matched.length < Math.min(2, rows.length) || !matched.length) return null;
  /* l'intestazione: poco sopra la prima riga trovata, una riga fatta di nomi e non di numeri */
  const first = (matched[0] as { i: number }).i, taken = new Set(matched.map(m => m.i));
  let head: Line | null = null;
  for (let i = first - 1; i >= Math.max(0, first - 6); i--) {
    const l = lines[i] as Line;
    if (taken.has(i) || !l.cells.length) continue;
    const numbers = l.cells.filter(c => cellNumber(c) !== null).length, names = l.cells.filter(c => /[A-Za-zÀ-ÿ]/.test(c.s)).length;
    if (names >= 2 && numbers <= 1) { head = l; break; }
    if (l.cells.length === 1 && /\s/.test((l.cells[0] as { s: string }).s) && numbers === 0 && src.kind !== 'grid') { head = l; break; }
  }
  if (!head) return null;
  const cols: Column[] = headerColumns(head).cols;
  if (cols.length < 2) return null;
  const near = nearFor(cols, src.kind);
  const votes: Record<string, number>[] = cols.map(() => ({})), filled = cols.map(() => 0);
  for (const m of matched) {
    const a = assign(lines[m.i] as Line, cols, near);
    if (!a) continue;
    a.got.forEach((pieces, k) => {
      if (!pieces.length) return;
      filled[k] = (filled[k] as number) + 1;
      const v = votes[k] as Record<string, number>;
      for (const f of PRIORITY) if (agrees(f, pieces, m.r)) v[f] = (v[f] || 0) + 1;
    });
  }
  /* per ogni colonna il campo che coincide più spesso; a parità, quello che dice il nome della colonna, poi l'ordine di PRIORITY */
  const choice: { field: Field; votes: number }[] = cols.map((col, k) => {
    const v = votes[k] as Record<string, number>, n = filled[k] as number, generic = fieldOf(col.t);
    let best: Field = 'altro', bestV = 0;
    for (const f of PRIORITY) {
      const c = v[f] || 0;
      if (c > bestV || (c === bestV && c > 0 && f === generic && best !== generic)) { best = f; bestV = c; }
    }
    /* una colonna vuota in tutte le righe trovate non insegna niente: vale il nome */
    if (!n) return { field: generic && generic !== 'articolo' ? generic : 'altro', votes: 0 };
    return bestV >= Math.max(1, Math.ceil(n * 0.6)) ? { field: best, votes: bestV } : { field: NUMERIC[generic || 'altro'] ? 'altro' : (generic && generic !== 'articolo' ? generic : 'altro'), votes: 0 };
  });
  /* un campo che può stare in una colonna sola resta a quella con più coincidenze */
  choice.forEach((c, k) => {
    if (MANY[c.field]) return;
    for (let j = 0; j < choice.length; j++) {
      const o = choice[j] as { field: Field; votes: number };
      if (j !== k && o.field === c.field && (o.votes > c.votes || (o.votes === c.votes && j < k))) { c.field = 'altro'; break; }
    }
  });
  const colonne: Record<string, string> = {}, firma: string[] = [];
  cols.forEach((col, k) => { if (!col.t) return; firma.push(col.t); colonne[col.t] = (choice[k] as { field: Field }).field; });
  const fields = Object.keys(colonne).map(k => colonne[k]);
  const hasItem = fields.some(f => f === 'cod_articolo' || f === 'cod_cliente' || f === 'ean' || f === 'descrizione');
  const hasQty = fields.some(f => f === 'colli' || f === 'quantita');
  return hasItem && hasQty ? { firma, colonne } : null;
}

/** In un messaggio a parole: quale unità il cliente sottintende quando scrive solo un numero. */
function discoverUnit(src: Source, rows: readonly Row[]): Unit {
  /* qui ogni descrizione vale come credibile: le righe giuste sono già quelle dell'ordine finito */
  const f = readFree(src.lines.map(lineText), () => true, true);
  let colli = 0, pezzi = 0;
  for (const g of f.guessed) {
    const n = g.colli !== null ? g.colli : g.quantita;
    const r = rows.find(x => overlapShare(words(g.descrizione), words(x.descrizione)) >= 0.5 || (x.link ? overlapShare(words(g.descrizione), words(x.link.desc)) >= 0.5 : false));
    if (!r || n === null) continue;
    if (numEq(n, r.colli)) colli++; else if (numEq(n, r.quantita)) pezzi++;
  }
  return colli > pezzi ? 'colli' : pezzi > colli ? 'pezzi' : '';
}

function sameFirma(a: readonly string[], b: readonly string[]): boolean {
  if (!a.length || !b.length) return false;
  let n = 0;
  for (const x of a) if (b.some(y => y === x || (x.length >= 3 && ratio(x, y) >= 0.8))) n++;
  return n / Math.max(a.length, b.length) >= 0.7;
}

export interface Learned { key: string; recipe: Recipe; nuova: boolean; formati: number; unita: boolean }
/**
 * Impara da un ordine esportato. `sources` sono le righe di testo dei documenti da cui l'ordine è stato letto.
 * Aggiorna (o crea) la ricetta del cliente dentro `alias` e dice che cosa ha imparato. Null se non c'è nulla
 * da imparare: cliente sconosciuto, oppure nessun documento da confrontare.
 */
export function learnRecipe(alias: Record<string, string>, order: Order, sources: readonly Source[], today: string): Learned | null {
  const who: Who = { nome: str(order.cliente).trim(), piva: str(order.piva).trim(), cod: str(order.cliente_cod).trim() };
  if (!who.nome && !who.cod && digits(who.piva).length < 8) return null;
  const rows = order.righe.filter(r => r.descrizione.trim() || finalCode(r));
  if (!rows.length || !sources.length) return null;
  const found = findRecipe(alias, who);
  const recipe: Recipe = found ? found.recipe : { v: 1, nome: who.nome, piva: who.piva, cod: who.cod, ordini: 0, at: today, formati: [] };
  let formats = 0, unitLearned = false;
  for (const src of sources) {
    const f = discoverFormat(src, rows);
    if (f) {
      formats++;
      const old = recipe.formati.find(x => sameFirma(x.firma, f.firma));
      if (old) { old.firma = f.firma; old.colonne = f.colonne; old.volte++; old.at = today; }
      else recipe.formati.push({ ...f, volte: 1, at: today });
    } else if (src.kind === 'text') {
      const u = discoverUnit(src, rows);
      if (u) { recipe.unita = u; unitLearned = true; }
    }
  }
  if (!formats && !unitLearned) return null;
  /* i formati usati più di recente restano; quelli vecchi lasciano il posto */
  recipe.formati.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.volte - a.volte));
  recipe.formati = recipe.formati.slice(0, MAX_FORMATS);
  recipe.ordini++; recipe.at = today;
  if (who.nome) recipe.nome = who.nome;
  if (who.piva) recipe.piva = who.piva;
  if (who.cod) recipe.cod = who.cod;
  const key = found && found.key === keyOf(recipe) ? found.key : keyOf(recipe);
  if (found && found.key !== key) delete alias[found.key];
  alias[key] = JSON.stringify(recipe);
  return { key, recipe, nuova: !found, formati: formats, unita: unitLearned };
}
