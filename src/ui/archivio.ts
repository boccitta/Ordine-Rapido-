/*
 * Ordine Rapido - interfaccia: l'archivio del gestionale. Caricamento dei file esportati (articoli, clienti,
 * mandanti), scelta delle colonne, copia di sicurezza e ripristino, salvataggio degli abbinamenti imparati.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { buildIndex } from '../core/abbinamento.ts';
import { archiveItems, guessMap, mergeItems, rowsToItems, setArchiveDate, setArchiveItems } from '../core/anagrafiche.ts';
import type { ColumnMap } from '../core/anagrafiche.ts';
import { backupBuild, backupParse } from '../core/copia.ts';
import type { Restored } from '../core/copia.ts';
import { fmtDate } from '../core/numeri.ts';
import { aliasCount, clearLearned, recipes } from '../core/ricette.ts';
import { errorCode } from '../core/tipi.ts';
import type { Archive, Kind } from '../core/tipi.ts';
import type { StoreMode } from '../piattaforma/tipi.ts';
import { $, button, count, el, input, status, today } from './dom.ts';
import { renderCols, renderTemplateInfo, syncOpts } from './impostazioni.ts';
import { saveProfile } from './preferenze.ts';
import { matchAll, refresh, renderLinks } from './righe.ts';
import { renderRecipes } from './ricette.ts';
import { paintChip, paintSetup } from './schermate.ts';
import { tableFromFile } from './tabelle.ts';
import { S, platform } from './stato.ts';
import { INFO } from './versione.ts';

/* I campi di ogni archivio, con il nome mostrato nella scelta delle colonne. */
const FIELDS: Record<Kind, readonly (readonly [field: string, label: string])[]> = {
  art: [['cod', 'Codice articolo'], ['desc', 'Descrizione'], ['ean', 'EAN / codice a barre'], ['um', 'Unità di misura'], ['mand', 'Casa mandante'], ['prezzo', 'Prezzo di listino'], ['conf', 'Pezzi per collo']],
  cli: [['cod', 'Codice cliente'], ['nome', 'Ragione sociale'], ['piva', 'Partita IVA']],
  man: [['cod', 'Codice mandante'], ['nome', 'Ragione sociale'], ['piva', 'Partita IVA']]
};
const KIND_NAME: Record<Kind, readonly [title: string, plural: string]> = { art: ['Articoli', 'articoli'], cli: ['Clienti', 'clienti'], man: ['Mandanti', 'mandanti'] };
const STORE_NOTE: Record<StoreMode, string> = {
  file: 'Gli archivi restano salvati solo su questo dispositivo, nella cartella dati dell\'app. Non vengono inviati a nessuno.',
  db: 'Gli archivi restano salvati nel tuo spazio privato di questa pagina: li ritrovi anche da un altro dispositivo.',
  idb: 'Gli archivi restano salvati solo su questo dispositivo, dentro l\'app o il browser che stai usando. Non vengono inviati a nessuno.',
  local: 'Gli archivi restano salvati solo in questo browser.',
  mem: 'Qui gli archivi non si possono salvare: restano fino alla chiusura della pagina.'
};

/** Un file esportato dal gestionale, letto ma non ancora salvato: aspetta che si scelgano le colonne. */
interface Pending { kind: Kind; rows: string[][]; name: string; header: boolean; map: ColumnMap; mode: 'replace' | 'merge'; mand: string }
let pendingKind: Kind = 'art', pending: Pending | null = null, clearArmed = false;

export function archStatus(text: string, level?: string): void { status('archStatus', text, level); }
const savingBlock = (a: number, b: number) => archStatus('Salvo l\'archivio: blocco ' + a + ' di ' + b + '…', '');

export function renderArchInfo(): void {
  const a = S.arch;
  const when = (n: number, at: string) => { const d = fmtDate(at, 'dmy'); return n ? count(n) + (d ? ', caricati il ' + d : ' caricati') : 'non caricati'; };
  $('artInfo').textContent = when(a.art.length, a.artAt);
  $('cliInfo').textContent = when(a.cli.length, a.cliAt);
  $('manInfo').textContent = when(a.man.length, a.manAt);
  paintChip(); paintSetup();
  $('aliasInfo').textContent = count(aliasCount(a.alias));
  renderRecipes();
  $('btnArt').textContent = a.art.length ? 'Aggiorna articoli' : 'Carica export articoli';
  $('btnCli').textContent = a.cli.length ? 'Aggiorna clienti' : 'Carica export clienti';
  $('btnMan').textContent = a.man.length ? 'Aggiorna mandanti' : 'Carica export mandanti';
}

