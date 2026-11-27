/*
 * Ordine Rapido - lettura sul dispositivo: i dati di testata e i totali. Numero e data dell'ordine, consegna,
 * pagamento, destinazione, note; cliente e casa mandante, cercati prima di tutto tra quelli dell'archivio.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { companyKey, digits, normText } from '../anagrafiche.ts';
import type { Party } from '../tipi.ts';
import { bare, cellNumber, findDate, lineText, readNumber } from './testo.ts';
import type { Cell, Line, Source } from './testo.ts';

export interface Head {
  mandante: string; mandante_piva: string; cliente: string; cliente_piva: string;
  numero: string; data: string; consegna: string; pagamento: string; destinazione: string; note: string;
  imponibile: number | null; colli: number | null; pezzi: number | null;
}

/* via i segni ai bordi; il punto finale resta se chiude una sigla, come in «S.R.L.» */
const clean = (s: string) => s.replace(/^[\s.:;-]+|[\s;:-]+$/g, '').replace(/(?<=[A-Za-zÀ-ÿ0-9)]{2})\.+$/, '').replace(/[\s;:-]+$/, '').replace(/\s+/g, ' ');
/** Una cella che apre un altro dato: lì finisce il valore di quello precedente. */
const ANY_LABEL = /^(?:pagam|consegn|destinaz|dest\.|luogo|note?\b|fornitore|spett|data\b|numero|n\.|nr\.|rif|tel|p\.?\s*iva|partita|cod\w*\.?\s*fisc|pagina|pag\.)/i;
/** Quello che segue un'etichetta sulla stessa riga: il resto della cella, oppure le celle dopo, fino alla prossima etichetta. */
function valueAfter(l: Line, k: number, label: RegExp): { text: string; x: number } {
  const c = l.cells[k] as Cell, m = label.exec(c.s), rest = clean(m ? c.s.slice(m.index + m[0].length) : '');
  if (rest) return { text: rest, x: c.x0 + (c.x1 - c.x0) * (c.s.length - rest.length) / Math.max(1, c.s.length) };
  const next: Cell[] = [];
  for (const n of l.cells.slice(k + 1)) { if (next.length && ANY_LABEL.test(n.s)) break; next.push(n); }
  return { text: clean(next.map(n => n.s).join(' ')), x: next[0] ? next[0].x0 : c.x1 };
}
/** La cella che sta sotto, alla stessa altezza orizzontale, entro `depth` righe. */
function below(lines: readonly Line[], i: number, c: Cell, depth = 1): Cell | null {
  for (let j = i + 1; j <= i + depth && j < lines.length; j++) {
    const hit = (lines[j] as Line).cells.find(n => Math.min(n.x1, c.x1) - Math.max(n.x0, c.x0) > 0);
    if (hit) return hit;
  }
  return null;
}

const L_PAY = /^(?:pagamento|pagam\.?|cond\w*\.? (?:di )?pagamento|modalit[aà] (?:di )?pagamento)\b[\s.:]*(?:con\s+)?/i;
const L_DEST = /^(?:destinazione(?: merce)?|dest\.? merce|luogo (?:di )?consegna|consegnare (?:a|presso)|indirizzo (?:di )?consegna)\b[\s.:]*/i;
const L_NOTE = /^(?:note|nota|annotazioni|osservazioni)\b\s*[.:]*\s*/i;
const L_SUPPLIER = /^(?:fornitore|spett\.?(?:le)?(?: ditta| fornitore)?|mandante|ditta fornitrice|casa mandante)\b[\s.:]*/i;
const L_DELIVERY = /\bconsegn\w*\b/i;
const L_DATE = /^(?:data(?!\s+(?:consegna|cons\b|evasione|scadenza|richiesta))(?: ordine| doc\w*| documento)?|del|inviato|date)\b[\s.:]*/i;
const NUMBER_INLINE = /\b(?:ordine|proposta|conferma|oda|ordinativo)\b[^\n]{0,40}?\b(?:n|nr|num|numero)\s*[.°:]*\s*([A-Za-z0-9][A-Za-z0-9\/._-]{0,24})/i;
/* lo stesso, quando la lettura di una foto ha attaccato le parole: «ORDINEN.0412» */
const NUMBER_GLUED = /(?:ordine|oda)\s*(?:n|nr)\s*[.°:]\s*([A-Za-z0-9][A-Za-z0-9\/._-]{0,24})/i;
const L_NUMBER =/^(?:numero|num\.?|n\.?|nr\.?)(?:\s*(?:ordine|ord\.?|doc\w*))?\s*[.°:]*\s*$/i;
const VAT = /(?:p\.?\s*iva|partita\s+iva|cod\w*\.?\s*fisc\w*\.?|c\.?\s*f\.?)[^\d]{0,24}(\d{11})\b/gi;
const T_COLLI = /^tot\w*\.? (?:n\.? )?(?:colli|cartoni|ct)\b/, T_PEZZI = /^tot\w*\.? (?:n\.? )?(?:pezzi|quantita|q ta|qta|pz)\b/;
const T_MERCE = /^(?:importo merce|totale merce|tot merce|totale imponibile|imponibile merce|netto merce)\b/, T_IMPONIBILE = /^imponibile\b/;

