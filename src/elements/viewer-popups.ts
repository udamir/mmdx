// The viewer's pop-up panels (View settings, pen options). Loaded on first use: not needed to show a diagram (§R5).
import { layerDefs } from '../core/layers.js';
import type { DiagramMeta } from '../core/meta/types.js';
import type { MagicPen } from '../dom/pen.js';
import { PEN_COLORS, PEN_FADES, PEN_SIZES } from '../dom/pen.js';
import { h, icon } from '../ui/h.js';
import type { I18n } from '../ui/i18n.js';
import { I_eye, I_eyeOff } from '../ui/icons.js';

/** Pen colours, sizes, auto erase and Erase all; re-draws itself on every change. */
export function penOptions(pen: MagicPen, t: I18n['t']): HTMLElement {
  const pop = h('div', { class: 'pop pen-opts', role: 'dialog', 'aria-label': t('pen.title') });
  const draw = (): void => {
    pop.replaceChildren(
      h('div', { class: 'line' }, ...PEN_COLORS.map((c) => h('button', { type: 'button', class: 'swatch', style: `background:${c}`, 'aria-label': c, 'aria-pressed': String(pen.color === c), onclick: () => { pen.setColor(c); draw(); } }))),
      h('div', { class: 'line' }, ...PEN_SIZES.map((s) => h('button', { type: 'button', class: 'size', 'aria-label': `${s}px`, 'aria-pressed': String(pen.size === s), onclick: () => { pen.setSize(s); draw(); } }, h('i', { style: `width:${s + 2}px;height:${s + 2}px` })))),
      h('div', { class: 'line' }, h('span', { class: 'ds-sect' }, t('pen.fade')),
        ...PEN_FADES.map((f) => h('button', { type: 'button', class: 'fade', 'aria-pressed': String(pen.fade === f), onclick: () => { pen.setFade(f); draw(); } }, f ? `${f / 1000}s` : '∞'))),
      h('button', { type: 'button', onclick: () => pen.clear() }, t('pen.erase')),
    );
  };
  draw();
  return pop;
}

export interface ViewSettingsState {
  meta: () => DiagramMeta;
  /** Layers shown by the host's override, if any. */
  visible: () => readonly string[] | undefined;
  labels: () => boolean;
  hover: () => boolean;
  setVisible(ids: string[]): void;
  setLabels(on: boolean): void;
  setHover(on: boolean): void;
}

/** View settings (A.7 row 68): Layers (when the diagram has any) and Display (labels, hover highlight). */
export function viewSettings(s: ViewSettingsState, t: I18n['t']): HTMLElement {
  const pop = h('div', { class: 'pop', role: 'dialog', 'aria-label': t('layers.title') });
  const draw = (): void => {
    const defs = layerDefs(s.meta());
    const visible = s.visible();
    const shown = (id: string, hidden: boolean): boolean => (visible ? visible.includes(id) : !hidden);
    const rows = defs.length > 1 || defs[0]?.hidden
      ? [h('div', { class: 'ds-sect' }, t('layers.layers')), ...defs.map((l) => {
        const on = shown(l.id, l.hidden);
        return h('div', { class: 'row' + (on ? '' : ' off') },
          h('button', { type: 'button', class: 'eye', 'aria-pressed': String(on), 'aria-label': on ? t('layers.hide') : t('layers.show'), onclick: () => {
            const cur = defs.filter((d) => shown(d.id, d.hidden)).map((d) => d.id);
            s.setVisible(on ? cur.filter((x) => x !== l.id) : [...cur, l.id]);
            setTimeout(draw, 0);
          } }, icon(on ? I_eye : I_eyeOff)),
          h('span', { class: 'name' }, l.id === 'default' && !l.name ? t('layers.default') : l.name));
      })]
      : [];
    const toggle = (label: string, value: boolean, set: (v: boolean) => void): HTMLElement =>
      h('div', { class: 'row' }, h('span', { class: 'name' }, label),
        h('button', { type: 'button', role: 'switch', class: 'ds-toggle', 'aria-checked': String(value), 'aria-label': label, onclick: () => { set(!value); draw(); } }));
    pop.replaceChildren(...rows,
      h('div', { class: 'ds-sect' }, t('layers.display')),
      toggle(t('layers.labels'), s.labels(), (v) => s.setLabels(v)),
      toggle(t('layers.hover'), s.hover(), (v) => s.setHover(v)));
  };
  draw();
  return pop;
}
