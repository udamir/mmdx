// Diff annotations (§7.4): what a view of a diff draws over (and onto) a rendered diagram, as scene nodes, so the
// screen, exports and server-side rendering get the same picture.
//   overlay  highlight outlines / connector strokes with a badge per change, and move arrows (merged view)
//   runs     highlighter rectangles behind changed words (merged view), placed with the text measurer
//   body     the diagram with every item tagged by its change key (`data-ck`, which pairs items across views),
//            unchanged items dimmed and removed items faded
// Shapes carry explicit colours (exports have no stylesheet); on screen, the element's CSS restyles them by class.
import { el, g } from '../scene/build.js';
import type { AttrValue, SceneNode, TextLine, TextRun } from '../scene/types.js';
import { markRuns, markStyledRuns, hasMarks, stripMarks } from '../text/marks.js';
import type { FontSpec, TextMeasurer } from '../text/measure.js';
import type { GeometryIndex, RenderResult } from '../render/types.js';
import type { ItemKind, Rect } from '../types.js';
import type { ChangeFacet, ItemChange, ItemShape } from './types.js';
import { beforeKey, changeKey } from './merge.js';
import { diffKind } from '../kinds/registry.js';
import { MARK_ICONS } from './icons.js';

/** A highlight colour family: the filter of a change. */
export type Mark = 'added' | 'removed' | ChangeFacet;

export const MARKS: readonly Mark[] = ['added', 'removed', 'content', 'layout', 'style'];

export type DiffView = 'before' | 'merged' | 'after';

export interface DiffColors {
  /** Line / text colour and the tinted fill of each mark. */
  marks: Record<Mark, { c: string; bg: string }>;
  /** Faded opacity of unchanged items. */
  dim: number;
}

/** The highlight colours: exports and server-side rendering draw with them, and the `--mmdx-diff-*` tokens of the screen (diff/styles.ts DIFF_TOKENS) are made from them. */
export const DIFF_COLORS: Record<'light' | 'dark', DiffColors> = {
  light: {
    marks: {
      added: { c: '#1a7f37', bg: '#dafbe1' },
      removed: { c: '#cf222e', bg: '#ffebe9' },
      content: { c: '#b35900', bg: '#fff1e0' },
      layout: { c: '#0969da', bg: '#ddf4ff' },
      style: { c: '#8250df', bg: '#fbefff' },
    },
    dim: 0.28,
  },
  dark: {
    marks: {
      added: { c: '#3fb950', bg: 'rgba(46,160,67,.22)' },
      removed: { c: '#f85149', bg: 'rgba(248,81,73,.22)' },
      content: { c: '#e3a33b', bg: 'rgba(227,163,59,.2)' },
      layout: { c: '#58a6ff', bg: 'rgba(56,139,253,.2)' },
      style: { c: '#bc8cff', bg: 'rgba(163,113,247,.2)' },
    },
    dim: 0.35,
  },
};

// ---- shapes -----------------------------------------------------------------------------------------------------

export type { ItemShape };

/** Where an item is drawn, from the renderer's geometry index. */
export function shapeOf(geom: GeometryIndex, kind: ItemKind, id: string): ItemShape | null {
  return geom.type ? diffKind(geom.type)?.shape(geom, { kind, id }) ?? null : null;
}

export const centreOf = (s: ItemShape): { x: number; y: number } => (s.t === 'rect' ? { x: s.r.x + s.r.w / 2, y: s.r.y + s.r.h / 2 } : s.mid);

/** The area to bring into view for a shape (an edge: its label, else a box around its middle). */
export const focusRect = (s: ItemShape): Rect => (s.t === 'rect' ? s.r : s.label ?? { x: s.mid.x - 40, y: s.mid.y - 40, w: 80, h: 80 });

// ---- marks of a change ------------------------------------------------------------------------------------------

/** The highlight colour of a change: its status, or its first changed facet. */
export const markOf = (c: ItemChange): Mark => (c.status === 'added' ? 'added' : c.status === 'removed' ? 'removed' : c.facets[0] ?? 'content');

