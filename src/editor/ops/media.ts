// Icons and images of the selection (T05, no UI): what the selected items show and the writes the icon picker, the
// image tool, the selection toolbar and Properties make, through the edit kind's `media`, `setIcon`, `setImage` and
// `setMedia`. Several items change in one history step (each write sees the code the one before left).
import { reparse } from '../../core/kinds/registry.js';
import type { CodeResult } from '../../core/ops/types.js';
import type { ItemRef } from '../../core/types.js';
import type { SupportedModel } from '../../core/model.js';
import type { EditorCore, Sel } from '../core.js';
import { editKind, withEdit } from '../kinds/registry.js';
import type { EditKind, ItemMedia, MediaPatch } from '../kinds/types.js';
import { patchStateMedia, setStateIcon, setStateImage } from '../../core/ops/state-media.js';

/** An item's icon and image (null: it takes neither, or its type has no media). */
export function mediaOf(core: EditorCore, ref: ItemRef): ItemMedia | null {
  return withEdit(core.model, (k, m) => k.media?.(m, ref, core)) ?? null;
}

/** The selected items that take an icon (`icon`) or an image (`image`). */
export function mediaTargets(core: EditorCore, what: 'icon' | 'image'): Sel[] {
  const k = editKind(core.model.type);
  if (!k || (what === 'icon' ? !k.setIcon : !k.setImage)) return [];
  return core.selection().filter((r) => {
    const m = mediaOf(core, r);
    return !!m && (what === 'icon' ? m.canIcon !== false : m.canImage);
  });
}

/** Runs a write on each item in turn and applies the result as one step; false when nothing changed. */
function each(core: EditorCore, label: string, refs: readonly ItemRef[], f: (k: EditKind, code: string, model: SupportedModel, ref: ItemRef) => CodeResult | null): boolean {
  if (!refs.length) return false;
  let code = core.code;
  for (const ref of refs) {
    const r = withEdit(code === core.code ? core.model : reparse(code), (k, m) => f(k, code, m, ref));
    if (r) code = r.code;
  }
  return code !== core.code && core.applyCode({ code }, label, { select: [...refs] });
}

/** A metadata write on each item (image and icon items kept in metadata: `mediaNodesInMeta`), in one history step. */
function inMeta(core: EditorCore, label: string, refs: readonly ItemRef[], f: (m: Record<string, unknown>) => void): boolean {
  if (!refs.length) return false;
  core.change(label, () => {
    for (const r of refs) {
      f(core.ensure(r.kind, r.id) as Record<string, unknown>);
      core.tidy(r.kind, r.id);
    }
  });
  return true;
}

const metaMedia = (core: EditorCore): boolean => !!editKind(core.model.type)?.mediaNodesInMeta;

/** Sets (or with null removes) the icon of items. */
export const setIconOf = (core: EditorCore, refs: readonly ItemRef[], icon: string | null): boolean =>
  metaMedia(core) ? inMeta(core, core.i18n.t('history.icon'), refs, (m) => setStateIcon(m, icon)) : each(core, core.i18n.t('history.icon'), refs, (k, code, m, ref) => k.setIcon?.(code, m, ref, icon, core) ?? null);

/** Sets (or with null removes) the image of items; `url` passed the image policy. */
export function setImageOf(core: EditorCore, refs: readonly ItemRef[], url: string | null): boolean {
  if (metaMedia(core)) return inMeta(core, core.i18n.t('history.image'), refs, (m) => setStateImage(m, url));
  // a type without image syntax keeps the URL in the item's metadata (`img`: mindmap nodes; T10's participants…)
  if (editKind(core.model.type)?.imageInMeta) {
    if (!refs.length) return false;
    core.change(core.i18n.t('history.image'), () => {
      for (const r of refs) {
        const m = core.ensure(r.kind, r.id);
        if (url) m['img'] = url;
        else delete m['img'];
        core.tidy(r.kind, r.id);
      }
    });
    return true;
  }
  return each(core, core.i18n.t('history.image'), refs, (k, code, m, ref) => k.setImage?.(code, m, ref, url, core) ?? null);
}

/** Changes the layout keys (position, frame, size, aspect lock) of icon and image items. */
export const setMediaOf = (core: EditorCore, refs: readonly ItemRef[], patch: MediaPatch): boolean =>
  metaMedia(core) ? inMeta(core, core.i18n.t('history.media'), refs, (m) => patchStateMedia(m, patch)) : each(core, core.i18n.t('history.media'), refs, (k, code, m, ref) => k.setMedia?.(code, m, ref, patch, core) ?? null);

/**
 * Metadata keys of the icon and the image beside a label (T10 §4.6: `iconPos`, `iconSize`, `imgW`, `imgH`; null or the
 * default — the type's `iconPos`, else `l` — removes the key), in one history step.
 */
export function setDecoration(core: EditorCore, refs: readonly ItemRef[], key: 'iconPos' | 'iconSize' | 'imgW' | 'imgH', value: string | number | null): void {
  const pos = editKind(core.model.type)?.iconPos ?? 'l';
  core.change(core.i18n.t('history.media'), () => {
    for (const r of refs) {
      const m = core.ensure(r.kind, r.id);
      if (value === null || value === '' || (key === 'iconPos' && value === pos)) delete m[key];
      else (m as Record<string, unknown>)[key] = value;
      core.tidy(r.kind, r.id);
    }
  });
}

/** The image fit (contain, cover, stretch): item metadata `imgFit` (mmdx only; Mermaid has the aspect lock alone). */
export function setImageFit(core: EditorCore, refs: readonly ItemRef[], fit: string | null): void {
  core.change(core.i18n.t('history.media'), () => {
    for (const r of refs) {
      const m = core.ensure(r.kind, r.id);
      if (fit && fit !== 'contain') m['imgFit'] = fit;
      else delete m['imgFit'];
      core.tidy(r.kind, r.id);
    }
  });
}
