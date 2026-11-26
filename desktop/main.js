/*
 * Ordine Rapido - app desktop per Windows, Linux e Mac.
 * Apre in una finestra la stessa pagina della cartella app/, senza server e senza dominio.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
'use strict';
const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('node:path');

const PAGINA = path.join(__dirname, '..', 'app', 'index.html');
/* Gli unici siti che un collegamento dell'app può aprire nel browser predefinito. */
const SITI_ESTERNI = new Set(['www.gesacom.it', 'github.com', 'platform.claude.com', 'www.gnu.org']);
/* L'unico indirizzo a cui l'app può collegarsi da sola: la lettura automatica degli ordini. */
const RETE_PERMESSA = ['https://api.anthropic.com/'];

function apriNelBrowser(indirizzo) {
  try {
    const u = new URL(indirizzo);
    if (u.protocol === 'https:' && SITI_ESTERNI.has(u.hostname)) shell.openExternal(u.href);
  } catch (e) { /* indirizzo non valido: non si apre nulla */ }
}

function creaFinestra() {
  const finestra = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 560,
    title: 'Ordine Rapido', backgroundColor: '#F2F5FA', autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, spellcheck: false }
  });
  finestra.once('ready-to-show', () => finestra.show());
  /* La finestra mostra solo l'app: ogni altro collegamento va al browser, se è tra quelli previsti. */
  finestra.webContents.setWindowOpenHandler(({ url }) => { apriNelBrowser(url); return { action: 'deny' }; });
  finestra.webContents.on('will-navigate', (evento, url) => { evento.preventDefault(); apriNelBrowser(url); });
  finestra.loadFile(PAGINA);
}

function menu() {
  const mac = process.platform === 'darwin';
  return Menu.buildFromTemplate([
    ...(mac ? [{ label: 'Ordine Rapido', submenu: [
      { role: 'about', label: 'Informazioni su Ordine Rapido' }, { type: 'separator' },
      { role: 'hide', label: 'Nascondi Ordine Rapido' }, { role: 'hideOthers', label: 'Nascondi altre' }, { role: 'unhide', label: 'Mostra tutte' },
      { type: 'separator' }, { role: 'quit', label: 'Esci da Ordine Rapido' }] }] : []),
    { label: 'Modifica', submenu: [
      { role: 'undo', label: 'Annulla' }, { role: 'redo', label: 'Ripeti' }, { type: 'separator' },
      { role: 'cut', label: 'Taglia' }, { role: 'copy', label: 'Copia' }, { role: 'paste', label: 'Incolla' }, { role: 'selectAll', label: 'Seleziona tutto' }] },
    { label: 'Vista', submenu: [
      { role: 'resetZoom', label: 'Dimensione normale' }, { role: 'zoomIn', label: 'Ingrandisci' }, { role: 'zoomOut', label: 'Riduci' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Schermo intero' }] },
    { label: 'Finestra', submenu: [
      { role: 'minimize', label: 'Riduci a icona' }, ...(mac ? [{ role: 'zoom', label: 'Ridimensiona' }] : [{ role: 'quit', label: 'Esci' }])] }
  ]);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const f = BrowserWindow.getAllWindows()[0];
    if (f) { if (f.isMinimized()) f.restore(); f.focus(); }
  });
  app.whenReady().then(() => {
    const s = session.defaultSession;
    /* Niente fotocamera, microfono, posizione o notifiche: l'app non ne ha bisogno. */
    s.setPermissionRequestHandler((contenuto, permesso, risposta) => risposta(permesso === 'clipboard-sanitized-write'));
    /* Seconda barriera oltre a quella scritta nella pagina: dalla finestra non parte nessuna richiesta verso altri siti. */
    s.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (dettagli, prosegui) => {
      prosegui({ cancel: !RETE_PERMESSA.some(base => dettagli.url.startsWith(base)) });
    });
    Menu.setApplicationMenu(menu());
    creaFinestra();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) creaFinestra(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