/** Badge text: `+`, `−`, or the initials of the changed facets (`C`, `L`, `S`). */
export const badgeOf = (c: ItemChange): string => (c.status === 'added' ? '+' : c.status === 'removed' ? '−' : c.facets.map((f) => f[0]!.toUpperCase()).join(''));

/** The marks a badge shows an icon for: the status, or every changed facet. */
const badgeMarks = (c: ItemChange): Mark[] => (c.status === 'added' ? ['added'] : c.status === 'removed' ? ['removed'] : c.facets.length ? [...c.facets] : ['content']);

/** The icon of a mark as a `size` px square at (x, y). */
export const badgeIcon = (m: Mark, x: number, y: number, size: number, color: string): SceneNode =>
  el('path', { class: 'dx-icon', d: MARK_ICONS[m], transform: `translate(${x} ${y}) scale(${size / 24})`, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });

// ---- annotation -------------------------------------------------------------------------------------------------

export interface AnnotateInput {
  view: DiffView;
  /** The render of this view (before, merged or after). */
  result: RenderResult;
  /** The before render (move arrows of the merged view start there). */
  before: RenderResult;
  /** Changes shown (filters applied), in list order. */
  changes: readonly ItemChange[];
  measure: TextMeasurer;
}

export interface AnnotateOptions {
  /** Fade unchanged items. */
  dim?: boolean;
  /** Draw highlights and badges (exports can leave them out). */
  highlights?: boolean;
  colors?: DiffColors;
  /** Badge size factor; on screen the element's CSS keeps badges at a constant screen size instead. */
  badgeScale?: number;
}

export interface Annotated {
  body: SceneNode[];
  runs: SceneNode[];
  overlay: SceneNode[];
}

/** The scene layers of one view of a diff. */
export function annotate(input: AnnotateInput, o: AnnotateOptions = {}): Annotated {
  const { view, result, changes } = input;
  const colors = o.colors ?? DIFF_COLORS.light;
  // the change key of an item drawn in this view
  const fromBefore = new Map(changes.map((c) => [beforeKey(c), changeKey(c)]));
  const keyIn = (kind: string, id: string): string => (view === 'before' ? fromBefore.get(`${kind}:${id}`) ?? `${kind}:${id}` : `${kind}:${id}`);
  const shown = changes.filter((c) => (view === 'before' ? c.status !== 'added' : view === 'after' ? c.status !== 'removed' : true));
  const keep = new Set(shown.map(changeKey));
  const gone = view === 'merged' ? new Set(changes.filter((c) => c.status === 'removed').map(changeKey)) : new Set<string>();
  const body = decorateBody(result.body, keyIn, o.dim ? keep : null, gone, colors.dim);

  const overlay: SceneNode[] = [];
  if (o.highlights !== false) {
    if (view === 'merged') overlay.push(...moves(input, colors));
    for (const c of shown) {
      const id = view === 'before' ? c.beforeId ?? c.id : view === 'after' ? c.id : changeKey(c).slice(c.kind.length + 1);
      const s = shapeOf(result.geom, c.kind, id);
      if (s) overlay.push(highlight(changeKey(c), s, markOf(c), badgeMarks(c), c.status === 'removed', colors, o.badgeScale));
    }
  }
  const runs = view === 'merged' && o.highlights !== false ? highlighterRuns(result.body, input.measure, colors) : [];
  return { body, runs, overlay };
}

/** Tags every item with its change key; dims items outside `keep` and fades `gone` ones. */
function decorateBody(nodes: readonly SceneNode[], keyIn: (kind: string, id: string) => string, keep: ReadonlySet<string> | null, gone: ReadonlySet<string>, dim: number): SceneNode[] {
  return nodes.map((n): SceneNode => {
    if (n.t === 'g' && n.item) {
      const raw = `${n.item.kind}:${n.item.id}`;
      const key = keyIn(n.item.kind, n.item.id);
      // an item drawn in parts (an edge and its label) keeps one pairing key per part
      const ck = n.key && n.key !== raw ? n.key.replace(raw, key) : key;
      const cls = [String(n.attrs['class'] ?? ''), keep && !keep.has(key) ? 'dx-dim' : '', gone.has(key) ? 'dx-gone' : ''].filter(Boolean).join(' ');
      const attrs: Record<string, AttrValue> = { ...n.attrs, class: cls, 'data-ck': ck };
      if (keep && !keep.has(key)) attrs['opacity'] = dim;
      else if (gone.has(key)) attrs['opacity'] = 0.6;
      return { ...n, attrs, children: n.children.map(markedRuns) };
    }
    if (n.t === 'g' || n.t === 'a') return { ...n, children: decorateBody(n.children, keyIn, keep, gone, dim) };
    return markedRuns(n);
  });
}

