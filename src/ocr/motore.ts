/*
 * Ordine Rapido - il motore che riconosce i caratteri in foto e scansioni. Gira in un processo separato dalla pagina
 * (un «worker»), con i modelli PP-OCRv6 e il motore ONNX Runtime in WebAssembly su un solo filo: funziona anche
 * su computer modesti e non usa la rete. Riceve tutto quello che gli serve dalla pagina, già in memoria.
 *
 * Questo file non fa parte di app.js: «npm run compila» lo impacchetta dentro app/vendor/ocr/ocr-dati.js.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import * as ort from 'onnxruntime-web';
import { PaddleOcrService } from 'ppu-paddle-ocr/web';

interface Start { t: 'avvia'; wasm: ArrayBuffer; rilevamento: ArrayBuffer; riconoscimento: ArrayBuffer; dizionario: ArrayBuffer }
interface Read { t: 'leggi'; id: number; immagine: ImageBitmap }
interface Piece { s: string; x: number; y: number; w: number; h: number }

let service: PaddleOcrService | null = null;
const send = (m: unknown) => (self as unknown as { postMessage(m: unknown): void }).postMessage(m);

/** Il risultato può arrivare come elenco di righe o come righe di parole: si prendono tutti i pezzi che hanno testo e riquadro. */
function pieces(v: unknown, out: Piece[]): Piece[] {
  if (Array.isArray(v)) { for (const x of v) pieces(x, out); return out; }
  if (!v || typeof v !== 'object') return out;
  const o = v as { text?: unknown; box?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } };
  const b = o.box;
  if (typeof o.text === 'string' && o.text.trim() && b && typeof b.x === 'number' && typeof b.y === 'number' && typeof b.width === 'number' && typeof b.height === 'number') {
    out.push({ s: o.text, x: b.x, y: b.y, w: b.width, h: b.height });
  }
  return out;
}

async function start(m: Start): Promise<void> {
  /* niente rete: il motore WebAssembly arriva dalla pagina, e gira su un filo solo */
  ort.env.wasm.wasmPaths = undefined;
  ort.env.wasm.wasmBinary = m.wasm;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const s = new PaddleOcrService({
    model: { detection: m.rilevamento, recognition: m.riconoscimento, charactersDictionary: m.dizionario },
    /* i modelli .ort sono già ottimizzati: chi li distribuisce chiede di non rifarlo, e l'avvio è più rapido */
    session: { executionProviders: ['wasm'], graphOptimizationLevel: 'disabled' }
  });
  await s.initialize();
  service = s;
}

async function read(m: Read): Promise<Piece[]> {
  if (!service) throw new Error('motore non avviato');
  const canvas = new OffscreenCanvas(m.immagine.width, m.immagine.height), ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('tela non disponibile');
  ctx.drawImage(m.immagine, 0, 0);
  m.immagine.close();
  const result = await service.recognize(canvas as unknown as Parameters<PaddleOcrService['recognize']>[0]) as unknown as { lines?: unknown };
  return pieces(result && result.lines, []);
}

self.onmessage = (e: MessageEvent<Start | Read>) => {
  const m = e.data;
  if (m.t === 'avvia') start(m).then(() => send({ t: 'pronto' }), err => send({ t: 'errore', m: String(err && (err as Error).message || err) }));
  else if (m.t === 'leggi') read(m).then(righe => send({ t: 'letto', id: m.id, righe }), err => send({ t: 'errore', id: m.id, m: String(err && (err as Error).message || err) }));
};
