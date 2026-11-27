/*
 * Ordine Rapido - abbinamento con l'archivio: è qui la regola che dà senso al progetto.
 * Una riga dell'ordine viene collegata a un articolo solo se quell'articolo esiste nell'archivio caricato:
 * nel file esportato non può finire un codice inventato.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { companyKey, digits, keyMatch, normCode, normText, noZeros, tokens } from './anagrafiche.ts';
import { distance, ratio } from './simile.ts';
import type { Article, Index, Link, Order, Party, Row, Via } from './tipi.ts';

export function buildIndex(arts: Article[]): Index {
  const ix: Index = { arts, code: Object.create(null), codeNz: Object.create(null), ean: Object.create(null), mk: [], tok: null, voc: null };
  const add = (map: Record<string, number[]>, key: string, i: number) => { (map[key] = map[key] || []).push(i); };
  arts.forEach((a, i) => {
    const c = normCode(a.cod), e = digits(a.ean);
    ix.mk.push(companyKey(a.mand));
    if (c) { add(ix.code, c, i); add(ix.codeNz, noZeros(c), i); }
    if (e.length >= 8) add(ix.ean, e, i);
  });
  return ix;
}

/** Gli articoli con quella chiave; se l'ordine ha una casa mandante, prima quelli di quella mandante. */
function lookup(ix: Index, map: Record<string, number[]>, key: string, mk: string): number[] | null {
  let list = map[key];
  if (!list) return null;
  if (mk) { const f = list.filter(i => keyMatch(ix.mk[i] || '', mk)); if (f.length) list = f; }
  return list;
}

export function linkOf(a: Article, ok: boolean, via: Via): Link {
  const l: Link = { cod: a.cod, desc: a.desc, um: a.um, mand: a.mand, ok, via };
  if (a.conf) l.conf = a.conf;
  return l;
}

const STOP: Readonly<Record<string, 1>> = { DI: 1, DA: 1, DEL: 1, DELLA: 1, DELLE: 1, DEI: 1, PER: 1, CON: 1, IN: 1, AL: 1, ALLA: 1, ALL: 1, ALLO: 1, IL: 1, LA: 1, LO: 1, LE: 1, GLI: 1, UN: 1, UNA: 1, ED: 1 };
/**
 * Le parole che contano in una descrizione: senza articoli e preposizioni e senza la vocale finale,
 * così «panetti» trova «panetto» e «80x3» trova «80 X 3».
 */
export function words(s: unknown): string[] {
  const text = String(s ?? '');
  /* «all'uovo» vale anche come «alluovo», come lo scrive chi va di fretta */
  const elided = (text.match(/[A-Za-zÀ-ÿ]+['’][A-Za-zÀ-ÿ]+/g) || []).map(w => w.replace(/['’]/g, ''));
  return tokens((text + ' ' + elided.join(' '))
    .replace(/(\d)\s*[xX×]\s*(?=\d)/g, '$1 X ')
    /* «500g», «1kg», «200ml»: il numero da una parte, l'unità dall'altra */
    .replace(/(\d)([A-Za-z]{1,3})\b/g, '$1 $2'))
    .filter(t => !Object.prototype.hasOwnProperty.call(STOP, t))
    .map(t => (t.length >= 4 && /[AEIOU]$/.test(t) && !/\d/.test(t) ? t.slice(0, -1) : t));
}

/** Le chiavi con cui si ricorda un abbinamento scelto a mano: per codice della mandante, per codice del cliente, per descrizione. */
export function aliasKeys(order: Order, row: Row): string[] {
  const ck = digits(order.piva) || companyKey(order.cliente), keys: string[] = [];
  const a = normCode(row.cod_articolo), c = normCode(row.cod_cliente), d = normText(row.descrizione);
  if (a) keys.push('x|' + companyKey(order.mandante) + '|' + a);
  if (c) keys.push('c|' + ck + '|' + c);
  if (d) keys.push('d|' + ck + '|' + d);
  return keys;
}

/**
 * Cerca l'articolo di una riga: per codice, per codice senza zeri iniziali, per EAN, per abbinamento già usato.
 * Restituisce null se non c'è archivio; un collegamento con ok:false se l'articolo non c'è o i candidati sono più d'uno.
 */
