/*
 * Ordine Rapido - interfaccia: il pannello Impostazioni. Chi legge gli ordini (questo dispositivo, un servizio di
 * intelligenza artificiale a scelta tra Claude, Gemini e GPT con la propria chiave e il proprio modello, oppure i due
 * insieme), il modello del gestionale e il tracciato del file (colonne, separatore, formato dei numeri).
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { PROVIDERS, isProviderId, keyLooksValid } from '../ia/indice.ts';
import type { ProviderId } from '../ia/indice.ts';
import { FIELD_EMPTY, FIELD_FIXED, analyzeTemplate, profileFromTemplate } from '../core/modello.ts';
import type { TemplateAnalysis } from '../core/modello.ts';
import { fmtDate } from '../core/numeri.ts';
import { COLS, colDef, defaultProfile, isFixed } from '../core/tracciato.ts';
import { AppError, errorCode } from '../core/tipi.ts';
import type { Profile } from '../core/tipi.ts';
import type { KeyOutcome } from '../piattaforma/tipi.ts';
import { $, button, el, find, input, openDlg, select, status } from './dom.ts';
import { readStatus } from './lettura.ts';
import { saveProfile, saveUi } from './preferenze.ts';
import { refresh } from './righe.ts';
import { paintSetup } from './schermate.ts';
import { S, platform, readerMode } from './stato.ts';
import { tableFromFile } from './tabelle.ts';

/* ---------- Chi legge gli ordini ---------- */
function aiStatus(text: string, level?: string): void { status('aiStatus', text, level); }

/** Che cosa dire quando una chiave non va: il nome del servizio e dell'azienda cambiano. */
function aiError(code: string, id: ProviderId): string {
  const p = PROVIDERS[id], where = id === 'anthropic' ? 'dalla Console di Anthropic' : id === 'gemini' ? 'da Google AI Studio' : 'dalla piattaforma di OpenAI';
  const m: Readonly<Record<string, string>> = {
    bad_key: 'La chiave non è valida o è stata revocata. Copiala di nuovo ' + where + '.',
    bad_key_format: 'La chiave contiene spazi o caratteri non validi. Copiala di nuovo ' + where + '.',
    no_permission: 'Questa chiave non ha i permessi necessari.',
    billing: 'L\'account ' + p.company + ' collegato alla chiave non ha credito, ha esaurito la quota o ha un problema di pagamento.',
    rate_limited: 'Troppe richieste o limite di spesa raggiunto. Riprova tra qualche minuto.',
    offline: 'Non riesco a contattare ' + p.company + '. Controlla la connessione a internet e riprova.',
    overloaded: 'Il servizio di ' + p.company + ' non risponde in questo momento. Riprova tra poco.'
  };
  return m[code] || '';
}
const KEY_MSG: Readonly<Record<KeyOutcome, string>> = {
  session: 'Chiave valida. Resta attiva fino alla chiusura dell\'app.',
  saved: 'Chiave valida, salvata su questo dispositivo.',
  encrypted: 'Chiave valida, salvata su questo dispositivo e cifrata dal sistema.',
  unsaved: 'Chiave valida, ma qui non si può salvare: vale fino alla chiusura dell\'app.',
  no_keyring: 'Chiave valida, ma questo sistema non offre un portachiavi per cifrarla: non viene scritta su disco e vale fino alla chiusura dell\'app.'
};
const MODE_NOTE: Readonly<Record<string, string>> = {
  local: 'Niente esce da questo dispositivo. Se un ordine non si riesce a leggere, l\'app lo dice e propone l\'intelligenza artificiale.',
  auto: 'Legge sul dispositivo; se la lettura è incompleta (righe senza quantità, articoli non trovati, scrittura a mano) chiede al servizio scelto e tiene il risultato migliore.',
  ai: 'Ogni ordine viene inviato al servizio scelto.'
};

/** Il servizio mostrato nel pannello: quello scelto per leggere. */
function shownProvider(): ProviderId { return platform().ai.state().provider; }