/* ---------- Abbinamenti imparati: si salvano poco dopo l'ultima modifica, uno alla volta ---------- */
let aliasTimer: ReturnType<typeof setTimeout> | undefined;
let aliasChain: Promise<void> = Promise.resolve();
function saveAliasNow(): void {
  clearTimeout(aliasTimer); aliasTimer = undefined;
  aliasChain = aliasChain.then(() => platform().store.saveAlias(S.arch))
    .catch(() => { archStatus('Non sono riuscito a salvare gli abbinamenti imparati. Valgono fino alla chiusura della pagina.', 'warn'); });
}
export function saveAliasSoon(): void {
  clearTimeout(aliasTimer);
  aliasTimer = setTimeout(saveAliasNow, 700);
}
/** Se c'è un salvataggio in attesa lo fa subito: serve quando la pagina sta per chiudersi. */
function flushAlias(): void { if (aliasTimer !== undefined) saveAliasNow(); }

/** Mette in uso un archivio appena caricato o ripristinato: indice degli articoli, collegamenti, schermate. */
function useArchive(): void {
  S.ix = S.arch.art.length ? buildIndex(S.arch.art) : null;
  matchAll(true); renderLinks(); refresh(); renderArchInfo();
}

/* ---------- Caricamento dei file esportati ---------- */
function colName(i: number): string {
  let s = ''; i++;
  while (i > 0) { s = String.fromCharCode(65 + (i - 1) % 26) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

/** Il riquadro in cui si dice quale colonna del file contiene ogni campo, prima di salvare. */
function renderMapper(): void {
  const m = $('mapper'); m.textContent = ''; m.hidden = !pending;
  if (!pending) return;
  const P = pending;
  let width = 0;
  for (const r of P.rows.slice(0, 50)) width = Math.max(width, r.length);
  const sampleRow = P.rows[P.header ? 1 : 0] || [], head = P.header ? (P.rows[0] || []) : [];
  m.append(el('strong', { text: KIND_NAME[P.kind][0] + ' da ' + P.name }));
  const hc = el('input', { type: 'checkbox', id: 'm-header', checked: P.header });
  hc.addEventListener('change', () => { P.header = hc.checked; renderMapper(); });
  m.append(el('label', { className: 'check' }, hc, ' La prima riga contiene i nomi delle colonne'));
  const grid = el('div', { className: 'grid' });
  const cnt = el('p', { className: 'status', id: 'm-count' });
  function updateCount(): void {
    const n = P.map.cod === undefined ? 0 : rowsToItems(P.kind, P.rows, P.map, P.header, P.mand).length;
    cnt.textContent = n ? count(n) + ' righe con codice pronte da salvare.' : 'Indica la colonna del codice.';
    cnt.className = 'status ' + (n ? '' : 'warn');
  }
  for (const [field, label] of FIELDS[P.kind]) {
    const sel = el('select', { id: 'm-' + field });
    sel.append(el('option', { value: '-1', text: 'non presente' }));
    for (let i = 0; i < width; i++) {
      const lab = colName(i) + (head[i] ? ' · ' + String(head[i]).slice(0, 24) : '') + (sampleRow[i] ? ' · es. ' + String(sampleRow[i]).slice(0, 22) : '');
      sel.append(el('option', { value: String(i), text: lab }));
    }
    const chosen = P.map[field];
    sel.value = String(chosen === undefined ? -1 : chosen);
    sel.addEventListener('change', () => { const v = Number(sel.value); if (v < 0) delete P.map[field]; else P.map[field] = v; updateCount(); });
    const lb = el('label', { text: label + (field === 'cod' ? ' (obbligatorio)' : '') }); lb.htmlFor = 'm-' + field;
    grid.append(el('div', { className: 'field' }, lb, sel));
  }
  if (P.kind === 'art') {
    const mi = el('input', { type: 'text', id: 'm-mand', value: P.mand, placeholder: 'es. LATTERIA VALFINTA S.P.A.' });
    mi.addEventListener('input', () => { P.mand = mi.value; });
    const ml = el('label', { text: 'Casa mandante per tutto il file, se manca la colonna' }); ml.htmlFor = 'm-mand';
    grid.append(el('div', { className: 'field' }, ml, mi));
  }
  m.append(grid);
  const md = el('select', { id: 'm-mode' });
  md.append(el('option', { value: 'replace', text: 'Sostituisci tutto l\'archivio' }), el('option', { value: 'merge', text: P.kind === 'art' ? 'Aggiungi e aggiorna (un file per mandante)' : 'Aggiungi e aggiorna' }));
  md.value = P.mode; md.addEventListener('change', () => { P.mode = md.value === 'merge' ? 'merge' : 'replace'; });
  const mdl = el('label', { text: 'Cosa fare con l\'archivio già salvato' }); mdl.htmlFor = 'm-mode';
  m.append(el('div', { className: 'field' }, mdl, md));
  m.append(cnt);
  updateCount();
  const save = el('button', { type: 'button', className: 'primary', text: 'Salva in archivio' }), cancel = el('button', { type: 'button', text: 'Annulla' });
  cancel.addEventListener('click', () => { pending = null; renderMapper(); });
  save.addEventListener('click', async () => {
    if (P.map.cod === undefined) { archStatus('Indica quale colonna contiene il codice.', 'warn'); return; }
    const kind = P.kind, items = rowsToItems(kind, P.rows, P.map, P.header, P.mand);
    if (!items.length) { archStatus('Nessuna riga con un codice in quella colonna.', 'warn'); return; }
    save.disabled = true;
    setArchiveItems(S.arch, kind, P.mode === 'merge' ? mergeItems(kind, archiveItems(S.arch, kind), items) : items);
    setArchiveDate(S.arch, kind, today());
    pending = null; renderMapper();
    useArchive();
    try {
      await platform().store.saveArchive(S.arch, kind, savingBlock);
      archStatus(count(archiveItems(S.arch, kind).length) + ' ' + KIND_NAME[kind][1] + ' in archivio.', 'ok');
    } catch (err) {
      archStatus(errorCode(err) === 'quota_exceeded' ? 'Archivio troppo grande per lo spazio disponibile. Carica solo le case mandanti che ti servono.'
        : 'Archivio caricato, ma non sono riuscito a salvarlo: vale fino alla chiusura della pagina. Riprova più tardi.', 'warn');
    }
  });
  m.append(el('div', { className: 'row' }, save, cancel));
}

async function chosenArchiveFile(file: File): Promise<void> {
  archStatus('Leggo ' + file.name + '…', '');
  try {
    const rows = (await tableFromFile(file)).rows;
    if (!rows.length) { archStatus('Il file è vuoto.', 'bad'); return; }
    const kind = pendingKind, g = guessMap(kind, rows[0] || []);
    pending = { kind, rows, name: file.name, header: g.found > 0, map: g.found > 0 ? g.map : (kind === 'art' ? { cod: 0, desc: 1 } : { cod: 0, nome: 1 }), mode: 'replace', mand: '' };
    archStatus('', ''); renderMapper();
  } catch (err) {
    archStatus(errorCode(err) === 'local' && err instanceof Error ? err.message : 'Non riesco a leggere questo file. Esportalo in CSV o Excel e riprova.', 'bad');
  }
}

/* ---------- Copia di sicurezza ---------- */
async function saveBackup(): Promise<void> {
  const name = 'ordine-rapido-archivio_' + today() + '.json', text = JSON.stringify(backupBuild(S.arch, S.profile, INFO.versione, today()));
  try {
    const p = platform();
    await p.ready;
    await p.files.save(name, text, 'application/json');
    archStatus('Copia salvata: ' + name + '. Contiene i tuoi archivi: tienila al sicuro e non pubblicarla.', 'ok');
  } catch (e) {
    const declined = errorCode(e) === 'declined';
    archStatus(declined ? 'Salvataggio annullato.' : 'Non sono riuscito a salvare la copia.', declined ? '' : 'bad');
  }
}

async function chosenBackupFile(file: File): Promise<void> {
  let data: Restored;
  try { data = backupParse(JSON.parse(await file.text())); }
  catch (err) { archStatus(errorCode(err) === 'local' && err instanceof Error ? err.message : 'Questo file non è una copia di sicurezza di Ordine Rapido.', 'bad'); return; }
  pending = null;
  const m = $('mapper'); m.textContent = ''; m.hidden = false; archStatus('', '');
  const go = el('button', { type: 'button', className: 'primary', text: 'Ripristina' }), no = el('button', { type: 'button', text: 'Annulla' });
  m.append(el('strong', { text: 'Ripristino da ' + file.name }),
    el('p', { className: 'status', text: 'La copia contiene ' + count(data.art.length) + ' articoli, ' + count(data.cli.length) + ' clienti, ' + count(data.man.length) + ' mandanti e ' +
      count(aliasCount(data.alias)) + ' abbinamenti imparati, ' + count(recipes(data.alias).length) + ' ricette dei clienti' + (data.profile ? ', più il tracciato del file' : '') + '. Prende il posto di quello che c\'è adesso in archivio.' }),
    el('div', { className: 'row' }, go, no));
  no.addEventListener('click', () => { m.textContent = ''; m.hidden = true; });
  go.addEventListener('click', async () => {
    go.disabled = true;
    const { profile, ...archive } = data;
    S.arch = archive as Archive;
    if (profile) { S.profile = profile; saveProfile(); syncOpts(); renderCols(); renderTemplateInfo(); }
    m.textContent = ''; m.hidden = true;
    useArchive();
    try { await platform().store.saveAll(S.arch, savingBlock); archStatus('Archivi ripristinati dalla copia.', 'ok'); }
    catch (err) {
      archStatus(errorCode(err) === 'quota_exceeded' ? 'Archivi ripristinati, ma sono troppo grandi per essere salvati qui: valgono fino alla chiusura.'
        : 'Archivi ripristinati, ma non sono riuscito a salvarli: valgono fino alla chiusura.', 'warn');
    }
  });
}

/** Legge gli archivi salvati, all'avvio. */
export async function loadArchives(): Promise<void> {
  const store = platform().store;
  try {
    const mode = await store.init();
    $('archMode').textContent = STORE_NOTE[mode];
    S.arch = await store.load();
    S.archReady = true;
    useArchive();
    if (store.migrated()) store.saveAll(S.arch).catch(() => { /* si riproverà al prossimo salvataggio */ });
  } catch {
    S.archReady = true; renderArchInfo(); refresh();
    $('archChip').dataset.state = 'err'; $('archChipText').textContent = $('archChipShort').textContent = 'Archivio non disponibile';
    archStatus('Non riesco a leggere gli archivi salvati in questo momento. Puoi ricaricarli dal file.', 'warn');
  }
}

export function wireArchive(): void {
  const pick = (kind: Kind) => () => { pendingKind = kind; input('archFile').click(); };
  $('btnArt').addEventListener('click', pick('art'));
  $('btnCli').addEventListener('click', pick('cli'));
  $('btnMan').addEventListener('click', pick('man'));
  $('btnAliasClear').addEventListener('click', () => {
    const b = button('btnAliasClear');
    if (!clearArmed) { clearArmed = true; b.textContent = 'Conferma: azzera'; setTimeout(() => { clearArmed = false; b.textContent = 'Azzera'; }, 4000); return; }
    clearArmed = false; b.textContent = 'Azzera';
    clearLearned(S.arch.alias, 'alias'); saveAliasSoon(); renderArchInfo(); archStatus('Abbinamenti imparati azzerati. Le ricette dei clienti restano.', '');
  });
  input('archFile').addEventListener('change', () => {
    const field = input('archFile'), file = field.files && field.files[0];
    field.value = '';
    if (file) void chosenArchiveFile(file);
  });
  window.addEventListener('pagehide', flushAlias);
  $('btnBackup').addEventListener('click', () => { void saveBackup(); });
  $('btnRestore').addEventListener('click', () => input('backupFile').click());
  input('backupFile').addEventListener('change', () => {
    const field = input('backupFile'), file = field.files && field.files[0];
    field.value = '';
    if (file) void chosenBackupFile(file);
  });
}
