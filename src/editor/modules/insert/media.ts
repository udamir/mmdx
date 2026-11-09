// The editor's pickers (T05 §4.3–4.5), a lazy chunk of the insert module: the icon picker over the icon registry
// (`searchIcons`, previews by `iconImage`), the image tool (the host's image library and upload —
// its image store, else `uploadImage` —, the image policy's check, an offer to reduce big pictures) and the emoji picker (the emoji data, a chunk of its own per locale). Each opens as a
// dialog popover beside its button, with Tab kept inside. A chosen icon goes on the selected items (`setIcon`); the image
// tool in insert mode adds an image item through the edit kind (`addImage`), else it sets the selected item's image.
import { checkImageUrl } from '../../../core/media/policy.js';
import { iconImage } from '../../../core/icons/draw.js';
import { searchIcons } from '../../../core/icons/search.js';
import type { Point } from '../../../core/types.js';
import { loadEmoji } from '../../../emoji/data.js';
import { h } from '../../../ui/h.js';
import { registerMessages } from '../../../ui/i18n.js';
import { BLOCK_MESSAGES_MEDIA } from '../../../ui/messages/blocks-media.js';
import { EDITOR_MEDIA_MESSAGES } from '../../../ui/messages/editor-media.js';
import { createEmojiPicker, EMOJI_PICKER_CSS } from '../../../ui/blocks/emoji-picker.js';
import { createIconPicker, ICON_PICKER_CSS } from '../../../ui/blocks/icon-picker.js';
import { createImagePicker, IMAGE_PICKER_CSS, type ImageTab } from '../../../ui/blocks/image-picker.js';
import type { ImageInfo } from '../../../adapters/images.js';
import { reduceImage, imageSize } from '../../../dom/downscale.js';
import type { EditorCore } from '../../core.js';
import { editKind, withEdit } from '../../kinds/registry.js';
import { mediaOf, mediaTargets, setIconOf, setImageOf } from '../../ops/media.js';
import { canvasCenter } from '../shapes/drag.js';

registerMessages(BLOCK_MESSAGES_MEDIA);
registerMessages(EDITOR_MEDIA_MESSAGES);

export const MEDIA_CSS = /* css */ `
.ins-pop.mmdx-pop { position: fixed; padding: 10px; }
`;

const RECENT_ICONS = 'icons.recent', RECENT_EMOJI = 'emoji.recent', TONE = 'emoji.tone';

const remember = (core: EditorCore, key: string, v: string, n: number): void => {
  const list = (core.storage.get<string[]>(key) ?? []).filter((x) => typeof x === 'string' && x !== v);
  core.storage.set(key, [v, ...list].slice(0, n));
};

/** The chrome's text colour (monochrome icon previews): a colour literal, else the default ink. */
function inkOf(core: EditorCore): string {
  const v = typeof getComputedStyle === 'function' ? getComputedStyle(core.root).getPropertyValue('--mmdx-text').trim() : '';
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : '#1f2328';
}

/** Puts a popover beside its anchor (right of a dock button, below anything else), inside the viewport. */
function place(el: HTMLElement, anchor: HTMLElement | null, core: EditorCore): void {
  const r = anchor?.getBoundingClientRect() ?? core.dom.wrap.getBoundingClientRect();
  const vw = typeof innerWidth === 'number' ? innerWidth : 1024, vh = typeof innerHeight === 'number' ? innerHeight : 768;
  const w = el.offsetWidth || 360, ht = el.offsetHeight || 420;
  const dock = !!anchor?.closest('.tool-dock');
  let left = dock ? r.right + 10 : r.left, top = dock ? r.top - 20 : r.bottom + 6;
  if (!anchor) {
    left = r.left + r.width / 2 - w / 2;
    top = r.top + 60;
  }
  el.style.left = `${Math.round(Math.max(8, Math.min(left, vw - w - 8)))}px`;
  el.style.top = `${Math.round(Math.max(8, Math.min(top, vh - ht - 8)))}px`;
}

/** Opens `content` as a dialog popover (Tab kept inside, Esc and an outside press close it). */
function openPop(core: EditorCore, content: HTMLElement, anchor: HTMLElement | null, onClose: () => void): HTMLElement {
  const pop = h('div', { class: 'ins-pop' }, content);
  core.dom.shadow.append(pop);
  core.popovers.open(pop, anchor, { onClose, trap: true });
  place(pop, anchor, core);
  return pop;
}

/** Where an insert-mode choice lands: the given point, else the middle of the canvas (snapped). */
const spot = (core: EditorCore, at?: Point): Point => {
  const p = at ?? canvasCenter(core);
  return { x: core.snapV(p.x), y: core.snapV(p.y) };
};

// ---- icon picker -----------------------------------------------------------------------------------------------------