export function renderAi(): void {
  const ai = platform().ai, st = ai.state(), mode = readerMode(), id = st.provider, ps = st.providers[id], p = PROVIDERS[id];
  const anyKey = ai.available.some(x => st.providers[x].hasKey);
  select('ai-mode').value = mode;
  const missing = mode !== 'local' && ai.needsKey && !ps.hasKey;
  status('aiModeNote', missing ? 'Per far leggere a ' + p.name + ' salva qui sotto la tua chiave API: finché manca, legge questo dispositivo.' : (ai.needsKey ? MODE_NOTE[mode] || '' : ''), missing ? 'warn' : '');
  $('aiClaude').hidden = ai.needsKey; $('aiOwn').hidden = !ai.needsKey;
  $('keyNote').hidden = !ai.needsKey || anyKey;
  if (!ai.needsKey) return;
  const ps2 = select('ai-provider');
  if (!ps2.options.length) for (const x of ai.available) ps2.append(el('option', { value: x, text: PROVIDERS[x].name + ' (' + PROVIDERS[x].company + ')' }));
  ps2.value = id;
  $('aiKeys').textContent = 'Chiavi salvate: ' + ai.available.map(x => PROVIDERS[x].name + (st.providers[x].hasKey ? ' ✓' : ' –')).join(' · ');
  $('ai-key-label').textContent = 'Chiave API di ' + p.company;
  for (const a of Array.from(document.querySelectorAll<HTMLElement>('.keylink'))) a.hidden = a.dataset.provider !== id;
  const key = input('ai-key');
  key.value = ps.keyText;
  /* Nell'app desktop la chiave salvata non torna nella pagina: se ne mostrano solo gli ultimi caratteri. */
  key.placeholder = ps.hasKey && !ps.keyText ? 'Chiave salvata (termina con ' + ps.keyHint + ')' : p.keyStart + '…';
  input('ai-remember').checked = st.remember;
  const sel = select('ai-model'), seen: Record<string, 1> = {};
  sel.textContent = '';
  for (const m of (ps.models.length ? ps.models : p.models)) {
    if (seen[m[0]]) continue;
    seen[m[0]] = 1; sel.append(el('option', { value: m[0], text: String(m[1] || m[0]) + (p.hints[m[0]] || '') }));
  }
  if (ps.model && !seen[ps.model]) sel.append(el('option', { value: ps.model, text: ps.model }));
  sel.value = ps.model;
  $('btnAiForget').hidden = !ps.hasKey;
}

export function openSettings(focusId: string): void {
  openDlg('setDlg');
  const n = find(focusId);
  if (n) { n.scrollIntoView({ block: 'start' }); n.focus({ preventScroll: true }); }
}

async function saveKey(): Promise<void> {
  const ai = platform().ai, id = shownProvider(), ps = ai.state().providers[id], key = input('ai-key').value.trim();
  const reuse = !key && ps.hasKey && !ps.keyText;
  if (!key && !reuse) { aiStatus('Incolla la tua chiave API di ' + PROVIDERS[id].company + '.', 'warn'); $('ai-key').focus(); return; }
  if (key && !keyLooksValid(key)) { aiStatus(aiError('bad_key_format', id), 'bad'); return; }
  const b = button('btnAiSave');
  b.disabled = true; aiStatus('Verifico la chiave con ' + PROVIDERS[id].company + '…', '');
  try {
    /* l'elenco dei modelli non consuma credito: serve a provare la chiave e a proporre i modelli disponibili */
    const out = await ai.verify(id, key, input('ai-remember').checked);
    /* chi salva una chiave vuole usarla: se leggeva solo il dispositivo, si passa all'automatico */
    if (S.readerChoice === 'local') S.readerChoice = 'auto';
    saveUi(); renderAi(); readStatus('', '');
    aiStatus(KEY_MSG[out] + ' Modello: ' + (select('ai-model').selectedOptions[0] || { textContent: '' }).textContent + '.', out === 'unsaved' || out === 'no_keyring' ? 'warn' : 'ok');
  } catch (e) {
    const detail = e instanceof AppError ? e.detail : '';
    aiStatus(aiError(errorCode(e), id) || ('Verifica non riuscita.' + (detail ? ' Dettaglio: ' + detail : '')), 'bad');
  } finally { b.disabled = false; }
}

/* ---------- Modello del gestionale ---------- */
/** Un modello letto ma non ancora in uso: aspetta che si confermi che cosa va in ogni colonna. */
let tpl: { name: string; a: TemplateAnalysis } | null = null;
let clearArmed = false;
function tplStatus(text: string, level?: string): void { status('tplStatus', text, level); }

const SEP_NAME: Readonly<Record<string, string>> = { ';': 'punto e virgola', ',': 'virgola', '\t': 'tabulazione', '|': 'barra verticale' };
function describe(a: TemplateAnalysis): string {
  const parts = a.format === 'xlsx' ? ['File Excel'] : ['File CSV', 'separatore: ' + (SEP_NAME[a.sep] || a.sep), 'codifica ' + (a.enc === 'utf8' ? 'UTF-8' : 'Windows')];
  if (a.samples) {
    if (a.format !== 'xlsx') parts.push('decimali con ' + (a.dec === '.' ? 'il punto' : 'la virgola'));
    parts.push('date come ' + fmtDate('2026-11-27', a.date));
  }
  return parts.join(' · ') + '.' + (a.samples ? '' : ' Il modello non ha righe compilate: il formato di numeri e date resta quello impostato qui sotto.');
}
const isField = (f: string) => f !== FIELD_FIXED && f !== FIELD_EMPTY;

