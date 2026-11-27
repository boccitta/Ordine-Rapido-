/*
 * Ordine Rapido - interfaccia: esportazione del file per il gestionale.
 * Prima di ogni esportazione passa da guard(): se una riga non è collegata a un articolo dell'archivio
 * il file non esce, così nel gestionale non nascono codici nuovi.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { unlinked } from '../core/ordine.ts';
import { buildTable, fileName, toCp1252, toDelimited } from '../core/tracciato.ts';
import { errorCode } from '../core/tipi.ts';
import { $, icon, status } from './dom.ts';
import { didExport } from './schermate.ts';
import { S, platform } from './stato.ts';

/** Il testo del file con il separatore indicato: quello del tracciato per il CSV, la tabulazione per «Copia righe». */
export function currentText(sep: string): string { return toDelimited(buildTable(S.order, S.profile), sep, S.profile.header); }
export function expStatus(text: string, level?: string): void { status('expStatus', text, level); }

/** Quante righe impediscono l'esportazione. Zero se l'archivio non è caricato o se il tracciato lo permette. */
export function blocked(): number { return (!S.ix || S.profile.allowUnlinked) ? 0 : unlinked(S.order); }

function guard(): boolean {
  const n = blocked();
  if (!n) return true;
  expStatus((n === 1 ? '1 riga non è collegata' : n + ' righe non sono collegate') + ' a un articolo dell\'archivio. Collegala o eliminala prima di esportare: così non nascono codici nuovi.', 'bad');
  S.guardShown = true;
  return false;
}

async function copyText(text: string, okMsg: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); expStatus(okMsg, 'ok'); didExport(); }
  catch {
    const range = document.createRange(); range.selectNodeContents($('preview'));
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    expStatus('Copia automatica non permessa qui. L\'anteprima è selezionata: premi Ctrl+C.', 'warn');
  }
}

/** Il riquadro della schermata «Esporta»: pronto, bloccato, già esportato, oppure senza righe. */
export function paintExport(): void {
  const o = S.order, n = o.righe.length ? blocked() : 0, card = $('readyCard');
  const state = !o.righe.length ? 'empty' : n ? 'blocked' : S.exported ? 'done' : 'ready';
  card.dataset.state = state;
  $('h3a').textContent = state === 'empty' ? 'Nessuna riga da esportare' : state === 'blocked' ? (n === 1 ? 'Una riga da collegare all\'archivio' : n + ' righe da collegare all\'archivio') : state === 'done' ? 'File esportato' : 'Il file è pronto';
  $('readyText').textContent = state === 'empty' ? 'Torna al controllo e aggiungi almeno una riga.'
    : state === 'blocked' ? 'Collega ogni riga a un articolo dell\'archivio, oppure eliminala: così nel gestionale non nascono codici nuovi.'
    : state === 'done' ? 'Ora importalo nel gestionale. Per un altro ordine premi Nuovo ordine.' : 'Scaricalo, oppure copia le righe, e importalo nel gestionale.';
  const ic = $('readyIcon'); ic.textContent = ''; ic.append(icon(state === 'done' ? 'ok' : state === 'ready' ? 'file' : 'alert'));
  $('fileName').textContent = o.righe.length ? fileName(o) : '';
  $('btnFix').hidden = state === 'ready' || state === 'done';
  $('btnNew').classList.toggle('primary', state === 'done');
}

export function wireExport(): void {
  $('btnTsv').addEventListener('click', () => {
    if (!S.order.righe.length) { expStatus('Non ci sono righe da copiare.', 'warn'); return; }
    if (!guard()) return;
    void copyText(currentText('\t'), 'Righe copiate. In GesACom: clic destro nell\'area righe, poi Importa righe da Excel.');
  });
  $('btnCopyCsv').addEventListener('click', () => { if (!guard()) return; void copyText(currentText(S.profile.sep), 'CSV copiato negli appunti.'); });
  $('btnDownload').addEventListener('click', async () => {
    if (!S.order.righe.length) { expStatus('Non ci sono righe da esportare.', 'warn'); return; }
    if (!guard()) return;
    const p = platform();
    await p.ready;
    const text = currentText(S.profile.sep), name = fileName(S.order);
    const data = S.profile.enc === 'utf8' ? '﻿' + text : toCp1252(text);
    if (!p.files.available()) {
      $('btnDownload').hidden = true; document.body.classList.add('no-dl');
      expStatus('Da qui non posso salvare file. Usa Copia CSV e incollalo in un file di testo.', 'warn');
      return;
    }
    try {
      await p.files.save(name, data, 'text/csv');
      expStatus((p.kind === 'claude' ? 'File salvato: ' : 'File scaricato: ') + name, 'ok'); didExport();
    } catch (e) {
      const code = errorCode(e);
      if (code === 'declined') expStatus('Salvataggio annullato.', '');
      else if (code === 'rate_limited') expStatus('C\'è già una richiesta di salvataggio aperta. Riprova tra poco.', 'warn');
      else expStatus('Salvataggio non riuscito qui. Usa Copia CSV.', 'bad');
    }
  });
}
