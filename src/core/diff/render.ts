// Rendering a diff (§7.5): both versions, the merged picture, the filtered change list and one shared coordinate space, from two sources. `renderDiffToSvgWith` composes any view into one standalone SVG (exports, CI bots, SSR). Everything here renders with the given diagram kinds (component architecture §9.1: <mmdx-diff> loads the kinds of both versions on demand); the all-kinds wrappers are in all.ts, so a bundle that loads kinds ships none statically.
import { diffKind } from '../kinds/registry.js';
import type { CoreContext } from '../context-base.js';
import { isSupported, type DiagramModel } from '../model.js';
import { parseWith } from '../parse/dispatch.js';
import { renderDocumentWith, renderSourceWith, type Kinds, type PipelineOptions, type Rendered } from '../pipeline-core.js';
import { pageScene } from '../render/page.js';
import { el, g, text } from '../scene/build.js';
import { escAttr, fmt, serializeNodes } from '../scene/serialize.js';
import { withoutMarks } from '../text/marks.js';
import type { SceneNode } from '../scene/types.js';
import type { Rect } from '../types.js';
import { annotate, badgeIcon, centreOf, DIFF_COLORS, MARKS, shapeOf, type DiffColors, type DiffView, type Mark } from './annotate.js';
import { diffDiagramsWith, ignoreFacets } from './index.js';
import type { DiagramDiff, DiffIgnore, ItemChange } from './types.js';
import { withLayoutOf, withoutStyle } from './transform.js';
import { mergeDiagrams, type Merged } from './merge.js';
import { maxOf } from '../geom.js';

// The merged picture measures its labels without the change marks (annotate turns them into styled runs). One derived
// context per context, so its layout cache lives as long as the caller's.
const marklessContexts = new WeakMap<CoreContext, CoreContext>();
const marklessContext = (ctx: CoreContext): CoreContext => {
  let m = marklessContexts.get(ctx);
  if (!m) marklessContexts.set(ctx, (m = { ...ctx, measure: withoutMarks(ctx.measure) }));
  return m;
};

export interface DiffHide {
  added?: boolean;
  removed?: boolean;
}

export interface DiffRenderOptions extends PipelineOptions {
  /** Facets to ignore: their field changes are dropped (Layout off draws the old version on the new layout, Style off draws both unstyled). */
  ignore?: DiffIgnore;
  /** Added / removed items to leave out of the change list and the highlights. */
  hide?: DiffHide;
}

