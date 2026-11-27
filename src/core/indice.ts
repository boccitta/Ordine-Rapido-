/*
 * Ordine Rapido - logica pura: numeri, calcoli, controlli, abbinamento con l'archivio e costruzione del file.
 * Nessun accesso alla pagina, alla rete o al disco: tutto quello che sta in questa cartella si prova da solo
 * con Node (vedi test/core.test.ts).
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
export * from './tipi.ts';
export { num, round, show, fmtDate } from './numeri.ts';
export type { NumKind } from './numeri.ts';
export { rowCalc, rowDiff, totals, checks, unlinked } from './ordine.ts';
export type { RowCalc, Totals } from './ordine.ts';
export {
  KINDS, PACK, normCode, normText, companyKey, pack, unpack, mergeItems, rowsToItems, detectSep, parseDelimited, guessMap,
  emptyArchive, archiveDate, setArchiveDate, archiveItems, setArchiveItems
} from './anagrafiche.ts';
export type { ColumnMap } from './anagrafiche.ts';
export { buildIndex, linkOf, aliasKeys, matchRow, search, matchClient, matchMandante } from './abbinamento.ts';
export { COLS, colDef, defaultProfile, mergeProfile, buildTable, toDelimited, toCp1252, fileName } from './tracciato.ts';
export type { ColDef } from './tracciato.ts';
export { extractJson } from './risposta.ts';
export { BACKUP_ID, BACKUP_VER, backupBuild, backupParse } from './copia.ts';
export type { Backup, Restored } from './copia.ts';
