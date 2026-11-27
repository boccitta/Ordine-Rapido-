/*
 * Ordine Rapido - interfaccia: il riconoscimento dei caratteri per foto e scansioni, fatto su questo dispositivo.
 * Il motore (src/ocr/motore.ts) e i suoi dati viaggiano con l'app nel file vendor/ocr/ocr-dati.js, generato da
 * «npm run compila»: si carica solo alla prima foto e lavora in un processo separato, così la finestra non si blocca.
 * Nessuna immagine esce dal dispositivo.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import type { Item } from '../core/lettura/indice.ts';
import { AppError } from '../core/tipi.ts';
import { loadScript } from './librerie.ts';

/** Quello che ocr-dati.js lascia a disposizione della pagina: il codice del motore e i suoi file, in base64. */
interface OcrData { codice: string; wasm: string; rilevamento: string; riconoscimento: string; dizionario: string }
type Reply = { t: 'pronto' } | { t: 'letto'; id: number; righe: Item[] } | { t: 'errore'; id?: number; m: string };

const DATA = 'vendor/ocr/ocr-dati.js';
let engine: Promise<Worker> | null = null, seq = 0;
const waiting: Record<number, { ok: (items: Item[]) => void; no: (e: Error) => void }> = {};

function bytes(b64: string): ArrayBuffer {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function start(): Promise<Worker> {
  return (async () => {
    /* nella versione in un solo file (e nella pagina dentro Claude) le librerie stanno dentro la pagina e il motore
       non c'è: lo si sa senza nemmeno cercarlo. Altrove, se il file manca, il riconoscimento non è disponibile. */
    if (document.getElementById('vendor:pdf.min.js')) throw new AppError('ocr_missing');
    try { await loadScript(DATA); } catch { throw new AppError('ocr_missing'); }
    const box = globalThis as { ordineRapidoOcr?: OcrData }, d = box.ordineRapidoOcr;
    if (!d || typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') throw new AppError('ocr_missing');
    const worker = new Worker(URL.createObjectURL(new Blob([d.codice], { type: 'text/javascript' })));
    const files = { wasm: bytes(d.wasm), rilevamento: bytes(d.rilevamento), riconoscimento: bytes(d.riconoscimento), dizionario: bytes(d.dizionario) };
    /* i dati ora stanno nel motore: il testo in base64 non serve più */
    delete box.ordineRapidoOcr;
    await new Promise<void>((ok, no) => {
      worker.onmessage = (e: MessageEvent<Reply>) => {
        const m = e.data;
        if (m.t === 'pronto') { ok(); return; }
        if (m.t === 'errore' && m.id === undefined) { no(new AppError('local', 'Il riconoscimento dei caratteri non è riuscito ad avviarsi su questo dispositivo.', { detail: m.m })); return; }
        const w = m.id === undefined ? undefined : waiting[m.id];
        if (!w || m.id === undefined) return;
        delete waiting[m.id];
        if (m.t === 'letto') w.ok(m.righe); else w.no(new AppError('local', 'Non sono riuscito a leggere questa immagine.', { detail: m.m }));
      };
      worker.onerror = e => { no(new AppError('local', 'Il riconoscimento dei caratteri non è riuscito ad avviarsi su questo dispositivo.', { detail: e.message })); };
      worker.postMessage({ t: 'avvia', ...files }, [files.wasm, files.rilevamento, files.riconoscimento, files.dizionario]);
    });
    return worker;
  })();
}

/**
 * Legge il testo di un'immagine. Restituisce i pezzi di testo con la loro posizione, in punti dell'immagine.
 * Lancia un AppError 'ocr_missing' se in questa versione dell'app il riconoscimento non c'è.
 */
export async function recognize(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<Item[]> {
  if (!engine) engine = start();
  let worker: Worker;
  try { worker = await engine; } catch (e) { engine = null; throw e; }
  if (signal && signal.aborted) throw new AppError('cancelled');
  const bitmap = await createImageBitmap(canvas), id = ++seq;
  return new Promise<Item[]>((ok, no) => {
    waiting[id] = { ok, no };
    /* fermare la lettura non ferma il motore: il risultato, quando arriva, viene ignorato */
    if (signal) signal.addEventListener('abort', () => { if (waiting[id]) { delete waiting[id]; no(new AppError('cancelled')); } }, { once: true });
    worker.postMessage({ t: 'leggi', id, immagine: bitmap }, [bitmap]);
  });
}
