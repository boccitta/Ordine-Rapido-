/*
 * Ordine Rapido - modello del gestionale: da un file di esempio nel formato che il gestionale importa
 * si ricava il tracciato. Quali colonne vuole, in che ordine e con che nome; separatore, decimali, date.
 * Così il programma sa come deve essere fatto il file prima ancora di leggere il primo ordine.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { str } from './anagrafiche.ts';
import { COLS, colDef, isFixed, isNumeric } from './tracciato.ts';
import type { Profile, ProfileCol } from './tipi.ts';

/** Che cosa va in una colonna del modello: un campo dell'app, un valore sempre uguale, oppure niente. */
export const FIELD_FIXED = 'fisso', FIELD_EMPTY = 'vuoto';

export interface TemplateColumn {
  /** Il nome della colonna così come lo vuole il gestionale. */
  header: string;
  /** Un valore di esempio preso dal file, per riconoscerla a colpo d'occhio. */
  sample: string;
  /** Il campo dell'app (un id di COLS), oppure FIELD_FIXED o FIELD_EMPTY. */
  field: string;
  /** Il valore da scrivere quando il campo è FIELD_FIXED. */
  value: string;
}
export interface TemplateAnalysis {
  columns: TemplateColumn[];
  sep: string; dec: string; date: string; enc: string; header: boolean;
  format: 'csv' | 'xlsx';
  /** Quante righe di esempio c'erano sotto l'intestazione. */
  samples: number;
  /** Quante colonne sono state riconosciute da sole. */
  recognized: number;
}

/* Come i gestionali chiamano di solito ogni campo. L'ordine conta: prima i nomi più specifici. */
const HINTS: readonly (readonly [field: string, re: RegExp])[] = [
  ['cod_cliente', /cod\w*art\w*cli|art\w*cli|ns\W*cod|cod\w*interno/],
  ['cliente_cod', /cod\w*cli|cli\w*cod|idcli/],
  ['mandante_cod', /cod\w*(mand|forn|ditta)|(mand|forn)\w*cod|idforn/],
  ['ean', /ean|barcode|barre/],
  ['cod_articolo', /cod\w*art|art\w*cod|^codice$|^cod$|^articolo$|^art$|sku|cod\w*prod/],
  ['nota', /nota\w*riga|note\w*riga|riga\w*not/],
  ['n_riga', /^riga$|^nriga$|num\w*riga|progr|^pos(izione)?$/],
  ['descrizione', /descr|denominaz/],
  ['um', /^um$|unimis|unit\w*mis|^misura$/],
  ['colli', /colli|cartoni|confez|^ct$/],
  ['quantita', /quant|^qta$|^qt$|pezzi|^pz$/],
  ['netto', /netto/],
  ['sc1', /sc(onto)?1|primo\w*sc/],
  ['sc2', /sc(onto)?2|second\w*sc/],
  ['sc3', /sc(onto)?3|terzo\w*sc/],
  ['sc1', /^sc$|^sconto$|scontoperc|^perc\w*sc/],
  ['prezzo', /prezzo|listino|^prz$/],
  ['omaggio', /omagg|gratis/],
  ['totale', /totale|importo|^tot$/],
  ['numero', /num\w*ord|nr?ord|ord\w*num|^numero$|rif\w*ord|^ordine$/],
  ['consegna', /consegn|evasion/],
  ['data', /data\w*ord|^data$|dataord|datadoc/],
  ['piva', /piva|partitaiva|^iva$/],
  ['cliente', /cliente|ragione|ragsoc|intestat/],
  ['mandante', /mandante|fornitore|ditta/],
  ['pagamento', /pagam/],
  ['destinazione', /destinaz|destmerce|indirizzo/],
  ['note', /^note$|^nota$|annotaz|osservaz/]
];

