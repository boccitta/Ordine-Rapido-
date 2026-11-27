/*
 * Ordine Rapido - lettura sul dispositivo: dal contenuto dei file all'ordine, senza intelligenza artificiale
 * e senza inviare nulla. Il risultato ha la stessa forma di quello che restituisce Claude, così il resto dell'app
 * non distingue chi ha letto. I codici valgono solo se esistono nell'archivio: lo decide l'abbinamento, non la lettura.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { search } from '../abbinamento.ts';
import { normCode, noZeros } from '../anagrafiche.ts';
import { findRecipe, formatsFor } from '../ricette.ts';
import type { Index, Party } from '../tipi.ts';
import { GIFT_WORDS, readFree } from './libera.ts';
import { readTables } from './tabella.ts';
import type { ReadRow } from './tabella.ts';
import { readHead } from './testata.ts';
import { lineText } from './testo.ts';
import type { Source } from './testo.ts';

export { fromGrid, fromItems, fromText, findDate, readNumber } from './testo.ts';
export type { Cell, Item, Line, Source } from './testo.ts';
export type { ReadRow } from './tabella.ts';

/**
 * Quello che la lettura può consultare: l'archivio caricato, la data di oggi e gli abbinamenti imparati,
 * dentro i quali stanno le ricette dei clienti (vedi ricette.ts).
 */
export interface LocalContext { ix: Index | null; cli: readonly Party[]; man: readonly Party[]; today: string; alias?: Readonly<Record<string, string>> }
export interface LocalAnswer {
  mandante: { nome: string | null; piva: string | null };
  cliente: { nome: string | null; piva: string | null };
  destinazione: string | null; numero_ordine: string | null; data_ordine: string | null; data_consegna: string | null;
  pagamento: string | null; note: string | null;
  righe: ReadRow[];
  totali: { imponibile: number | null; colli: number | null; pezzi: number | null };
  avvisi: string[];
  /** la ricetta usata, se una tabella è stata letta con un formato imparato o i messaggi con l'unità di sempre */
  ricetta: { cliente: string; ordini: number } | null;
}

/* come dire a un servizio di intelligenza artificiale che cosa contiene una colonna, nei termini della risposta che gli si chiede */
const FIELD_HINT: Readonly<Record<string, string>> = {
  cod_articolo: 'cod_articolo', cod_cliente: 'cod_cliente', ean: 'ean', descrizione: 'descrizione', um: 'um', colli: 'colli (cartoni)',
  quantita: 'quantita (pezzi)', pzcollo: 'pezzi per collo, non è la quantità', prezzo: 'prezzo', sconto: 'uno degli sconti', netto: 'prezzo_netto',
  totale: 'totale', nota: 'nota', iva: 'aliquota IVA, da ignorare', riga: 'numero di riga, da ignorare', altro: 'da ignorare'
};
/**
 * Quello che l'app ha imparato dagli ordini precedenti del cliente, scritto per un servizio di intelligenza artificiale:
 * com'è fatta la tabella dei suoi ordini e che cosa intende quando scrive una quantità senza unità. Vuoto se non c'è ricetta.
 */
export function recipeHints(sources: readonly Source[], ctx: LocalContext): string[] {
  const h = readHead(sources, ctx.cli, ctx.man, ctx.today);
  const mine = findRecipe(ctx.alias || {}, { nome: h.cliente, piva: h.cliente_piva, cod: h.cliente_cod });
  if (!mine) return [];
  const out: string[] = [];
  for (const f of mine.recipe.formati.slice(0, 2)) {
    const cols = f.firma.filter(n => f.colonne[n]).map(n => '«' + n + '» = ' + (FIELD_HINT[f.colonne[n] as string] || f.colonne[n]));
    if (cols.length) out.push('- Colonne della tabella nei suoi ordini: ' + cols.join('; ') + '.');
  }
  if (mine.recipe.unita) out.push('- Quando scrive una quantità senza unità intende ' + (mine.recipe.unita === 'colli' ? 'colli (cartoni)' : 'pezzi') + '.');
  if (!out.length) return [];
  return ['Il cliente sembra «' + (mine.recipe.nome || 'già noto') + '». Dai suoi ordini precedenti, già controllati, risulta:'].concat(out);
}

const MAX_ROWS = 400;
const DISCOUNT_ALL = /\bsconto\s+(?:del\s+|di\s+|dell')?(\d+(?:[.,]\d+)?)\s*%\s+su\s+(?:tutt|l'inter)/i;
const orNull = (s: string) => s || null;