export function renderTemplateInfo(): void {
  const p = S.profile, n = p.cols.filter(c => c.on).length;
  $('tplInfo').textContent = p.template ? p.template + ', ' + n + ' colonne' : 'non caricato';
  $('btnTpl').textContent = p.template ? 'Cambia modello' : 'Carica il modello';
  $('btnTplClear').hidden = !p.template;
  paintSetup();
}

/** Mette in uso un tracciato appena cambiato: lo salva e ridisegna tutto ciò che ne dipende. */
function applyProfile(): void { saveProfile(); syncOpts(); renderCols(); renderTemplateInfo(); refresh(); }

/** Il riquadro in cui, per ogni colonna del modello, si conferma che cosa deve contenere. */
function renderTplMap(focus?: string): void {
  const m = $('tplMap'); m.textContent = ''; m.hidden = !tpl;
  if (!tpl) return;
  const T = tpl, a = T.a;
  m.append(el('strong', { text: 'Modello: ' + T.name }), el('p', { className: 'status', text: describe(a) }));
  m.append(el('p', { className: 'how', text: a.recognized
    ? 'Ho riconosciuto dal nome ' + a.recognized + ' colonne su ' + a.columns.length + '. Controlla, e per le altre scegli che cosa devono contenere.'
    : 'Non ho riconosciuto nessuna colonna dal nome: controlla che la prima riga del file contenga i nomi delle colonne, poi scegli per ognuna che cosa deve contenere.' }));
  const list = el('div', { className: 'tplcols' });
  a.columns.forEach((c, k) => {
    const sel = el('select', { id: 'tpl-f-' + k });
    sel.setAttribute('aria-label', 'Contenuto della colonna ' + (c.header || String(k + 1)));
    const gr = el('optgroup', { label: 'Dati della riga' }), gt = el('optgroup', { label: 'Dati dell\'ordine' }), gx = el('optgroup', { label: 'Altro' });
    for (const d of COLS) (d.g === 'r' ? gr : gt).append(el('option', { value: d.id, text: d.label }));
    gx.append(el('option', { value: FIELD_FIXED, text: 'Sempre lo stesso valore' }), el('option', { value: FIELD_EMPTY, text: 'Lascia vuota' }));
    sel.append(gr, gt, gx); sel.value = c.field;
    const val = el('input', { type: 'text', id: 'tpl-v-' + k, value: c.value, placeholder: 'valore', hidden: c.field !== FIELD_FIXED });
    val.setAttribute('aria-label', 'Valore fisso per la colonna ' + (c.header || String(k + 1)));
    val.addEventListener('input', () => { c.value = val.value; });
    sel.addEventListener('change', () => {
      c.field = sel.value;
      /* un dato dell'app va in una colonna sola: se era già altrove, quella colonna resta vuota */
      if (isField(c.field)) a.columns.forEach((o, j) => { if (j !== k && o.field === c.field) o.field = FIELD_EMPTY; });
      if (c.field === FIELD_FIXED && !c.value) c.value = c.sample;
      renderTplMap('tpl-f-' + k);
    });
    const name = el('div', { className: 'tc-name' }, el('b', { text: c.header || '(senza nome)' }), c.sample ? el('span', { text: 'es. ' + c.sample.slice(0, 30) }) : null);
    list.append(el('div', { className: 'tc' + (c.field === FIELD_EMPTY ? ' off' : '') }, name, sel, val));
  });
  m.append(list);
  const use = el('button', { type: 'button', className: 'primary', id: 'btnTplUse', text: 'Usa questo modello' }), cancel = el('button', { type: 'button', text: 'Annulla' });
  cancel.addEventListener('click', () => { tpl = null; renderTplMap(); tplStatus('', ''); });
  use.addEventListener('click', () => {
    if (!a.columns.some(c => isField(c.field))) { tplStatus('Scegli almeno una colonna che contenga un dato dell\'ordine, per esempio il codice articolo.', 'warn'); return; }
    /* quello che il modello non dice resta com'era: numeri e date senza righe di esempio, separatore e codifica per un Excel */
    if (!a.samples) { a.dec = S.profile.dec; a.date = S.profile.date; }
    if (a.format === 'xlsx') { a.sep = S.profile.sep; a.enc = S.profile.enc; }
    S.profile = profileFromTemplate(a, S.profile, T.name);
    tpl = null; renderTplMap(); applyProfile();
    tplStatus('Modello in uso: il file esportato avrà le stesse ' + a.columns.length + ' colonne di ' + T.name + ', nello stesso ordine.', 'ok');
  });
  m.append(el('div', { className: 'row' }, use, cancel));
  const f = focus ? find(focus) : null;
  if (f) f.focus();
}

