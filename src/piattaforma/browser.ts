/*
 * Ordine Rapido - ambiente «browser»: la pagina aperta da file o la versione portatile in un solo file.
 * Archivi nel database del browser (IndexedDB), chiavi API nella memoria locale del browser,
 * lettura con una richiesta diretta al servizio scelto (Anthropic, Google o OpenAI), file salvati con il normale download.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { MAX_IMAGES, PROVIDERS, PROVIDER_IDS, allowedUrl, isProviderId, keyLooksValid, pickModel } from '../ia/indice.ts';
import type { EncodedImage, HttpRequest, Model, ProviderId, Send } from '../ia/indice.ts';
import { KINDS, archiveDate, archiveItems, emptyArchive, pack, setArchiveDate, unpack } from '../core/anagrafiche.ts';
import { AppError } from '../core/tipi.ts';
import type { Archive, Item, Kind } from '../core/tipi.ts';
import type { AiAccess, AiState, ArchiveStore, FileSaver, KeyOutcome, Platform, Progress, Reader, ReadOptions, StoreMode } from './tipi.ts';

/* ---------- Archivi ---------- */
const LS = 'ordine-rapido-archivi', LS_OLD = 'gesacom-archivi-v1';
const DB_NAME = 'ordine-rapido', DB_STORE = 'archivi';

export function aliasRows(arch: Archive): string[] {
  const out: string[] = [];
  for (const k in arch.alias) out.push(k + '\t' + arch.alias[k]);
  return out;
}
export function aliasFrom(rows: unknown): Record<string, string> {
  const m: Record<string, string> = Object.create(null);
  if (Array.isArray(rows)) for (const l of rows) { const s = String(l), i = s.lastIndexOf('\t'); if (i > 0) m[s.slice(0, i)] = s.slice(i + 1); }
  return m;
}
export function packAll(arch: Archive, kind: Kind): string[] {
  return (archiveItems(arch, kind) as Item[]).map(it => pack(kind, it));
}
/** Riporta in un archivio le righe compatte di un tipo, con la data dell'ultimo caricamento. */
export function unpackInto(out: Archive, kind: Kind, rows: unknown, at: unknown): void {
  const items = archiveItems(out, kind) as Item[];
  if (Array.isArray(rows)) for (const l of rows) items.push(unpack(kind, l));
  setArchiveDate(out, kind, typeof at === 'string' ? at : '');
}
function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => { setTimeout(() => rej(new AppError('timeout')), ms); })]);
}

