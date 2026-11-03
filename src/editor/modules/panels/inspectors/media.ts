// The Properties panel's Icon and Image sections (T05 §4.6) for an item whose type gives it media (the edit kind's
// `media`): the icon (choose, replace, remove), the label position, the icon's frame and size; the image's URL
// (checked against the image policy when the image tool opens), its size, fit and aspect lock. Writes go to the
// Mermaid code through `setIcon`, `setImage` and `setMedia` (a flowchart's node data); the fit is metadata.
import type { ItemRef } from '../../../../core/types.js';
import { h } from '../../../../ui/h.js';
import { registerMessages } from '../../../../ui/i18n.js';
import { EDITOR_MEDIA_MESSAGES } from '../../../../ui/messages/editor-media.js';
import { editKind } from '../../../kinds/registry.js';
import type { ItemMedia, MediaPatch } from '../../../kinds/types.js';
import { mediaOf, setIconOf, setImageFit, setImageOf, setMediaOf } from '../../../ops/media.js';
import { row, sect, type PanelCtx } from './shared.js';
import { isFaPack, splitIconName } from '../../../../core/icons/names.js';

registerMessages(EDITOR_MEDIA_MESSAGES);

/** A select of fixed choices (`''` unset). */
function choice(label: string, values: readonly string[], cur: string | undefined, text: (v: string) => string, on: (v: string) => void): HTMLSelectElement {
  const sel = h('select', { 'aria-label': label }, ...values.map((v) => h('option', { value: v }, text(v))));
  sel.value = cur ?? values[0] ?? '';
  sel.addEventListener('change', () => on(sel.value));
  return sel;
}

/** A number field written on change (empty: removes the key). */
function size(label: string, cur: number | undefined, on: (v: number | null) => void): HTMLInputElement {
  const inp = h('input', { type: 'number', min: '8', max: '2000', step: '1', 'aria-label': label, placeholder: 'auto' });
  if (cur !== undefined) inp.value = String(cur);
  inp.addEventListener('change', () => {
    const v = inp.value.trim() === '' ? null : Number(inp.value);
    if (v === null || Number.isFinite(v)) on(v);
  });
  inp.addEventListener('keydown', (ev) => {
    if ((ev as KeyboardEvent).key === 'Enter') inp.blur();
  });
  return inp;
}

/** The layout keys every icon and image node has: label position and size. */
function layoutRows(p: PanelCtx, host: HTMLElement, ref: ItemRef, m: ItemMedia): void {
  const { core } = p;
  const t = core.i18n.t;
  const set = (patch: MediaPatch): void => void setMediaOf(core, [ref], patch);
  host.append(row(t('props.labelPos'), choice(t('props.labelPos'), ['b', 't'], m.pos, (v) => t(`media.pos.${v}`), (v) => set({ pos: v }))));
  host.append(row(t('props.mediaH'), size(t('props.mediaH'), m.h, (v) => set({ h: v }))));
  if (m.node === 'image' || m.w !== undefined) host.append(row(t('props.mediaW'), size(t('props.mediaW'), m.w, (v) => set({ w: v }))));
}

export function mediaSection(p: PanelCtx, host: HTMLElement, ref: ItemRef): void {
  const { core } = p;
  const t = core.i18n.t;
  const k = editKind(core.model.type);
  const m = mediaOf(core, ref);
  if (!k || !m) return;
  if (k.setIcon && m.node !== 'image') {
    sect(host, t('props.icon'));
    const pick = h('button', { type: 'button' }, t('props.choose'));
    pick.addEventListener('click', () => core.run('openIconPicker', pick));
    const name = h('code', { class: 'hint' }, m.icon ?? t('props.iconNone'));
    const ctl: (Node | null)[] = [name, pick];
    if (m.icon) {
      const rm = h('button', { type: 'button', class: 'danger' }, t('props.removeIcon'));
      rm.addEventListener('click', () => void setIconOf(core, [ref], null));
      ctl.push(rm);
    }
    host.append(row(t('props.icon'), ...ctl));
    // an icon in the label (T06 §3.3, §3.6): stock Mermaid draws Font Awesome tokens only; the icon can become the node
    if (!m.node && m.icon) {
      if (!isFaPack(splitIconName(m.icon)[0])) host.append(h('div', { class: 'hint' }, t('props.iconTokenMmdx')));
      if (k.setMedia) {
        const conv = h('button', { type: 'button' }, t('props.toIconNode'));
        conv.addEventListener('click', () => void setMediaOf(core, [ref], { node: 'icon' }));
        host.append(row('', conv));
      }
    }
    if (m.node === 'icon') {
      host.append(row(t('props.iconForm'), choice(t('props.iconForm'), ['', 'square', 'circle', 'rounded'], m.form ?? '', (v) => t(`media.form.${v || 'none'}`), (v) => void setMediaOf(core, [ref], { form: v || null }))));
      layoutRows(p, host, ref, m);
    }
  }
  if (k.setImage && m.canImage && m.node !== 'icon') {
    sect(host, t('props.image'));
    const url = h('input', { type: 'text', readOnly: true, 'aria-label': t('props.imageUrl'), value: m.image ?? '' });
    const pick = h('button', { type: 'button' }, m.image ? t('props.choose') : t('props.addImage'));
    pick.addEventListener('click', () => core.run('openImageTool', pick, { insert: false }));
    const ctl: (Node | null)[] = [m.image ? url : h('span', { class: 'hint' }, t('props.imageNone')), pick];
    if (m.image) {
      const rm = h('button', { type: 'button', class: 'danger' }, t('props.removeImage'));
      rm.addEventListener('click', () => void setImageOf(core, [ref], null));
      ctl.push(rm);
    }
    host.append(row(t('props.imageUrl'), ...ctl));
    if (m.node === 'image') {
      layoutRows(p, host, ref, m);
      const lock = h('input', { type: 'checkbox', 'aria-label': t('props.aspect') });
      lock.checked = m.constraint === 'on';
      lock.addEventListener('change', () => void setMediaOf(core, [ref], { constraint: lock.checked ? 'on' : null }));
      host.append(row(t('props.aspect'), lock));
      const fit = core.getM(ref.kind, ref.id)['imgFit'];
      host.append(row(t('props.fit'), choice(t('props.fit'), ['contain', 'cover', 'stretch'], typeof fit === 'string' ? fit : 'contain', (v) => t(`media.fit.${v}`), (v) => setImageFit(core, [ref], v))));
    }
  }
}
