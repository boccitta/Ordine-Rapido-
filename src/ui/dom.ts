/*
 * Ordine Rapido - interfaccia: piccoli attrezzi per lavorare sulla pagina.
 * Tutto ciò che arriva da un documento o da un archivio entra nella pagina come testo (textContent),
 * mai come HTML: è la funzione el() a garantirlo.
 *
 * Copyright (C) 2026 Roberto Murenu
 * Software libero distribuito con licenza GNU General Public License versione 3 (GPL-3.0-only),
 * senza alcuna garanzia. Il testo completo della licenza è nel file LICENSE.
 */

/** L'elemento con quell'identificativo, se c'è. */
export function find<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}
/** L'elemento con quell'identificativo. Se manca, la pagina e il codice non corrispondono: meglio saperlo subito. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error('Nella pagina manca l\'elemento #' + id);
  return n as T;
}
export const input = (id: string) => $<HTMLInputElement>(id);
export const select = (id: string) => $<HTMLSelectElement>(id);
export const button = (id: string) => $<HTMLButtonElement>(id);

type Child = Node | string | null | undefined;
/**
 * Crea un elemento. `text` diventa il testo; le altre voci sono proprietà dell'elemento (className, value, checked…)
 * oppure, se l'elemento non ha quella proprietà, attributi.
 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, unknown> | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (k === 'text') n.textContent = v === null || v === undefined ? '' : String(v);
    else if (k in n) (n as unknown as Record<string, unknown>)[k] = v;
    else n.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined) n.append(c);
  return n;
}

const SVGNS = 'http://www.w3.org/2000/svg';
/** Un'icona tra quelle definite in cima alla pagina. */
export function icon(name: string): SVGSVGElement {
  const s = document.createElementNS(SVGNS, 'svg'), u = document.createElementNS(SVGNS, 'use');
  s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true'); u.setAttribute('href', '#i-' + name); s.append(u);
  return s;
}

/** Scrive un messaggio in una riga di stato. level: '', 'ok', 'warn' oppure 'bad'. */
export function status(id: string, text: string, level?: string): void {
  const s = $(id);
  s.textContent = text; s.className = 'status ' + (level || '');
}

export function miniBtn(text: string, label: string, fn: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', className: 'mini', text });
  b.setAttribute('aria-label', label); b.addEventListener('click', fn);
  return b;
}

export function count(n: number): string { return n.toLocaleString('it-IT'); }
export function money(n: number): string { return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
/** La data di oggi nel formato AAAA-MM-GG. */
export function today(): string {
  const d = new Date(), z = (n: number) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

export function openDlg(id: string): void { const d = $<HTMLDialogElement>(id); if (!d.open) d.showModal(); }
/** Collega un pannello: pulsante di chiusura, clic fuori dal pannello, ritorno del fuoco al pulsante che l'ha aperto. */
export function wireDlg(id: string, closeId: string, backTo: string): void {
  const d = $<HTMLDialogElement>(id);
  $(closeId).addEventListener('click', () => d.close());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  d.addEventListener('close', () => { const b = find(backTo); if (b && !b.hidden && b.offsetParent) b.focus(); });
}
