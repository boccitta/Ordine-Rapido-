/*
 * Ordine Rapido - lettura sul dispositivo: dal contenuto di un file a righe di testo con la posizione di ogni pezzo.
 * Un foglio Excel, una pagina PDF, una foto passata dal riconoscimento dei caratteri e un messaggio diventano tutti
 * la stessa cosa: righe fatte di celle, ognuna con il punto in cui comincia e finisce. È la posizione a dire in quale
 * colonna sta un numero.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */

/** Un pezzo di testo su una riga. x0 e x1 sono in un'unità qualsiasi, purché sia la stessa in tutta la fonte. */
export interface Cell { s: string; x0: number; x1: number; /** il valore, quando la cella di un foglio contiene già un numero */ n?: number }
export interface Line { cells: Cell[] }
/** grid: foglio di calcolo o CSV · page: pagina di PDF o foto · text: messaggio o file di testo */
export interface Source { name: string; kind: 'grid' | 'page' | 'text'; lines: Line[]; /** true se il testo viene da una foto: può contenere errori di lettura */ rough?: boolean }
/** Un frammento di testo con la sua posizione sulla pagina: così li danno i PDF e il riconoscimento dei caratteri. */
export interface Item { s: string; x: number; y: number; w: number; h: number }

/** Il testo di una riga, con le celle separate da due spazi. */
export function lineText(l: Line): string { return l.cells.map(c => c.s).join('  '); }
/** Testo ridotto all'osso per i confronti: minuscolo, senza accenti, solo lettere e cifre separate da uno spazio. */
export function bare(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/* ---------- Da file a righe ---------- */
/** Le righe di un foglio: ogni colonna occupa una fascia larga 100, così le celle si allineano da sole. */
export function fromGrid(name: string, rows: readonly (readonly unknown[])[]): Source {
  const lines: Line[] = [];
  for (const r of rows) {
    const cells: Cell[] = [];
    r.forEach((v, k) => {
      if (v === null || v === undefined || v === '') return;
      const c: Cell = { s: '', x0: k * 100, x1: k * 100 + 99 };
      if (typeof v === 'number') { if (!isFinite(v)) return; c.n = v; c.s = String(v); }
      /* le date delle celle arrivano come mezzanotte dell'ora locale, a volte qualche secondo prima: cinque minuti di margine */
      else if (v instanceof Date) { if (isNaN(v.getTime())) return; const d = new Date(v.getTime() + 300000); c.s = isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
      else c.s = String(v).replace(/\s+/g, ' ').trim();
      if (c.s) cells.push(c);
    });
    if (cells.length) lines.push({ cells });
  }
  return { name, kind: 'grid', lines };
}

/** Le righe di un testo: una cella nuova dove ci sono una tabulazione, una barra o almeno due spazi. La posizione è il numero del carattere. */
export function fromText(name: string, text: string): Source {
  const lines: Line[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const cells: Cell[] = [], line = raw.replace(/\t/g, '    ');
    const re = /(?:[^\s|]|\s(?![\s|])|\|(?!\s))+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) { const s = m[0].trim(); if (s) cells.push({ s, x0: m.index + m[0].indexOf(s), x1: m.index + m[0].indexOf(s) + s.length }); }
    /* le righe vuote restano: in un messaggio dicono dove finisce un elenco */
    lines.push({ cells });
  }
  return { name, kind: 'text', lines };
}

/**
 * Ricompone le righe di una pagina dai frammenti di testo. Le coordinate crescono verso destra e verso il basso.
 * Due frammenti stanno sulla stessa riga se sono alla stessa altezza di quello che li precede: così una pagina
 * fotografata un po' storta resta leggibile. Sulla riga, uno spazio più largo di un carattere e mezzo apre una cella nuova.
 */
export function fromItems(name: string, items: readonly Item[], opts?: { photo?: boolean }): Source {
  const rows: { y: number; h: number; items: Item[] }[] = [];
  let sorted = items.filter(i => i.s && i.s.trim()).slice();
  /* una foto è quasi sempre un po' storta: prima si raddrizza, altrimenti le colonne lontane finiscono su righe diverse */
  if (opts && opts.photo) { const t = skew(sorted); if (t) sorted = sorted.map(i => ({ ...i, y: i.y - (i.x + i.w / 2) * t })); }
  sorted.sort((a, b) => a.x - b.x);
  const photo = !!(opts && opts.photo);
  /* dove passa una riga all'altezza di x: in una foto la riga può salire o scendere, e la pendenza si ricava dai suoi pezzi */
  const lineAt = (r: { y: number; items: Item[] }, x: number): number => {
    const first = r.items[0] as Item, last = r.items[r.items.length - 1] as Item;
    const x0 = first.x + first.w / 2, x1 = last.x + last.w / 2, y0 = first.y + first.h / 2, y1 = last.y + last.h / 2;
    if (!photo || r.items.length < 2 || x1 - x0 < 4 * last.h) return r.y;
    return y1 + Math.max(-0.14, Math.min(0.14, (y1 - y0) / (x1 - x0))) * (x - x1);
  };
  for (const it of sorted) {
    const cy = it.y + it.h / 2;
    let best: typeof rows[number] | null = null, bestD = Infinity;
    for (const r of rows) {
      const d = Math.abs(lineAt(r, it.x + it.w / 2) - cy), tol = Math.max(2, Math.min(r.h, it.h || r.h) * 0.6);
      if (d <= tol && d < bestD) { best = r; bestD = d; }
    }
    if (best) { best.items.push(it); best.y = cy; best.h = it.h || best.h; }
    else rows.push({ y: cy, h: it.h || 10, items: [it] });
  }
  /* l'ordine dall'alto in basso si decide sul primo frammento di ogni riga: quello più a sinistra */
  rows.sort((a, b) => ((a.items[0] as Item).y + (a.items[0] as Item).h / 2) - ((b.items[0] as Item).y + (b.items[0] as Item).h / 2));
  /*
   * In una foto presa di sbieco le righe in alto salgono più di quelle in basso: la parte destra di una riga può
   * finire su una riga a sé. Due righe vicine che occupano parti diverse della larghezza, e che una pendenza
   * modesta mette alla stessa altezza, sono la stessa riga.
   */
  if (opts && opts.photo) for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i] as typeof rows[number], b = rows[i + 1] as typeof rows[number];
    const [left, right] = (a.items[0] as Item).x <= (b.items[0] as Item).x ? [a, b] : [b, a];
    const end = left.items[left.items.length - 1] as Item, start = right.items[0] as Item;
    const dx = start.x - (end.x + end.w), dy = Math.abs((start.y + start.h / 2) - (end.y + end.h / 2));
    if (dx > 0 && dy <= 0.14 * (dx + (start.w + end.w) / 2) && dy <= 2.2 * Math.min(start.h, end.h)) {
      left.items = left.items.concat(right.items);
      rows.splice(i, 2, left); i--;
    }
  }
  const lines: Line[] = [];
  for (const r of rows) {
    const cells: Cell[] = [];
    let last: Item | null = null;
    for (const it of r.items) {
      const s = it.s.replace(/\s+/g, ' ').trim(), prev = cells[cells.length - 1];
      if (last && prev) {
        const cw = (last.w / Math.max(1, last.s.trim().length) + it.w / Math.max(1, s.length)) / 2;
        if (it.x - (last.x + last.w) <= cw * 1.6) { prev.s += ' ' + s; prev.x1 = Math.max(prev.x1, it.x + it.w); last = it; continue; }
      }
      cells.push({ s, x0: it.x, x1: it.x + it.w }); last = it;
    }
    lines.push({ cells });
  }
  const src: Source = { name, kind: 'page', lines };
  if (opts && opts.photo) src.rough = true;
  return src;
}