async function chosenTemplate(file: File): Promise<void> {
  tplStatus('Leggo ' + file.name + '…', '');
  try {
    const t = await tableFromFile(file), a = analyzeTemplate(t.rows, { sep: t.sep, enc: t.enc, format: t.format });
    if (!a.columns.length) { tpl = null; renderTplMap(); tplStatus('Il file è vuoto: serve almeno la riga con i nomi delle colonne.', 'bad'); return; }
    tpl = { name: file.name, a }; tplStatus('', ''); renderTplMap();
    $('tplMap').scrollIntoView({ block: 'nearest' });
  } catch (err) {
    tplStatus(errorCode(err) === 'local' && err instanceof Error ? err.message : 'Non riesco a leggere questo file. Usa un CSV o un Excel esportato dal gestionale.', 'bad');
  }
}
/** Apre le impostazioni sul modello del gestionale e chiede subito il file. */
export function pickTemplate(): void { openSettings('hTrac'); input('tplFile').click(); }

/* ---------- Tracciato del file ---------- */
type TextOption = 'format' | 'sep' | 'dec' | 'date' | 'enc' | 'um' | 'omaggi' | 'descSrc';
type CheckOption = 'header' | 'allowUnlinked';
const TEXT_OPTIONS: readonly TextOption[] = ['format', 'sep', 'dec', 'date', 'enc', 'um', 'omaggi', 'descSrc'];
const CHECK_OPTIONS: readonly CheckOption[] = ['header', 'allowUnlinked'];
type Field = HTMLInputElement | HTMLSelectElement;

/** Riporta nei campi il tracciato in uso. Separatore, codifica e decimali valgono solo per un file di testo. */
export function syncOpts(): void {
  const p: Profile = S.profile, xlsx = p.format === 'xlsx';
  for (const k of TEXT_OPTIONS) $<Field>('p-' + k).value = p[k];
  for (const k of CHECK_OPTIONS) input('p-' + k).checked = !!p[k];
  for (const k of ['sep', 'enc', 'dec']) { const box = $('p-' + k).parentElement; if (box) box.hidden = xlsx; }
}

export function renderCols(): void {
  const ul = $('cols'); ul.textContent = '';
  S.profile.cols.forEach((c, i) => {
    const def = colDef(c.id);
    if (!def) return;
    const fixed = isFixed(c.id), what = fixed ? 'colonna a valore fisso ' + (c.header || String(i + 1)) : def.label;
    const li = el('li', { className: (c.on ? '' : 'off') + (fixed ? ' fix' : '') });
    const chk = el('input', { type: 'checkbox', id: 'c-on-' + c.id, checked: c.on });
    chk.addEventListener('change', () => { c.on = chk.checked; li.classList.toggle('off', !c.on); saveProfile(); refresh(); });
    let name: HTMLElement;
    if (fixed) {
      /* una colonna che il gestionale vuole ma che l'app non conosce: si scrive sempre lo stesso valore, anche vuoto */
      const val = el('input', { type: 'text', id: 'c-val-' + c.id, value: c.value || '', placeholder: 'valore fisso (vuoto)' });
      val.setAttribute('aria-label', 'Valore della ' + what);
      val.addEventListener('input', () => { c.value = val.value; saveProfile(); refresh(); });
      chk.setAttribute('aria-label', 'Includi la ' + what);
      name = el('span', { className: 'nm' }, val);
    } else {
      const lb = el('label', { className: 'nm', text: def.label }); lb.htmlFor = 'c-on-' + c.id;
      name = lb;
    }
    const hd = el('input', { type: 'text', id: 'c-hd-' + c.id, value: c.header });
    hd.setAttribute('aria-label', 'Nome colonna per ' + what);
    hd.addEventListener('input', () => { c.header = hd.value; saveProfile(); refresh(); });
    const up = el('button', { type: 'button', className: 'mini', text: '↑', disabled: i === 0 });
    up.setAttribute('aria-label', 'Sposta prima: ' + what);
    up.addEventListener('click', () => move(i, -1));
    const dn = el('button', { type: 'button', className: 'mini', text: '↓', disabled: i === S.profile.cols.length - 1 });
    dn.setAttribute('aria-label', 'Sposta dopo: ' + what);
    dn.addEventListener('click', () => move(i, 1));
    li.append(chk, name, hd, up, dn); ul.append(li);
  });
}
function move(i: number, d: number): void {
  const cols = S.profile.cols, j = i + d, a = cols[i], b = cols[j];
  if (j < 0 || j >= cols.length || !a || !b) return;
  cols[i] = b; cols[j] = a;
  saveProfile(); renderCols(); refresh();
}
/** «Solo righe» mette le colonne di riga per prime e spegne quelle di testata; «Testata + righe» fa il contrario. */
function preset(full: boolean): void {
  const base = defaultProfile().cols, byId: Record<string, string> = {};
  for (const c of S.profile.cols) byId[c.id] = c.header;
  const group = (g: 'r' | 't') => base.filter(c => { const def = colDef(c.id); return !!def && def.g === g; });
  const t = group('t'), r = group('r');
  for (const c of t) c.on = full;
  S.profile.cols = (full ? t.concat(r) : r.concat(t)).map(c => ({ id: c.id, on: c.on, header: byId[c.id] || c.header }));
  /* le colonne non sono più quelle del modello caricato */
  S.profile.template = '';
  applyProfile();
}

