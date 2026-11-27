/*
 * Ordine Rapido - sceglie l'ambiente in cui la pagina sta girando.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { browserPlatform } from './browser.ts';
import { claudeCapabilities, claudePlatform } from './claude.ts';
import { desktopBridge, desktopPlatform } from './desktop.ts';
import type { Platform } from './tipi.ts';

export function detectPlatform(): Platform {
  const bridge = desktopBridge();
  if (bridge) return desktopPlatform(bridge);
  const caps = claudeCapabilities();
  if (caps) return claudePlatform(caps);
  return browserPlatform();
}
export type { Platform, StoreMode, Reader, AiAccess, AiState, KeyOutcome, ArchiveStore, FileSaver } from './tipi.ts';
