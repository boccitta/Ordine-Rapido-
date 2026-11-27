/*
 * Ordine Rapido - app desktop per Windows, Linux e Mac: il processo principale.
 * Apre in una finestra la pagina della cartella app/, senza server e senza dominio, e fa per lei le tre cose
 * che una pagina non deve fare da sola: custodire la chiave API, parlare con Anthropic, scrivere gli archivi su disco.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent, MenuItemConstructorOptions, Session } from 'electron';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { API, MAX_IMAGES, askJson, keyLooksValid, listModels } from '../anthropic/protocollo.ts';
import type { EncodedImage, Send } from '../anthropic/protocollo.ts';
import { AppError } from '../core/tipi.ts';
import { ArchiveFiles, isKind } from './archivi.ts';
import { KeyVault } from './chiave.ts';
import { CHANNEL } from './contratto.ts';
import type { Failure, KeyState, KeyVerified, Reply, StoredArchive, StoredArchives } from './contratto.ts';

const PAGINA = path.join(__dirname, '..', 'app', 'index.html');
const PONTE = path.join(__dirname, 'preload.js');
/* Gli unici siti che un collegamento dell'app può aprire nel browser predefinito. */
const SITI_ESTERNI = new Set(['www.gesacom.it', 'github.com', 'platform.claude.com', 'www.gnu.org']);
/* La sessione di rete usata solo per Anthropic: separata da quella della finestra, senza dati salvati su disco. */
const SESSIONE_API = 'ordine-rapido-anthropic';
const TUTTA_LA_RETE = ['http', 'https', 'ws', 'wss'].map(protocollo => protocollo + '://*/*');

let finestra: BrowserWindow | null = null;

function apriNelBrowser(indirizzo: string): void {
  try {
    const u = new URL(indirizzo);
    if (u.protocol === 'https:' && SITI_ESTERNI.has(u.hostname)) void shell.openExternal(u.href);
  } catch { /* indirizzo non valido: non si apre nulla */ }
}

function creaFinestra(): void {
  const f = new BrowserWindow({
    width: 1280, height: 860, minWidth: 380, minHeight: 560,
    title: 'Ordine Rapido', backgroundColor: '#F2F5FA', autoHideMenuBar: true, show: false,
    webPreferences: { preload: PONTE, contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, spellcheck: false }
  });
  finestra = f;
  f.once('ready-to-show', () => f.show());
  f.on('closed', () => { if (finestra === f) finestra = null; });
  /* La finestra mostra solo l'app: ogni altro collegamento va al browser, se è tra quelli previsti. */
  f.webContents.setWindowOpenHandler(({ url }) => { apriNelBrowser(url); return { action: 'deny' }; });
  f.webContents.on('will-navigate', (evento, url) => { evento.preventDefault(); apriNelBrowser(url); });
  void f.loadFile(PAGINA);
}

