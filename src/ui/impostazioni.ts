/*
 * Ordine Rapido - interfaccia: il pannello Impostazioni. Lettura automatica (chiave API e modello)
 * e tracciato del file (colonne, separatore, formato dei numeri).
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { MODELS, MODEL_HINT, keyLooksValid } from '../anthropic/protocollo.ts';
import { colDef, defaultProfile } from '../core/tracciato.ts';
import { AppError, errorCode } from '../core/tipi.ts';
import type { Profile } from '../core/tipi.ts';
import type { KeyOutcome } from '../piattaforma/tipi.ts';
import { $, button, el, find, input, openDlg, select, status } from './dom.ts';
import { readStatus } from './lettura.ts';
import { saveProfile } from './preferenze.ts';
import { refresh } from './righe.ts';
import { S, platform } from './stato.ts';

/* ---------- Lettura automatica ---------- */
function aiStatus(text: string, level?: string): void { status('aiStatus', text, level); }

const AI_ERR: Readonly<Record<string, string>> = {
  bad_key: 'La chiave non è valida o è stata revocata. Copiala di nuovo dalla Console di Anthropic.',
  bad_key_format: 'La chiave contiene spazi o caratteri non validi. Copiala di nuovo dalla Console di Anthropic.',
  no_permission: 'Questa chiave non ha i permessi necessari.',
  billing: 'L\'account Anthropic collegato alla chiave non ha credito o ha un problema di pagamento.',
  rate_limited: 'Troppe richieste o limite di spesa raggiunto. Riprova tra qualche minuto.',
  offline: 'Non riesco a contattare Anthropic. Controlla la connessione a internet e riprova.',
  overloaded: 'Il servizio di Anthropic non risponde in questo momento. Riprova tra poco.'
};
const KEY_MSG: Readonly<Record<KeyOutcome, string>> = {
  session: 'Chiave valida. Resta attiva fino alla chiusura dell\'app.',
  saved: 'Chiave valida, salvata su questo dispositivo.',
  encrypted: 'Chiave valida, salvata su questo dispositivo e cifrata dal sistema.',
  unsaved: 'Chiave valida, ma qui non si può salvare: vale fino alla chiusura dell\'app.',
  no_keyring: 'Chiave valida, ma questo sistema non offre un portachiavi per cifrarla: non viene scritta su disco e vale fino alla chiusura dell\'app.'
};

export function renderAi(): void {
  const ai = platform().ai, st = ai.state();
  $('aiClaude').hidden = ai.needsKey; $('aiOwn').hidden = !ai.needsKey;
  $('keyNote').hidden = !ai.needsKey || st.hasKey;
  if (!ai.needsKey) return;
  const key = input('ai-key');
  key.value = st.keyText;
  /* Nell'app desktop la chiave salvata non torna nella pagina: se ne mostrano solo gli ultimi caratteri. */
  key.placeholder = st.hasKey && !st.keyText ? 'Chiave salvata (termina con ' + st.keyHint + ')' : 'sk-ant-…';
  input('ai-remember').checked = st.remember;
  const sel = select('ai-model'), seen: Record<string, 1> = {};
  sel.textContent = '';
  for (const m of (st.models.length ? st.models : MODELS)) {
    if (seen[m[0]]) continue;
    seen[m[0]] = 1; sel.append(el('option', { value: m[0], text: String(m[1] || m[0]) + (MODEL_HINT[m[0]] || '') }));
  }
  if (!seen[st.model]) sel.append(el('option', { value: st.model, text: st.model }));
  sel.value = st.model;
  $('btnAiForget').hidden = !st.hasKey;
}

export function openSettings(focusId: string): void {
  openDlg('setDlg');
  const n = find(focusId);
  if (n) { n.scrollIntoView({ block: 'start' }); n.focus({ preventScroll: true }); }
}

async function saveKey(): Promise<void> {
  const ai = platform().ai, st = ai.state(), key = input('ai-key').value.trim();
  const reuse = !key && st.hasKey && !st.keyText;
  if (!key && !reuse) { aiStatus('Incolla la tua chiave API.', 'warn'); $('ai-key').focus(); return; }
  if (key && !keyLooksValid(key)) { aiStatus(AI_ERR.bad_key_format || '', 'bad'); return; }
  const b = button('btnAiSave');
  b.disabled = true; aiStatus('Verifico la chiave…', '');
  try {
    /* l'elenco dei modelli non consuma credito: serve a provare la chiave e a proporre i modelli disponibili */
    const out = await ai.verify(key, input('ai-remember').checked, select('ai-model').value || st.model);
    renderAi(); readStatus('', '');
    aiStatus(KEY_MSG[out], out === 'unsaved' || out === 'no_keyring' ? 'warn' : 'ok');
  } catch (e) {
    const detail = e instanceof AppError ? e.detail : '';
    aiStatus(AI_ERR[errorCode(e)] || ('Verifica non riuscita.' + (detail ? ' Dettaglio: ' + detail : '')), 'bad');
  } finally { b.disabled = false; }
}

