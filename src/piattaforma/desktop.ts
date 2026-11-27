/*
 * Ordine Rapido - ambiente «app desktop», visto dalla pagina.
 * Tutto passa dal ponte offerto dal processo principale: la chiave API è custodita lì, cifrata dal sistema
 * operativo, ed è il processo principale a parlare con Anthropic; gli archivi sono file nella cartella dati
 * dell'app. La pagina non ha accesso né alla rete né al disco.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { KINDS, archiveDate, emptyArchive } from '../core/anagrafiche.ts';
import { AppError } from '../core/tipi.ts';
import type { Archive } from '../core/tipi.ts';
import { BRIDGE } from '../desktop/contratto.ts';
import type { DesktopBridge, KeyState, KeyStates, Reply } from '../desktop/contratto.ts';
import { MAX_IMAGES, PROVIDER_IDS, keyLooksValid, pickModel } from '../ia/indice.ts';
import { aiState, aliasFrom, aliasRows, browserStore, downloadSaver, encodeImages, loadAiSaved, packAll, storeAiSaved, unpackInto } from './browser.ts';
import type { AiAccess, ArchiveStore, KeyOutcome, Platform, Progress, Reader, ReadOptions, StoreMode } from './tipi.ts';

export function desktopBridge(): DesktopBridge | null {
  const b = (globalThis as Record<string, unknown>)[BRIDGE] as DesktopBridge | undefined;
  return b && typeof b === 'object' && b.key && b.read && b.archives ? b : null;
}

/** Trasforma la risposta del processo principale nel valore, oppure nell'errore che descrive. */
function unwrap<T>(r: Reply<T>): T {
  if (r.ok) return r.value;
  const extra: { status?: number; detail?: string } = {};
  if (r.status !== undefined) extra.status = r.status;
  if (r.detail !== undefined) extra.detail = r.detail;
  throw new AppError(r.code, r.message, extra);
}

/** Archivi in file nella cartella dati dell'app. */
function desktopStore(bridge: DesktopBridge): ArchiveStore {
  /* Una versione precedente teneva gli archivi nel database della finestra: si leggono da lì una volta sola. */
  const old = browserStore();
  let wasMigrated = false;

  const store: ArchiveStore = {
    async init(): Promise<StoreMode> { return 'file'; },
    async load(): Promise<Archive> {
      const saved = unwrap(await bridge.archives.load());
      const out = emptyArchive();
      let found = false;
      for (const k of KINDS) { const a = saved[k]; if (a) { found = true; unpackInto(out, k, a.rows, a.at); } }
      if (saved.alias) { found = true; out.alias = aliasFrom(saved.alias); }
      if (found) return out;
      try {
        await old.init();
        const before = await old.load();
        if (before.art.length || before.cli.length || before.man.length || Object.keys(before.alias).length) { wasMigrated = true; return before; }
      } catch { /* nessun archivio precedente leggibile: si parte vuoti */ }
      return out;
    },
    async saveArchive(arch, kind) {
      unwrap(await bridge.archives.save(kind, { rows: packAll(arch, kind), at: archiveDate(arch, kind) }));
    },
    async saveAlias(arch) {
      unwrap(await bridge.archives.saveAlias(aliasRows(arch)));
    },
    async saveAll(arch, progress?: Progress) {
      for (const k of KINDS) await store.saveArchive(arch, k, progress);
      await store.saveAlias(arch);
    },
    migrated: () => wasMigrated
  };
  return store;
}

function outcome(state: KeyState, remember: boolean): KeyOutcome {
  if (!remember) return 'session';
  return state.stored ? 'encrypted' : state.canEncrypt ? 'unsaved' : 'no_keyring';
}
function noKeys(): KeyStates {
  const out = {} as KeyStates;
  for (const id of PROVIDER_IDS) out[id] = { present: false, hint: '', stored: false, canEncrypt: true };
  return out;
}

/** Lettura con un servizio: la pagina prepara la richiesta, il processo principale aggiunge la chiave e la spedisce. */
function desktopAi(bridge: DesktopBridge): { ai: AiAccess; ready: Promise<void> } {
  /* Servizio e modelli scelti non sono segreti: restano tra le preferenze della finestra. Le chiavi no. */
  const saved = loadAiSaved();
  let keys: KeyStates = noKeys();
  let counter = 0;

  const ready = (async () => {
    try {
      /* Una versione precedente salvava le chiavi tra le preferenze della finestra: si spostano nel processo principale. */
      for (const id of PROVIDER_IDS) {
        const moved = saved.p[id].key;
        if (!moved) continue;
        saved.p[id].key = '';
        storeAiSaved(saved, false);
        if (keyLooksValid(moved)) { try { keys = unwrap(await bridge.key.verify(id, moved, saved.remember)).state; } catch { /* non più valida: si chiederà di nuovo */ } }
      }
      keys = unwrap(await bridge.key.state());
    } catch { /* ponte non disponibile: la lettura con i servizi resta spenta */ }
  })();

  const reader: Reader = {
    limits: async () => ({ images: { maxCount: MAX_IMAGES } }),
    async json(prompt: string, opts?: ReadOptions) {
      const id = 'l' + (++counter) + '-' + Date.now().toString(36), signal = opts && opts.signal;
      const images = await encodeImages(opts && opts.images);
      if (signal && signal.aborted) throw new AppError('cancelled');
      const stop = () => bridge.read.stop(id);
      if (signal) signal.addEventListener('abort', stop, { once: true });
      try { return unwrap(await bridge.read.ask(id, saved.provider, saved.p[saved.provider].model, prompt, images)); }
      finally { if (signal) signal.removeEventListener('abort', stop); }
    }
  };
  const ai: AiAccess = {
    needsKey: true,
    available: PROVIDER_IDS,
    state: () => aiState(saved, id => ({ has: keys[id].present, text: '', hint: keys[id].hint })),
    reader: () => (keys[saved.provider].present ? reader : null),
    async verify(id, text, remember): Promise<KeyOutcome> {
      if (text && !keyLooksValid(text)) throw new AppError('bad_key_format');
      const r = unwrap(await bridge.key.verify(id, text, remember));
      keys = r.state; saved.remember = remember;
      saved.p[id].models = r.models; saved.p[id].model = pickModel(id, saved.p[id].model, r.models);
      storeAiSaved(saved, false);
      return outcome(keys[id], remember);
    },
    async forget(id) {
      keys = unwrap(await bridge.key.forget(id));
      saved.p[id].models = []; storeAiSaved(saved, false);
    },
    setProvider(id) { saved.provider = id; storeAiSaved(saved, false); },
    setModel(id, model) { saved.p[id].model = model; storeAiSaved(saved, false); },
    async setRemember(remember) {
      saved.remember = remember; storeAiSaved(saved, false);
      keys = unwrap(await bridge.key.remember(remember));
    }
  };
  return { ai, ready };
}

export function desktopPlatform(bridge: DesktopBridge): Platform {
  const { ai, ready } = desktopAi(bridge);
  return { kind: 'desktop', store: desktopStore(bridge), ai, files: downloadSaver, ready };
}
