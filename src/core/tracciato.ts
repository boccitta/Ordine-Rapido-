/*
 * Ordine Rapido - tracciato ed esportazione: quali colonne finiscono nel file, in che ordine e in che formato.
 * Il codice articolo esportato è sempre quello dell'archivio, quando la riga è collegata.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { fmtDate, num, round, show } from './numeri.ts';
import { rowCalc } from './ordine.ts';
import type { Order, OrderText, Profile, ProfileCol, Row, Table } from './tipi.ts';

/** Una colonna esportabile. g: 'r' riga, 't' testata (ripetuta su ogni riga). */
export interface ColDef { id: string; g: 'r' | 't'; label: string; header: string; on: boolean }

export const COLS: readonly ColDef[] = [
  { id: 'cod_articolo', g: 'r', label: 'Codice articolo mandante', header: 'CodArticolo', on: true },
  { id: 'descrizione', g: 'r', label: 'Descrizione', header: 'Descrizione', on: true },
  { id: 'um', g: 'r', label: 'Unità di misura', header: 'Unimis', on: true },
  { id: 'quantita', g: 'r', label: 'Quantità', header: 'Quantita', on: true },
  { id: 'colli', g: 'r', label: 'Colli', header: 'Colli', on: true },
  { id: 'prezzo', g: 'r', label: 'Prezzo unitario', header: 'Prezzo', on: true },
  { id: 'sc1', g: 'r', label: 'Sconto 1 %', header: 'Sconto1', on: true },
  { id: 'sc2', g: 'r', label: 'Sconto 2 %', header: 'Sconto2', on: true },
  { id: 'sc3', g: 'r', label: 'Sconto 3 %', header: 'Sconto3', on: false },
  { id: 'omaggio', g: 'r', label: 'Omaggio S/N', header: 'Omaggio', on: true },
  { id: 'netto', g: 'r', label: 'Prezzo netto', header: 'PrezzoNetto', on: false },
  { id: 'totale', g: 'r', label: 'Totale riga', header: 'Totale', on: false },
  { id: 'cod_cliente', g: 'r', label: 'Codice articolo del cliente', header: 'CodArtCliente', on: false },
  { id: 'ean', g: 'r', label: 'EAN', header: 'EAN', on: false },
  { id: 'nota', g: 'r', label: 'Nota riga', header: 'NotaRiga', on: false },
  { id: 'numero', g: 't', label: 'N. ordine cliente', header: 'NumOrdine', on: true },
  { id: 'data', g: 't', label: 'Data ordine', header: 'DataOrdine', on: true },
  { id: 'consegna', g: 't', label: 'Data consegna', header: 'DataConsegna', on: true },
  { id: 'cliente_cod', g: 't', label: 'Codice cliente', header: 'CodCliente', on: true },
  { id: 'cliente', g: 't', label: 'Cliente', header: 'Cliente', on: true },
  { id: 'piva', g: 't', label: 'P.IVA cliente', header: 'PIvaCliente', on: true },
  { id: 'mandante_cod', g: 't', label: 'Codice mandante', header: 'CodMandante', on: true },
  { id: 'mandante', g: 't', label: 'Casa mandante', header: 'Mandante', on: true },
  { id: 'pagamento', g: 't', label: 'Pagamento', header: 'Pagamento', on: true },
  { id: 'destinazione', g: 't', label: 'Destinazione merce', header: 'Destinazione', on: true },
  { id: 'note', g: 't', label: 'Note', header: 'Note', on: true }
];
export function colDef(id: string): ColDef | null {
  return COLS.find(c => c.id === id) || null;
}

export function defaultProfile(): Profile {
  return { sep: ';', dec: ',', date: 'dmy', enc: 'cp1252', um: 'PZ', omaggi: 'sconto100', header: true, descSrc: 'gesacom', allowUnlinked: false,
    cols: COLS.map(c => ({ id: c.id, on: c.on, header: c.header })) };
}