/** Il numero che accompagna un'etichetta: nella stessa cella in fondo, nella prima cella numerica a destra, oppure nella cella sotto. */
function numberFor(lines: readonly Line[], i: number, k: number): number | null {
  const l = lines[i] as Line, c = l.cells[k] as Cell;
  const tail = /[:.\s](-?\d[\d.,]*)\s*(?:€|eur\w*)?$/i.exec(c.s);
  if (tail && !/%$/.test(c.s)) { const n = readNumber(tail[1] as string); if (n !== null) return n; }
  for (const n of l.cells.slice(k + 1)) { const v = cellNumber(n); if (v !== null) return v; if (/[A-Za-z]{3}/.test(n.s)) break; }
  const b = below(lines, i, c);
  return b ? cellNumber(b) : null;
}

/** L'azienda dell'archivio nominata nel testo: quella con il nome più lungo, se è una sola. */
function partyIn(list: readonly Party[], text: string, vats: readonly string[], skip?: Party | null): Party | null {
  for (const v of vats) { const hit = list.find(p => digits(p.piva) === v); if (hit && hit !== skip) return hit; }
  let best: Party | null = null, bestLen = 0, tie = false;
  /* nel testo letto da una foto gli spazi si perdono spesso: un nome lungo vale anche scritto tutto attaccato */
  const tight = text.replace(/ /g, '');
  for (const p of list) {
    if (p === skip) continue;
    const key = companyKey(p.nome);
    if (key.length < 6) continue;
    if (text.indexOf(' ' + key + ' ') < 0 && !(key.length >= 10 && tight.indexOf(key.replace(/ /g, '')) >= 0)) continue;
    if (key.length > bestLen) { best = p; bestLen = key.length; tie = false; } else if (key.length === bestLen) tie = true;
  }
  return tie ? null : best;
}

