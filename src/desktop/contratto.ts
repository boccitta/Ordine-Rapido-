/*
 * Ordine Rapido - il ponte tra la finestra e il processo principale dell'app desktop.
 * È l'elenco completo di quello che la pagina può chiedere: nient'altro esce dalla finestra.
 * La chiave API entra dal ponte una volta sola, quando l'utente la scrive, e non torna più indietro.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import type { EncodedImage, Model } from '../anthropic/protocollo.ts';
import type { Kind } from '../core/tipi.ts';

/** Il nome con cui il ponte compare nella pagina: window.ordineRapido. */
export const BRIDGE = 'ordineRapido';

/** I canali tra finestra e processo principale. */
export const CHANNEL = {
  keyState: 'chiave:stato',
  keyVerify: 'chiave:verifica',
  keyRemember: 'chiave:ricorda',
  keyForget: 'chiave:rimuovi',
  readAsk: 'lettura:chiedi',
  readStop: 'lettura:ferma',
  archLoad: 'archivi:leggi',
  archSave: 'archivi:salva',
  aliasSave: 'archivi:salva-abbinamenti'
} as const;

/** Ogni risposta dice se è andata bene; un errore viaggia come dato, con il codice che l'interfaccia sa spiegare. */
export interface Failure { ok: false; code: string; message: string; status?: number; detail?: string }
export type Reply<T> = { ok: true; value: T } | Failure;

export interface KeyState {
  present: boolean;
  /** Gli ultimi caratteri, per riconoscere la chiave salvata senza mostrarla. */
  hint: string;
  /** true se la chiave è scritta su disco, cifrata dal sistema operativo. */
  stored: boolean;
  /** false se il sistema non offre un portachiavi con cui cifrarla. */
  canEncrypt: boolean;
}
export interface KeyVerified { models: Model[]; state: KeyState }

/** Un archivio così come sta su disco: una riga compatta per elemento, più la data dell'ultimo caricamento. */
export interface StoredArchive { rows: string[]; at: string }
export interface StoredArchives { art: StoredArchive | null; cli: StoredArchive | null; man: StoredArchive | null; alias: string[] | null }

export interface DesktopBridge {
  key: {
    state(): Promise<Reply<KeyState>>;
    /** Prova la chiave con Anthropic e, se è valida, la tiene. Con chiave vuota riprova quella già salvata. */
    verify(key: string, remember: boolean): Promise<Reply<KeyVerified>>;
    remember(remember: boolean): Promise<Reply<KeyState>>;
    forget(): Promise<Reply<KeyState>>;
  };
  read: {
    ask(id: string, model: string, prompt: string, images: EncodedImage[]): Promise<Reply<unknown>>;
    stop(id: string): void;
  };
  archives: {
    load(): Promise<Reply<StoredArchives>>;
    save(kind: Kind, archive: StoredArchive): Promise<Reply<null>>;
    saveAlias(rows: string[]): Promise<Reply<null>>;
  };
}
