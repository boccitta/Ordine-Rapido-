/*
 * Ordine Rapido - interfaccia: errori imprevisti.
 * Un errore che nessuno ha previsto non deve passare in silenzio né lasciare l'app ferma senza spiegazioni:
 * compare un avviso che dice che cosa fare. L'ordine in lavorazione intanto è già salvato (vedi bozza.ts).
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
const MESSAGE = 'Qualcosa non ha funzionato come doveva. Il tuo ordine è ancora qui: riprova e, se succede di nuovo, chiudi e riapri l\'app.';

/** Mostra l'avviso. Non usa gli altri attrezzi dell'interfaccia: deve funzionare anche se il resto non è partito. */
export function showProblem(text?: string): void {
  const box = document.getElementById('oops'), label = document.getElementById('oopsText');
  if (!box || !label) return;
  label.textContent = text || MESSAGE;
  box.hidden = false;
}

export function wireProblems(): void {
  const close = document.getElementById('oopsClose'), box = document.getElementById('oops');
  if (close && box) close.addEventListener('click', () => { box.hidden = true; });
  /* solo gli errori del codice dell'app: un file che non si carica ha già il suo messaggio */
  window.addEventListener('error', e => { if (e.error) showProblem(); });
  window.addEventListener('unhandledrejection', () => showProblem());
}
