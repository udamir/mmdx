// Render dispatch (prototype render/index.js): model + meta + resolved theme → scene tree + geometry, plus the
// page and the standalone SVG export (§7). The kinds are passed in, as for parsing.

import type { DiagramMeta } from '../meta/types.js';
import type { DiagramModel } from '../model.js';
import { escAttr, fmt, serializeNodes } from '../scene/serialize.js';
import type { SceneNode } from '../scene/types.js';
import type { ResolvedTheme } from '../theme/types.js';
import type { Rect } from '../types.js';
import { toNumber } from '../validate.js';
import type { RenderEnv, SubResult } from './common.js';
import type { Kinds } from '../kinds/types.js';
import { effectivePage, fitPage, gridPattern, isClear, pageBounds, pageScene } from './page.js';
import type { RenderContext, RenderOptions, RenderResult } from './types.js';


/** What an unsupported (or empty) model renders: an empty 400×200 page (before the page minimum). */
const empty = (): SubResult => ({ defs: [], body: [], bounds: { x: 0, y: 0, w: 400, h: 200 }, geom: { type: null }, presetsUsed: {} });

export function renderWith(kinds: Kinds, model: DiagramModel, meta: DiagramMeta, theme: ResolvedTheme, ctx: RenderContext, opts: RenderOptions = {}): RenderResult {
  const canvas = effectivePage(model.type, meta, theme);
  const bg = ctx.color(canvas.background ?? theme.canvas.background);
  // renderers use this colour behind labels (halo) and inside markers: on a transparent page, the paper colour
  const paper = isClear(bg) ? ctx.color(theme.palette['paper']) ?? '#ffffff' : bg!;
  const env: RenderEnv = {
    ctx,
    theme,
    meta: { ...meta, canvas },
    opts,
    paper,
    pad: toNumber(canvas.pad) ?? theme.canvas.pad,
    diagnostics: [],
  };
  const kind = model.type ? kinds[model.type] : undefined;
  const r = kind && model.type ? kind.render(model, env) : empty();
  const contentBounds = r.bounds;
  const bounds = pageBounds(fitPage(r.bounds, canvas), canvas);
  const border = ctx.color(canvas.border ?? theme.canvas.border);
  const grid = ctx.color(canvas.grid ?? theme.canvas.grid);
  const defs = [...r.defs];
  if (grid) defs.push(gridPattern(ctx, grid));
  const out: RenderResult = {
    defs,
    body: r.body,
    bounds,
    contentBounds,
    page: { background: isClear(bg) ? 'transparent' : bg!, grid, border: isClear(border) ? null : border! },
    pageSettings: canvas,
    geom: r.geom,
    presetsUsed: r.presetsUsed,
  };
  if (env.diagnostics.length) out.diagnostics = env.diagnostics;
  return out;
}

export interface ExportScene {
  /** viewBox of the document (the page). */
  bounds: Rect;
  defs: SceneNode[];
  /** Page, then the diagram. */
  body: SceneNode[];
}

/** The scene of a standalone document: page + diagram (prototype `exportSvg` before serialization). */
export function exportScene(result: RenderResult, ctx: RenderContext): ExportScene {
  return { bounds: result.bounds, defs: result.defs, body: [...pageScene(result, ctx), ...result.body] };
}

export interface SvgStringOptions {
  /** Server-side render: marks the root for hydration and records how text was measured (§7.3). */
  ssr?: boolean;
}

/** Standalone `<svg xmlns=…>` document (export, SSR, previews), through the escaping serializer. */
export function renderSvgString(result: RenderResult, ctx: RenderContext, opts: SvgStringOptions = {}): string {
  const s = exportScene(result, ctx);
  const b = s.bounds;
  const extra = opts.ssr ? ` data-mmdx-ssr="1" data-mmdx-measure="${escAttr(ctx.measure.kind)}"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(b.x)} ${fmt(b.y)} ${fmt(b.w)} ${fmt(b.h)}" width="${fmt(b.w)}" height="${fmt(b.h)}"${extra}>` +
    `<defs>${serializeNodes(s.defs)}</defs>${serializeNodes(s.body)}</svg>`
  );
}