/** Archivi nel browser: IndexedDB; se non è disponibile, la memoria locale; se nemmeno quella, solo fino alla chiusura. */
export function browserStore(): ArchiveStore {
  let mode: StoreMode = 'mem', idb: IDBDatabase | null = null, wasMigrated = false;

  function openIdb(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
      let rq: IDBOpenDBRequest;
      try { rq = indexedDB.open(DB_NAME, 1); } catch (e) { rej(e); return; }
      rq.onupgradeneeded = () => { rq.result.createObjectStore(DB_STORE); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
      rq.onblocked = () => rej(new AppError('blocked'));
    });
  }
  function idbGet(key: string): Promise<{ rows?: unknown; at?: unknown } | undefined> {
    return new Promise((res, rej) => {
      if (!idb) { rej(new AppError('unavailable_local')); return; }
      const rq = idb.transaction(DB_STORE).objectStore(DB_STORE).get(key);
      rq.onsuccess = () => res(rq.result as { rows?: unknown; at?: unknown } | undefined);
      rq.onerror = () => rej(rq.error);
    });
  }
  function idbPut(key: string, val: unknown): Promise<void> {
    return new Promise((res, rej) => {
      if (!idb) { rej(new AppError('unavailable_local')); return; }
      const tx = idb.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(val, key);
      tx.oncomplete = () => res();
      tx.onerror = tx.onabort = () => rej(new AppError(tx.error && tx.error.name === 'QuotaExceededError' ? 'quota_exceeded' : 'unavailable_local'));
    });
  }
  function fromLocal(key: string, out: Archive): boolean {
    let raw: Record<string, unknown> | null = null;
    try { raw = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* dato illeggibile: come se non ci fosse */ }
    if (!raw || typeof raw !== 'object') return false;
    for (const k of KINDS) unpackInto(out, k, raw[k], raw[k + 'At']);
    out.alias = aliasFrom(raw.alias);
    return true;
  }
  function saveLocal(arch: Archive): void {
    const o: Record<string, unknown> = { alias: aliasRows(arch) };
    for (const k of KINDS) { o[k] = packAll(arch, k); o[k + 'At'] = archiveDate(arch, k); }
    try { localStorage.setItem(LS, JSON.stringify(o)); } catch { throw new AppError('quota_exceeded'); }
  }

  const store: ArchiveStore = {
    async init() {
      if (typeof indexedDB !== 'undefined') {
        try { idb = await timeout(openIdb(), 4000); await timeout(idbGet('art'), 4000); mode = 'idb'; } catch { idb = null; }
      }
      if (mode === 'mem') { try { localStorage.setItem(LS + '-t', '1'); localStorage.removeItem(LS + '-t'); mode = 'local'; } catch { mode = 'mem'; } }
      return mode;
    },
    async load() {
      const out = emptyArchive();
      if (mode === 'idb') {
        let found = false;
        for (const k of KINDS) {
          const rec = await idbGet(k);
          if (rec) { found = true; unpackInto(out, k, rec.rows, rec.at); }
        }
        const al = await idbGet('alias');
        if (al) { found = true; out.alias = aliasFrom(al.rows); }
        /* Archivi lasciati nella memoria locale da una versione precedente: si leggono una volta e si spostano nel database. */
        if (!found) wasMigrated = fromLocal(LS, out) || fromLocal(LS_OLD, out);
      } else if (mode === 'local') {
        if (!fromLocal(LS, out)) fromLocal(LS_OLD, out);
      }
      return out;
    },
    async saveArchive(arch, kind) {
      if (mode === 'local') { saveLocal(arch); return; }
      if (mode !== 'idb') return;
      await idbPut(kind, { rows: packAll(arch, kind), at: archiveDate(arch, kind) });
      /* chiede al browser di non cancellare da solo i dati dell'app quando lo spazio scarseggia */
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch { /* non disponibile */ }
    },
    async saveAlias(arch) {
      if (mode === 'local') { saveLocal(arch); return; }
      if (mode === 'idb') await idbPut('alias', { rows: aliasRows(arch) });
    },
    async saveAll(arch, progress?: Progress) {
      for (const k of KINDS) await store.saveArchive(arch, k, progress);
      await store.saveAlias(arch);
    },
    migrated: () => wasMigrated
  };
  return store;
}

/* ---------- Lettura con un servizio di intelligenza artificiale, con la chiave API di chi usa l'app ---------- */
export const AI_KEY = 'ordine-rapido-lettura';

/** Chiave (solo nel browser), modello scelto ed elenco dei modelli di un servizio. */
export interface ProviderSaved { key: string; model: string; models: Model[] }
export interface AiSaved { provider: ProviderId; remember: boolean; p: Record<ProviderId, ProviderSaved> }

function models(v: unknown): Model[] {
  const out: Model[] = [];
  if (Array.isArray(v)) for (const m of v as unknown[]) if (Array.isArray(m) && typeof m[0] === 'string') out.push([m[0], String(m[1] || m[0])]);
  return out;
}
function providerSaved(id: ProviderId, v: unknown): ProviderSaved {
  const o = v && typeof v === 'object' ? v as Record<string, unknown> : {};
  return { key: typeof o.key === 'string' ? o.key : '', model: typeof o.model === 'string' && o.model ? o.model : (PROVIDERS[id].models[0] || [''])[0], models: models(o.models) };
}
/** Le impostazioni di lettura salvate. Quelle di una versione precedente (solo Claude) diventano quelle di Claude. */
export function loadAiSaved(): AiSaved {
  let o: Record<string, unknown> = {};
  try { o = JSON.parse(localStorage.getItem(AI_KEY) || '{}') || {}; } catch { /* impostazioni illeggibili: si riparte da quelle predefinite */ }
  const per = o.p && typeof o.p === 'object' ? o.p as Record<string, unknown> : { anthropic: { key: o.key, model: o.model, models: o.models } };
  const p = {} as Record<ProviderId, ProviderSaved>;
  for (const id of PROVIDER_IDS) p[id] = providerSaved(id, per[id]);
  return { provider: isProviderId(o.provider) ? o.provider : 'anthropic', remember: o.remember !== false, p };
}
/** Scrive le impostazioni di lettura. `withKey` è false nell'app desktop, dove le chiavi non passano mai da qui. */
export function storeAiSaved(ai: AiSaved, withKey: boolean): boolean {
  const p: Record<string, ProviderSaved> = {};
  for (const id of PROVIDER_IDS) { const s = ai.p[id]; p[id] = { key: withKey && ai.remember ? s.key : '', model: s.model, models: s.models }; }
  try { localStorage.setItem(AI_KEY, JSON.stringify({ provider: ai.provider, remember: ai.remember, p })); return true; }
  catch { return false; }
}

