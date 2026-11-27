/*
 * Ordine Rapido - interfaccia: avvio. Sceglie l'ambiente, collega i pulsanti, disegna la prima schermata
 * e legge gli archivi salvati. È il punto d'ingresso del codice della pagina.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { detectPlatform } from '../piattaforma/indice.ts';
import { loadArchives, renderArchInfo, wireArchive } from './archivio.ts';
import { restoreDraft, wireDraft } from './bozza.ts';
import { $ } from './dom.ts';
import { showProblem, wireProblems } from './errori.ts';
import { wireExport } from './esporta.ts';
import { renderAi, renderCols, syncOpts, wireSettings } from './impostazioni.ts';
import { wireReading } from './lettura.ts';
import { loadProfile, loadUi } from './preferenze.ts';
import { refresh, renderHeadRow, renderRows, wireRows } from './righe.ts';
import { applySkin, paint, wireScreens } from './schermate.ts';
import { S, setPlatform } from './stato.ts';
import { fillHead, wireHead } from './testata.ts';
import { INFO } from './versione.ts';

function start(): void {
  wireProblems();
  const p = detectPlatform();
  setPlatform(p);
  S.profile = loadProfile();
  loadUi();
  /* un ordine rimasto aperto alla chiusura torna in lavorazione: dalla schermata «Carica» si riprende con un clic */
  restoreDraft();

  wireArchive(); wireHead(); wireRows(); wireExport(); wireSettings(); wireReading(); wireScreens(); wireDraft();

  applySkin(); syncOpts(); renderHeadRow(); renderCols(); fillHead(); renderRows(); refresh(); renderArchInfo(); renderAi(); paint();
  $('ver').textContent = INFO.versione; $('ver').title = 'Versione ' + INFO.versione;
  $('aboutVer').textContent = 'Ordine Rapido ' + INFO.versione;
  if (INFO.sorgente) { $<HTMLAnchorElement>('aboutSrc').href = INFO.sorgente; $('aboutSrcBox').hidden = false; }

  /* Quando lettura e salvataggio dei file sono pronti si aggiorna ciò che dipende da loro. */
  void p.ready.then(() => {
    renderAi();
    const canSave = p.files.available();
    $('btnDownload').hidden = !canSave; document.body.classList.toggle('no-dl', !canSave);
  });
  void loadArchives();
}

try { start(); }
catch (e) {
  showProblem('L\'app non è riuscita ad avviarsi del tutto. Chiudila e riaprila; se succede ancora, scarica di nuovo l\'app.');
  throw e;
}
