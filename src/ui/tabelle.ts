/*
 * Ordine Rapido - interfaccia: da un file CSV o Excel a una tabella di righe e celle.
 * Serve agli archivi esportati dal gestionale e al modello del file da importare.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { detectSep, parseDelimited } from '../core/anagrafiche.ts';
import { detectEncoding } from '../core/modello.ts';
import { loadXlsx } from './librerie.ts';

export interface FileTable {
  rows: string[][];
  format: 'csv' | 'xlsx';
  /** Separatore e codifica riconosciuti: valgono solo per i file di testo. */
  sep: string;
  enc: 'utf8' | 'cp1252';
}

export const isSheetName = (name: string): boolean => /\.(xlsx|xlsm|xls|ods)$/i.test(name);

/** Legge un file di testo con la codifica giusta: UTF-8 se è valido, altrimenti quella di Windows. */
export function decodeText(buf: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

export async function tableFromFile(file: File): Promise<FileTable> {
  const buf = await file.arrayBuffer();
  if (isSheetName(file.name)) {
    const XLSX = await loadXlsx(), wb = XLSX.read(buf, { type: 'array' });
    let best: unknown[][] = [];
    for (const nm of wb.SheetNames) {
      const sheet = wb.Sheets[nm];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false });
      if (rows.length > best.length) best = rows;
    }
    return { rows: best.map(r => r.map(v => (v === null || v === undefined ? '' : String(v)))), format: 'xlsx', sep: ';', enc: 'cp1252' };
  }
  const text = decodeText(buf), sep = detectSep(text);
  return { rows: parseDelimited(text, sep), format: 'csv', sep, enc: detectEncoding(new Uint8Array(buf)) };
}
