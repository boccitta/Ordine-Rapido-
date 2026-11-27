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
import { MAX_IMAGES, keyLooksValid } from '../anthropic/protocollo.ts';
import { KINDS, archiveDate, emptyArchive } from '../core/anagrafiche.ts';
import { AppError } from '../core/tipi.ts';
import type { Archive } from '../core/tipi.ts';
import { BRIDGE } from '../desktop/contratto.ts';
import type { DesktopBridge, KeyState, Reply } from '../desktop/contratto.ts';
import { aliasFrom, aliasRows, browserStore, downloadSaver, encodeImages, loadAiSaved, packAll, storeAiSaved, unpackInto } from './browser.ts';
import type { AiAccess, AiState, ArchiveStore, KeyOutcome, Platform, Progress, Reader, ReadOptions, StoreMode } from './tipi.ts';

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

/** Lettura automatica: la pagina prepara la richiesta, il processo principale aggiunge la chiave e la spedisce. */
function desktopAi(bridge: DesktopBridge): { ai: AiAccess; ready: Promise<void> } {
  /* Modello scelto ed elenco dei modelli non sono segreti: restano tra le preferenze della finestra. La chiave no. */
  const saved = loadAiSaved();
  let key: KeyState = { present: false, hint: '', stored: false, canEncrypt: true };
  let counter = 0;

  const ready = (async () => {
    try {
      /* Una versione precedente salvava la chiave tra le preferenze della finestra: si sposta nel processo principale. */
      if (saved.key && keyLooksValid(saved.key)) {
        const moved = saved.key;
        saved.key = '';
        storeAiSaved(saved, false);
        try { key = unwrap(await bridge.key.verify(moved, saved.remember)).state; return; } catch { /* non più valida: si chiederà di nuovo */ }
      }
      key = unwrap(await bridge.key.state());
    } catch { /* ponte non disponibile: la lettura automatica resta spenta */ }
  })();

  const reader: Reader = {
    limits: async () => ({ images: { maxCount: MAX_IMAGES } }),
    async json(prompt: string, opts?: ReadOptions) {
      const id = 'l' + (++counter) + '-' + Date.now().toString(36), signal = opts && opts.signal;
      const images = await encodeImages(opts && opts.images);
      if (signal && signal.aborted) throw new AppError('cancelled');
      const stop = () => bridge.read.stop(id);
      if (signal) signal.addEventListener('abort', stop, { once: true });
      try { return unwrap(await bridge.read.ask(id, saved.model, prompt, images)); }
      finally { if (signal) signal.removeEventListener('abort', stop); }
    }
  };
  const ai: AiAccess = {
    needsKey: true,
    state: (): AiState => ({ hasKey: key.present, keyText: '', keyHint: key.hint, remember: saved.remember, model: saved.model, models: saved.models.slice() }),
    reader: () => (key.present ? reader : null),
    async verify(text, remember, model): Promise<KeyOutcome> {
      if (text && !keyLooksValid(text)) throw new AppError('bad_key_format');
      const r = unwrap(await bridge.key.verify(text, remember));
      key = r.state; saved.remember = remember; saved.model = model || saved.model; saved.models = r.models;
      storeAiSaved(saved, false);
      return outcome(key, remember);
    },
    async forget() {
      key = unwrap(await bridge.key.forget());
      saved.models = []; storeAiSaved(saved, false);
    },
    setModel(model) { saved.model = model; storeAiSaved(saved, false); },
    async setRemember(remember) {
      saved.remember = remember; storeAiSaved(saved, false);
      key = unwrap(await bridge.key.remember(remember));
    }
  };
  return { ai, ready };
}

export function desktopPlatform(bridge: DesktopBridge): Platform {
  const { ai, ready } = desktopAi(bridge);
  return { kind: 'desktop', store: desktopStore(bridge), ai, files: downloadSaver, ready };
}