/**
 * Di quanto è inclinata una pagina fotografata: la pendenza (tra -0,14 e 0,14, cioè circa otto gradi) con cui
 * i pezzi di testo si dispongono sul minor numero di righe. Zero se la pagina è dritta o ha troppo poco testo.
 */
function skew(items: readonly Item[]): number {
  if (items.length < 6) return 0;
  const hs = items.map(i => i.h).sort((a, b) => a - b), tol = Math.max(2, (hs[hs.length >> 1] || 10) * 0.35);
  let best = 0, bestRows = Infinity;
  for (let k = 0; k <= 56; k++) {
    /* si parte da zero e ci si allarga da una parte e dall'altra: a parità di righe vince l'inclinazione minore */
    const t = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.005;
    const ys = items.map(i => i.y + i.h / 2 - (i.x + i.w / 2) * t).sort((a, b) => a - b);
    let rows = 1;
    for (let j = 1; j < ys.length; j++) if ((ys[j] as number) - (ys[j - 1] as number) > tol) rows++;
    if (rows < bestRows) { bestRows = rows; best = t; }
  }
  return best;
}

/* ---------- Numeri ---------- */
/**
 * Legge un numero scritto come nei documenti italiani: 1.016,35 · 12,450 · 4.388 (quattromila) · 0.85.
 * Restituisce null se il testo non è soltanto un numero.
 */
