// The popovers of an image node (T05 §4.6), whose source is a picture or an icon: the source, and the settings — an
// icon's frame or a picture's fit, and the label's position; the aspect lock and sizes are in Properties. Values come from `api.media()`, writes go through
// `api.setMedia` (the editor: the item's node data in the Mermaid code).
import { h } from '../../h.js';
import { choiceRow, popLabel } from '../../toolbar-kit.js';
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

/**
 * An image node's source: a picture — from the host's library, uploaded, or by its URL (the image tool on that tab;
 * only the ones the host has) — or an icon (the icon picker). Either replaces the current one.
 */
export function sourcePop(f: Fill): void {
  const { pop, x } = f;
  const { t, api } = x;
  const m = api.media?.();
  if (!m?.node) return;
  const anchor = x.bar.querySelector<HTMLElement>('[data-c="source"]') ?? x.bar;
  pop.classList.add('narrow');
  const sources = api.imageSources?.() ?? ['url'];
  const names = { library: t('tb.imageLibrary'), upload: t('tb.imageUpload'), url: t('tb.imageUrlPick') };
  pop.append(popLabel(t('tb.picture')), choiceRow(sources, '', (v) => {
    x.close();
    api.pickImage?.(anchor, v as 'library' | 'upload' | 'url');
  }, (v) => svgIcon(v === 'url' ? 'link' : v), (v) => names[v as keyof typeof names]));
  pop.append(popLabel(t('tb.iconSource')), choiceRow(['icon'], m.node, () => {
    x.close();
    api.pickIcon?.(anchor);
  }, () => svgIcon('icon'), () => (m.node === 'icon' ? t('tb.replaceIcon') : t('tb.useIcon'))));
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