export function blobBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); res(s.slice(s.indexOf(',') + 1)); };
    r.onerror = () => rej(new AppError('image_rejected'));
    r.readAsDataURL(blob);
  });
}
export async function encodeImages(images: readonly Blob[] | undefined): Promise<EncodedImage[]> {
  const out: EncodedImage[] = [];
  for (const im of images || []) out.push({ media_type: im.type || 'image/jpeg', data: await blobBase64(im) });
  return out;
}

/* La richiesta parte da questo dispositivo e va direttamente al servizio scelto, senza altri passaggi. */
const send: Send = (url: string, request: HttpRequest) => {
  if (!allowedUrl(url)) return Promise.reject(new AppError('forbidden'));
  const init: RequestInit = { method: request.method, headers: request.headers, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' };
  if (request.body !== undefined) init.body = request.body;
  if (request.signal) init.signal = request.signal;
  return fetch(url, init);
};

/** Lo stato di lettura da mostrare, a partire da quello salvato e da quanto si sa delle chiavi. */
export function aiState(ai: AiSaved, keys: (id: ProviderId) => { has: boolean; text: string; hint: string }): AiState {
  const providers = {} as AiState['providers'];
  for (const id of PROVIDER_IDS) {
    const s = ai.p[id], k = keys(id);
    providers[id] = { hasKey: k.has, keyText: k.text, keyHint: k.hint, model: s.model, models: s.models.slice() };
  }
  return { provider: ai.provider, remember: ai.remember, providers };
}

function browserAi(): AiAccess {
  /* Le chiavi restano solo qui: nelle impostazioni dell'app su questo dispositivo, mai negli archivi né nelle copie di sicurezza. */
  const ai = loadAiSaved();
  const reader: Reader = {
    limits: async () => ({ images: { maxCount: MAX_IMAGES } }),
    json: async (prompt: string, opts?: ReadOptions) => {
      const s = ai.p[ai.provider];
      return PROVIDERS[ai.provider].askJson(send, s.key, s.model, prompt, await encodeImages(opts && opts.images), (opts && opts.signal) || null, true);
    }
  };
  return {
    needsKey: true,
    available: PROVIDER_IDS,
    state: () => aiState(ai, id => ({ has: !!ai.p[id].key, text: ai.p[id].key, hint: ai.p[id].key.slice(-4) })),
    reader: () => (ai.p[ai.provider].key ? reader : null),
    async verify(id, key, remember): Promise<KeyOutcome> {
      const s = ai.p[id], candidate = key || s.key;
      if (!keyLooksValid(candidate)) throw new AppError('bad_key_format');
      const list = await PROVIDERS[id].listModels(send, candidate, true);
      s.key = candidate; s.models = list; s.model = pickModel(id, s.model, list);
      ai.remember = remember;
      const saved = storeAiSaved(ai, true);
      return !remember ? 'session' : saved ? 'saved' : 'unsaved';
    },
    async forget(id) { ai.p[id].key = ''; ai.p[id].models = []; storeAiSaved(ai, true); },
    setProvider(id) { ai.provider = id; storeAiSaved(ai, true); },
    setModel(id, model) { ai.p[id].model = model; storeAiSaved(ai, true); },
    async setRemember(remember) { ai.remember = remember; storeAiSaved(ai, true); }
  };
}

/* ---------- File ---------- */
/** Salva un file con il normale download del browser (nell'app desktop si apre la finestra «Salva con nome»). */
export const downloadSaver: FileSaver = {
  available: () => true,
  async save(filename, data, type) {
    const part: BlobPart = typeof data === 'string' ? data : new Uint8Array(data);
    const url = URL.createObjectURL(new Blob([part], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
};

export function browserPlatform(): Platform {
  return { kind: 'browser', store: browserStore(), ai: browserAi(), files: downloadSaver, ready: Promise.resolve() };
}
