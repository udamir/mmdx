// The settings popover of an image node (T05 §4.6), whose image is a picture or an icon: an icon's frame or a
// picture's fit, and the label's position; the aspect lock and sizes are in Properties, the image itself is changed in
// the image tool (the toolbar's Change image). Values come from `api.media()`, writes go through `api.setMedia` (the
// editor: the item's node data, or an image state's metadata).
import { h } from '../../../kit/h.js';
import { choiceRow, popLabel } from '../../../kit/toolbar-kit.js';
import { framePreview, svgIcon } from '../icons.js';
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


/** An image node's settings, per its source: an icon's frame or a picture's fit, and the label's position (the aspect lock and sizes are in Properties). */
export function mediaPop(f: Fill): void {
  const { pop, x, again } = f;
  const { t, api } = x;
  const m = api.media?.();
  if (!m?.node) return;
  const set = (p: ToolbarMediaPatch): void => {
    api.setMedia?.(p);
    again();
  };
  if (m.node === 'icon') {
    pop.append(popLabel(t('tb.iconForm')), choiceRow(['', 'square', 'circle', 'rounded'], m.form ?? '', (v) => set({ form: v || null }), (v) => framePreview(v, 28), (v) => t(`tb.form.${v || 'none'}`)));
  } else {
    pop.append(popLabel(t('tb.fit')), texts(['contain', 'cover', 'stretch'], m.fit ?? 'contain', (v) => t(`tb.fit.${v}`), (v) => set({ fit: v })));
  }
  pop.append(popLabel(t('tb.labelPos')), choiceRow(['t', 'b'], m.pos ?? 'b', (v) => set({ pos: v }), (v) => svgIcon(v === 't' ? 'labelTop' : 'labelBottom'), (v) => t(v === 't' ? 'tb.labelAbove' : 'tb.labelBelow')));
}