const PROFILE_TEXT = ['sep', 'dec', 'date', 'enc', 'um', 'omaggi', 'descSrc'] as const;
/** Parte dal tracciato predefinito e ci riporta sopra quello salvato: così un tracciato vecchio riceve le colonne nuove. */
export function mergeProfile(saved: unknown): Profile {
  const p = defaultProfile();
  if (!saved || typeof saved !== 'object') return p;
  const s = saved as Record<string, unknown>;
  for (const k of PROFILE_TEXT) { const v = s[k]; if (typeof v === 'string') p[k] = v; }
  if (typeof s.header === 'boolean') p.header = s.header;
  if (typeof s.allowUnlinked === 'boolean') p.allowUnlinked = s.allowUnlinked;
  if (Array.isArray(s.cols)) {
    const seen: Record<string, 1> = {}, cols: ProfileCol[] = [];
    for (const c of s.cols as unknown[]) {
      if (!c || typeof c !== 'object') continue;
      const col = c as Record<string, unknown>, def = typeof col.id === 'string' ? colDef(col.id) : null;
      if (def && !seen[def.id]) { seen[def.id] = 1; cols.push({ id: def.id, on: !!col.on, header: String(col.header || def.header) }); }
    }
    for (const c of p.cols) if (!seen[c.id]) cols.push(c);
    p.cols = cols;
  }
  return p;
}

/** Il valore di una colonna per una riga dell'ordine, già nel formato del tracciato. */
function value(id: string, order: Order, r: Row, p: Profile): string {
  const c = rowCalc(r), gift = !!r.omaggio, d = p.dec, lk = r.link && r.link.ok ? r.link : null;
  switch (id) {
    case 'cod_articolo': return lk ? lk.cod : String(r.cod_articolo || '').trim();
    case 'descrizione': return lk && lk.desc && p.descSrc !== 'doc' ? lk.desc : String(r.descrizione || '').trim();
    case 'um': return (lk && lk.um) || String(r.um || '').trim() || p.um || '';
    case 'quantita': return show(num(r.quantita), 'qty', d);
    case 'colli': return show(num(r.colli), 'qty', d);
    case 'prezzo': return gift && p.omaggi === 'prezzo0' ? show(0, 'price', d) : show(num(r.prezzo), 'price', d);
    case 'sc1': return gift && p.omaggi === 'sconto100' ? '100' : show(num(r.sc1), 'pct', d);
    case 'sc2': return gift && p.omaggi === 'sconto100' ? '' : show(num(r.sc2), 'pct', d);
    case 'sc3': return gift && p.omaggi === 'sconto100' ? '' : show(num(r.sc3), 'pct', d);
    case 'omaggio': return gift ? 'S' : 'N';
    case 'netto': return gift ? show(0, 'price', d) : show(c.netto, 'price', d);
    case 'totale': return c.totale === null ? '' : show(round(c.totale, 2), 'money', d);
    case 'cod_cliente': return String(r.cod_cliente || '').trim();
    case 'ean': return String(r.ean || '').trim();
    case 'nota': return String(r.nota || '').trim();
    case 'data': return fmtDate(order.data, p.date);
    case 'consegna': return fmtDate(order.consegna, p.date);
    default: return String(order[id as OrderText] || '').trim();
  }
}

export function buildTable(order: Order, p: Profile): Table {
  const cols = p.cols.filter(c => c.on);
  return {
    headers: cols.map(c => c.header),
    rows: order.righe.map(r => cols.map(c => value(c.id, order, r, p)))
  };
}

function cell(v: unknown, sep: string): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (sep === '\t') return s.replace(/[\t\r\n]+/g, ' ');
  return (s.indexOf(sep) >= 0 || /["\r\n]/.test(s) || /^\s|\s$/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/** Il testo del file: righe che finiscono con CRLF, come si aspettano i gestionali su Windows. */
export function toDelimited(table: Table, sep: string, withHeader: boolean): string {
  const lines: string[] = [];
  if (withHeader) lines.push(table.headers.map(h => cell(h, sep)).join(sep));
  for (const r of table.rows) lines.push(r.map(v => cell(v, sep)).join(sep));
  return lines.join('\r\n') + '\r\n';
}

/* I caratteri di Windows-1252 che non coincidono con Latin-1. */
const CP: Record<number, number> = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
/** Codifica Windows (ANSI). Un carattere che non esiste in quella codifica diventa un punto interrogativo. */
export function toCp1252(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[i] = (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) ? c : (CP[c] || 0x3F);
  }
  return out;
}

function slug(s: unknown, n = 24): string {
  const full = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (full.length <= n) return full;
  const cut = full.slice(0, n), i = cut.lastIndexOf('-');
  return (full.charAt(n) !== '-' && i > 3 ? cut.slice(0, i) : cut).replace(/-+$/, '');
}
export function fileName(order: Order): string {
  const parts = ['ordine', slug(order.mandante), slug(order.cliente), slug(order.numero, 16), order.data || ''].filter(Boolean);
  return parts.join('_') + '.csv';
}
