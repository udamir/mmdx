// The Properties panel's Icon and Image sections (T05 §4.6) for an item whose type gives it media (the edit kind's
// `media`): the icon (choose, replace, remove), the label position, the icon's frame and size; the image's URL
// (checked against the image policy when the image tool opens), its size, fit and aspect lock. Writes go to the
// Mermaid code through `setIcon`, `setImage` and `setMedia` (a flowchart's node data); the fit is metadata. In the types
// that draw icons and images beside the label (`decorated`: mindmap nodes, states), the icon's place and size and the
// image's size are metadata too (T10 §4.6), the icon's place defaulting to the type's (`iconPos`: above a participant's
// name); a type whose stock Mermaid shows every label token as text (`iconsAsText`: sequence) says so.
import type { ItemRef } from '../../../../core/types.js';
import { h } from '../../../../ui/h.js';
import { registerMessages } from '../../../../ui/i18n.js';
import { EDITOR_MEDIA_MESSAGES } from '../../../../ui/messages/editor-media.js';
import { editKind } from '../../../kinds/registry.js';
import type { ItemMedia, MediaPatch } from '../../../kinds/types.js';
import { imageSources, mediaOf, setDecoration, setIconOf, setImageFit, setImageOf, setMediaOf } from '../../../ops/media.js';
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
  if (m.node) return nodeMedia(p, host, ref, m);
  // a label's icon token on a node that takes no icon of its own (a flowchart's plain shapes): it can become an icon node
  if (m.canIcon === false && !m.node && m.icon && k.setMedia) {
    sect(host, t('props.icon'));
    if (!isFaPack(splitIconName(m.icon)[0])) host.append(h('div', { class: 'hint' }, t('props.iconTokenMmdx')));
    const conv = h('button', { type: 'button' }, t('props.toIconNode'));
    conv.addEventListener('click', () => void setMediaOf(core, [ref], { node: 'icon' }));
    host.append(row(t('props.icon'), h('code', { class: 'hint' }, m.icon), conv));
  }
  if (k.setIcon && m.canIcon !== false) {
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
    if (m.icon) {
      if (k.iconsAsText) host.append(h('div', { class: 'hint' }, t('props.iconTokenText')));
      else if (!isFaPack(splitIconName(m.icon)[0])) host.append(h('div', { class: 'hint' }, t('props.iconTokenMmdx')));
      if (k.setMedia) {
        const conv = h('button', { type: 'button' }, t('props.toIconNode'));
        conv.addEventListener('click', () => void setMediaOf(core, [ref], { node: 'icon' }));
        host.append(row('', conv));
      }
    }
    if (k.decorated && m.icon) {
      // where the icon is drawn (inline before the text, above, below) and its size (inline: the font's)
      const meta = core.getM(ref.kind, ref.id);
      const pos = typeof meta['iconPos'] === 'string' ? meta['iconPos'] : k.iconPos ?? 'l';
      host.append(row(t('props.iconPos'), choice(t('props.iconPos'), ['l', 't', 'b'], pos, (v) => t(`media.iconPos.${v}`), (v) => setDecoration(core, [ref], 'iconPos', v))));
      host.append(row(t('props.iconSize'), size(t('props.iconSize'), typeof meta['iconSize'] === 'number' ? meta['iconSize'] : undefined, (v) => setDecoration(core, [ref], 'iconSize', v))));
    }
  }
  if (k.setImage && m.canImage) {
    sect(host, t('props.image'));
    const url = h('input', { type: 'text', readOnly: true, 'aria-label': t('props.imageUrl'), value: m.image ?? '' });
    const ctl: (Node | null)[] = [m.image ? url : h('span', { class: 'hint' }, t('props.imageNone'))];
    if (m.image) {
      const rm = h('button', { type: 'button', class: 'danger' }, t('props.removeImage'));
      rm.addEventListener('click', () => void setImageOf(core, [ref], null));
      ctl.push(rm);
    }
    host.append(row(t('props.imageUrl'), ...ctl));
    // a new or replacing picture: from the host's library, uploaded, or by its URL (the image tool on that tab)
    const names = { library: t('props.imageLibrary'), upload: t('props.imageUpload'), url: t('props.imageByUrl') };
    host.append(row('', ...imageSources(core).map((tab) => {
      const b = h('button', { type: 'button', dataset: { source: tab } }, names[tab]);
      b.addEventListener('click', () => core.run('openImageTool', b, { insert: false, tab }));
      return b;
    })));
    if (k.decorated && m.image !== null) {
      // the picture's box (one of the two: the other follows its aspect) and fit
      const meta = core.getM(ref.kind, ref.id);
      const num = (key: string): number | undefined => (typeof meta[key] === 'number' ? (meta[key] as number) : undefined);
      host.append(row(t('props.mediaW'), size(t('props.mediaW'), num('imgW'), (v) => setDecoration(core, [ref], 'imgW', v))));
      host.append(row(t('props.mediaH'), size(t('props.mediaH'), num('imgH'), (v) => setDecoration(core, [ref], 'imgH', v))));
      const fit = meta['imgFit'];
      host.append(row(t('props.fit'), choice(t('props.fit'), ['contain', 'cover', 'stretch'], typeof fit === 'string' ? fit : 'contain', (v) => t(`media.fit.${v}`), (v) => setImageFit(core, [ref], v))));
    }
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
  const k = editKind(core.model.type);
  sect(host, t('props.image'));
  const current = m.node === 'icon'
    ? h('code', { class: 'hint' }, m.icon ?? '')
    : m.image ? h('input', { type: 'text', readOnly: true, 'aria-label': t('props.imageUrl'), value: m.image }) : h('span', { class: 'hint' }, t('props.imageNone'));
  const rm = h('button', { type: 'button', class: 'danger' }, t('props.removeImage'));
  rm.addEventListener('click', () => void (m.node === 'icon' ? setIconOf(core, [ref], null) : setImageOf(core, [ref], null)));
  host.append(row(m.node === 'icon' ? t('props.icon') : t('props.imageUrl'), current, rm));
  // change it: a picture from the library, uploaded or by URL (the image tool on that tab), or an icon
  const names = { library: t('props.imageLibrary'), upload: t('props.imageUpload'), url: t('props.imageByUrl') };
  const buttons = (k?.setImage && m.canImage ? imageSources(core) : []).map((tab) => {
    const b = h('button', { type: 'button', dataset: { source: tab } }, names[tab]);
    b.addEventListener('click', () => core.run('openImageTool', b, { insert: false, tab }));
    return b;
  });
  if (k?.setIcon && m.canIcon !== false) {
    const ic = h('button', { type: 'button', dataset: { source: 'icon' } }, t('props.imageIcon'));
    ic.addEventListener('click', () => core.run('openImageTool', ic, { insert: false, tab: 'icon' }));
    buttons.push(ic);
  }
  host.append(row(t('props.changeImage'), ...buttons));
  if (m.node === 'icon') host.append(row(t('props.iconForm'), choice(t('props.iconForm'), ['', 'square', 'circle', 'rounded'], m.form ?? '', (v) => t(`media.form.${v || 'none'}`), (v) => void setMediaOf(core, [ref], { form: v || null }))));
  layoutRows(p, host, ref, m);
  if (m.node !== 'image') return;
  const lock = h('input', { type: 'checkbox', 'aria-label': t('props.aspect') });
  lock.checked = m.constraint === 'on';
  lock.addEventListener('change', () => void setMediaOf(core, [ref], { constraint: lock.checked ? 'on' : null }));
  host.append(row(t('props.aspect'), lock));
  const fit = core.getM(ref.kind, ref.id)['imgFit'];
  host.append(row(t('props.fit'), choice(t('props.fit'), ['contain', 'cover', 'stretch'], typeof fit === 'string' ? fit : 'contain', (v) => t(`media.fit.${v}`), (v) => setImageFit(core, [ref], v))));
}
