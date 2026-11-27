/*
 * Ordine Rapido - interfaccia: lo stato dell'app in un posto solo.
 * Ogni modulo dell'interfaccia legge e cambia questi dati; nessuno ne tiene una copia propria.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { emptyArchive } from '../core/anagrafiche.ts';
import { defaultProfile } from '../core/tracciato.ts';
import type { Archive, Index, Order, Profile, Row } from '../core/tipi.ts';
import type { Platform } from '../piattaforma/tipi.ts';

export type View = 'carica' | 'controlla' | 'esporta';
/** none: nessun ordine aperto · example: l'ordine di prova · order: un ordine letto o scritto a mano */
export type Stage = 'none' | 'example' | 'order';
export type Skin = '' | 'dark' | 'light';

export function emptyRow(): Row {
  return { cod_articolo: '', cod_cliente: '', ean: '', descrizione: '', um: '', colli: '', quantita: '', prezzo: '', sc1: '', sc2: '', sc3: '', omaggio: false, netto_doc: '', totale_doc: '', nota: '' };
}
export function emptyOrder(): Order {
  return { mandante: '', mandante_cod: '', mandante_piva: '', cliente: '', cliente_cod: '', piva: '', numero: '', data: '', consegna: '', pagamento: '', destinazione: '', note: '', tot_imponibile: '', tot_colli: '', tot_pezzi: '', righe: [emptyRow()] };
}
/** L'ordine di prova. Dati di fantasia: aziende inventate e partita IVA con cifra di controllo volutamente sbagliata. */
export function exampleOrder(): Order {
  const r = (o: Partial<Row>): Row => Object.assign(emptyRow(), o);
  return { mandante: 'CONSERVE FANTASIA S.P.A.', mandante_cod: '', mandante_piva: '', cliente: 'MARKET FANTASIA S.R.L.', cliente_cod: '', piva: '01234500033', numero: '2026/0412',
    data: '2026-11-23', consegna: '2026-11-30', pagamento: 'RIBA 30 GG DF FM',
    destinazione: 'MARKET FANTASIA S.R.L., VIA INVENTATA 22, 07026 Olbia (SS)', note: '',
    tot_imponibile: '435,86', tot_colli: '23', tot_pezzi: '356',
    righe: [
      r({ cod_articolo: '300101', descrizione: 'PASSATA DI POMODORO BOTTIGLIA GR 700', colli: '10', quantita: '120', prezzo: '0,85', sc1: '5', netto_doc: '0,8075', totale_doc: '96,90' }),
      r({ cod_articolo: '300102', descrizione: 'POLPA DI POMODORO LATTA GR 400', colli: '5', quantita: '120', prezzo: '0,55', netto_doc: '0,55', totale_doc: '66,00' }),
      r({ cod_articolo: '300301', descrizione: 'TONNO ALL\'OLIO DI OLIVA GR 80 X 3', colli: '4', quantita: '64', prezzo: '2,95', sc1: '5', netto_doc: '2,8025', totale_doc: '179,36' }),
      r({ cod_articolo: '300301', descrizione: 'TONNO ALL\'OLIO DI OLIVA GR 80 X 3', colli: '1', quantita: '16', prezzo: '2,95', omaggio: true }),
      r({ cod_articolo: '300402', descrizione: 'CARCIOFINI SOTT\'OLIO VASO GR 280', colli: '3', quantita: '36', prezzo: '2,60', netto_doc: '2,60', totale_doc: '93,60' })
    ] };
}
export const EX_NOTES: readonly string[] = ['Riga 4: sul documento ha il prezzo ma né netto né totale. È trattata come omaggio (sconto merce): verifica con il cliente.'];

export interface AppState {
  /* L'ordine in lavorazione */
  order: Order;
  isExample: boolean;
  /** Avvisi scritti dal modello durante la lettura, più quelli aggiunti dall'app. */
  notes: string[];
  /** Da dove viene l'ordine: nome del file, oppure vuoto se scritto a mano. */
  src: string;
  stage: Stage;
  exported: boolean;
  /* Il materiale da leggere */
  files: File[];
  /** Indirizzi locali delle immagini del documento, per «Vedi il documento». */
  previews: string[];
  /* Tracciato e archivi */
  profile: Profile;
  arch: Archive;
  /** Indice degli articoli: null finché l'archivio articoli non è caricato. */
  ix: Index | null;
  archReady: boolean;
  cliOk: boolean;
  manOk: boolean;
  /* Schermate */
  view: View;
  headEdit: boolean;
  allCols: boolean;
  skinChoice: Skin;
  /** Chi legge gli ordini, se è stato scelto a mano; vuoto finché decide l'app (vedi readerMode). */
  readerChoice: '' | 'local' | 'claude';
  /** true se i passaggi «per cominciare» sono stati nascosti a mano. */
  setupHidden: boolean;
  /** Quante cose da verificare, e quante da sistemare, mostra la schermata «Controlla». */
  issues: number;
  bads: number;
  /** true se è a video l'avviso che blocca l'esportazione: sparisce da solo quando il blocco non c'è più. */
  guardShown: boolean;
}

export const S: AppState = {
  order: exampleOrder(), isExample: true, notes: EX_NOTES.slice(), src: '', stage: 'none', exported: false,
  files: [], previews: [],
  profile: defaultProfile(), arch: emptyArchive(), ix: null, archReady: false, cliOk: false, manOk: false,
  view: 'carica', headEdit: false, allCols: false, skinChoice: '', readerChoice: '', setupHidden: false,
  issues: 0, bads: 0, guardShown: false
};

let current: Platform | null = null;
export function setPlatform(p: Platform): void { current = p; }
/** L'ambiente in cui gira la pagina: browser, app desktop o Claude. */
export function platform(): Platform {
  if (!current) throw new Error('Ambiente non ancora scelto');
  return current;
}

/**
 * Chi legge gli ordini adesso. Se non è stato scelto a mano: Claude dove è già disponibile (dentro Claude, oppure
 * con una chiave salvata), altrimenti questo dispositivo, che non ha bisogno di niente.
 */
export function readerMode(): 'local' | 'claude' {
  if (S.readerChoice) return S.readerChoice;
  const ai = platform().ai;
  return !ai.needsKey || ai.state().hasKey ? 'claude' : 'local';
}
