/*
 * Ordine Rapido - lettura sul dispositivo: gli ordini scritti a parole, in un messaggio o su un biglietto.
 * «6 cartoni di mozzarella», «passata 700 gr 10 ct», «anzi la passata fai 12», «togli i borlotti».
 * Sono regole, non comprensione: ogni riga letta così va riguardata, e gli avvisi dicono dove.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { bare, readNumber } from './testo.ts';
import { emptyReadRow } from './tabella.ts';
import type { ReadRow } from './tabella.ts';

const COLLI = 'cartoni|cartone|ct|crt|cart|colli|collo|casse|cassa|cassette|cassetta|confezioni|confezione|conf|scatole|scatola|scatoloni|scatolone|imballi|imballo|fardelli|fardello|pacchi|pacco';
const PEZZI = 'pezzi|pezzo|pz';
const PESO = 'kg|chili|chilo|kili|kilo';
const NUM = '(\\d+(?:[.,]\\d+)?)';
const RE_UNIT = new RegExp('(?:^|[^\\w.,\\/])' + NUM + '\\s*(' + COLLI + '|' + PEZZI + ')\\b\\.?', 'i');
const RE_LEAD = new RegExp('^' + NUM + '\\s*(?:x\\s+)?(' + PESO + ')?\\b\\.?\\s*(?:di\\s+|da\\s+|d\')?(\\S.*)$', 'i');
const RE_TAIL = /^(.*[A-Za-zÀ-ÿ].*?)\s+(\d{1,2})$/;
const IS_COLLI = new RegExp('^(?:' + COLLI + ')$', 'i');
/* parole che indicano già il pezzo singolo: «20 panetti di burro» sono venti pezzi, non venti cartoni */
const PIECE_WORD = /^(?:panett|bottigli|vasett|vas[oi]\b|bust[ae]\b|bustin|latt[ae]\b|lattin|barattol|vaschett|form[ae]\b|filon|tubett|tub[oi]\b|flacon|sacchett|pacchett|brick\b|brik\b|unit[aà]\b|singol)/i;
/* dopo un numero queste parole non sono merce: «30 giorni», «8%», «27 novembre» */
const NOT_GOODS = /^(?:gg|giorni|giorno|ore|euro|eur|€|%|anni|mesi|minuti|km|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|di\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre))\b/i;
const FILLER = /^(?:e|ed|poi|anche|più|piu|inoltre|aggiungi|aggiungere|aggiungimi|metti|mettimi|mandami|manda|mi servono|mi serve|servono|serve|vorrei|ordino|ordine|per favore|se riesci|se puoi|grazie|ciao|buongiorno|buonasera|salve)\b[\s,:.!-]*/i;
const TRAILER = /\s*(?:[,;.!?]\s*)?\b(?:grazie|per favore|x favore|come sempre|come l'altra volta|come al solito|come da accordi|se possibile|se riesci|mi raccomando)\b.*$/i;
export const GIFT_WORDS = /\b(?:in omaggio|omaggio|omaggi|gratis|in regalo|sconto merce)\b/i;
/** L'inizio di un messaggio di chat esportato: data, ora e nome di chi scrive. */
const CHAT = /^\[?\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4},?\s+\d{1,2}[:.]\d{2}(?::\d{2})?\]?\s*(?:-\s*)?([^:]{1,40}):\s*/;
const FIX = /\b(?:l[aeo]\s+|l'|il\s+|i\s+|gli\s+)?([a-zà-ÿ]{4,})\s+(?:fai|falli|fanne|fammi|facciamo|metti|mettine|diventa|diventano|porta(?:li|le|la|lo)?\s+a)\s+(\d+)\b/i;
const DROP = /\b(?:togli|toglimi|togliere|elimina|cancella|annulla)\s+(?:anche\s+)?(?:l[aeo]\s+|l'|il\s+|i\s+|gli\s+)?([a-zà-ÿ]{4,})/i;
const SECOND_THOUGHT = /\b(?:anzi|invece|correggo|ho sbagliato|errata corrige)\b/i;

/** Dice se una descrizione somiglia a un articolo dell'archivio. Senza archivio risponde sempre sì. */
export type Plausible = (description: string) => boolean;
export type Unit = 'colli' | 'pezzi' | '';

function tidy(s: string): string {
  let d = s.replace(GIFT_WORDS, ' ').replace(TRAILER, '');
  /* via faccine, segni e file di puntini; restano lettere, cifre e la punteggiatura che serve a un formato come «1/4» o «80x3» */
  d = d.replace(/[^\p{L}\p{N}\s.,'\/%+x×-]/gu, ' ').replace(/\.{2,}/g, ' ').replace(/\s+/g, ' ').trim();
  /* in fondo, le lettere rimaste sole sono resti di una riga di puntini letta male */
  d = d.replace(/(?:\s+[A-Za-z.]){1,3}$/, '');
  return d.replace(/^[\s.,:;-]+|[\s.,:;-]+$/g, '');
}

interface Parsed { row: ReadRow; unit: Unit; assumed: boolean }
function parseSegment(raw: string, prev: Unit, plausible: Plausible, hasArchive: boolean): Parsed | null {
  let seg = raw.replace(/^[\s\-–•*·>]+/, '').trim(), guard = 0;
  while (FILLER.test(seg) && guard++ < 6) seg = seg.replace(FILLER, '');
  if (!seg) return null;
  const gift = GIFT_WORDS.test(seg), r = emptyReadRow();
  r.omaggio = gift;
  let m = RE_UNIT.exec(seg);
  if (m) {
    const n = readNumber(m[1] as string), end = m.index + m[0].length;
    const before = tidy(seg.slice(0, m.index + m[0].indexOf(m[1] as string))), after = tidy(seg.slice(end).replace(/^\s*(?:di|da)\s+|^\s*d'/i, ''));
    if (n === null) return null;
    r.descrizione = /[A-Za-zÀ-ÿ]{3}/.test(after) ? after : (before + ' ' + after).trim();
    if (!/[A-Za-zÀ-ÿ]{3}/.test(r.descrizione)) return null;
    const colli = IS_COLLI.test(m[2] as string);
    if (colli) r.colli = n; else r.quantita = n;
    return { row: r, unit: colli ? 'colli' : 'pezzi', assumed: false };
  }
  m = RE_LEAD.exec(seg);
  if (m) {
    const n = readNumber(m[1] as string), rest = m[3] as string, d = tidy(rest);
    if (n !== null && n > 0 && n < 1000 && !NOT_GOODS.test(rest) && /[A-Za-zÀ-ÿ]{3}/.test(d) && d.split(' ').length <= 12 && (plausible(d) || !hasArchive)) {
      r.descrizione = d;
      if (m[2]) { r.quantita = n; r.um = 'KG'; return { row: r, unit: '', assumed: false }; }
      if (PIECE_WORD.test(d)) { r.quantita = n; return { row: r, unit: '', assumed: false }; }
      if (prev === 'colli') r.colli = n; else r.quantita = n;
      return { row: r, unit: prev, assumed: true };
    }
  }
  m = RE_TAIL.exec(seg);
  if (m && hasArchive) {
    const n = readNumber(m[2] as string), d = tidy(m[1] as string);
    if (n !== null && n > 0 && /[A-Za-zÀ-ÿ]{3}/.test(d) && d.split(' ').length <= 8 && plausible(d)) {
      r.descrizione = d;
      if (prev === 'colli') r.colli = n; else r.quantita = n;
      return { row: r, unit: prev, assumed: true };
    }
  }
  return null;
}

/** La riga che parla di quella parola: «passata» trova «passata 700 gr». Si cerca dall'ultima scritta. */
function rowAbout(rows: readonly ReadRow[], word: string): number {
  const w = bare(word), stem = w.slice(0, Math.max(4, w.length - 2));
  for (let i = rows.length - 1; i >= 0; i--) if ((' ' + bare((rows[i] as ReadRow).descrizione)).indexOf(' ' + stem) >= 0) return i;
  return -1;
}

export interface FreeResult {
  rows: ReadRow[]; warnings: string[];
  /** chi scrive i messaggi di una chat, dal più presente */
  senders: string[];
  /** le righe la cui quantità era scritta senza unità: la colonna (colli o pezzi) è stata supposta */
  guessed: ReadRow[];
}

/**
 * Ricava le righe d'ordine da righe di testo libero. `usual` è l'unità che questo cliente sottintende di solito
 * (imparata dagli ordini precedenti): vale per le quantità scritte senza unità finché il messaggio non ne nomina una.
 */
export function readFree(lines: readonly string[], plausible: Plausible, hasArchive: boolean, usual: Unit = ''): FreeResult {
  const rows: ReadRow[] = [], warnings: string[] = [], assumed: string[] = [], guessed: ReadRow[] = [], seen: Record<string, number> = {};
  let unit: Unit = usual, fromUsual = !!usual;
  for (const raw of lines) {
    let line = raw.trim();
    const chat = CHAT.exec(line);
    if (chat) { const who = (chat[1] as string).trim(); seen[who] = (seen[who] || 0) + 1; line = line.slice(chat[0].length); }
    if (!line) continue;
    /* prima le correzioni: valgono sulle righe già lette */
    let fixed = false;
    const fix = FIX.exec(line), drop = DROP.exec(line);
    if (fix) {
      const i = rowAbout(rows, fix[1] as string), n = Number(fix[2]), r = rows[i];
      if (r) {
        const old = r.colli !== null ? r.colli : r.quantita;
        if (r.colli !== null || r.quantita === null && unit === 'colli') r.colli = n; else r.quantita = n;
        warnings.push('«' + r.descrizione + '»: quantità portata da ' + (old === null ? 'niente' : old) + ' a ' + n + ', come scritto più avanti nel messaggio. Verifica.');
        fixed = true;
      }
    }
    if (drop) {
      const i = rowAbout(rows, drop[1] as string), r = rows[i];
      if (r) { rows.splice(i, 1); warnings.push('Tolta la riga «' + r.descrizione + '»: più avanti nel messaggio è scritto di toglierla. Verifica.'); fixed = true; }
    }
    if ((fix || drop || SECOND_THOUGHT.test(line)) && !fixed) warnings.push('Nel messaggio c\'è una correzione che non ho saputo applicare: «' + line.slice(0, 120) + '». Controlla le righe.');
    if (fix || drop) continue;
    for (const seg of line.split(/\s*;\s*|\s*,\s*(?=\d)|\s+e\s+(?=\d)|\s+\+\s+(?=\d)/)) {
      const p = parseSegment(seg, unit, plausible, hasArchive);
      if (!p) continue;
      if (p.unit && !p.assumed) { unit = p.unit; fromUsual = false; }
      if (p.assumed) {
        guessed.push(p.row);
        /* se l'unità sottintesa è quella di sempre per questo cliente, non c'è niente da segnalare */
        if (!fromUsual) assumed.push(p.row.descrizione);
      }
      rows.push(p.row);
    }
  }
  if (assumed.length) warnings.push('Quantità scritta senza unità (pezzi o cartoni) per: ' + assumed.slice(0, 6).join('; ') + (assumed.length > 6 ? '…' : '') + '. Verifica che sia nella colonna giusta.');
  const senders = Object.keys(seen).sort((a, b) => (seen[b] as number) - (seen[a] as number));
  return { rows, warnings, senders, guessed };
}
