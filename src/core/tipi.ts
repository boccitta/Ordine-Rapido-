/*
 * Ordine Rapido - i dati su cui lavora l'app: ordine, righe, archivi, tracciato del file.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */

/** Articolo dell'archivio del gestionale. `conf` è il numero di pezzi per collo, se il gestionale lo esporta. */
export interface Article { cod: string; desc: string; ean: string; um: string; mand: string; prezzo: string; conf?: string }
/** Cliente o casa mandante dell'archivio del gestionale. */
export interface Party { cod: string; nome: string; piva: string }

/** I tre archivi: articoli, clienti, mandanti. */
export interface ItemByKind { art: Article; cli: Party; man: Party }
export type Kind = keyof ItemByKind;
export type Item = Article | Party;

/** Come una riga è stata collegata a un articolo dell'archivio. */
export type Via = '' | 'codice' | 'ean' | 'storico' | 'multi' | 'manuale' | 'confermato' | 'suggerito';

/** Collegamento tra una riga dell'ordine e un articolo dell'archivio. Solo con ok:true il codice entra nel file. */
export interface Link { cod: string; desc: string; um: string; mand: string; ok: boolean; via: Via; multi?: Article[]; /** pezzi per collo dell'articolo */ conf?: string }

/** Una riga dell'ordine, con i valori così come si leggono e si scrivono nei campi. */
export interface Row {
  cod_articolo: string; cod_cliente: string; ean: string; descrizione: string; um: string;
  colli: string; quantita: string; prezzo: string; sc1: string; sc2: string; sc3: string;
  omaggio: boolean; netto_doc: string; totale_doc: string; nota: string;
  link?: Link | null;
}
/** I campi di testo di una riga. */
export type RowText = Exclude<keyof Row, 'omaggio' | 'link'>;

export interface Order {
  mandante: string; mandante_cod: string; mandante_piva: string;
  cliente: string; cliente_cod: string; piva: string;
  numero: string; data: string; consegna: string; pagamento: string; destinazione: string; note: string;
  tot_imponibile: string; tot_colli: string; tot_pezzi: string;
  righe: Row[];
  /** true se il codice è stato trovato in automatico: vale finché non cambia il nome da cui è stato ricavato. */
  man_auto?: boolean; cli_auto?: boolean;
}
/** I campi di testo della testata. */
export type OrderText = Exclude<keyof Order, 'righe' | 'man_auto' | 'cli_auto'>;

/** Gli archivi caricati dall'utente, più gli abbinamenti imparati. */
export interface Archive {
  art: Article[]; cli: Party[]; man: Party[];
  alias: Record<string, string>;
  artAt: string; cliAt: string; manAt: string;
}

/** Indice degli articoli per l'abbinamento: per codice, per codice senza zeri iniziali, per EAN. */
export interface Index {
  arts: Article[];
  code: Record<string, number[]>;
  codeNz: Record<string, number[]>;
  ean: Record<string, number[]>;
  /** chiave della casa mandante di ogni articolo */
  mk: string[];
  /** parole della descrizione di ogni articolo: calcolate alla prima ricerca */
  tok: string[][] | null;
  /** tutte le parole delle descrizioni, una volta sola: servono a ritrovare una parola scritta con qualche lettera sbagliata */
  voc: Record<string, 1> | null;
}

/**
 * Una colonna del file. `id` è un campo dell'app (vedi COLS) oppure, per le colonne che il gestionale vuole
 * ma che l'app non conosce, un nome del tipo x1, x2…: in quel caso `value` è il valore fisso da scrivere (anche vuoto).
 */
export interface ProfileCol { id: string; on: boolean; header: string; value?: string }
/** Tracciato: come deve essere fatto il file per il gestionale. */
export interface Profile {
  sep: string; dec: string; date: string; enc: string; um: string; omaggi: string;
  header: boolean; descSrc: string; allowUnlinked: boolean;
  /** 'csv' oppure 'xlsx': il tipo di file che il gestionale importa. */
  format: string;
  /** Il nome del file modello da cui è stato ricavato il tracciato; vuoto se è stato impostato a mano. */
  template: string;
  cols: ProfileCol[];
}

export type Level = 'ok' | 'warn' | 'bad' | 'info';
export interface Check { level: Level; text: string; k?: string }
/** Che cosa c'è in archivio al momento del controllo. */
export interface CheckContext { hasArt?: boolean; hasCli?: boolean; cliOk?: boolean; hasMan?: boolean; manOk?: boolean }

export interface Table { headers: string[]; rows: string[][] }

/** Errore con un codice che l'interfaccia sa spiegare a chi usa l'app. */
export class AppError extends Error {
  code: string;
  status?: number;
  detail?: string;
  constructor(code: string, message?: string, extra?: { status?: number; detail?: string }) {
    super(message || code);
    this.name = 'AppError';
    this.code = code;
    if (extra && extra.status !== undefined) this.status = extra.status;
    if (extra && extra.detail !== undefined) this.detail = extra.detail;
  }
}
/** Il codice di un errore qualsiasi, se ne ha uno. */
export function errorCode(e: unknown): string {
  return e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : '';
}
