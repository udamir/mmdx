// Page ops of the editor (no UI): the page values in effect, page presets, fit / custom page size and proportions,
// each applied as one history step. Shared by the Properties panel and the page toolbar.
import type { DiagramMeta } from '../../core/meta/types.js';
import { setPage, setPagePreset } from '../../core/ops/meta-ops.js';
import { cloneMeta } from '../../core/ops/meta-util.js';
import { effectivePage, ratioOf } from '../../core/render/page.js';
import type { EditorCore } from '../core.js';
import { applyMeta } from './doc.js';

/** Named proportions (the label is an i18n key when it starts with `ratio.`). */
export { RATIOS } from '../../ui/diagram/page-ratios.js';

/** Page values in effect: theme < page preset < the diagram's own. */
export const pageEff = (core: EditorCore): ReturnType<typeof effectivePage> => effectivePage(core.model.type, core.meta, core.result.theme);

/** The metadata with one page value set (`dflt`: the value that means "not set"); not applied. */
export function setPageValue(core: EditorCore, k: string, v: unknown, dflt?: unknown): DiagramMeta {
  return setPage(core.meta, core.result.theme, core.model.type, k, v, dflt).meta;
}

export function choosePagePreset(core: EditorCore, id: string): void {
  applyMeta(core, core.i18n.t('history.pagePreset'), setPagePreset(core.meta, id || null));
}

/** Fit content / custom page size (a custom page starts from the current page). */
export function setPageSizeMode(core: EditorCore, mode: string): void {
  const out = cloneMeta(core.meta), c = out.canvas, b = core.result.result.bounds;
  if (mode === 'fit') {
    delete c.w;
    delete c.h;
    delete c.x;
    delete c.y;
  } else if (!(c.w && c.h)) Object.assign(c, { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
  applyMeta(core, core.i18n.t('history.pageSize'), { meta: out });
}

/** Proportions; a custom page keeps its width and centre. */
export function setPageRatio(core: EditorCore, r: string): void {
  const meta = setPageValue(core, 'ratio', r || '', '');
  const c = meta.canvas;
  const kk = ratioOf(r);
  if (c.w && c.h && kk) {
    const cy = (c.y ?? 0) + c.h / 2, hh = Math.round(c.w / kk);
    Object.assign(c, { h: hh, y: Math.round(cy - hh / 2) });
  }
  applyMeta(core, core.i18n.t('history.pageRatio'), { meta });
}
