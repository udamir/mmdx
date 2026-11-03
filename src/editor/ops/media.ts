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
    return !!m && (what === 'icon' || m.canImage);
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

/** Sets (or with null removes) the icon of items. */
export const setIconOf = (core: EditorCore, refs: readonly ItemRef[], icon: string | null): boolean =>
  each(core, core.i18n.t('history.icon'), refs, (k, code, m, ref) => k.setIcon?.(code, m, ref, icon, core) ?? null);

/** Sets (or with null removes) the image of items; `url` passed the image policy. */
export const setImageOf = (core: EditorCore, refs: readonly ItemRef[], url: string | null): boolean =>
  each(core, core.i18n.t('history.image'), refs, (k, code, m, ref) => k.setImage?.(code, m, ref, url, core) ?? null);

/** Changes the layout keys (position, frame, size, aspect lock) of icon and image items. */
export const setMediaOf = (core: EditorCore, refs: readonly ItemRef[], patch: MediaPatch): boolean =>
  each(core, core.i18n.t('history.media'), refs, (k, code, m, ref) => k.setMedia?.(code, m, ref, patch, core) ?? null);

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
