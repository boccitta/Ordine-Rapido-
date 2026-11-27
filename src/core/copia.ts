/*
 * Ordine Rapido - copia di sicurezza degli archivi: un file JSON con un formato dichiarato e numerato.
 * La chiave API non ne fa mai parte.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { KINDS, PACK, archiveDate, emptyArchive, mergeItems, setArchiveDate, setArchiveItems, str } from './anagrafiche.ts';
import { mergeProfile } from './tracciato.ts';
import { AppError } from './tipi.ts';
import type { Archive, Item, Kind, Profile } from './tipi.ts';

export const BACKUP_ID = 'ordine-rapido-archivio';
export const BACKUP_VER = 1;

interface BackupBlock { aggiornato_il: string; campi: string[]; righe: string[][] }
export interface Backup {
  formato: string; versione_formato: number; app: string; creato_il: string;
  tracciato: Profile | null; abbinamenti: Record<string, string>;
  art: BackupBlock; cli: BackupBlock; man: BackupBlock;
}
/** Gli archivi letti da una copia, con il tracciato se la copia lo contiene. */
export interface Restored extends Archive { profile: Profile | null }

export function backupBuild(arch: Archive, profile: Profile | null | undefined, appVersion: unknown, date: unknown): Backup {
  const block = (k: Kind): BackupBlock => ({
    aggiornato_il: str(archiveDate(arch, k)),
    campi: PACK[k].slice(),
    righe: ((arch[k] || []) as Item[]).map(it => PACK[k].map(f => str((it as unknown as Record<string, unknown>)[f])))
  });
  const o: Backup = { formato: BACKUP_ID, versione_formato: BACKUP_VER, app: str(appVersion), creato_il: str(date), tracciato: profile || null, abbinamenti: {},
    art: block('art'), cli: block('cli'), man: block('man') };
  for (const key in arch.alias) o.abbinamenti[key] = arch.alias[key] || '';
  return o;
}

const NOT_A_BACKUP = 'Questo file non è una copia di sicurezza di Ordine Rapido.';

/** Legge una copia di sicurezza. Rifiuta i file estranei e le copie create da una versione più recente dell'app. */
export function backupParse(input: unknown): Restored {
  if (!input || typeof input !== 'object') throw new AppError('local', NOT_A_BACKUP);
  const o = input as Record<string, unknown>;
  if (o.formato !== BACKUP_ID) throw new AppError('local', NOT_A_BACKUP);
  const v = Number(o.versione_formato);
  if (!(v >= 1)) throw new AppError('local', NOT_A_BACKUP);
  if (v > BACKUP_VER) throw new AppError('local', 'Questa copia è stata creata da una versione più recente di Ordine Rapido. Aggiorna l\'app e riprova.');
  const out: Restored = Object.assign(emptyArchive(), { profile: null });
  for (const k of KINDS) {
    const b = o[k] as { righe?: unknown; campi?: unknown; aggiornato_il?: unknown } | null | undefined;
    if (!b || !Array.isArray(b.righe)) continue;
    const campi: readonly unknown[] = Array.isArray(b.campi) ? b.campi : PACK[k];
    const items = (b.righe as unknown[]).filter(Array.isArray).map(r => {
      const it: Record<string, string> = {};
      for (const f of PACK[k]) { const i = campi.indexOf(f); it[f] = i >= 0 ? str((r as unknown[])[i]).replace(/[\t\r\n]+/g, ' ') : ''; }
      return it;
    }).filter(it => (it.cod || '').trim());
    setArchiveItems(out, k, mergeItems(k, [], items as unknown as Item[]));
    setArchiveDate(out, k, str(b.aggiornato_il));
  }
  if (o.abbinamenti && typeof o.abbinamenti === 'object') {
    const al = o.abbinamenti as Record<string, unknown>;
    for (const key in al) { const cod = al[key]; if (typeof cod === 'string') out.alias[key] = cod; }
  }
  if (o.tracciato && typeof o.tracciato === 'object') out.profile = mergeProfile(o.tracciato);
  return out;
}
