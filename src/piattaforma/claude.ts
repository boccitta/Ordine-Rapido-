/*
 * Ordine Rapido - ambiente «dentro Claude»: la pagina pubblicata come artifact.
 * La lettura la fa Claude attraverso la pagina (non serve nessuna chiave), gli archivi stanno nello spazio
 * privato della pagina e i file si salvano con la funzione che la pagina mette a disposizione.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { KINDS, archiveDate, archiveItems, emptyArchive, pack } from '../core/anagrafiche.ts';
import { AppError, errorCode } from '../core/tipi.ts';
import type { Archive, Item } from '../core/tipi.ts';
import { aiState, aliasFrom, aliasRows, browserStore, loadAiSaved, unpackInto } from './browser.ts';
import type { AiAccess, ArchiveStore, FileSaver, Platform, Progress, Reader, StoreMode } from './tipi.ts';

/* Quello che la pagina offre quando gira dentro Claude: solo le parti che l'app usa. */
interface ClaudeDoc { id: string; data(): Record<string, unknown> | undefined }
interface ClaudeDocRef { set(body: unknown): Promise<unknown>; delete(): Promise<unknown> }
interface ClaudeCollection { limit(n: number): { get(): Promise<{ docs: ClaudeDoc[] }> }; doc(id: string): ClaudeDocRef }
interface ClaudeDb { collection(path: string): ClaudeCollection }
interface ClaudeUser { id(): Promise<string | null> }
interface ClaudeDownloads { save(file: { filename: string; data: string | Uint8Array }): Promise<unknown> }
export interface ClaudeCapabilities { use(name: string): Promise<unknown> }

export function claudeCapabilities(): ClaudeCapabilities | null {
  const c = (globalThis as { claude?: { use?: unknown } }).claude;
  return c && typeof c.use === 'function' ? c as ClaudeCapabilities : null;
}

const wait = (ms: number) => new Promise<void>(r => { setTimeout(r, ms); });
function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => { setTimeout(() => rej(new AppError('timeout')), ms); })]);
}
/** Una scrittura rifiutata perché il servizio è occupato si riprova una volta, dopo una breve attesa. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e) {
    const code = errorCode(e);
    if (code === 'unavailable' || code === 'resource_exhausted') { await wait(1200 + Math.random() * 800); return fn(); }
    throw e;
  }
}

/** Archivi nello spazio privato della pagina. Se non è disponibile si ripiega sul deposito del browser. */
function claudeStore(caps: ClaudeCapabilities): ArchiveStore {
  const fallback = browserStore();
  let base: ClaudeCollection | null = null;
  let meta: Record<string, unknown> = {};

  const store: ArchiveStore = {
    async init(): Promise<StoreMode> {
      try {
        const u = await caps.use('user') as ClaudeUser | null, d = await caps.use('db') as ClaudeDb | null, id = u ? await u.id() : null;
        if (d && id) { base = d.collection('data/users/' + id); return 'db'; }
      } catch { /* spazio privato non disponibile: si usa quello del browser */ }
      return fallback.init();
    },
    async load(): Promise<Archive> {
      if (!base) return fallback.load();
      const out = emptyArchive();
      const snap = await timeout(base.limit(1000).get(), 15000);
      const parts: Record<string, unknown[][]> = { art: [], cli: [], man: [] };
      let al: unknown = [];
      for (const d of snap.docs) if (d.id === 'meta') meta = JSON.parse(JSON.stringify(d.data() || {}));
      for (const d of snap.docs) {
        const b = d.data() || {};
        if (d.id === 'alias') al = b.rows || [];
        else {
          const list = typeof b.k === 'string' && Object.prototype.hasOwnProperty.call(parts, b.k) ? parts[b.k] : undefined;
          if (list && b.gen === meta[b.k + 'Gen'] && typeof b.i === 'number') list[b.i] = Array.isArray(b.rows) ? b.rows : [];
        }
      }
      for (const k of KINDS) {
        const rows: unknown[] = [];
        for (const chunk of parts[k] || []) for (const l of chunk || []) rows.push(l);
        unpackInto(out, k, rows, meta[k + 'At']);
      }
      out.alias = aliasFrom(al);
      return out;
    },
    /* Ogni salvataggio scrive una nuova serie di blocchi e solo alla fine la rende quella valida. */
    async saveArchive(arch, kind, progress?: Progress) {
      if (!base) return fallback.saveArchive(arch, kind, progress);
      const col = base, gen = Date.now().toString(36), chunks: string[][] = [];
      let cur: string[] = [], size = 0;
      for (const it of archiveItems(arch, kind) as Item[]) {
        const l = pack(kind, it);
        if (size + l.length > 110000 && cur.length) { chunks.push(cur); cur = []; size = 0; }
        cur.push(l); size += l.length + 4;
      }
      if (cur.length) chunks.push(cur);
      for (let i = 0; i < chunks.length; i++) {
        if (progress) progress(i + 1, chunks.length);
        const body = { k: kind, gen, i, rows: chunks[i] }, ref = col.doc(kind + '-' + gen + '-' + i);
        await call(() => ref.set(body));
      }
      const oldGen = meta[kind + 'Gen'], oldN = Number(meta[kind + 'N']) || 0;
      meta[kind + 'Gen'] = gen; meta[kind + 'N'] = chunks.length; meta[kind + 'At'] = archiveDate(arch, kind);
      await call(() => col.doc('meta').set(JSON.parse(JSON.stringify(meta))));
      if (oldGen) for (let j = 0; j < oldN; j++) { try { await col.doc(kind + '-' + String(oldGen) + '-' + j).delete(); } catch { /* un blocco vecchio rimasto non fa danni */ } }
    },
    async saveAlias(arch) {
      if (!base) return fallback.saveAlias(arch);
      const col = base;
      await call(() => col.doc('alias').set({ rows: aliasRows(arch) }));
    },
    async saveAll(arch, progress?: Progress) {
      for (const k of KINDS) await store.saveArchive(arch, k, progress);
      await store.saveAlias(arch);
    },
    migrated: () => (base ? false : fallback.migrated())
  };
  return store;
}

export function claudePlatform(caps: ClaudeCapabilities): Platform {
  let sample: Reader | null = null, downloads: ClaudeDownloads | null = null;
  const ready = (async () => {
    try { sample = await caps.use('sample') as Reader | null; } catch { sample = null; }
    try { downloads = await caps.use('downloads') as ClaudeDownloads | null; } catch { downloads = null; }
  })();
  /* dentro Claude legge Claude, attraverso la pagina: niente chiavi e niente altri servizi */
  const ai: AiAccess = {
    needsKey: false,
    available: ['anthropic'],
    state: () => ({ ...aiState(loadAiSaved(), () => ({ has: false, text: '', hint: '' })), provider: 'anthropic' }),
    reader: () => sample,
    verify: async () => 'session',
    forget: async () => {},
    setProvider: () => {},
    setModel: () => {},
    setRemember: async () => {}
  };
  const files: FileSaver = {
    available: () => !!downloads,
    async save(filename, data) {
      if (!downloads) throw new AppError('local');
      await downloads.save({ filename, data });
    }
  };
  return { kind: 'claude', store: claudeStore(caps), ai, files, ready };
}
