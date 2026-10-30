// Page model (§7.4): page presets, page bounds, background / grid / border (prototype render/index.js `pageSvg`).
import type { CanvasMeta, DiagramMeta, PageSettings } from '../meta/types.js';
import { def, el } from '../scene/build.js';
import type { SceneNode } from '../scene/types.js';
import type { PagePresets, ResolvedTheme } from '../theme/types.js';
import type { DiagramType, Rect } from '../types.js';
import type { RenderContext, RenderResult } from './types.js';

/** A page fitted to the content is never smaller than this. */
export const MIN_PAGE = { w: 720, h: 420 } as const;

export const isClear = (c: string | null | undefined): boolean => !c || c === 'none' || c === 'transparent';

/**
 * Page presets: per diagram type in the theme (`flowchart.pagePresets`, …), chosen by `%%@ canvas {"preset": …}`.
 * A preset holds page settings: background, border, grid, pad, routing, ratio, and the sequence layout
 * (gap, rowH, mirror, blockSpan).
 */
export const pagePresets = (theme: ResolvedTheme, type: DiagramType): PagePresets => theme[type].pagePresets ?? {};

/** Page settings in effect: theme page defaults < the diagram's page preset < the diagram's own settings. */
export function effectivePage(type: DiagramType | null, meta: DiagramMeta, theme: ResolvedTheme): CanvasMeta {
  const name = meta.canvas.preset;
  const all = type ? pagePresets(theme, type) : {};
  const chosen = typeof name === 'string' && Object.prototype.hasOwnProperty.call(all, name) ? all[name] : undefined;
  const out: CanvasMeta = {};
  if (chosen) for (const [k, v] of Object.entries(chosen)) if (k !== 'label' && v !== undefined) out[k] = v;
  for (const [k, v] of Object.entries(meta.canvas)) if (v !== undefined) out[k] = v;
  return out;
}

/** `"16:9"` → 16 / 9; 0 when not a valid ratio. */
export function ratioOf(r: unknown): number {
  const m = /^([\d.]+):([\d.]+)$/.exec(typeof r === 'string' ? r : '');
  if (!m) return 0;
  const a = Number(m[1]), b = Number(m[2]);
  return a > 0 && b > 0 ? a / b : 0;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/**
 * Page size (meta.canvas):
 *   x, y, w, h   custom size — the page is that box, wherever the content is; none = fit the content
 *   ratio "16:9" proportions are locked: a fitted page grows around the content to match them,
 *                a custom page keeps them while its width / height are edited
 */
export function pageBounds(b: Rect, c: Partial<CanvasMeta> = {}): Rect {
  const w0 = num(c.w), h0 = num(c.h);
  if (w0 && h0) return { x: num(c.x) ?? 0, y: num(c.y) ?? 0, w: w0, h: h0 };
  const k = ratioOf(c.ratio);
  if (!k) return b;
  let w = b.w, h = b.h;
  if (w / h < k) w = h * k;
  else h = w / k;
  return { x: b.x - (w - b.w) / 2, y: b.y - (h - b.h) / 2, w, h };
}

/**
 * A page fitted to the content is never smaller than MIN_PAGE (room to start on — the "drag shapes…" hint of an
 * empty diagram sits in it — and no jump when the first shapes arrive); it grows around the content's centre.
 */
export function fitPage(b: Rect, c: Partial<PageSettings & { w?: number; h?: number }>): Rect {
  if (num(c.w) && num(c.h)) return b;
  const w = Math.max(b.w || 0, MIN_PAGE.w), h = Math.max(b.h || 0, MIN_PAGE.h);
  return { x: b.x + (b.w || 0) / 2 - w / 2, y: b.y + (b.h || 0) / 2 - h / 2, w, h };
}

const GRID = 'page-grid';

/** `<pattern>` of the page grid (id `${idPrefix}page-grid`). */
export function gridPattern(ctx: RenderContext, color: string): SceneNode {
  const id = `${ctx.idPrefix.replace(/[^\w-]/g, '')}${GRID}`;
  return def('pattern', { id, width: 24, height: 24, patternUnits: 'userSpaceOnUse' }, [
    el('path', { d: 'M24,0 H0 V24', fill: 'none', stroke: color, 'stroke-width': 1 }),
  ], id);
}

/**
 * Page = background + optional grid + border (background and border transparent by default), drawn under the
 * diagram. The grid pattern itself is in `result.defs`.
 */
export function pageScene(result: Pick<RenderResult, 'bounds' | 'page'>, ctx: RenderContext): SceneNode[] {
  const { x, y, w, h } = result.bounds;
  const c = result.page;
  // transparent unless a background is set ("transparent" still takes clicks, so the page can be selected)
  const out: SceneNode[] = [el('rect', { class: 'page', x, y, width: w, height: h, fill: isClear(c.background) ? 'transparent' : c.background }, 'page')];
  if (c.grid) out.push(el('rect', { x, y, width: w, height: h, fill: `url(#${ctx.idPrefix.replace(/[^\w-]/g, '')}${GRID})` }, 'page-grid'));
  if (!isClear(c.border)) out.push(el('rect', { x: x + 1, y: y + 1, width: w - 2, height: h - 2, fill: 'none', stroke: c.border, 'stroke-width': 2 }, 'page-border'));
  return out;
}