export function matchRow(ix: Index | null, row: Row, order: Order, alias?: Record<string, string> | null): Link | null {
  if (!ix || !ix.arts.length) return null;
  const mk = companyKey(order.mandante), c = normCode(row.cod_articolo);
  let list: number[] | null = null, via: Via = '';
  if (c) { list = lookup(ix, ix.code, c, mk) || lookup(ix, ix.codeNz, noZeros(c), mk); via = 'codice'; }
  if (!list) {
    let e = digits(row.ean);
    if (e.length < 8 && /^\d{8,14}$/.test(c)) e = c;
    if (e.length >= 8) { list = lookup(ix, ix.ean, e, mk); via = 'ean'; }
  }
  if (!list && alias) {
    const keys = aliasKeys(order, row);
    for (let k = 0; k < keys.length && !list; k++) {
      const cod = alias[keys[k] || ''];
      if (cod) { list = lookup(ix, ix.code, normCode(cod), mk); via = 'storico'; }
    }
    /*
     * La stessa descrizione dello stesso cliente, scritta con qualche lettera diversa (succede con le foto):
     * vale l'abbinamento già usato, se le due descrizioni sono quasi identiche.
     */
    const d = normText(row.descrizione);
    if (!list && d.length >= 10) {
      const pref = 'd|' + (digits(order.piva) || companyKey(order.cliente)) + '|';
      let best = '', bestR = 0.9;
      for (const k in alias) if (k.indexOf(pref) === 0) { const r = ratio(k.slice(pref.length), d); if (r > bestR) { bestR = r; best = k; } }
      const cod = best ? alias[best] : '';
      if (cod) { list = lookup(ix, ix.code, normCode(cod), mk); via = 'storico'; }
    }
  }
  const first = list ? ix.arts[list[0] ?? -1] : undefined;
  if (!list || !first) return { cod: '', desc: '', um: '', mand: '', ok: false, via: '' };
  if (list.length === 1) return linkOf(first, true, via);
  const l = linkOf(first, false, 'multi');
  l.multi = list.slice(0, 25).map(i => ix.arts[i]).filter((a): a is Article => !!a);
  return l;
}

/** Ricerca per descrizione o codice: gli articoli più simili, i migliori in cima. */
export function search(ix: Index | null, query: string, mandante: string, n?: number): { art: Article; score: number }[] {
  if (!ix) return [];
  if (!ix.tok) ix.tok = ix.arts.map(a => words(a.desc));
  if (!ix.voc) { const v: Record<string, 1> = Object.create(null); for (const t of ix.tok) for (const w of t) v[w] = 1; ix.voc = v; }
  const tok = ix.tok, voc = ix.voc, q = words(query), qc = normCode(query), mk = companyKey(mandante);
  /* il peso di ogni parola cercata: 1 se è scritta come nell'archivio, meno se ci somiglia soltanto */
  const qs: Record<string, number> = Object.create(null), out: { i: number; s: number }[] = [];
  let qn = 0;
  for (const t of q) if (!qs[t]) { qs[t] = 1; qn++; }
  if (!qn && qc.length < 2) return [];
  /* una parola che nell'archivio non c'è (MALLOEDDUS) vale come quelle che le somigliano di più (MALLOREDDUS); i numeri no */
  for (const t of Object.keys(qs)) {
    if (voc[t] || t.length < 4 || /\d/.test(t)) continue;
    const max = t.length >= 8 ? 2 : 1;
    let found = 0;
    for (const v in voc) {
      if (Math.abs(v.length - t.length) > max || qs[v]) continue;
      if (distance(v, t, max) <= max) { qs[v] = 0.8; if (++found >= 3) break; }
    }
  }
  ix.arts.forEach((art, i) => {
    const t = tok[i] || [], seen: Record<string, 1> = Object.create(null);
    let inter = 0;
    for (const w of t) if (qs[w] && !seen[w]) { seen[w] = 1; inter += qs[w] as number; }
    let s = inter ? inter / Math.sqrt(qn * Math.max(1, t.length)) : 0;
    if (qc.length >= 3 && normCode(art.cod).indexOf(qc) >= 0) s += 1;
    if (s > 0 && mk && ix.mk[i] && !keyMatch(ix.mk[i] || '', mk)) s *= 0.3;
    if (s > 0) out.push({ i, s });
  });
  out.sort((x, y) => y.s - x.s || x.i - y.i);
  const res: { art: Article; score: number }[] = [];
  for (const o of out.slice(0, n || 10)) { const art = ix.arts[o.i]; if (art) res.push({ art, score: o.s }); }
  return res;
}

/** Cliente o casa mandante: prima per partita IVA, poi per ragione sociale. Se i candidati sono più d'uno non sceglie. */
function matchParty(list: readonly Party[] | null | undefined, name: string, piva: string): Party | null {
  if (!list || !list.length) return null;
  const p = digits(piva);
  if (p.length >= 8) { const byVat = list.find(c => digits(c.piva) === p); if (byVat) return byVat; }
  const k = companyKey(name);
  if (!k) return null;
  let hits = list.filter(c => companyKey(c.nome) === k);
  if (hits.length === 1) return hits[0] || null;
  hits = list.filter(c => keyMatch(companyKey(c.nome), k));
  return hits.length === 1 ? (hits[0] || null) : null;
}
export function matchClient(clis: readonly Party[], order: Order): Party | null { return matchParty(clis, order.cliente, order.piva); }
export function matchMandante(mans: readonly Party[], order: Order): Party | null { return matchParty(mans, order.mandante, order.mandante_piva); }
