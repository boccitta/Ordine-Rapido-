/*
 * Ordine Rapido - interfaccia: i dati dell'ordine (casa mandante, cliente, date, pagamento, totali del documento).
 * Si leggono come un riepilogo; «Modifica» apre i campi.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */
import { fmtDate } from '../core/numeri.ts';
import type { OrderText } from '../core/tipi.ts';
import { $, el, icon, input } from './dom.ts';
import { checkCliente, checkMandante, matchAll, refresh, renderLinks, touched } from './righe.ts';
import { S } from './stato.ts';

const HEAD: readonly OrderText[] = ['mandante', 'mandante_cod', 'cliente', 'cliente_cod', 'piva', 'numero', 'data', 'consegna', 'pagamento', 'destinazione', 'note', 'tot_imponibile', 'tot_colli', 'tot_pezzi'];

export function fillHead(): void {
  for (const k of HEAD) input('h-' + k).value = S.order[k] || '';
}

export function paintHead(): void {
  const dl = $('headView'), o = S.order;
  dl.textContent = '';
  function it(label: string, value: string, kind?: 'need' | 'wide', extra?: HTMLElement | null): void {
    const v = String(value || '').trim(), dd = el('dd', { text: v || (kind === 'need' ? 'da indicare' : '–') });
    if (extra) dd.append(extra);
    dl.append(el('div', { className: (v ? '' : kind === 'need' ? 'miss' : 'none') + (kind === 'wide' ? ' wide' : '') }, el('dt', { text: label }), dd));
  }
  const cod = String(o.cliente_cod || '').trim(), mcod = String(o.mandante_cod || '').trim();
  it('Casa mandante', o.mandante, 'need', mcod ? el('span', { className: 'pill' + (S.manOk ? ' ok' : ''), text: mcod, title: S.manOk ? 'Codice mandante presente in archivio' : 'Codice mandante' }) : null);
  it('Cliente', o.cliente, 'need', cod ? el('span', { className: 'pill' + (S.cliOk ? ' ok' : ''), text: cod, title: S.cliOk ? 'Codice cliente presente in archivio' : 'Codice cliente' }) : null);
  it('N. ordine', o.numero); it('Data ordine', fmtDate(o.data, 'dmy')); it('Consegna', fmtDate(o.consegna, 'dmy')); it('Pagamento', o.pagamento);
  if (!cod && String(o.piva || '').trim()) it('P.IVA cliente', o.piva);
  if (String(o.destinazione || '').trim()) it('Destinazione merce', o.destinazione, 'wide');
  if (String(o.note || '').trim()) it('Note', o.note, 'wide');
  dl.hidden = S.headEdit; $('headEdit').hidden = !S.headEdit;
  const b = $('btnHeadEdit');
  b.textContent = ''; b.append(icon(S.headEdit ? 'check' : 'edit'), S.headEdit ? 'Fatto' : 'Modifica'); b.setAttribute('aria-expanded', S.headEdit ? 'true' : 'false');
}

export function wireHead(): void {
  for (const k of HEAD) {
    const field = input('h-' + k);
    field.addEventListener('input', () => {
      const o = S.order;
      o[k] = field.value; touched();
      /* un codice trovato in automatico vale finché non cambia il nome da cui è stato ricavato */
      if (k === 'mandante' && o.man_auto) { o.mandante_cod = ''; o.mandante_piva = ''; input('h-mandante_cod').value = ''; }
      if ((k === 'cliente' || k === 'piva') && o.cli_auto) { o.cliente_cod = ''; input('h-cliente_cod').value = ''; }
      if (k === 'mandante_cod') o.man_auto = false;
      if (k === 'cliente_cod') o.cli_auto = false;
      if (k === 'mandante' || k === 'cliente' || k === 'piva') { matchAll(false); renderLinks(); }
      if (k === 'cliente_cod') checkCliente();
      if (k === 'mandante_cod') checkMandante();
      refresh();
    });
  }
  $('btnHeadEdit').addEventListener('click', () => {
    S.headEdit = !S.headEdit; paintHead();
    if (S.headEdit) $('h-mandante').focus(); else $('btnHeadEdit').focus();
  });
}
