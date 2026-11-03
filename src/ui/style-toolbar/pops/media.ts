// The Icon & image popover (T05 §4.6) of an icon or image item: the label's position, the icon's frame, the width,
// and for an image its fit, the aspect lock and "Replace image…". Values come from `api.media()`, writes go through
// `api.setMedia` (the editor: the item's node data in the Mermaid code).
import { h } from '../../h.js';
import { popLabel } from '../../toolbar-kit.js';
import type { ToolbarMediaPatch } from '../types.js';
import type { Fill } from './common.js';

/** A row of exclusive text choices. */
function texts(values: readonly string[], cur: string, name: (v: string) => string, pick: (v: string) => void): HTMLElement {
  const row = h('div', { class: 'mtb-choices mtb-words', role: 'group' });
  for (const v of values) {
    const on = v === cur;
    row.append(h('button', { type: 'button', class: 'mtb-choice' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => pick(v) }, name(v)));
  }
  return row;
}

export function mediaPop(f: Fill): void {
  const { pop, x, again } = f;
  const { t, api } = x;
  const m = api.media?.();
  const set = (p: ToolbarMediaPatch): void => {
    api.setMedia?.(p);
    again();
  };
  // an icon in the label: it can become the node (an icon node with the label as its caption)
  if (m && !m.node && m.icon) {
    const conv = h('button', { type: 'button', class: 'link', title: t('tb.toIconNodeTip') }, t('tb.toIconNode'));
    conv.addEventListener('click', () => set({ node: 'icon' }));
    pop.append(conv);
    return;
  }
  if (!m?.node) return;
  pop.append(popLabel(t('tb.labelPos')));
  pop.append(texts(['t', 'b'], m.pos ?? 'b', (v) => t(`tb.pos.${v === 't' ? 'top' : 'bottom'}`), (v) => set({ pos: v })));
  if (m.node === 'icon') {
    pop.append(popLabel(t('tb.iconForm')));
    pop.append(texts(['', 'square', 'circle', 'rounded'], m.form ?? '', (v) => t(`tb.form.${v || 'none'}`), (v) => set({ form: v || null })));
  }
  const w = h('input', { class: 'mtb-num', type: 'text', inputMode: 'numeric', 'aria-label': t('tb.mediaW'), placeholder: 'auto' });
  w.value = m.w !== undefined ? String(m.w) : '';
  w.addEventListener('change', () => {
    const v = w.value.trim() === '' ? null : Number(w.value);
    if (v === null || (Number.isFinite(v) && v >= 8)) set({ w: v });
  });
  w.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') ev.stopPropagation();
  });
  pop.append(popLabel(t('tb.mediaW')), w);
  if (m.node !== 'image') return;
  pop.append(popLabel(t('tb.fit')));
  pop.append(texts(['contain', 'cover', 'stretch'], m.fit ?? 'contain', (v) => t(`tb.fit.${v}`), (v) => set({ fit: v })));
  const lock = h('input', { type: 'checkbox' });
  lock.checked = m.constraint === 'on';
  lock.addEventListener('change', () => set({ constraint: lock.checked ? 'on' : null }));
  pop.append(h('label', { class: 'mtb-check' }, lock, ' ', t('tb.aspect')));
  if (api.pickImage) {
    const rep = h('button', { type: 'button', class: 'link' }, t('tb.replaceImage'));
    rep.addEventListener('click', () => {
      x.close();
      api.pickImage?.(rep.closest<HTMLElement>('.mtb-pop') ?? rep);
    });
    pop.append(rep);
  }
}