/* ---------- Tracciato del file ---------- */
type TextOption = 'sep' | 'dec' | 'date' | 'enc' | 'um' | 'omaggi' | 'descSrc';
type CheckOption = 'header' | 'allowUnlinked';
const TEXT_OPTIONS: readonly TextOption[] = ['sep', 'dec', 'date', 'enc', 'um', 'omaggi', 'descSrc'];
const CHECK_OPTIONS: readonly CheckOption[] = ['header', 'allowUnlinked'];
type Field = HTMLInputElement | HTMLSelectElement;

/** Riporta nei campi il tracciato in uso. */
export function syncOpts(): void {
  const p: Profile = S.profile;
  for (const k of TEXT_OPTIONS) $<Field>('p-' + k).value = p[k];
  for (const k of CHECK_OPTIONS) input('p-' + k).checked = !!p[k];
}

export function renderCols(): void {
  const ul = $('cols'); ul.textContent = '';
  S.profile.cols.forEach((c, i) => {
    const def = colDef(c.id);
    if (!def) return;
    const li = el('li', { className: c.on ? '' : 'off' });
    const chk = el('input', { type: 'checkbox', id: 'c-on-' + c.id, checked: c.on });
    chk.addEventListener('change', () => { c.on = chk.checked; li.className = c.on ? '' : 'off'; saveProfile(); refresh(); });
    const name = el('label', { className: 'nm', text: def.label }); name.htmlFor = 'c-on-' + c.id;
    const hd = el('input', { type: 'text', id: 'c-hd-' + c.id, value: c.header });
    hd.setAttribute('aria-label', 'Nome colonna per ' + def.label);
    hd.addEventListener('input', () => { c.header = hd.value; saveProfile(); refresh(); });
    const up = el('button', { type: 'button', className: 'mini', text: '↑', disabled: i === 0 });
    up.setAttribute('aria-label', 'Sposta prima: ' + def.label);
    up.addEventListener('click', () => move(i, -1));
    const dn = el('button', { type: 'button', className: 'mini', text: '↓', disabled: i === S.profile.cols.length - 1 });
    dn.setAttribute('aria-label', 'Sposta dopo: ' + def.label);
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
  saveProfile(); renderCols(); refresh();
}

export function wireSettings(): void {
  $('btnAiSave').addEventListener('click', () => { void saveKey(); });
  $('btnAiForget').addEventListener('click', async () => {
    try { await platform().ai.forget(); } catch { /* resta com'era: il pannello mostra lo stato reale */ }
    renderAi();
    aiStatus('Chiave rimossa da questo dispositivo.', '');
  });
  $('ai-model').addEventListener('change', () => platform().ai.setModel(select('ai-model').value));
  $('ai-remember').addEventListener('change', () => { platform().ai.setRemember(input('ai-remember').checked).catch(() => { /* vale la scelta fatta al prossimo salvataggio */ }); });
  $('ai-show').addEventListener('click', () => {
    const k = input('ai-key'), on = k.type === 'password';
    k.type = on ? 'text' : 'password'; $('ai-show').textContent = on ? 'Nascondi' : 'Mostra'; $('ai-show').setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  $('btnKeyNote').addEventListener('click', () => openSettings('ai-key'));
  $('btnSet2').addEventListener('click', () => openSettings('hTrac'));

  for (const k of TEXT_OPTIONS) {
    const field = $<Field>('p-' + k);
    field.addEventListener('input', () => { S.profile[k] = field.value; saveProfile(); refresh(); });
  }
  for (const k of CHECK_OPTIONS) {
    const field = input('p-' + k);
    field.addEventListener('change', () => { S.profile[k] = field.checked; saveProfile(); refresh(); });
  }
  $('btnPresetRows').addEventListener('click', () => preset(false));
  $('btnPresetFull').addEventListener('click', () => preset(true));
}