function menu(): Menu {
  const mac = process.platform === 'darwin';
  const voci: MenuItemConstructorOptions[] = [
    ...(mac ? [{ label: 'Ordine Rapido', submenu: [
      { role: 'about', label: 'Informazioni su Ordine Rapido' }, { type: 'separator' },
      { role: 'hide', label: 'Nascondi Ordine Rapido' }, { role: 'hideOthers', label: 'Nascondi altre' }, { role: 'unhide', label: 'Mostra tutte' },
      { type: 'separator' }, { role: 'quit', label: 'Esci da Ordine Rapido' }] } as MenuItemConstructorOptions] : []),
    { label: 'Modifica', submenu: [
      { role: 'undo', label: 'Annulla' }, { role: 'redo', label: 'Ripeti' }, { type: 'separator' },
      { role: 'cut', label: 'Taglia' }, { role: 'copy', label: 'Copia' }, { role: 'paste', label: 'Incolla' }, { role: 'selectAll', label: 'Seleziona tutto' }] },
    { label: 'Vista', submenu: [
      { role: 'resetZoom', label: 'Dimensione normale' }, { role: 'zoomIn', label: 'Ingrandisci' }, { role: 'zoomOut', label: 'Riduci' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Schermo intero' }] },
    { label: 'Finestra', submenu: [
      { role: 'minimize', label: 'Riduci a icona' }, mac ? { role: 'zoom', label: 'Ridimensiona' } : { role: 'quit', label: 'Esci' }] }
  ];
  return Menu.buildFromTemplate(voci);
}

/* ---------- Rete ---------- */
function sessioneApi(): Session { return session.fromPartition(SESSIONE_API); }

function preparaRete(): void {
  /* Dalla finestra non parte nessuna richiesta di rete: tutto ciò che serve alla pagina è già dentro l'app. */
  session.defaultSession.webRequest.onBeforeRequest({ urls: TUTTA_LA_RETE }, (_dettagli, prosegui) => { prosegui({ cancel: true }); });
  /* Niente fotocamera, microfono, posizione o notifiche: l'app non ne ha bisogno. */
  session.defaultSession.setPermissionRequestHandler((_contenuto, permesso, risposta) => { risposta(permesso === 'clipboard-sanitized-write'); });
  /* Dalla sessione dedicata si raggiunge un solo indirizzo: quello di Anthropic. */
  sessioneApi().webRequest.onBeforeRequest({ urls: TUTTA_LA_RETE }, (dettagli, prosegui) => { prosegui({ cancel: !dettagli.url.startsWith(API + '/') }); });
}

const invia: Send = (url, richiesta) => {
  const init: RequestInit = { method: richiesta.method, headers: richiesta.headers, credentials: 'omit', cache: 'no-store' };
  if (richiesta.body !== undefined) init.body = richiesta.body;
  if (richiesta.signal) init.signal = richiesta.signal;
  return sessioneApi().fetch(url, init);
};

/* ---------- Ponte con la finestra ---------- */
/** Si risponde solo alla pagina dell'app, nella sua finestra: non a cornici interne né ad altre pagine. */
function fidato(evento: IpcMainEvent | IpcMainInvokeEvent): boolean {
  if (!finestra || evento.sender !== finestra.webContents) return false;
  const cornice = evento.senderFrame;
  if (!cornice || cornice !== finestra.webContents.mainFrame) return false;
  try { const u = new URL(cornice.url); return u.protocol === 'file:' && u.pathname === new URL(pathToFileURL(PAGINA).href).pathname; }
  catch { return false; }
}

function errore(e: unknown): Failure {
  if (e instanceof AppError) {
    const r: Failure = { ok: false, code: e.code, message: e.message };
    if (e.status !== undefined) r.status = e.status;
    if (e.detail !== undefined) r.detail = e.detail;
    return r;
  }
  const codice = e && typeof e === 'object' ? (e as { code?: unknown }).code : '';
  return { ok: false, code: codice === 'ENOSPC' || codice === 'quota_exceeded' ? 'quota_exceeded' : 'unavailable_local', message: '' };
}

function rispondi<T>(canale: string, fn: (...argomenti: unknown[]) => Promise<T> | T): void {
  ipcMain.handle(canale, async (evento, ...argomenti: unknown[]): Promise<Reply<T>> => {
    if (!fidato(evento)) return { ok: false, code: 'forbidden', message: '' };
    try { return { ok: true, value: await fn(...argomenti) }; }
    catch (e) { return errore(e); }
  });
}

function immagini(v: unknown): EncodedImage[] {
  const out: EncodedImage[] = [];
  if (!Array.isArray(v)) return out;
  for (const im of v.slice(0, MAX_IMAGES)) {
    if (!im || typeof im !== 'object') continue;
    const o = im as { media_type?: unknown; data?: unknown };
    if (typeof o.data === 'string' && typeof o.media_type === 'string' && /^image\/[a-z0-9.+-]{1,20}$/.test(o.media_type)) out.push({ media_type: o.media_type, data: o.data });
  }
  return out;
}

function preparaPonte(cassaforte: KeyVault, archivi: ArchiveFiles): void {
  const letture = new Map<string, AbortController>();

  rispondi<KeyState>(CHANNEL.keyState, () => cassaforte.state());
  rispondi<KeyVerified>(CHANNEL.keyVerify, async (chiave, ricorda) => {
    const candidata = (typeof chiave === 'string' ? chiave.trim() : '') || cassaforte.get();
    if (!keyLooksValid(candidata)) throw new AppError('bad_key_format');
    /* l'elenco dei modelli non consuma credito: serve a provare la chiave e a proporre i modelli disponibili */
    const models = await listModels(invia, candidata);
    cassaforte.set(candidata, ricorda === true);
    return { models, state: cassaforte.state() };
  });
  rispondi<KeyState>(CHANNEL.keyRemember, ricorda => { cassaforte.persist(ricorda === true); return cassaforte.state(); });
  rispondi<KeyState>(CHANNEL.keyForget, () => { cassaforte.forget(); return cassaforte.state(); });

  rispondi<unknown>(CHANNEL.readAsk, async (id, modello, richiesta, allegati) => {
    if (typeof id !== 'string' || typeof richiesta !== 'string' || typeof modello !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(modello)) throw new AppError('api_invalid');
    const chiave = cassaforte.get();
    if (!chiave) throw new AppError('no_key');
    const controllo = new AbortController();
    letture.set(id, controllo);
    try { return await askJson(invia, chiave, modello, richiesta, immagini(allegati), controllo.signal); }
    finally { letture.delete(id); }
  });
  ipcMain.on(CHANNEL.readStop, (evento, id: unknown) => {
    if (!fidato(evento) || typeof id !== 'string') return;
    const controllo = letture.get(id);
    if (controllo) controllo.abort();
  });

  rispondi<StoredArchives>(CHANNEL.archLoad, () => archivi.load());
  rispondi<null>(CHANNEL.archSave, async (tipo, archivio) => {
    if (!isKind(tipo)) throw new AppError('api_invalid');
    await archivi.save(tipo, archivio as StoredArchive);
    return null;
  });
  rispondi<null>(CHANNEL.aliasSave, async righe => { await archivi.saveAlias(righe as string[]); return null; });
}

/* ---------- Avvio ---------- */
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (finestra) { if (finestra.isMinimized()) finestra.restore(); finestra.focus(); }
  });
  void app.whenReady().then(() => {
    const dati = app.getPath('userData');
    const cassaforte = new KeyVault(dati);
    cassaforte.load();
    preparaRete();
    preparaPonte(cassaforte, new ArchiveFiles(dati));
    Menu.setApplicationMenu(menu());
    creaFinestra();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) creaFinestra(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