/** Legge testata e totali da tutte le fonti. `today` serve per le date relative («giovedì», «domani»). */
export function readHead(sources: readonly Source[], cli: readonly Party[], man: readonly Party[], today: string): Head {
  const h: Head = { mandante: '', mandante_piva: '', cliente: '', cliente_piva: '', numero: '', data: '', consegna: '', pagamento: '', destinazione: '', note: '', imponibile: null, colli: null, pezzi: null };
  let merce: number | null = null, imponibile: number | null = null, supplierLine = -1, all = '';
  const vats: { v: string; supplier: boolean }[] = [], delivery: string[] = [];

  for (const src of sources) {
    const lines = src.lines;
    lines.forEach((l, i) => {
      const text = lineText(l);
      if (!text) return;
      all += ' ' + text;
      let m: RegExpExecArray | null;
      if (!h.numero && (m = NUMBER_INLINE.exec(text) || NUMBER_GLUED.exec(text)) && /\d/.test(m[1] as string)) h.numero = (m[1] as string).replace(/[.]+$/, '');
      if (L_DELIVERY.test(text) || /\bper\s+(?:luned|marted|mercoled|gioved|venerd|sabato|domenica|domani|dopodomani)/i.test(text)) delivery.push(text);
      if (!h.pagamento && (m = /\bpago\s+(.{3,60}?)(?:\s+come sempre|[.!]|$)/i.exec(text))) h.pagamento = clean(m[1] as string);
      l.cells.forEach((c, k) => {
        const b = bare(c.s);
        if (!h.numero && L_NUMBER.test(c.s)) { const v = valueAfter(l, k, L_NUMBER).text.split(' ')[0] || ''; if (/\d/.test(v)) h.numero = v; }
        if (!h.data && L_DATE.test(c.s)) h.data = findDate(valueAfter(l, k, L_DATE).text, '');
        if (!h.pagamento && L_PAY.test(c.s)) h.pagamento = clean(valueAfter(l, k, L_PAY).text.replace(/,?\s*come (?:sempre|al solito|d'accordo|concordato)\b.*$/i, ''));
        if (!h.destinazione && L_DEST.test(c.s)) h.destinazione = valueAfter(l, k, L_DEST).text;
        if (!h.mandante && L_SUPPLIER.test(c.s)) {
          const under = below(lines, i, c, 4);
          const v = valueAfter(l, k, L_SUPPLIER).text || (under ? under.s : '');
          /* il nome finisce dove comincia l'indirizzo */
          h.mandante = clean(v.split(/\s+-\s+|,\s+(?:via|viale|piazza|corso|loc)/i)[0] || '');
          supplierLine = i;
        }
        if (!h.note && L_NOTE.test(c.s)) {
          const v = valueAfter(l, k, L_NOTE);
          let note = v.text;
          /* le righe sotto che cominciano dove comincia il testo della nota ne sono il seguito */
          for (let j = i + 1; j < Math.min(lines.length, i + 4) && note; j++) {
            const n = lines[j] as Line, first = n.cells[0];
            if (n.cells.length !== 1 || !first || Math.abs(first.x0 - v.x) > Math.max(3, (c.x1 - c.x0) / Math.max(1, c.s.length))) break;
            note += (/[.!?;:,]$/.test(note) ? ' ' : '. ') + clean(first.s);
          }
          h.note = note;
        }
        if (h.colli === null && T_COLLI.test(b)) h.colli = numberFor(lines, i, k);
        if (h.pezzi === null && T_PEZZI.test(b)) h.pezzi = numberFor(lines, i, k);
        if (merce === null && T_MERCE.test(b)) merce = numberFor(lines, i, k);
        else if (T_IMPONIBILE.test(b)) { const n = numberFor(lines, i, k); if (n !== null) imponibile = (imponibile || 0) + n; }
      });
      VAT.lastIndex = 0;
      while ((m = VAT.exec(text))) vats.push({ v: m[1] as string, supplier: i === supplierLine || /fornitore|cod\w*\.? forn/i.test(text) });
    });
  }

  /* la data dell'ordine: quella con l'etichetta, altrimenti quella di un messaggio di chat o di una mail */
  if (!h.data) { const m = /^\[?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/m.exec(all.trim()); if (m) h.data = findDate(m[1] as string, ''); }
  const ref = h.data || today;
  for (const d of delivery) {
    /* la data di consegna è quella scritta dopo la parola «consegna»; prima può esserci la data dell'ordine */
    if (!h.consegna) h.consegna = findDate(d.replace(/^.*?consegn\w*/i, ''), ref);
    /* «Consegna: entro il 02/12/2026 - franco ns. punto vendita…»: quello che segue la data è la destinazione */
    const m = /consegn\w*[\s.:]*(?:richiesta\s*)?(?:entro\s+(?:il\s+)?)?\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\s*[-–,:]\s*(.{12,160})$/i.exec(d);
    if (m && !h.destinazione) h.destinazione = clean(m[1] as string);
  }
  h.imponibile = merce !== null ? merce : imponibile;

  /* cliente e casa mandante: prima quelli dell'archivio, riconosciuti dalla partita IVA o dal nome scritto nel documento */
  const norm = ' ' + normText(all).split(' ').filter(t => t.length > 1).join(' ') + ' ', vatList = vats.map(v => v.v);
  const m = partyIn(man, norm, vatList) || (h.mandante ? partyIn(man, ' ' + companyKey(h.mandante) + ' ', []) : null);
  if (m) { h.mandante = m.nome; h.mandante_piva = digits(m.piva); }
  const c = partyIn(cli, norm, vatList);
  if (c) { h.cliente = c.nome; h.cliente_piva = digits(c.piva); }
  if (!h.mandante_piva) { const v = vats.find(x => x.supplier); if (v) h.mandante_piva = v.v; }
  if (!h.cliente_piva) { const v = vats.find(x => !x.supplier && x.v !== h.mandante_piva); if (v) h.cliente_piva = v.v; }
  /* in un documento vero e proprio chi ordina è scritto in cima, a sinistra */
  if (!h.cliente) {
    const first = sources.find(s => s.kind !== 'text' && !s.rough && s.lines.length > 2), top = first ? first.lines.find(l => l.cells.length > 0) : null;
    const name = top && top.cells[0] ? clean(top.cells[0].s) : '';
    if (/[A-Za-zÀ-ÿ]{3}/.test(name) && name.length <= 60 && !/^(ordine|proposta|conferma|spett|data|pag)/i.test(name)) h.cliente = name;
  }
  return h;
}
