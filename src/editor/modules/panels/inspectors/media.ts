// The Properties panel's Image section (T05 §4.6) for an item whose type gives it media (the edit kind's `media`): an
// image node — a flowchart's image and icon nodes, and the image and icon items kept in metadata (states, mindmap nodes,
// participants) — shows its source, changed through the image tool (library, upload, URL, icon), and that source's
// settings; a plain item takes a picture, which makes it an image item. Writes go through `setIcon`, `setImage` and
// `setMedia` (a flowchart's node data) or the item's metadata (`mediaNodesInMeta`); the fit is metadata.
import type { ItemRef } from '../../../../core/types.js';
import { h, icon } from '../../../../ui/kit/h.js';
import { I_image, I_trash } from '../../../../ui/kit/icons.js';
import { registerMessages } from '../../../../i18n.js';
import { EDITOR_MEDIA_MESSAGES } from '../../../messages-media.js';
import { BLOCK_MESSAGES_MEDIA } from '../../../../ui/messages/blocks-media.js';
import { editKind } from '../../../kinds/registry.js';
import type { ItemMedia, MediaPatch } from '../../../kinds/types.js';
import { mediaOf, setIconOf, setImageFit, setImageOf, setMediaOf, takesImages, takesMedia } from '../../../ops/media.js';
import { row, sect, type PanelCtx } from '../../../lib/panel.js';
import { isFaPack, splitIconName } from '../../../../core/icons/names.js';

registerMessages(EDITOR_MEDIA_MESSAGES);
registerMessages(BLOCK_MESSAGES_MEDIA);

/** A small icon button (the preset section's look): its name is its title. */
const iconButton = (path: string, name: string, act: string): HTMLButtonElement =>
  h('button', { type: 'button', class: 'pp-act', title: name, 'aria-label': name, dataset: { act } }, icon(path, 17));

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
  if (m.node) return nodeMedia(p, host, ref, m);
  // a label's icon token on a flowchart's plain shape (which takes no icon of its own): it can become an icon node
  if (m.canIcon === false && m.icon && takesMedia(k)) {
    sect(host, t('props.icon'));
    if (!isFaPack(splitIconName(m.icon)[0])) host.append(h('div', { class: 'hint' }, t('props.iconTokenMmdx')));
    const conv = h('button', { type: 'button' }, t('props.toIconNode'));
    conv.addEventListener('click', () => void setMediaOf(core, [ref], { node: 'icon' }));
    host.append(row(t('props.icon'), h('code', { class: 'hint' }, m.icon), conv));
  }
  // a plain item takes an image (it becomes an image or icon node): Set image… opens the image tool and its four tabs
  if (takesImages(k) && m.canImage) {
    sect(host, t('props.image'));
    const set = iconButton(I_image, t('props.setImage'), 'set');
    set.addEventListener('click', () => core.run('openImageTool', set, { insert: false }));
    host.append(row(t('props.image'), h('span', { class: 'hint' }, t('props.imageNone')), set));
  }
}

/**
 * An image node's Image section (a flowchart's image and icon nodes, image states): its source — the picture's URL or
 * the icon — changed from the host's library, by an upload, by URL or to an icon (the same four as the toolbar's Change
 * image), then that source's settings: the icon's frame, or the picture's aspect lock and fit; the label's position
 * and the size.
 */
function nodeMedia(p: PanelCtx, host: HTMLElement, ref: ItemRef, m: ItemMedia): void {
  const { core } = p;
  const t = core.i18n.t;
  sect(host, t('props.image'));
  const current = m.node === 'icon'
    ? h('code', { class: 'hint' }, m.icon ?? '')
    : m.image ? h('input', { type: 'text', readOnly: true, 'aria-label': t('image.url'), value: m.image }) : h('span', { class: 'hint' }, t('props.imageNone'));
  // Change image (the image tool, on the tab of its source: Library, Upload, URL or Icon) and Remove image, as icons
  const change = iconButton(I_image, t('image.change'), 'change');
  change.addEventListener('click', () => core.run('openImageTool', change, { insert: false }));
  const rm = iconButton(I_trash, t('props.removeImage'), 'remove');
  rm.addEventListener('click', () => void (m.node === 'icon' ? setIconOf(core, [ref], null) : setImageOf(core, [ref], null)));
  host.append(row(m.node === 'icon' ? t('props.icon') : t('image.url'), current, change, rm));
  if (m.node === 'icon') host.append(row(t('props.iconForm'), choice(t('props.iconForm'), ['', 'square', 'circle', 'rounded'], m.form ?? '', (v) => t(`media.form.${v || 'none'}`), (v) => void setMediaOf(core, [ref], { form: v || null }))));
  layoutRows(p, host, ref, m);
  if (m.node !== 'image') return;
  const lock = h('input', { type: 'checkbox', 'aria-label': t('image.aspect') });
  lock.checked = m.constraint === 'on';
  lock.addEventListener('change', () => void setMediaOf(core, [ref], { constraint: lock.checked ? 'on' : null }));
  host.append(row(t('image.aspect'), lock));
  const fit = core.getM(ref.kind, ref.id)['imgFit'];
  host.append(row(t('image.fit'), choice(t('image.fit'), ['contain', 'cover', 'stretch'], typeof fit === 'string' ? fit : 'contain', (v) => t(`media.fit.${v}`), (v) => setImageFit(core, [ref], v))));
}