export interface DiffRendered {
  /** The diff of the two sources as they are. */
  raw: DiagramDiff;
  /** The diff with the filters applied. */
  diff: DiagramDiff;
  /** Changed, added and removed items, top to bottom and left to right in the drawing. */
  changes: ItemChange[];
  before: Rendered;
  after: Rendered;
  /** The merged picture; null when the diagram type changed. */
  merged: (Rendered & { status: Merged['status'] }) | null;
  /** The sources as drawn (style removed, old layout replaced, as the filters ask). */
  sources: { before: string; after: string };
  /** Layout off moved the old version onto the new layout. */
  layoutAligned: boolean;
  /** Union of the pages of both versions: every view shares this coordinate space. */
  bounds: Rect;
  /** The theme both versions were drawn with. */
  themeId: string;
}

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** Renders a diff with the given diagram kinds (parsers and renderers of both versions' types); `renderDiff` (all.ts) uses every kind. */
export function renderDiffWith(kinds: Kinds, before: string, after: string, ctx: CoreContext, o: DiffRenderOptions = {}): DiffRendered {
  const ignore = o.ignore ?? {};
  const hide = o.hide ?? {};
  // each code parsed once (P13): the diff and the two renders read the same models; only a style-less code is new
  const models = new Map<string, DiagramModel>();
  const parse = (code: string): DiagramModel => models.get(code) ?? models.set(code, parseWith(code, kinds)).get(code)!;
  const raw = diffDiagramsWith(kinds, before, after, parse);
  const ignored = ignoreFacets(raw, ignore);
  const items = ignored.items.map((c) => (hide[c.status as 'added' | 'removed'] ? { ...c, status: 'unchanged' as const } : c));
  const diff: DiagramDiff = {
    ...ignored,
    items,
    counts: { ...ignored.counts, added: hide.added ? 0 : ignored.counts.added, removed: hide.removed ? 0 : ignored.counts.removed },
  };
  let srcBefore = before, srcAfter = after;
  if (ignore.style) {
    srcBefore = withoutStyle(srcBefore);
    srcAfter = withoutStyle(srcAfter);
  }
  // sequence metadata is keyed by position, so its layout cannot be transplanted by id
  const layoutAligned = !!ignore.layout && !diffKind(raw.type)?.positionalIds && !raw.typeChanged;
  if (layoutAligned) srcBefore = withLayoutOf(srcBefore, srcAfter);
  const { ignore: _i, hide: _h, ...pipe } = o;
  // both versions with one theme (a fair comparison): the forced one, else the after version's own
  const ra = renderSourceWith(kinds, srcAfter, ctx, pipe, parse);
  const theme = ra.themeId;
  const popts: PipelineOptions = { ...pipe, theme };
  const rb = renderSourceWith(kinds, srcBefore, ctx, popts, parse);

  const pos = (c: ItemChange): { x: number; y: number } => {
    const s = c.status === 'removed' ? shapeOf(rb.result.geom, c.kind, c.beforeId ?? c.id) : shapeOf(ra.result.geom, c.kind, c.id);
    return s ? centreOf(s) : { x: 0, y: 0 };
  };
  const changes = diff.items
    .filter((c) => c.status !== 'unchanged')
    .map((c) => ({ c, p: pos(c) }))
    .sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x)
    .map((x) => x.c);

  let merged: DiffRendered['merged'] = null;
  const m = isSupported(rb.model) && isSupported(ra.model) ? mergeDiagrams(diff, rb.model, ra.model, rb.doc.meta, ra.doc.meta) : null;
  if (m) {
    const doc = { code: '', meta: m.meta };
    merged = { ...renderDocumentWith(kinds, doc, m.model, marklessContext(ctx), popts), doc, model: m.model, tooLarge: false, diagnostics: [], status: m.status };
  }
  let bounds = union(rb.result.bounds, ra.result.bounds);
  if (merged) bounds = union(bounds, merged.result.bounds);
  return { raw, diff, changes, before: rb, after: ra, merged, sources: { before: srcBefore, after: srcAfter }, layoutAligned, bounds, themeId: theme };
}

/** The Rendered of one view (merged falls back to after when the diagram type changed). */
export const renderedOf = (d: DiffRendered, view: DiffView): Rendered => (view === 'before' ? d.before : view === 'after' ? d.after : d.merged ?? d.after);

// ---- standalone SVG -----------------------------------------------------------------------------------------------

export interface DiffSvgOptions {
  view?: DiffView | 'side';
  dim?: boolean;
  /** Highlights, badges, move arrows and word highlighter (default true). */
  highlights?: boolean;
  /** A legend of the highlight colours under the picture (default true). */
  legend?: boolean;
  /** Colours of the highlights: the light or the dark token set (default light). */
  scheme?: 'light' | 'dark';
  /** Titles over the two pages of the side-by-side view. */
  titles?: { before?: string; after?: string };
  /** Badge size factor (default 1). */
  badgeScale?: number;
  ssr?: boolean;
}

/** The trusted style block of exported diffs: word marks (the scene carries their class tokens only). */
const exportCss = (c: DiffColors): string =>
  `.dx-ins{fill:${c.marks.added.c};font-weight:700}.dx-del{fill:${c.marks.removed.c};text-decoration:line-through}`;

interface Page {
  bounds: Rect;
  defs: SceneNode[];
  nodes: SceneNode[];
}

function pageOf(d: DiffRendered, view: DiffView, o: DiffSvgOptions, colors: DiffColors): Page {
  const r = renderedOf(d, view);
  const v: DiffView = view === 'merged' && !d.merged ? 'after' : view;
  const a = annotate({ view: v, result: r.result, before: d.before.result, changes: d.changes, measure: r.rctx.measure }, {
    dim: o.dim ?? true, highlights: o.highlights ?? true, colors, ...(o.badgeScale ? { badgeScale: o.badgeScale } : {}),
  });
  const bounds = r.result.bounds;
  return { bounds, defs: r.result.defs, nodes: [...pageScene(r.result, r.rctx), ...a.body, g({ class: 'dx-runs' }, a.runs), g({ class: 'dx-layer' }, a.overlay)] };
}