export function openIconPicker(core: EditorCore, anchor: HTMLElement | null): void {
  if (anchor && core.popovers.isOpenFor(anchor)) return core.popovers.close();
  const t = core.i18n.t;
  const targets = mediaTargets(core, 'icon');
  if (!targets.length) return core.toast(t('media.selectIcon'));
  core.addCss([ICON_PICKER_CSS, MEDIA_CSS]);
  const reg = core.ctx.icons;
  const ink = inkOf(core);
  const current = targets.length === 1 ? mediaOf(core, targets[0]!)?.icon ?? null : null;
  const hasIcon = targets.some((r) => !!mediaOf(core, r)?.icon);
  const close = (): void => core.popovers.close(true);
  const choose = (name: string): void => {
    remember(core, RECENT_ICONS, name, 16);
    setIconOf(core, targets, name);
  };
  const picker = createIconPicker({
    t,
    packs: () => reg.packList().map((p) => ({
      name: p.name, title: p.info?.name ?? p.name, loaded: p.loaded, failed: p.failed, builtin: p.builtin,
      ...(p.info?.license?.title ? { license: p.info.license.title } : {}),
    })),
    find: (q, pack) => {
      if (q) return searchIcons(reg, q, { ...(pack ? { packs: [pack] } : {}), limit: 600 }).map((x) => x.name);
      const out: string[] = [];
      for (const name of pack ? [pack] : reg.packNames()) {
        const icons = reg.packData(name)?.icons ?? {};
        for (const [n, ic] of Object.entries(icons)) if (!ic.hidden) out.push(`${name}:${n}`);
      }
      return out;
    },
    preview: (name) => iconImage(reg, name, { color: ink, size: 28 }).href,
    load: (pack) => reg.load(pack),
    recent: core.storage.get<string[]>(RECENT_ICONS) ?? [],
    current,
    onPick: (name) => {
      choose(name);
      close();
    },
    onRemove: hasIcon ? () => {
      setIconOf(core, targets, null);
      close();
    } : null,
  });
  // the built-in set is a lazy chunk: listed once it is in
  const off = reg.onChange(() => picker.refresh());
  for (const p of reg.packList()) if (p.builtin && !p.loaded) void reg.load(p.name);
  openPop(core, picker.el, anchor, () => {
    off();
    picker.destroy();
  });
}

// ---- image tool ------------------------------------------------------------------------------------------------------

export function openImageTool(core: EditorCore, anchor: HTMLElement | null, o: { insert?: boolean; file?: File; at?: Point; tab?: ImageTab }): void {
  if (anchor && core.popovers.isOpenFor(anchor)) return core.popovers.close();
  core.addCss([IMAGE_PICKER_CSS, MEDIA_CSS]);
  const t = core.i18n.t;
  const kind = editKind(core.model.type);
  const targets = o.insert ? [] : mediaTargets(core, 'image');
  const insert = !targets.length;
  if (insert && !kind?.addImage) return core.toast(t('media.noImages'));
  const current = targets.length === 1 ? mediaOf(core, targets[0]!)?.image ?? '' : '';
  const close = (): void => core.popovers.close(true);
  const upload = core.upload;
  const store = core.images;
  const picker = createImagePicker({
    t,
    value: current,
    ...(o.tab ? { tab: o.tab } : {}),
    library: store ? (q) => store.list(q) : null,
    thumbUrl: (img) => thumbUrl(core, img),
    submitLabel: insert ? t('image.add') : t('image.replace'),
    check: (url) => {
      const r = checkImageUrl(url, core.ctx.imagePolicy, core.ctx.resolveUrl);
      return 'reason' in r ? t(`image.reason.${r.reason}`) : null;
    },
    upload: upload ? async (file) => (await upload(file)).url : null,
    measure: imageSize,
    reduce: reduceImage,
    onSubmit: (url) => {
      // the URL passed the policy in the block; checked again here (an upload's URL as well)
      if ('reason' in checkImageUrl(url, core.ctx.imagePolicy, core.ctx.resolveUrl)) return core.toast(t('media.blocked'), { error: true });
      if (insert) withEdit(core.model, (k, m) => k.addImage?.(core, m, url, spot(core, o.at)));
      else setImageOf(core, targets, url);
      close();
    },
    onRemove: !insert && targets.some((r) => !!mediaOf(core, r)?.image) ? () => {
      setImageOf(core, targets, null);
      close();
    } : null,
    onRefused: (msg) => core.toast(msg),
  });
  // the library follows the store (a picture added or removed elsewhere)
  const off = store?.subscribe?.(() => void picker.refresh());
  openPop(core, picker.el, anchor, () => {
    off?.();
    picker.destroy();
  });
  if (o.file) void picker.takeFile(o.file);
}

/**
 * A library tile's picture: the record's `thumb`, else its `url` through the host's `resolveUrl` — loaded by the
 * browser in the editor's own UI, so only web and inline picture URLs (null: a blank tile).
 */
function thumbUrl(core: EditorCore, img: ImageInfo): string | null {
  const raw = img.thumb ?? img.url;
  let url: unknown = raw;
  try {
    url = img.thumb ? raw : core.ctx.resolveUrl?.(raw, 'image') ?? raw;
  } catch {
    url = raw;
  }
  return typeof url === 'string' && /^(https?:|blob:|data:image\/)/i.test(url.trim()) ? url.trim() : null;
}

// ---- emoji picker ----------------------------------------------------------------------------------------------------

/** Opens the emoji picker; the emoji go to `onPick` (it stays open for more), `onClose` runs when it closes. */
export function pickEmoji(core: EditorCore, anchor: HTMLElement, onPick: (emoji: string) => void, onClose?: () => void): void {
  if (core.popovers.isOpenFor(anchor)) return core.popovers.close();
  core.addCss([EMOJI_PICKER_CSS, MEDIA_CSS]);
  const t = core.i18n.t;
  const box = h('div', { class: 'ep-wait', role: 'status' }, t('emoji.loading'));
  let destroy: (() => void) | null = null;
  let open = true;
  openPop(core, box, anchor, () => {
    open = false;
    destroy?.();
    onClose?.();
  });
  void loadEmoji(core.i18n.locale).then((data) => {
    if (!open) return;
    const picker = createEmojiPicker({
      t, data,
      recent: core.storage.get<string[]>(RECENT_EMOJI) ?? [],
      tone: core.storage.get<number>(TONE) ?? 0,
      onTone: (n) => core.storage.set(TONE, n),
      onPick: (e) => {
        remember(core, RECENT_EMOJI, e, 27);
        onPick(e);
      },
    });
    destroy = () => picker.destroy();
    box.replaceWith(picker.el);
    picker.focus();
  }, () => {
    box.textContent = t('emoji.failed');
  });
}
