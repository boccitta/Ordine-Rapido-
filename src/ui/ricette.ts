/*
 * Ordine Rapido - interfaccia: le ricette dei clienti. Quando un ordine viene esportato l'app impara dal confronto
 * tra il documento del cliente e l'ordine finito (src/core/ricette.ts), e ricorda gli abbinamenti di tutte le righe
 * collegate. Nel pannello Archivio si vede che cosa ha imparato e lo si può dimenticare.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { aliasKeys } from '../core/abbinamento.ts';
import { fmtDate } from '../core/numeri.ts';
import { clearLearned, learnRecipe, recipes } from '../core/ricette.ts';
import type { Recipe } from '../core/ricette.ts';
import { renderArchInfo, saveAliasSoon } from './archivio.ts';
import { $, count, el, today } from './dom.ts';
import { S } from './stato.ts';

const FIELD_NAME: Readonly<Record<string, string>> = {
  cod_articolo: 'codice articolo', cod_cliente: 'codice del cliente', ean: 'EAN', descrizione: 'descrizione', um: 'unità di misura',
  colli: 'colli', quantita: 'quantità', pzcollo: 'pezzi per collo', prezzo: 'prezzo', sconto: 'sconto', netto: 'prezzo netto',
  totale: 'importo', iva: 'IVA', nota: 'note', riga: 'numero di riga', altro: 'da ignorare'
};

/**
 * Impara dall'ordine appena esportato. Restituisce una frase da aggiungere al messaggio di esportazione,
 * oppure '' se non c'era niente di nuovo da imparare.
 */
export function learnFromExport(): string {
  if (S.learned || S.isExample) return '';
  S.learned = true;
  const o = S.order;
  /* gli abbinamenti di tutte le righe collegate: la prossima volta la stessa descrizione o lo stesso codice del cliente si collegano da soli */
  let aliases = 0;
  for (const r of o.righe) {
    const l = r.link;
    if (!l || !l.ok) continue;
    for (const k of aliasKeys(o, r)) {
      if (k.indexOf('x|') === 0 && (l.via === 'codice' || l.via === 'ean')) continue;
      if (S.arch.alias[k] !== l.cod) { S.arch.alias[k] = l.cod; aliases++; }
    }
  }
  const got = learnRecipe(S.arch.alias, o, S.sources, today());
  if (aliases || got) { saveAliasSoon(); renderArchInfo(); }
  if (!got) return '';
  const who = got.recipe.nome || 'questo cliente';
  if (got.nuova) return ' Ho imparato com\'è fatto l\'ordine di ' + who + ': il prossimo lo leggerò allo stesso modo.';
  return ' La ricetta di ' + who + ' è aggiornata (' + count(got.recipe.ordini) + ' ordini).';
}

function describe(r: Recipe): string {
  const parts: string[] = [];
  const f = r.formati[0];
  if (f) {
    const cols = f.firma.filter(n => f.colonne[n] && f.colonne[n] !== 'altro').slice(0, 6).map(n => '«' + n + '» ' + (FIELD_NAME[f.colonne[n] as string] || f.colonne[n]));
    parts.push((r.formati.length > 1 ? r.formati.length + ' formati; l\'ultimo: ' : 'Colonne: ') + cols.join(', ') + (f.firma.length > 6 ? '…' : ''));
  }
  if (r.unita) parts.push('Nei messaggi un numero senza unità sono ' + (r.unita === 'colli' ? 'colli' : 'pezzi'));
  const text = parts.join('. ');
  return /[.…]$/.test(text) ? text : text + '.';
}

let clearArmed = false;
/** L'elenco delle ricette nel pannello Archivio. */
export function renderRecipes(): void {
  const list = recipes(S.arch.alias).sort((a, b) => (a.recipe.at < b.recipe.at ? 1 : -1));
  $('recipeInfo').textContent = list.length ? count(list.length) + (list.length === 1 ? ' cliente' : ' clienti') : 'ancora nessuna: si imparano esportando gli ordini';
  $('btnRecipes').hidden = !list.length;
  $('btnRecipeClear').hidden = !list.length;
  const ul = $('recipeList'); ul.textContent = '';
  for (const { key, recipe } of list) {
    const forget = el('button', { type: 'button', className: 'mini', text: 'Dimentica' });
    forget.setAttribute('aria-label', 'Dimentica la ricetta di ' + recipe.nome);
    forget.addEventListener('click', () => { delete S.arch.alias[key]; saveAliasSoon(); renderRecipes(); renderArchInfo(); });
    ul.append(el('li', null,
      el('div', null, el('b', { text: recipe.nome || 'Cliente senza nome' }), el('span', { text: count(recipe.ordini) + (recipe.ordini === 1 ? ' ordine' : ' ordini') + ', l\'ultimo il ' + fmtDate(recipe.at, 'dmy') }),
        el('small', { text: describe(recipe) })),
      forget));
  }
  if (!list.length) $('recipeList').hidden = true;
}

export function wireRecipes(): void {
  $('btnRecipes').addEventListener('click', () => {
    const ul = $('recipeList'), open = ul.hidden;
    ul.hidden = !open; $('btnRecipes').textContent = open ? 'Nascondi' : 'Vedi';
    $('btnRecipes').setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  $('btnRecipeClear').addEventListener('click', () => {
    const b = $('btnRecipeClear');
    if (!clearArmed) { clearArmed = true; b.textContent = 'Conferma: azzera'; setTimeout(() => { clearArmed = false; b.textContent = 'Azzera'; }, 4000); return; }
    clearArmed = false; b.textContent = 'Azzera';
    clearLearned(S.arch.alias, 'recipes'); saveAliasSoon(); renderRecipes(); renderArchInfo();
  });
}
