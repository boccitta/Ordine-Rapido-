/*
 * Ordine Rapido - interfaccia: preferenze salvate sul dispositivo (tracciato del file, tema, colonne visibili).
 * Non sono dati riservati: stanno nella memoria locale della pagina, in tutti gli ambienti.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { defaultProfile, mergeProfile } from '../core/tracciato.ts';
import type { Profile } from '../core/tipi.ts';
import { S } from './stato.ts';

/* Cambiare questi nomi fa perdere le preferenze a chi aggiorna: vedi docs/SVILUPPO.md. */
const PROFILE_KEY = 'ordine-rapido-tracciato', PROFILE_KEY_OLD = 'gesacom-tracciato-v2';
const UI_KEY = 'ordine-rapido-ui';

export function loadProfile(): Profile {
  try { return mergeProfile(JSON.parse(localStorage.getItem(PROFILE_KEY) || localStorage.getItem(PROFILE_KEY_OLD) || 'null')); }
  catch { return defaultProfile(); }
}
export function saveProfile(): void {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(S.profile)); } catch { /* qui non si può salvare: vale fino alla chiusura */ }
}

export function loadUi(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {};
    S.allCols = saved.allCols === true;
    S.skinChoice = saved.skin === 'dark' || saved.skin === 'light' ? saved.skin : '';
    S.readerChoice = saved.reader === 'local' || saved.reader === 'claude' ? saved.reader : '';
    S.setupHidden = saved.setupHidden === true;
  } catch { /* preferenze illeggibili: si usano quelle predefinite */ }
}
export function saveUi(): void {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ allCols: S.allCols, skin: S.skinChoice, reader: S.readerChoice, setupHidden: S.setupHidden })); } catch { /* come sopra */ }
}
