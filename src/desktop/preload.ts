/*
 * Ordine Rapido - il ponte, lato finestra. Gira isolato dalla pagina e le espone solo le funzioni elencate
 * in contratto.ts: la pagina non riceve né Node né l'accesso generico ai canali.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { BRIDGE, CHANNEL } from './contratto.ts';
import type { DesktopBridge } from './contratto.ts';

const bridge: DesktopBridge = {
  key: {
    state: () => ipcRenderer.invoke(CHANNEL.keyState),
    verify: (provider, key, remember) => ipcRenderer.invoke(CHANNEL.keyVerify, provider, key, remember),
    remember: remember => ipcRenderer.invoke(CHANNEL.keyRemember, remember),
    forget: provider => ipcRenderer.invoke(CHANNEL.keyForget, provider)
  },
  read: {
    ask: (id, provider, model, prompt, images) => ipcRenderer.invoke(CHANNEL.readAsk, id, provider, model, prompt, images),
    stop: id => { ipcRenderer.send(CHANNEL.readStop, id); }
  },
  archives: {
    load: () => ipcRenderer.invoke(CHANNEL.archLoad),
    save: (kind, archive) => ipcRenderer.invoke(CHANNEL.archSave, kind, archive),
    saveAlias: rows => ipcRenderer.invoke(CHANNEL.aliasSave, rows)
  }
};

contextBridge.exposeInMainWorld(BRIDGE, bridge);
