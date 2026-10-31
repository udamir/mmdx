// Rendering a diff (§7.5): both versions, the merged picture, the filtered change list and one shared coordinate
// space, from two sources. `renderDiffToSvg` composes any view into one standalone SVG (exports, CI bots, SSR).
import { createContext, type CoreContext } from '../context.js';
import { isSupported } from '../model.js';
import { renderDocument, renderSource, type PipelineOptions, type Rendered } from '../pipeline.js';
import { pageScene } from '../render/page.js';
import { el, g, text } from '../scene/build.js';
import { escAttr, escText, fmt, serializeNodes, setMarkedText } from '../scene/serialize.js';
import { hasMarks, markRuns } from '../text/marks.js';
import type { SceneNode } from '../scene/types.js';
import type { Rect } from '../types.js';
import { annotate, centreOf, DIFF_COLORS, MARKS, shapeOf, type DiffColors, type DiffView, type Mark } from './annotate.js';
import { diffDiagrams, ignoreFacets, type DiagramDiff, type DiffIgnore, type ItemChange } from './index.js';
import { withLayoutOf, withoutStyle } from './transform.js';
import { mergeDiagrams, type Merged } from './merge.js';

// word-level change marks of the merged picture become styled runs (fixed class tokens) in serialized SVG
setMarkedText((lines) => {
  if (!lines.some((l) => hasMarks(l.text))) return null;
  const runs = markRuns(lines.map((l) => l.text));
  return lines
    .map((l, i) => {
      const body = runs[i]!.map((r) => (r.mark ? `<tspan class="dx-${r.mark}">${escText(r.text)}</tspan>` : escText(r.text))).join('') || '&#160;';
      return `<tspan x="${fmt(l.x)}" y="${fmt(l.y)}">${body}</tspan>`;
    })
    .join('');
});

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

export function renderDiff(before: string, after: string, ctx: CoreContext, o: DiffRenderOptions = {}): DiffRendered {
  const ignore = o.ignore ?? {};
  const hide = o.hide ?? {};
  const raw = diffDiagrams(before, after);
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
  const layoutAligned = !!ignore.layout && raw.type !== 'sequence' && !raw.typeChanged;
  if (layoutAligned) srcBefore = withLayoutOf(srcBefore, srcAfter);
  const { ignore: _i, hide: _h, ...pipe } = o;
  // both versions with one theme (a fair comparison): the forced one, else the after version's own
  const ra = renderSource(srcAfter, ctx, pipe);
  const theme = ra.themeId;
  const popts: PipelineOptions = { ...pipe, theme };
  const rb = renderSource(srcBefore, ctx, popts);

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
    merged = { ...renderDocument(doc, m.model, ctx, popts), doc, model: m.model, tooLarge: false, diagnostics: [], status: m.status };
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
  const badges: Record<Mark, string> = { added: '+', removed: '−', content: 'C', layout: 'L', style: 'S' };
  const n = d.diff.counts;
  const parts: SceneNode[] = [];
  let cx = x;
  for (const m of MARKS) {
    const c = colors.marks[m].c;
    parts.push(el('rect', { x: cx, y: y - 9, width: 18, height: 18, rx: 9, fill: c }));
    parts.push(text({ 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': FONT, 'font-size': 10.5, 'font-weight': 700, fill: '#ffffff' }, [{ text: badges[m], x: cx + 9, y: y + 0.5 }]));
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
  const height = Math.max(...pages.map((p) => p.page.bounds.h)) + titleH + legendH;
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

/**
 * Server-side and build-time rendering of a diff (CI bots, MR comments): two sources → one standalone SVG of a view.
 * Uses the static text measurer unless the context brings another one. Works in Node and workers (no DOM).
 */
export async function renderDiffToSvg(before: string, after: string, o: DiffRenderOptions & DiffSvgOptions & { ctx?: CoreContext } = {}): Promise<string> {
  const ctx = o.ctx ?? createContext();
  const ropts: DiffRenderOptions = {};
  if (o.theme) ropts.theme = o.theme;
  if (o.ignore) ropts.ignore = o.ignore;
  if (o.hide) ropts.hide = o.hide;
  return diffSvg(renderDiff(before, after, ctx, ropts), o);
}