export function wireSettings(): void {
  $('btnAiSave').addEventListener('click', () => { void saveKey(); });
  $('btnAiForget').addEventListener('click', async () => {
    const id = shownProvider();
    try { await platform().ai.forget(id); } catch { /* resta com'era: il pannello mostra lo stato reale */ }
    renderAi();
    aiStatus('Chiave di ' + PROVIDERS[id].company + ' rimossa da questo dispositivo.', '');
  });
  $('ai-mode').addEventListener('change', () => { const v = select('ai-mode').value; S.readerChoice = v === 'ai' || v === 'auto' ? v : 'local'; saveUi(); renderAi(); readStatus('', ''); });
  $('ai-provider').addEventListener('change', () => {
    const v = select('ai-provider').value;
    if (isProviderId(v)) platform().ai.setProvider(v);
    input('ai-key').value = ''; input('ai-key').type = 'password'; $('ai-show').textContent = 'Mostra';
    aiStatus('', ''); renderAi(); readStatus('', '');
  });
  $('ai-model').addEventListener('change', () => platform().ai.setModel(shownProvider(), select('ai-model').value));
  $('ai-remember').addEventListener('change', () => { platform().ai.setRemember(input('ai-remember').checked).catch(() => { /* vale la scelta fatta al prossimo salvataggio */ }); });
  $('ai-show').addEventListener('click', () => {
    const k = input('ai-key'), on = k.type === 'password';
    k.type = on ? 'text' : 'password'; $('ai-show').textContent = on ? 'Nascondi' : 'Mostra'; $('ai-show').setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  $('btnKeyNote').addEventListener('click', () => openSettings('ai-key'));
  $('btnSet2').addEventListener('click', () => openSettings('hTrac'));

  $('btnTpl').addEventListener('click', () => input('tplFile').click());
  input('tplFile').addEventListener('change', () => {
    const field = input('tplFile'), file = field.files && field.files[0];
    field.value = '';
    if (file) void chosenTemplate(file);
  });
  $('btnTplClear').addEventListener('click', () => {
    const b = button('btnTplClear');
    if (!clearArmed) { clearArmed = true; b.textContent = 'Conferma: togli'; setTimeout(() => { clearArmed = false; b.textContent = 'Togli'; }, 4000); return; }
    clearArmed = false; b.textContent = 'Togli';
    /* si torna alle colonne predefinite; restano le scelte che non dipendono dal modello */
    const p = S.profile;
    S.profile = { ...defaultProfile(), um: p.um, omaggi: p.omaggi, descSrc: p.descSrc, allowUnlinked: p.allowUnlinked };
    applyProfile(); tplStatus('Modello tolto: valgono le colonne predefinite.', '');
  });

  for (const k of TEXT_OPTIONS) {
    const field = $<Field>('p-' + k);
    field.addEventListener('input', () => { S.profile[k] = field.value; saveProfile(); if (k === 'format') syncOpts(); refresh(); });
  }
  for (const k of CHECK_OPTIONS) {
    const field = input('p-' + k);
    field.addEventListener('change', () => { S.profile[k] = field.checked; saveProfile(); refresh(); });
  }
  $('btnPresetRows').addEventListener('click', () => preset(false));
  $('btnPresetFull').addEventListener('click', () => preset(true));
}