/** Il nome di una colonna ridotto all'osso: minuscolo, senza accenti, senza spazi né punteggiatura. */
function bare(s: unknown): string {
  return str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
/** Il campo dell'app che corrisponde a un nome di colonna, se si riconosce. */
export function guessField(header: unknown): string {
  const h = bare(header);
  if (!h) return '';
  for (const [field, re] of HINTS) if (re.test(h)) return field;
  return '';
}

const isNumber = (v: string) => /^-?\d{1,3}([.,]\d{3})*([.,]\d+)?$|^-?\d+([.,]\d+)?$/.test(v.trim());

/**
 * Legge il file modello, già diviso in righe e celle. La prima riga deve contenere i nomi delle colonne;
 * le righe sotto, se ci sono, servono a capire il formato di numeri e date.
 */
export function analyzeTemplate(rows: readonly (readonly unknown[])[], info: { sep?: string; enc?: string; format: 'csv' | 'xlsx' }): TemplateAnalysis {
  const head = (rows[0] || []).map(v => str(v).trim()), data = rows.slice(1, 60);
  let width = head.length;
  while (width > 0 && !head[width - 1]) width--;
  const used: Record<string, 1> = {}, columns: TemplateColumn[] = [];
  let recognized = 0;
  for (let k = 0; k < width; k++) {
    const header = head[k] || '', values = data.map(r => str(r[k]).trim()).filter(Boolean);
    let field = guessField(header);
    if (field && used[field]) field = '';
    if (field) { used[field] = 1; recognized++; }
    const sample = values[0] || '';
    /* una colonna che l'app non conosce e che nel modello ha sempre lo stesso valore è un valore fisso: per esempio il tipo documento */
    const constant = !field && values.length > 0 && values.every(v => v === sample);
    columns.push({ header, sample, field: field || (constant ? FIELD_FIXED : FIELD_EMPTY), value: constant ? sample : '' });
  }

  /* decimali e date: si guardano i valori di esempio delle colonne riconosciute */
  let comma = 0, dot = 0, dmy = 0, iso = 0, compact = 0;
  columns.forEach((c, k) => {
    for (const r of data) {
      const v = str(r[k]).trim();
      if (!v) continue;
      if (isNumeric(c.field) && isNumber(v)) { if (/,\d{1,5}$/.test(v)) comma++; else if (/\.\d{1,5}$/.test(v) && !/^\d{1,3}(\.\d{3})+$/.test(v)) dot++; }
      if (c.field === 'data' || c.field === 'consegna') {
        if (/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}$/.test(v)) dmy++; else if (/^\d{4}-\d{2}-\d{2}/.test(v)) iso++; else if (/^\d{8}$/.test(v)) compact++;
      }
    }
  });
  return {
    columns, samples: data.length, recognized, header: true, format: info.format,
    sep: info.sep || ';', enc: info.enc || 'cp1252',
    dec: dot > comma ? '.' : ',',
    date: iso > dmy && iso >= compact ? 'iso' : compact > dmy ? 'compact' : 'dmy'
  };
}

/** Il tracciato che corrisponde al modello: le sue colonne nell'ordine del gestionale, poi le altre, spente. */
export function profileFromTemplate(a: TemplateAnalysis, base: Profile, name: string): Profile {
  const cols: ProfileCol[] = [], used: Record<string, 1> = {};
  let fixed = 0;
  for (const c of a.columns) {
    const def = c.field !== FIELD_FIXED && c.field !== FIELD_EMPTY && !isFixed(c.field) ? colDef(c.field) : null;
    if (def && !used[def.id]) { used[def.id] = 1; cols.push({ id: def.id, on: true, header: c.header || def.header }); }
    else cols.push({ id: 'x' + (++fixed), on: true, header: c.header, value: c.field === FIELD_FIXED ? c.value : '' });
  }
  for (const d of COLS) if (!used[d.id]) cols.push({ id: d.id, on: false, header: d.header });
  return { ...base, sep: a.sep, dec: a.dec, date: a.date, enc: a.enc, header: a.header, format: a.format, template: name, cols };
}

/** Riconosce la codifica di un file di testo: UTF-8 se è valido e contiene lettere accentate o la firma iniziale, altrimenti Windows. */
export function detectEncoding(bytes: Uint8Array): 'utf8' | 'cp1252' {
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf8';
  let high = false;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number;
    if (b < 0x80) continue;
    high = true;
    /* quanti byte di continuazione si aspetta UTF-8 dopo questo: se la sequenza non torna, il file è in codifica Windows */
    const n = b >= 0xF0 && b <= 0xF4 ? 3 : b >= 0xE0 && b <= 0xEF ? 2 : b >= 0xC2 && b <= 0xDF ? 1 : -1;
    if (n < 0) return 'cp1252';
    for (let k = 1; k <= n; k++) { const c = bytes[i + k]; if (c === undefined || (c & 0xC0) !== 0x80) return 'cp1252'; }
    i += n;
  }
  return high ? 'utf8' : 'cp1252';
}