export function readNumber(v: string): number | null {
  let s = v.replace(/[\s€%]/g, '').replace(/^(?:eur|euro)|(?:eur|euro)$/i, '');
  if (!/^[-+]?\d[\d.,]*$/.test(s)) return null;
  const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (comma >= 0) { if (s.indexOf(',') !== comma) return null; s = s.replace(',', '.'); }
  else if (dot >= 0) {
    /* solo punti: migliaia se i gruppi sono di tre cifre e il numero non comincia per zero, altrimenti decimali */
    if (/^[-+]?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else if (s.indexOf('.') !== dot) return null;
  }
  s = s.replace(/\.$/, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}
/** Il numero di una cella: quello già noto, se viene da un foglio, altrimenti quello scritto. */
export function cellNumber(c: Cell): number | null { return c.n !== undefined ? c.n : readNumber(c.s); }

/* ---------- Date ---------- */
function isoDate(y: number, m: number, d: number): string {
  if (!(y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1) return '';
  return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
}
function addDays(iso: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
function weekday(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay() : -1;
}
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const DAYS = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];

/**
 * La prima data scritta in un testo, nel formato AAAA-MM-GG; vuoto se non ce n'è.
 * Capisce 27/11/2026, 27.11.26, 2026-11-27, «27 novembre 2026», «5 dicembre», «giovedì», «domani».
 * `ref` è il giorno da cui si contano le date relative e quelle senza anno: la data dell'ordine, oppure oggi.
 */
export function findDate(text: string, ref: string): string {
  const t = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let m = /(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(t);
  if (m) { const d = isoDate(Number(m[1]), Number(m[2]), Number(m[3])); if (d) return d; }
  m = /(?:^|[^\d.,\/-])(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})(?![\d\/])/.exec(t);
  if (m) { const y = Number(m[3]), d = isoDate(y < 100 ? 2000 + y : y, Number(m[2]), Number(m[1])); if (d) return d; }
  const refYear = Number(ref.slice(0, 4)) || 0;
  m = /(?:^|[^\d])(\d{1,2})°?\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|gen|feb|mar|apr|mag|giu|lug|ago|set|sett|ott|nov|dic)\b\.?(?:\s+(\d{4}))?/.exec(t);
  if (m) {
    const mon = MONTHS.indexOf((m[2] as string).slice(0, 3)) + 1, day = Number(m[1]);
    if (m[3]) { const d = isoDate(Number(m[3]), mon, day); if (d) return d; }
    else if (refYear) {
      /* senza anno: la prossima volta che capita quel giorno, a partire dal riferimento */
      const d = isoDate(refYear, mon, day);
      if (d) return d >= addDays(ref, -1) ? d : isoDate(refYear + 1, mon, day);
    }
  }
  if (!ref) return '';
  if (/\bdopodomani\b/.test(t)) return addDays(ref, 2);
  if (/\bdomani\b/.test(t)) return addDays(ref, 1);
  m = /\b(domenica|lunedi|martedi|mercoledi|giovedi|venerdi|sabato)\b/.exec(t);
  if (m) {
    const want = DAYS.indexOf(m[1] as string), now = weekday(ref);
    if (now >= 0) return addDays(ref, ((want - now + 6) % 7) + 1);
  }
  return '';
}