/** Legge un ordine dalle fonti ricavate dai file e dal messaggio. Se non trova righe, `righe` è vuoto. */
export function readLocal(sources: readonly Source[], ctx: LocalContext): LocalAnswer {
  const ix = ctx.ix && ctx.ix.arts.length ? ctx.ix : null;
  const rows: ReadRow[] = [], avvisi: string[] = [];
  let sender = '', discount: number | null = null;
  /* una descrizione è credibile se in archivio c'è qualcosa che le somiglia: serve a non scambiare un indirizzo per una riga */
  const plausible = (d: string) => { if (!ix) return true; const hit = search(ix, d, '', 1)[0]; return !!hit && hit.score >= 0.3; };

  /* prima chi ha mandato l'ordine: se lo si conosce, la sua ricetta dice come sono fatti i suoi documenti */
  const h = readHead(sources, ctx.cli, ctx.man, ctx.today), alias = ctx.alias || {};
  const mine = findRecipe(alias, { nome: h.cliente, piva: h.cliente_piva, cod: h.cliente_cod });
  const learned = formatsFor(alias, mine ? mine.recipe : null), formats = learned.map(x => x.format);
  let usedRecipe: { cliente: string; ordini: number } | null = null;

  for (const src of sources) {
    const t = readTables(src.lines, src.kind, formats), base = rows.length;
    for (const k of t.formats) {
      const from = learned[k] ? (learned[k] as { from: string }).from : '';
      const rec = from && mine && mine.recipe.nome === from ? mine.recipe : null;
      if (!usedRecipe) usedRecipe = { cliente: from, ordini: rec ? rec.ordini : 0 };
    }
    if (t.rows.length) {
      for (const r of t.rows) rows.push(r);
      for (const i of t.guessedGifts) avvisi.push('Riga ' + (base + i + 1) + ': ha il prezzo ma né netto né importo. È trattata come omaggio (sconto merce): verifica con il cliente.');
      /* quello che è scritto fuori dalla tabella non diventa una riga: se parla di omaggi, lo si segnala */
      if (!t.rows.some(r => r.omaggio)) src.lines.forEach((l, i) => {
        const s = lineText(l);
        if (!t.used[i] && s.length < 400 && GIFT_WORDS.test(s)) avvisi.push('Fuori dalla tabella si parla di merce in omaggio: «' + s.slice(0, 160) + '». Se serve, aggiungi la riga a mano.');
      });
    } else {
      const usual = mine && mine.recipe.unita ? mine.recipe.unita : '';
      const f = readFree(src.lines.map(lineText), plausible, !!ix, usual);
      if (usual && f.guessed.length && !usedRecipe && mine) usedRecipe = { cliente: mine.recipe.nome, ordini: mine.recipe.ordini };
      for (const r of f.rows) rows.push(r);
      for (const w of f.warnings) avvisi.push(w);
      if (!sender && f.rows.length && f.senders[0]) sender = f.senders[0];
    }
    if (discount === null) for (const l of src.lines) { const m = DISCOUNT_ALL.exec(lineText(l)); if (m) { discount = Number((m[1] as string).replace(',', '.')); break; } }
  }
  if (rows.length > MAX_ROWS) { rows.length = MAX_ROWS; avvisi.push('Il documento ha più di ' + MAX_ROWS + ' righe: sono state lette solo le prime.'); }

  if (discount !== null && discount > 0 && discount < 100 && rows.length) {
    let n = 0;
    for (const r of rows) if (!r.omaggio && !r.sconti.length) { r.sconti.push(discount); n++; }
    if (n) avvisi.push('Nel testo è scritto uno sconto del ' + String(discount).replace('.', ',') + '% su tutta la fornitura: è stato messo su ' + (n === rows.length ? 'tutte le righe' : n + ' righe') + '. Verifica.');
  }

  /* i codici del fornitore si riconoscono dall'archivio: se stanno nella colonna «del cliente», le due colonne si scambiano */
  if (ix) {
    const known = (v: string | null) => { const c = normCode(v); return !!c && !!(ix.code[c] || ix.codeNz[noZeros(c)]); };
    const a = rows.filter(r => known(r.cod_articolo)).length, c = rows.filter(r => known(r.cod_cliente)).length;
    if (c > a) {
      for (const r of rows) { const t = r.cod_articolo; r.cod_articolo = r.cod_cliente; r.cod_cliente = t; }
      avvisi.push('I codici presenti in archivio erano nella colonna dei codici del cliente: le due colonne sono state scambiate.');
    }
  }

  return {
    mandante: { nome: orNull(h.mandante), piva: orNull(h.mandante_piva) },
    cliente: { nome: orNull(h.cliente || sender), piva: orNull(h.cliente_piva) },
    destinazione: orNull(h.destinazione), numero_ordine: orNull(h.numero), data_ordine: orNull(h.data), data_consegna: orNull(h.consegna),
    pagamento: orNull(h.pagamento), note: orNull(h.note),
    righe: rows,
    totali: { imponibile: h.imponibile, colli: h.colli, pezzi: h.pezzi },
    avvisi,
    ricetta: usedRecipe
  };
}