/** The lines of a text split at the change marks: plain lines by their text, rich ones (core/text/rich.ts) by their runs. */
const lineRuns = (lines: readonly TextLine[]): TextRun[][] =>
  lines.some((l) => l.runs) ? markStyledRuns(lines.map((l) => l.runs ?? [{ text: l.text, mark: null }])) : markRuns(lines.map((l) => l.text));

/** Text with change marks (the merged picture) as runs of removed and added words, its `text` without them. */
function markedRuns(n: SceneNode): SceneNode {
  if (n.t === 'text') {
    if (!n.lines.some((l) => hasMarks(l.text))) return n;
    const runs = lineRuns(n.lines);
    return { ...n, lines: n.lines.map((l, i) => ({ ...l, text: stripMarks(l.text), runs: runs[i] ?? [] })) };
  }
  if (n.t === 'g' || n.t === 'a') return { ...n, children: n.children.map(markedRuns) };
  return n;
}

function highlight(key: string, s: ItemShape, mark: Mark, icons: readonly Mark[], dashed: boolean, colors: DiffColors, badgeScale?: number): SceneNode {
  const { c, bg } = colors.marks[mark];
  const outline = (r: Rect, p: number, rx: number): SceneNode =>
    el('rect', { class: 'dx-outline', x: r.x - p, y: r.y - p, width: r.w + p * 2, height: r.h + p * 2, rx, fill: bg, 'fill-opacity': 0.6, stroke: c, 'stroke-width': 2.5, 'stroke-dasharray': dashed ? '7 5' : undefined, 'vector-effect': 'non-scaling-stroke' });
  const parts: SceneNode[] = [];
  let anchor: { x: number; y: number };
  if (s.t === 'rect') {
    // a shape's own outline (a diamond, a circle), grown like the box frame
    parts.push(s.d
      ? el('path', { class: 'dx-outline', d: s.d, fill: bg, 'fill-opacity': 0.6, stroke: c, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-dasharray': dashed ? '7 5' : undefined, 'vector-effect': 'non-scaling-stroke' })
      : outline(s.r, 8, 10));
    anchor = { x: s.r.x + s.r.w + 8, y: s.r.y - 8 };
  } else {
    parts.push(el('path', { class: 'dx-stroke', d: s.d, fill: 'none', stroke: c, 'stroke-width': 9, 'stroke-opacity': 0.35, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': dashed ? '14 8' : undefined }));
    if (s.label) parts.push(outline(s.label, 4, 6));
    // at the label's corner, not its middle: the badge never covers the label's text
    anchor = s.label ? { x: s.label.x + s.label.w + 4, y: s.label.y - 4 } : s.mid;
  }
  // the pill grows up and right from its anchor (an outline's corner), off the item: the CSS keeps it at a constant
  // screen size, so centred on the corner it covered the text of small or zoomed-out items
  // one 12 px icon per mark, 2 px apart, centred in an 18 px high pill (a circle for one icon)
  const w = icons.length * 14 + 4;
  const pill = g({ class: 'dx-badge', transform: badgeScale && badgeScale !== 1 ? `scale(${badgeScale})` : undefined }, [
    el('rect', { x: -3, y: -15, width: w, height: 18, rx: 9, fill: c, stroke: '#ffffff', 'stroke-width': 1.5 }),
    ...icons.map((m, i) => badgeIcon(m, i * 14, -12, 12, '#ffffff')),
  ]);
  parts.push(g({ transform: `translate(${anchor.x} ${anchor.y})` }, [pill]));
  return g({ class: `dx-hl dx-${mark}${dashed ? ' dx-dashed' : ''}`, 'data-key': key }, parts, { key: `hl:${key}` });
}

/** Old → new place of every moved item (merged view): the old outline, an arrow and its head. */
function moves(input: AnnotateInput, colors: DiffColors): SceneNode[] {
  const c = colors.marks.layout.c;
  const out: SceneNode[] = [];
  for (const ch of input.changes) {
    if (ch.status !== 'changed' || !ch.fields.some((f) => f.field === 'position')) continue;
    const from = shapeOf(input.before.geom, ch.kind, ch.beforeId ?? ch.id), to = shapeOf(input.result.geom, ch.kind, ch.id);
    if (from?.t !== 'rect' || to?.t !== 'rect') continue;
    const a = centreOf(from), b = centreOf(to);
    const ang = Math.atan2(b.y - a.y, b.x - a.x), s = 16;
    const pt = (d: number): string => `${b.x - s * Math.cos(ang + d)},${b.y - s * Math.sin(ang + d)}`;
    out.push(g({ class: 'dx-move', 'data-key': changeKey(ch) }, [
      el('rect', { class: 'dx-was', x: from.r.x, y: from.r.y, width: from.r.w, height: from.r.h, rx: 8, fill: 'none', stroke: c, 'stroke-width': 2, 'stroke-dasharray': '4 4', 'vector-effect': 'non-scaling-stroke' }),
      el('line', { class: 'dx-arrow', x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: c, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }),
      el('polygon', { class: 'dx-arrowhead', points: `${b.x},${b.y} ${pt(0.45)} ${pt(-0.45)}`, fill: c }),
    ], { key: `mv:${changeKey(ch)}` }));
  }
  return out;
}

/** Highlighter rectangles behind every marked run of text, from the measured widths of the runs. */
function highlighterRuns(body: readonly SceneNode[], measure: TextMeasurer, colors: DiffColors): SceneNode[] {
  const out: SceneNode[] = [];
  const visit = (n: SceneNode): void => {
    if (n.t === 'g' || n.t === 'a') {
      for (const c of n.children) visit(c);
      return;
    }
    if (n.t !== 'text' || !n.lines.some((l) => hasMarks(l.text))) return;
    const size = Number(n.attrs['font-size']) || 14;
    const base: FontSpec = { size, family: String(n.attrs['font-family'] ?? 'sans-serif'), weight: (n.attrs['font-weight'] as number | string | undefined) ?? 400 };
    if (n.attrs['font-style'] === 'italic') base.style = 'italic';
    const anchor = n.attrs['text-anchor'] ?? 'start';
    const central = n.attrs['dominant-baseline'] === 'central';
    const runs = lineRuns(n.lines);
    n.lines.forEach((l, i) => {
      const line = runs[i] ?? [];
      // inserted words are drawn bold (diff/styles.ts and the export style), as are bold runs
      const fontOf = (r: TextRun): FontSpec => {
        const f = r.mark === 'ins' || r.bold ? { ...base, weight: 700 } : base;
        return r.italic ? { ...f, style: 'italic' } : f;
      };
      const widths = line.map((r) => (r.icon ? r.icon.size : measure.width(r.text, fontOf(r))));
      const total = widths.reduce((a, b) => a + b, 0);
      // a line with icons starts at its left edge, and its runs after an icon at their own place
      let x = l.anchor ? l.x : anchor === 'middle' ? l.x - total / 2 : anchor === 'end' ? l.x - total : l.x;
      const top = central ? l.y - size * 0.66 : l.y - size * 0.92;
      line.forEach((r, j) => {
        const w = widths[j]!;
        if (r.x !== undefined) x = r.x;
        if (r.mark && (r.icon || r.text.trim())) {
          const m = colors.marks[r.mark === 'ins' ? 'added' : 'removed'];
          out.push(el('rect', { class: `run-${r.mark}`, x: x - 1, y: top, width: w + 2, height: size * 1.32, rx: 2, fill: m.bg, 'fill-opacity': 0.7 }));
        }
        x += w;
      });
    });
  };
  for (const n of body) visit(n);
  return out;
}