const FONT = 'system-ui, -apple-system, sans-serif';

function legend(x: number, y: number, d: DiffRendered, colors: DiffColors, ink: string): SceneNode {
  const names: Record<Mark, string> = { added: 'added', removed: 'removed', content: 'content', layout: 'layout', style: 'style' };
  const n = d.diff.counts;
  const parts: SceneNode[] = [];
  let cx = x;
  for (const m of MARKS) {
    const c = colors.marks[m].c;
    parts.push(el('rect', { x: cx, y: y - 9, width: 18, height: 18, rx: 9, fill: c }));
    parts.push(badgeIcon(m, cx + 3, y - 6, 12, '#ffffff'));
    const label = `${names[m]} ${n[m]}`;
    parts.push(text({ 'dominant-baseline': 'central', 'font-family': FONT, 'font-size': 12, fill: ink }, [{ text: label, x: cx + 24, y }]));
    cx += 24 + label.length * 7 + 16;
  }
  return g({ class: 'dx-legend' }, parts);
}

/** One view of a rendered diff as a standalone SVG document. */
export function diffSvg(d: DiffRendered, o: DiffSvgOptions = {}): string {
  const colors = DIFF_COLORS[o.scheme ?? 'light'];
  const ink = o.scheme === 'dark' ? '#e6e8ee' : '#1d2330';
  const view = o.view ?? 'merged';
  const pages: { page: Page; title?: string }[] =
    view === 'side'
      ? [{ page: pageOf(d, 'before', o, colors), title: o.titles?.before ?? 'Before' }, { page: pageOf(d, 'after', o, colors), title: o.titles?.after ?? 'After' }]
      : [{ page: pageOf(d, view, o, colors) }];
  const gap = 32, titleH = view === 'side' ? 32 : 0, legendH = o.legend === false ? 0 : 36;
  const width = pages.reduce((w, p) => w + p.page.bounds.w, 0) + gap * (pages.length - 1);
  const height = maxOf(pages.map((p) => p.page.bounds.h)) + titleH + legendH;
  const defs = new Map<string, SceneNode>();
  const body: SceneNode[] = [];
  let dx = 0;
  for (const { page, title } of pages) {
    for (const n of page.defs) defs.set(n.key ?? `${defs.size}`, n);
    const b = page.bounds;
    if (title) body.push(text({ 'font-family': FONT, 'font-size': 14, 'font-weight': 600, fill: ink, 'dominant-baseline': 'central' }, [{ text: title, x: dx + 4, y: titleH / 2 }]));
    body.push(g({ transform: `translate(${fmt(dx - b.x)} ${fmt(titleH - b.y)})` }, page.nodes));
    dx += b.w + gap;
  }
  if (legendH) body.push(legend(8, height - legendH / 2, d, colors, ink));
  const extra = o.ssr ? ' data-mmdx-ssr="1"' : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}"${extra} data-mmdx-diff="${escAttr(view)}">` +
    `<style>${exportCss(colors)}</style><defs>${serializeNodes([...defs.values()])}</defs>${serializeNodes(body)}</svg>`
  );
}

/** Server-side and build-time rendering of a diff (CI bots, MR comments) with the given diagram kinds: two sources → one standalone SVG of a view. Uses the static text measurer unless the context brings another one. Works in Node and workers (no DOM). `renderDiffToSvg` (all.ts) uses every kind. */
/** `ctx` is given (B41: a default here would put the built-in themes in every bundle that renders a diff). */
export async function renderDiffToSvgWith(kinds: Kinds, before: string, after: string, o: DiffRenderOptions & DiffSvgOptions & { ctx: CoreContext }): Promise<string> {
  const ctx = o.ctx;
  const ropts: DiffRenderOptions = {};
  if (o.theme) ropts.theme = o.theme;
  if (o.ignore) ropts.ignore = o.ignore;
  if (o.hide) ropts.hide = o.hide;
  return diffSvg(renderDiffWith(kinds, before, after, ctx, ropts), o);
}
