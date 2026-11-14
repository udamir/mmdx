// The Properties panel's building blocks shared by its inspectors and the kinds' own sections (A11d): the panel's context, a section heading and a labelled row.
import { h } from '../../ui/kit/h.js';
import type { EditorCore } from '../core.js';
import type { LiveEdit } from '../ops/live.js';

export interface PanelCtx {
  core: EditorCore;
  live: LiveEdit;
}

export const sect = (host: HTMLElement, text: string): void => {
  host.append(h('div', { class: 'sect', role: 'heading', 'aria-level': '3' }, text));
};
const wrapCtl = (...els: (Node | string | null)[]): HTMLElement => h('div', { class: 'ctl' }, ...els);
export const row = (label: string, ...ctl: (Node | string | null)[]): HTMLElement => h('div', { class: 'f' }, h('label', null, label), wrapCtl(...ctl), h('span'));
