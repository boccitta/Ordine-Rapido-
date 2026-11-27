/*
 * Ordine Rapido - versione dell'app e indirizzo del codice sorgente.
 * I valori vengono scritti al momento della costruzione (scripts/compila.js) a partire da package.json:
 * l'unica fonte del numero di versione resta quella.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
declare const __ORDINE_RAPIDO__: { versione: string; sorgente: string } | undefined;

export const INFO: { versione: string; sorgente: string } =
  typeof __ORDINE_RAPIDO__ !== 'undefined' && __ORDINE_RAPIDO__ ? __ORDINE_RAPIDO__ : { versione: '0.0.0', sorgente: '' };
