/*
 * Ordine Rapido - interfaccia: librerie di terzi per leggere PDF ed Excel.
 * Viaggiano con l'app: nella cartella vendor oppure, nella versione in un solo file, dentro la pagina stessa
 * (codificate in base64 e trasformate in un indirizzo locale al primo uso). Si caricano solo quando servono.
 * Qui sono descritte soltanto le parti che l'app usa.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { AppError } from '../core/tipi.ts';

/* ----- SheetJS ----- */
export type XlsxSheet = Record<string, unknown>;
export interface XlsxBook { SheetNames: string[]; Sheets: Record<string, XlsxSheet> }
export interface XlsxLib {
  read(data: ArrayBuffer, opts: Record<string, unknown>): XlsxBook;
  utils: {
    sheet_to_json(sheet: XlsxSheet, opts: Record<string, unknown>): unknown[][];
    sheet_to_csv(sheet: XlsxSheet, opts: Record<string, unknown>): string;
  };
}

/* ----- pdf.js ----- */
export interface PdfViewport { width: number; height: number }
export interface PdfTextItem { str?: string; transform: number[]; width?: number }
export interface PdfPage {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  getViewport(opts: { scale: number }): PdfViewport;
  render(opts: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise: Promise<unknown> };
}
export interface PdfDocument { numPages: number; getPage(n: number): Promise<PdfPage> }
export interface PdfLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(opts: { data: Uint8Array; isEvalSupported: boolean }): { promise: Promise<PdfDocument> };
}

const INCOMPLETE = 'Non riesco a caricare la libreria per leggere questo tipo di file: l\'app sembra incompleta. Scaricala di nuovo.';

const vendorUrls: Record<string, string> = {};
function vendorUrl(name: string): string {
  const known = vendorUrls[name];
  if (known) return known;
  const node = document.getElementById('vendor:' + name);
  if (!node) return (vendorUrls[name] = 'vendor/' + name);
  const bin = atob((node.textContent || '').replace(/\s+/g, '')), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return (vendorUrls[name] = URL.createObjectURL(new Blob([buf], { type: 'text/javascript' })));
}

const loaded: Record<string, Promise<void>> = {};
function loadScript(src: string): Promise<void> {
  let p = loaded[src];
  if (!p) {
    p = new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res();
      s.onerror = () => { delete loaded[src]; rej(new AppError('local', INCOMPLETE)); };
      document.head.append(s);
    });
    loaded[src] = p;
  }
  return p;
}

export async function loadXlsx(): Promise<XlsxLib> {
  await loadScript(vendorUrl('xlsx.full.min.js'));
  const lib = (globalThis as { XLSX?: XlsxLib }).XLSX;
  if (!lib) throw new AppError('local', INCOMPLETE);
  return lib;
}

export async function loadPdf(): Promise<PdfLib> {
  await loadScript(vendorUrl('pdf.min.js'));
  await loadScript(vendorUrl('pdf.worker.min.js'));
  const lib = (globalThis as { pdfjsLib?: PdfLib }).pdfjsLib;
  if (!lib) throw new AppError('local', INCOMPLETE);
  lib.GlobalWorkerOptions.workerSrc = vendorUrl('pdf.worker.min.js');
  return lib;
}
