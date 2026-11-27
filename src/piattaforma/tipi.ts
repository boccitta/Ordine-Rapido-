/*
 * Ordine Rapido - che cosa l'interfaccia chiede all'ambiente in cui gira.
 * L'app funziona in tre ambienti: aperta in un browser, installata come app desktop, pubblicata dentro Claude.
 * Cambia dove finiscono gli archivi, chi custodisce la chiave API e come si salva un file; il resto del codice
 * usa solo questo contratto e non sa in quale ambiente si trova.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import type { Model } from '../anthropic/protocollo.ts';
import type { Archive, Kind } from '../core/tipi.ts';

/** Dove sono salvati gli archivi: file dell'app, spazio privato in Claude, database del browser, memoria locale, solo memoria. */
export type StoreMode = 'file' | 'db' | 'idb' | 'local' | 'mem';
export type Progress = (done: number, total: number) => void;

export interface ArchiveStore {
  /** Prepara il deposito e dice dove finiranno i dati. */
  init(): Promise<StoreMode>;
  load(): Promise<Archive>;
  saveArchive(arch: Archive, kind: Kind, progress?: Progress): Promise<void>;
  saveAlias(arch: Archive): Promise<void>;
  saveAll(arch: Archive, progress?: Progress): Promise<void>;
  /** true se gli archivi sono stati trovati nel posto usato da una versione precedente: vanno riscritti in quello nuovo. */
  migrated(): boolean;
}

export interface ReadOptions { images?: Blob[]; signal?: AbortSignal; cache?: boolean }
/** Chi legge un ordine: riceve il testo della richiesta e le immagini, restituisce i dati che il modello ha risposto. */
export interface Reader {
  limits(): Promise<{ images?: { maxCount: number } } | null>;
  json(prompt: string, opts?: ReadOptions): Promise<unknown>;
}

/** Com'è andato il salvataggio della chiave dopo la verifica. */
export type KeyOutcome =
  | 'session'       /* valida, ma l'utente non vuole che sia ricordata */
  | 'saved'         /* salvata sul dispositivo */
  | 'encrypted'     /* salvata e cifrata dal sistema operativo (app desktop) */
  | 'unsaved'       /* qui non si può salvare */
  | 'no_keyring';   /* il sistema non offre un portachiavi: non viene scritta in chiaro */

export interface AiState {
  hasKey: boolean;
  /** La chiave da rimostrare nel campo. Nell'app desktop è sempre vuota: la pagina non la rivede più. */
  keyText: string;
  /** Gli ultimi caratteri della chiave salvata, per riconoscerla. */
  keyHint: string;
  remember: boolean;
  model: string;
  models: Model[];
}

/** La lettura automatica: chi la fa e, quando serve, la chiave API di chi usa l'app. */
export interface AiAccess {
  /** false dentro Claude, dove la lettura non ha bisogno di una chiave. */
  readonly needsKey: boolean;
  state(): AiState;
  /** Il lettore da usare adesso; null se manca la chiave o la lettura non è disponibile. */
  reader(): Reader | null;
  /** Prova la chiave leggendo l'elenco dei modelli; se è valida la tiene. Con chiave vuota riprova quella già salvata. */
  verify(key: string, remember: boolean, model: string): Promise<KeyOutcome>;
  forget(): Promise<void>;
  setModel(model: string): void;
  setRemember(remember: boolean): Promise<void>;
}

export interface FileSaver {
  /** false se da qui non si possono salvare file: resta la copia negli appunti. */
  available(): boolean;
  /** Salva un file. Lancia un AppError con codice 'declined' se l'utente annulla. */
  save(filename: string, data: string | Uint8Array, type: string): Promise<void>;
}

export interface Platform {
  readonly kind: 'browser' | 'desktop' | 'claude';
  readonly store: ArchiveStore;
  readonly ai: AiAccess;
  readonly files: FileSaver;
  /** Si risolve quando lettura e salvataggio dei file sono pronti. */
  readonly ready: Promise<void>;
}
