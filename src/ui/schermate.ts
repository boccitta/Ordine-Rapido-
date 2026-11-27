/*
 * Ordine Rapido - interfaccia: le tre schermate (Carica, Controlla, Esporta), i passaggi in alto,
 * i riquadri riassuntivi, i pannelli e il tema chiaro o scuro.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { round, show as showNum } from '../core/numeri.ts';
import type { Totals } from '../core/ordine.ts';
import type { Check, RowText } from '../core/tipi.ts';
import { $, button, count, el, find, icon, money, openDlg, status, wireDlg } from './dom.ts';
import { expStatus, paintExport } from './esporta.ts';
import { pickTemplate } from './impostazioni.ts';
import { addFiles, readStatus, renderFiles } from './lettura.ts';
import { saveUi } from './preferenze.ts';
import { setOrder } from './righe.ts';
import { EX_NOTES, S, emptyOrder, exampleOrder } from './stato.ts';
import type { Stage, View } from './stato.ts';
import { paintHead } from './testata.ts';

const VIEWS: readonly View[] = ['carica', 'controlla', 'esporta'];
const FOCUS: Record<View, string> = { carica: 'h1a', controlla: 'h2a', esporta: 'h3a' };
let freshT: ReturnType<typeof setTimeout> | undefined;

export function rowStatus(text: string, level?: string): void { status('rowStatus', text, level); }

/* Tema: segue quello di chi guarda, finché non lo scegli con il pulsante in alto. */
export function applySkin(): void {
  const root = document.documentElement, t = root.dataset.theme;
  const eff = S.skinChoice || (t === 'dark' || t === 'light' ? t : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  root.dataset.skin = eff;
  const b = $('btnTheme'), lab = eff === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro';
  b.textContent = ''; b.append(icon(eff === 'dark' ? 'sun' : 'moon')); b.setAttribute('aria-label', lab); b.title = lab;
}

/* Schermate e passaggi in alto */
export function paint(): void {
  const has = S.stage !== 'none', k = VIEWS.indexOf(S.view);
  VIEWS.forEach((_v, i) => {
    $('v' + (i + 1)).hidden = i !== k;
    const bar = document.querySelector<HTMLElement>('.actions [data-for="' + (i + 1) + '"]');
    if (bar) bar.hidden = i !== k;
  });
  document.body.dataset.view = S.view; document.body.dataset.stage = S.stage;
  const st = [k === 0 ? 'now' : 'done', k === 1 ? 'now' : (k === 2 || S.exported ? 'done' : 'todo'), S.exported ? 'done' : (k === 2 ? 'now' : 'todo')];
  [1, 2, 3].forEach(i => {
    const b = $('rail' + i), n = b.querySelector('.n'), state = st[i - 1] || 'todo';
    if (b.parentElement) b.parentElement.dataset.state = state;
    if (n) { n.textContent = ''; if (state === 'done') n.append(icon('check')); else n.textContent = String(i); }
    if (i - 1 === k) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  button('rail2').disabled = button('rail3').disabled = !has;
  const s = $('rail2s');
  s.textContent = has && S.issues ? String(S.issues) : ''; s.className = 's' + (S.bads ? ' bad' : '');
  s.title = S.issues === 1 ? '1 cosa da verificare' : S.issues + ' cose da verificare';
  $('openNote').hidden = !(has && k === 0);
  const si = $('srcInfo'); si.textContent = '';
  if (S.stage === 'order') si.append(icon(S.src ? 'file' : 'edit'), el('span', { text: S.src || 'Scritto a mano' }));
  paintExport();
}

export function show(v: View, focusId?: string): void {
  S.view = v; paintHead(); paint(); $('main').scrollTop = 0;
  const f = find(focusId || FOCUS[v]);
  if (f) f.focus({ preventScroll: true });
}

/* Controlli: prima quello che non va, in un riquadro solo; quello che è a posto resta una riga discreta. */
export function paintUi(list: readonly Check[], t: Totals): void {
  const ul = $('checks'), oks = $('oks'), byK: Record<string, Check> = {};
  ul.textContent = ''; oks.textContent = ''; S.issues = 0; S.bads = 0;
  for (const c of list) {
    if (c.k) byK[c.k] = c;
    if (c.level === 'bad' || c.level === 'warn') {
      S.issues++; if (c.level === 'bad') S.bads++;
      const li = el('li', { className: c.level }, icon(c.level === 'bad' ? 'x' : 'alert'), el('span', { text: c.text }));
      ul.append(li);
      if (c.k === 'noarch') {
        const lb = el('button', { type: 'button', className: 'link', text: 'Carica l\'archivio' });
        lb.addEventListener('click', () => openDlg('archDlg'));
        li.append(lb);
      }
    }
    else if (c.level === 'ok' && !c.k) oks.append(el('span', null, icon('check'), c.text));
  }
  ul.hidden = !S.issues; $('notesCap').hidden = !S.notes.length; $('issues').hidden = !S.issues && !S.notes.length;
  const v = $('verdict');
  v.textContent = ''; v.className = 'verdict ' + (S.bads ? 'bad' : S.issues ? 'warn' : 'ok');
  v.append(icon(S.bads ? 'x' : S.issues ? 'alert' : 'ok'), S.issues ? S.issues + (S.bads ? ' da sistemare' : ' da verificare') : 'Tutto a posto');
  $('t-righe').textContent = String(t.righe); $('t-colli').textContent = showNum(t.colli, 'qty'); $('t-pezzi').textContent = showNum(t.pezzi, 'qty');
  $('t-merce').textContent = money(round(t.merce, 2)) + ' €';
  $('t-gifts').textContent = t.omaggi ? 'di cui ' + t.omaggi + ' omaggio' : '';
  /* accanto a ogni totale, il confronto con quello scritto sul documento del cliente */
  const compare = [['imp', 'tile-merce', 'tot_imponibile'], ['colli', 'tile-colli', 'tot_colli'], ['pezzi', 'tile-pezzi', 'tot_pezzi']] as const;
  for (const [key, tileId, field] of compare) {
    const c = byK[key], tile = $(tileId), box = $('c-' + key), okk = !!c && c.level === 'ok', bad = !!c && c.level === 'bad';
    tile.classList.toggle('ok', okk); tile.classList.toggle('bad', bad); box.textContent = '';
    if (okk) box.append(icon('check'), 'come sul documento'); else if (bad) box.append(icon('x'), 'sul documento ' + String(S.order[field]).trim());
  }
  $('rowsN').textContent = t.righe ? '(' + t.righe + ')' : '';
  paintHead(); paintCols(); paint();
}

/* Le colonne facoltative restano nascoste finché sono vuote. */
const OPT_COLS: readonly RowText[] = ['sc2', 'sc3', 'cod_cliente', 'ean', 'nota'];
export function paintCols(): void {
  const t = $('rowsTable'), act = document.activeElement, cell = act && act.closest ? act.closest('td') : null;
  let hidden = 0;
  for (const k of OPT_COLS) {
    const used = S.order.righe.some(r => String(r[k] || '').trim() !== '');
    const keep = S.allCols || used || !!(cell && cell.classList.contains('c-' + k));
    t.classList.toggle('no-' + k, !keep); if (!keep) hidden++;
  }
  const b = $('btnCols');
  b.hidden = !S.allCols && !hidden;
  b.textContent = S.allCols ? 'Nascondi le colonne vuote' : 'Mostra le colonne vuote (' + hidden + ')'; b.setAttribute('aria-pressed', S.allCols ? 'true' : 'false');
}

/** Il pulsante in alto che dice quanti articoli e clienti ci sono in archivio. */
export function paintChip(): void {
  const chip = $('archChip'), a = S.arch.art.length, c = S.arch.cli.length;
  if (!S.archReady) { chip.dataset.state = 'load'; $('archChipText').textContent = $('archChipShort').textContent = 'Archivio'; return; }
  const mn = S.arch.man.length;
  chip.dataset.state = a ? 'ok' : 'todo';
  chip.setAttribute('aria-label', a ? 'Archivio del gestionale: ' + count(a) + ' articoli' + (c ? ', ' + count(c) + ' clienti' : '') + (mn ? ', ' + count(mn) + ' mandanti' : '') : 'Archivio del gestionale: da caricare');
  $('archChipText').textContent = a ? 'Archivio: ' + count(a) + (a === 1 ? ' articolo' : ' articoli') + (c ? ', ' + count(c) + (c === 1 ? ' cliente' : ' clienti') : '') : 'Carica l\'archivio';
  $('archChipShort').textContent = a ? count(a) + (a === 1 ? ' articolo' : ' articoli') : 'Carica l\'archivio';
}

/**
 * I due passaggi «per cominciare» nella schermata Carica: il modello del gestionale e l'archivio.
 * Spariscono da soli quando sono fatti entrambi, oppure quando si sceglie di nasconderli.
 */
export function paintSetup(): void {
  const tplName = S.profile.template, arts = S.arch.art.length;
  $('setup').hidden = S.setupHidden || !S.archReady || (!!tplName && arts > 0);
  $('suTpl').dataset.state = tplName ? 'done' : 'todo';
  $('suTplT').textContent = tplName ? 'In uso: ' + tplName : 'Un file di esempio nel formato che il gestionale importa: così l\'app sa come compilarlo.';
  $('btnSuTpl').textContent = tplName ? 'Cambia' : 'Carica il modello';
  $('suArch').dataset.state = arts ? 'done' : 'todo';
  $('suArchT').textContent = arts ? count(arts) + (arts === 1 ? ' articolo caricato' : ' articoli caricati') : 'Articoli, clienti e mandanti esportati dal gestionale: nel file finiscono solo codici che esistono.';
  $('btnSuArch').textContent = arts ? 'Apri' : 'Carica l\'archivio';
  for (const id of ['suTpl', 'suArch']) {
    const n = $(id).querySelector('.n');
    if (n) { n.textContent = ''; if ($(id).dataset.state === 'done') n.append(icon('check')); else n.textContent = id === 'suTpl' ? '1' : '2'; }
  }
}

export function didExport(): void { S.exported = true; paint(); }
/** Evidenzia per un attimo le righe appena lette. */
export function freshRows(): void {
  const tb = $('tbody');
  tb.classList.add('fresh'); clearTimeout(freshT);
  freshT = setTimeout(() => tb.classList.remove('fresh'), 1200);
}
export function openOrder(kind: Stage, name: string): void { S.src = name || ''; S.stage = kind; S.exported = false; rowStatus('', ''); }

function howMode(rows: boolean): void {
  $('howFile').setAttribute('aria-pressed', rows ? 'false' : 'true'); $('howRows').setAttribute('aria-pressed', rows ? 'true' : 'false');
  $('howFileList').hidden = rows; $('howRowsList').hidden = !rows;
}

function dragHasFiles(e: DragEvent): boolean {
  const t = e.dataTransfer && e.dataTransfer.types;
  return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0;
}

/** Collega passaggi, pulsanti in basso, pannelli e tema. */
export function wireScreens(): void {
  $('btnTheme').addEventListener('click', () => { S.skinChoice = document.documentElement.dataset.skin === 'dark' ? 'light' : 'dark'; saveUi(); applySkin(); });
  try { new MutationObserver(() => { if (!S.skinChoice) applySkin(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch { /* non disponibile: il tema si aggiorna alla riapertura */ }
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!S.skinChoice) applySkin(); }); } catch { /* come sopra */ }

  $('rail1').addEventListener('click', () => show('carica'));
  $('rail2').addEventListener('click', () => show('controlla'));
  $('rail3').addEventListener('click', () => show('esporta'));
  $('btnBack1').addEventListener('click', () => show('carica'));
  $('btnResume').addEventListener('click', () => show('controlla'));
  $('btnNext').addEventListener('click', () => show('esporta'));
  $('btnBack2').addEventListener('click', () => show('controlla'));
  $('btnFix').addEventListener('click', () => show('controlla'));

  $('btnExample').addEventListener('click', () => { S.headEdit = false; setOrder(exampleOrder(), true, EX_NOTES.slice()); openOrder('example', ''); show('controlla'); });
  $('btnManual').addEventListener('click', () => { S.headEdit = true; setOrder(emptyOrder(), false, []); openOrder('order', ''); show('controlla', 'h-mandante'); });
  $('btnNew').addEventListener('click', () => {
    S.files = []; renderFiles(); $<HTMLTextAreaElement>('msg').value = ''; readStatus('', ''); expStatus('', '');
    for (const u of S.previews) URL.revokeObjectURL(u);
    S.previews = []; $('origBox').hidden = true; $('orig').textContent = '';
    S.guardShown = false;
    setOrder(emptyOrder(), false, []);
    openOrder('none', ''); S.headEdit = false; show('carica', 'btnPick');
  });
  $('btnCols').addEventListener('click', () => { S.allCols = !S.allCols; saveUi(); paintCols(); });
  $('btnSuTpl').addEventListener('click', pickTemplate);
  $('btnSuArch').addEventListener('click', () => openDlg('archDlg'));
  $('btnSuHide').addEventListener('click', () => { S.setupHidden = true; saveUi(); paintSetup(); $('btnPick').focus(); });

  wireDlg('archDlg', 'archClose', 'archChip'); wireDlg('setDlg', 'setClose', 'btnSet'); wireDlg('origDlg', 'origClose', 'origBox');
  $('archChip').addEventListener('click', () => openDlg('archDlg'));
  $('btnSet').addEventListener('click', () => openDlg('setDlg'));
  $('origBox').addEventListener('click', () => openDlg('origDlg'));
  $('howFile').addEventListener('click', () => howMode(false));
  $('howRows').addEventListener('click', () => howMode(true));

  /* Un file lasciato cadere fuori dal riquadro non deve aprirsi al posto dell'app: finisce tra i file dell'ordine. */
  window.addEventListener('dragover', e => { if (dragHasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    if ((e.target instanceof Node && $('drop').contains(e.target)) || document.querySelector('dialog[open]')) return;
    if (e.dataTransfer) addFiles(e.dataTransfer.files);
    show('carica', 'btnRead');
  });
}
