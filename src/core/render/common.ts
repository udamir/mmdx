// Shapes, markers, ports, edge paths, text and style resolution shared by all renderers (prototype
// `render/common.js` + the style / text parts of `util.js`). Everything here returns scene nodes, never markup.
import { bezierPoint, clamp, polylinePoint } from '../geom.js';
import { def, el, g, link, text } from '../scene/build.js';
import { fmt } from '../scene/serialize.js';
import type { SceneNode, SceneText, SvgAttrs } from '../scene/types.js';
import { mergeLayers, type Side, type StyleProps } from '../style.js';
import type { FontSpec } from '../text/measure.js';
import type { CenterBox, ItemKind, Point, Rect } from '../types.js';
import { cleanDash, cleanFontFamily, resolveContentUrl, safeUrl, toNumber, type SafeUrl } from '../validate.js';
import { STYLE_KEYS, valueType } from '../meta/keys.js';
import { hash } from '../layout/hash.js';
import type { LayeredOptions, LayoutEdge, LayoutNode } from '../layout/layered.js';
import type { HiddenSets, Port, RenderContext, RenderOptions } from './types.js';
import { shapeDef, shapeIdOf } from '../shapes/registry.js';

// ---- style ----------------------------------------------------------------------------------------------------

const WEIGHT = /^(?:normal|bold|bolder|lighter|[1-9]00)$/;

/**
 * Validates one style layer by each key's value type (META_KEYS, X6): colours resolved through `ctx.color` (palette
 * refs, diagram palette, validation), numbers parsed, dashes and fonts checked; bad values dropped. A key the
 * registry does not know (a theme-only key) keeps a plain value.
 */
function cleanLayer(ctx: RenderContext, layer: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(layer)) {
    if (v === undefined || v === null || v === '') continue;
    let c: unknown;
    switch (valueType(k)) {
      case 'color': c = ctx.color(v); break;
      case 'number': c = toNumber(v); break;
      case 'dash': c = cleanDash(v); break;
      case 'font': c = cleanFontFamily(v); break;
      case 'weight': c = typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && WEIGHT.test(v) ? v : undefined; break;
      case 'bool': c = typeof v === 'boolean' ? v : undefined; break;
      case 'stack': c = typeof v === 'boolean' ? v : toNumber(v); break;
      default: c = typeof v === 'object' ? undefined : v;
    }
    if (c !== undefined) out[k] = c;
  }
  return out;
}

/**
 * Merges style layers left → right (`mergeLayers`: undefined / null / '' do not override) with every value
 * validated and every colour resolved through `ctx.color`. This replaces the prototype's global colour resolver.
 * Layers are cleaned before merging, so an invalid value in a later layer does not wipe a valid one below it.
 */
export function mergeStyle(ctx: RenderContext, ...layers: (object | null | undefined)[]): StyleProps {
  return mergeLayers<StyleProps>(...layers.map((l) => (l ? (cleanLayer(ctx, l) as Partial<StyleProps>) : null)));
}

/** The style keys of an item's metadata (plus kind-specific `extra` keys). */
export function pickStyle(m: object | undefined, extra: readonly string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!m) return out;
  const r = m as Record<string, unknown>;
  for (const k of [...STYLE_KEYS, ...extra]) if (r[k] !== undefined && r[k] !== '') out[k] = r[k];
  return out;
}

/** `meta.styles.<kind>._base`: the diagram-wide base style of a kind (Q7: every kind). */
export function baseStyle(meta: { styles: Record<string, Record<string, unknown>> }, kind: ItemKind): object | undefined {
  const b = meta.styles[kind]?.['_base'];
  return b && typeof b === 'object' ? b : undefined;
}

/** Theme presets of a kind, overridden by the diagram's own `style.<kind>` presets. */
export function presets(theme: Record<string, StyleProps> | undefined, own: Record<string, unknown> | undefined): Record<string, StyleProps> {
  const out: Record<string, StyleProps> = { ...theme };
  for (const [k, v] of Object.entries(own ?? {})) if (v && typeof v === 'object') out[k] = v as StyleProps;
  return out;
}

export const presetOf = (P: Record<string, StyleProps>, name: string | undefined): StyleProps | undefined =>
  name !== undefined && Object.prototype.hasOwnProperty.call(P, name) ? P[name] : undefined;

export const font = (size: number, weight: number | string | undefined, family: string): FontSpec => ({ size, weight: weight ?? 400, family });

export function countBy(arr: Iterable<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of arr) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

export const hiddenOf = (opts: RenderOptions, kind: ItemKind): ReadonlySet<string> => (opts.hidden as HiddenSets | undefined)?.[kind] ?? EMPTY_SET;
const EMPTY_SET: ReadonlySet<string> = new Set();

/** `minOf` over the lines of an item (prototype `Math.min(...n.lines)`). */
export function firstLine(defLine: number | null | undefined, lines: ReadonlySet<number>): number {
  if (defLine !== null && defLine !== undefined) return defLine;
  let m = Infinity;
  for (const l of lines) if (l < m) m = l;
  return m;
}

export const byLine = (a: number, b: number): number => (a === b ? 0 : a < b ? -1 : 1);

// ---- items and links ------------------------------------------------------------------------------------------

/** A diagram item: `g` with key = ItemKey, `item`, and the class / data attributes hit-testing reads. */
export function itemGroup(
  kind: ItemKind,
  id: string,
  cls: string,
  children: SceneNode[],
  attrs: SvgAttrs = {},
  part?: string,
): SceneNode {
  return g({ class: `el ${cls}`, 'data-kind': kind, 'data-id': id, ...attrs }, children, {
    key: part ? `${part}:${kind}:${id}` : `${kind}:${id}`,
    item: { kind, id },
  });
}

/** Links render blue and underlined (prototype `LINK_COLOR`). */
export const LINK_COLOR = '#2b5bd7';

/**
 * The item's link — through the host's resolver (`ctx.resolveUrl`) — if the link policy accepts it, else null (rejected
 * links are not rendered as links).
 */
export const itemLink = (ctx: RenderContext, ...candidates: unknown[]): SafeUrl | null => {
  for (const c of candidates) if (c !== undefined && c !== null && c !== '') return safeUrl(resolveContentUrl(c, 'link', ctx.resolveUrl), ctx.linkPolicy);
  return null;
};

export const withLink = (href: SafeUrl | null, nodes: SceneNode[]): SceneNode[] => (href ? [link(href, nodes)] : nodes);

/** `data-link` for the editor (View mode opens it). */
export const linkAttr = (href: SafeUrl | null): SvgAttrs => (href ? { 'data-link': href } : {});

// ---- text -----------------------------------------------------------------------------------------------------

export interface TextOpts {
  size: number;
  weight?: number | string | undefined;
  color?: string | undefined;
  family: string;
  anchor?: 'start' | 'middle' | 'end';
  /** Line height as a multiple of the size. */
  lh?: number;
  cls?: string;
  underline?: boolean;
  extra?: SvgAttrs;
}

/** The attributes of a text block (`textBlock`, `richText`). */
export const textAttrs = (o: TextOpts): SvgAttrs => ({
  class: o.cls || undefined,
  'text-anchor': o.anchor ?? 'middle',
  'dominant-baseline': 'central',
  'font-family': o.family,
  'font-size': o.size,
  'font-weight': o.weight ?? 400,
  fill: o.color ?? '#111',
  'text-decoration': o.underline ? 'underline' : undefined,
  ...o.extra,
});

/** Multi-line text centred vertically on y (prototype `svgText`). */
export function textBlock(lines: readonly string[], x: number, y: number, o: TextOpts): SceneText {
  const lh = o.lh ?? 1.3;
  const y0 = y - ((lines.length - 1) * o.size * lh) / 2;
  return text(textAttrs(o), lines.map((l, i) => ({ text: l, x, y: y0 + i * o.size * lh })));
}

/** Edge label with a halo so it stays readable over lines. */
export function haloLabel(
  lines: readonly string[],
  x: number,
  y: number,
  o: { size: number; color: string | undefined; family: string; halo: string; weight?: number | string | undefined; underline?: boolean },
): SceneText {
  const lh = o.size * 1.25;
  const y0 = y - ((lines.length - 1) * lh) / 2;
  return text(
    {
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': o.family,
      'font-size': o.size,
      'font-weight': o.weight ?? 400,
      fill: o.color,
      'text-decoration': o.underline ? 'underline' : undefined,
      stroke: o.halo,
      'stroke-width': 4,
      'stroke-linejoin': 'round',
      'paint-order': 'stroke',
    },
    lines.map((l, i) => ({ text: l, x, y: y0 + i * lh })),
  );
}

// ---- defs -----------------------------------------------------------------------------------------------------

const ARROWS = new Set(['open', 'filled', 'arrow', 'cross', 'circle', 'dot']);

/** `<defs>` content of one render: every id starts with `ctx.idPrefix` so diagrams on one page never collide. */
export class Defs {
  private readonly items = new Map<string, SceneNode>();
  readonly prefix: string;
  constructor(prefix: string) {
    this.prefix = prefix.replace(/[^\w-]/g, '');
  }

  /** Arrow-head marker; returns its id, or null for no / unknown head. */
  marker(type: string | undefined, color: string | undefined, size = 10): string | null {
    if (!type || !ARROWS.has(type)) return null;
    const c = color ?? '#222';
    const id = `${this.prefix}mk-${type}-${c.replace(/[^\w]/g, '')}-${Math.round(size)}`;
    if (!this.items.has(id)) {
      let body: SceneNode;
      if (type === 'open')
        body = el('path', { d: 'M1,1 L9,5 L1,9', fill: 'none', stroke: c, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      else if (type === 'filled') body = el('path', { d: 'M0,0.6 L10,5 L0,9.4 L2.6,5 z', fill: c });
      else if (type === 'arrow') body = el('path', { d: 'M0,1 L10,5 L0,9 z', fill: c });
      else if (type === 'cross') body = el('path', { d: 'M2,2 L8,8 M8,2 L2,8', stroke: c, 'stroke-width': 1.6 });
      else if (type === 'circle') body = el('circle', { cx: 5, cy: 5, r: 3.6, fill: '#fff', stroke: c, 'stroke-width': 1.4 });
      else body = el('circle', { cx: 5, cy: 5, r: 3, fill: c });
      const centred = type === 'circle' || type === 'cross' || type === 'dot';
      this.items.set(
        id,
        def(
          'marker',
          {
            id,
            viewBox: '0 0 10 10',
            refX: centred ? 5 : 9.4,
            refY: 5,
            markerWidth: size,
            markerHeight: size,
            markerUnits: 'userSpaceOnUse',
            orient: 'auto-start-reverse',
          },
          [body],
          id,
        ),
      );
    }
    return id;
  }

  /** Adds a definition under `<prefix><name>` (once) and returns the id. */
  add(name: string, make: (id: string) => SceneNode): string {
    const id = `${this.prefix}${name}`;
    if (!this.items.has(id)) this.items.set(id, make(id));
    return id;
  }

  nodes(): SceneNode[] {
    return [...this.items.values()];
  }
}

export const urlRef = (id: string | null): string | undefined => (id ? `url(#${id})` : undefined);

// ---- shapes ---------------------------------------------------------------------------------------------------

const P = (x: number, y: number): string => `${fmt(x)},${fmt(y)}`;

/** Node shapes (the catalogue's entry for the name; an unknown name, or one whose geometry is not loaded, draws a rectangle). b = {x, y, w, h} centred at (x, y). */
export function shapeNodes(shape: string | undefined, b: CenterBox, st: StyleProps, extra: SvgAttrs = {}): SceneNode[] {
  return shapeDef(shape).draw(b, st, extra);
}

/** The "stacked cards" look: false | true (one copy) | 2 | 3 copies shifted up-right behind the shape. */
export const stackLevel = (stack: unknown): number => (stack === true ? 1 : Math.max(0, Math.min(3, Number(stack) || 0)));

/**
 * Box that connectors attach to: grows up and to the right by the stack offset, so arrow heads end on the outermost
 * card instead of being covered by it.
 */
export function outerBox<B extends CenterBox>(b: B, stack: unknown): CenterBox {
  const off = 5 * stackLevel(stack);
  if (!off) return b;
  return { x: b.x + off / 2, y: b.y - off / 2, w: b.w + off, h: b.h + off };
}

export function stackedShapeNodes(shape: string | undefined, b: CenterBox, st: StyleProps, extra: SvgAttrs = {}): SceneNode[] {
  const n = stackLevel(st.stack);
  const out: SceneNode[] = [];
  for (let k = n; k >= 1; k--) out.push(...shapeNodes(shape, { x: b.x + 5 * k, y: b.y - 5 * k, w: b.w, h: b.h }, { ...st, dash: '' }));
  out.push(...shapeNodes(shape, b, st, extra));
  return out;
}

// ---- ports and edges ------------------------------------------------------------------------------------------

const NORMAL: Record<Side, Point> = { t: { x: 0, y: -1 }, b: { x: 0, y: 1 }, l: { x: -1, y: 0 }, r: { x: 1, y: 0 } };
export const isSide = (s: unknown): s is Side => s === 't' || s === 'b' || s === 'l' || s === 'r';

export function pickSides(a: CenterBox, b: CenterBox, prefer: 'v' | 'h' | null = null): [Side, Side] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const gapX = Math.abs(dx) - (a.w + b.w) / 2;
  const gapY = Math.abs(dy) - (a.h + b.h) / 2;
  let vertical = gapY >= gapX;
  if (prefer === 'v' && gapY > 0) vertical = true;
  if (prefer === 'h' && gapX > 0) vertical = false;
  if (vertical) return dy >= 0 ? ['b', 't'] : ['t', 'b'];
  return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
}

export function portPoint(b: CenterBox, side: Side, at = 0.5): Port {
  const n = NORMAL[side];
  if (side === 't' || side === 'b') return { x: b.x - b.w / 2 + b.w * at, y: b.y + (n.y * b.h) / 2, n };
  return { x: b.x + (n.x * b.w) / 2, y: b.y - b.h / 2 + b.h * at, n };
}

/** The side of box b that faces point p (for a line whose first / last bend point is p). */
export function sideToward(b: CenterBox, p: Point): Side {
  const dx = (p.x - b.x) / (b.w / 2 || 1), dy = (p.y - b.y) / (b.h / 2 || 1);
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : dy > 0 ? 'b' : 't';
}

export interface PortLink {
  id: string;
  a: CenterBox;
  b: CenterBox;
  aKey: string;
  bKey: string;
  fromSide?: Side | undefined;
  toSide?: Side | undefined;
  fromAt?: number | undefined;
  toAt?: number | undefined;
  /** This connection's preferred axis (the direction of the subgraph it was laid out in), over the call's `prefer`. */
  prefer?: 'v' | 'h' | null | undefined;
}

/** Distributes several connections that share a side so they do not overlap. */
export function assignPorts(
  links: readonly PortLink[],
  { prefer = null, spacing = 22 }: { prefer?: 'v' | 'h' | null; spacing?: number } = {},
): Map<string, { sa: Side; sb: Side; a: Port; b: Port }> {
  interface End {
    id: string;
    other: CenterBox;
    which: 'a' | 'b';
    fixed: number | undefined;
  }
  const ends = new Map<string, { box: CenterBox; side: Side; items: End[] }>();
  const sides = new Map<string, { sa: Side; sb: Side }>();
  const res = new Map<string, { sa: Side; sb: Side; a: Port; b: Port }>();
  const add = (key: string, side: Side, box: CenterBox, it: End): void => {
    const k = `${key}|${side}`;
    let e = ends.get(k);
    if (!e) ends.set(k, (e = { box, side, items: [] }));
    e.items.push(it);
  };
  for (const L of links) {
    const auto = pickSides(L.a, L.b, L.prefer !== undefined ? L.prefer : prefer);
    const sa = L.fromSide || auto[0], sb = L.toSide || auto[1];
    sides.set(L.id, { sa, sb });
    add(L.aKey, sa, L.a, { id: L.id, other: L.b, which: 'a', fixed: L.fromAt });
    add(L.bKey, sb, L.b, { id: L.id, other: L.a, which: 'b', fixed: L.toAt });
  }
  const pts = new Map<string, { a?: Port; b?: Port }>();
  for (const { box, side, items } of ends.values()) {
    const along = side === 't' || side === 'b' ? 'x' : 'y';
    const len = along === 'x' ? box.w : box.h;
    items.sort((p, q) => p.other[along] - q.other[along]);
    const n = items.length;
    const step = Math.min(0.8 / n, spacing / Math.max(len, 1));
    items.forEach((it, i) => {
      const at = it.fixed ?? clamp(0.5 + (i - (n - 1) / 2) * step, 0.06, 0.94);
      let p = pts.get(it.id);
      if (!p) pts.set(it.id, (p = {}));
      p[it.which] = portPoint(box, side, at);
    });
  }
  for (const [id, s] of sides) {
    const p = pts.get(id);
    if (p?.a && p.b) res.set(id, { ...s, a: p.a, b: p.b });
  }
  return res;
}

export interface EdgePath {
  d: string;
  at(t: number): Point;
  /** Middle of each part between consecutive points (ends included): where a new bend point can be pulled out. */
  mids: Point[];
}

export interface EdgePathOpts {
  routing?: string | undefined;
  curve?: number | undefined;
  radius?: number;
  points?: readonly (readonly [number, number])[] | undefined;
}

/**
 * Path between two ports. points: bend points [[x, y], …] the line passes through (fixed in diagram coordinates).
 * Besides the path (d) and a point at a fraction of its length (at), the result has `mids`.
 */
export function edgePath(p1: Port, p2: Port, { routing = 'curved', curve = 1, radius = 10, points = [] }: EdgePathOpts = {}): EdgePath {
  if (points.length) return pathThrough(p1, p2, points.map(([x, y]) => ({ x, y })), routing, curve, radius);
  const res = edgePathPlain(p1, p2, routing, curve, radius);
  return { ...res, mids: [res.at(0.5)] };
}

function pathThrough(p1: Port, p2: Port, pts: Point[], routing: string, curve: number, radius: number): EdgePath {
  const V: Point[] = [p1, ...pts, p2];
  let d: string, dense: Point[], vAt: number[]; // dense polyline of the drawn line; vAt[i]: index in it of user vertex V[i]
  if (routing === 'straight' || curve === 0) {
    d = `M${P(p1.x, p1.y)}` + V.slice(1).map((q) => ` L${P(q.x, q.y)}`).join('');
    dense = V;
    vAt = V.map((_, i) => i);
  } else if (routing === 'orthogonal') {
    // leave / enter along the box sides, then right-angled steps through each point
    const off = 18;
    const a = { x: p1.x + p1.n.x * off, y: p1.y + p1.n.y * off }, b = { x: p2.x + p2.n.x * off, y: p2.y + p2.n.y * off };
    const W: Point[] = [p1, a];
    vAt = [0];
    let prev = a, vertical = p1.n.y !== 0; // direction of the last leg
    [...pts, b].forEach((q, i) => {
      const dx = Math.abs(q.x - prev.x) > 0.5, dy = Math.abs(q.y - prev.y) > 0.5;
      if (dx && dy) {
        // keep going the same way, then turn once towards q
        W.push(vertical ? { x: prev.x, y: q.y } : { x: q.x, y: prev.y });
        vertical = !vertical;
      } else if (dx || dy) vertical = dy;
      W.push(q);
      if (i < pts.length) vAt.push(W.length - 1);
      prev = q;
    });
    W.push(p2);
    vAt.push(W.length - 1);
    // tidy: drop corners where the line runs straight on or doubles back (a point inside a box's approach),
    // keeping the user's points mapped to the nearest remaining corner. One linear pass over a stack of kept
    // points (the prototype restarted its scan after every removal, which is quadratic; same result).
    const keep = W.map(() => true);
    const st: number[] = [];
    const collinear = (i: number, j: number, k: number): boolean => {
      const a0 = W[i]!, b0 = W[j]!, c0 = W[k]!;
      const sameX = Math.abs(a0.x - b0.x) < 0.5 && Math.abs(b0.x - c0.x) < 0.5;
      const sameY = Math.abs(a0.y - b0.y) < 0.5 && Math.abs(b0.y - c0.y) < 0.5;
      return sameX || sameY;
    };
    for (let i = 0; i < W.length; i++) {
      while (st.length >= 2 && st[st.length - 1] !== 0 && collinear(st[st.length - 2]!, st[st.length - 1]!, i)) keep[st.pop()!] = false;
      st.push(i);
    }
    const remap: number[] = [];
    let n = -1;
    W.forEach((_, i) => {
      if (keep[i]) n++;
      remap[i] = Math.max(0, n);
    });
    const W2 = W.filter((_, i) => keep[i]);
    vAt = vAt.map((i) => remap[i]!);
    d = roundedPolyline(W2, radius);
    dense = W2;
  } else {
    // smooth curve through every point: Catmull-Rom tangents inside, the box sides' directions at the ends
    const T = V.map((v, i) => {
      if (i === 0) {
        const nx = V[1]!;
        const k = clamp(Math.hypot(nx.x - v.x, nx.y - v.y) * 0.42, 24, 220) * curve * 3;
        return { x: p1.n.x * k, y: p1.n.y * k };
      }
      const pv = V[i - 1]!;
      if (i === V.length - 1) {
        const k = clamp(Math.hypot(v.x - pv.x, v.y - pv.y) * 0.42, 24, 220) * curve * 3;
        return { x: -p2.n.x * k, y: -p2.n.y * k };
      }
      const nx = V[i + 1]!;
      return { x: (nx.x - pv.x) * 0.5 * curve, y: (nx.y - pv.y) * 0.5 * curve };
    });
    d = `M${P(p1.x, p1.y)}`;
    dense = [p1];
    vAt = [0];
    for (let i = 0; i < V.length - 1; i++) {
      const a = V[i]!, b = V[i + 1]!, ta = T[i]!, tb = T[i + 1]!;
      const c1 = { x: a.x + ta.x / 3, y: a.y + ta.y / 3 }, c2 = { x: b.x - tb.x / 3, y: b.y - tb.y / 3 };
      d += ` C${P(c1.x, c1.y)} ${P(c2.x, c2.y)} ${P(b.x, b.y)}`;
      for (let s = 1; s <= 16; s++) dense.push(bezierPoint(a, c1, c2, b, s / 16));
      vAt.push(dense.length - 1);
    }
  }
  // lengths along the dense line, for `at` and the middles between the user's points
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1]! + Math.hypot(dense[i]!.x - dense[i - 1]!.x, dense[i]!.y - dense[i - 1]!.y));
  const total = cum[cum.length - 1] || 1;
  const atLen = (L: number): Point => pointAlong(dense, cum, Math.max(0, Math.min(1, L / total)) * cum[cum.length - 1]!);
  const mids = vAt.slice(0, -1).map((ia, i) => atLen((cum[ia]! + cum[vAt[i + 1]!]!) / 2));
  return { d, at: (t) => atLen(t * total), mids };
}

/** `f` computed once per argument. */
export function memoBy<K, V>(f: (k: K) => V): (k: K) => V {
  const m = new Map<K, V>();
  return (k) => {
    if (!m.has(k)) m.set(k, f(k));
    return m.get(k) as V;
  };
}

/** The point `L` along a polyline whose running lengths are `cum`: a binary search (P22: `at` is called per sample). */
function pointAlong(pts: readonly Point[], cum: readonly number[], L: number): Point {
  if (pts.length < 2) return pts[0] ? { x: pts[0].x, y: pts[0].y } : { x: 0, y: 0 };
  let lo = 1, hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! >= L) hi = mid;
    else lo = mid + 1;
  }
  const a = pts[lo - 1]!, b = pts[lo]!, s = cum[lo]! - cum[lo - 1]!;
  const k = s ? (L - cum[lo - 1]!) / s : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/**
 * The boxes placed so far in a coarse grid, to ask whether a rect overlaps any (P22: a label tried against every
 * state and label is quadratic). Overlap is strict, as touching boxes do not cover each other.
 */
export function boxGrid(cell = 160): { add(b: CenterBox): void; hits(r: Rect): boolean } {
  const cells = new Map<string, CenterBox[]>();
  const big: CenterBox[] = [];
  const range = (lo: number, hi: number): [number, number] => [Math.floor(lo / cell), Math.floor(hi / cell)];
  const over = (r: Rect, b: CenterBox): boolean => r.x < b.x + b.w / 2 && r.x + r.w > b.x - b.w / 2 && r.y < b.y + b.h / 2 && r.y + r.h > b.y - b.h / 2;
  return {
    add(b) {
      if (![b.x, b.y, b.w, b.h].every(Number.isFinite)) return;
      const [x0, x1] = range(b.x - b.w / 2, b.x + b.w / 2), [y0, y1] = range(b.y - b.h / 2, b.y + b.h / 2);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 64) return void big.push(b);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) (cells.get(`${cx},${cy}`) ?? cells.set(`${cx},${cy}`, []).get(`${cx},${cy}`)!).push(b);
    },
    hits(r) {
      for (const b of big) if (over(r, b)) return true;
      const [x0, x1] = range(r.x, r.x + r.w), [y0, y1] = range(r.y, r.y + r.h);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) return [...cells.values()].some((l) => l.some((b) => over(r, b)));
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) for (const b of cells.get(`${cx},${cy}`) ?? []) if (over(r, b)) return true;
      return false;
    },
  };
}

function edgePathPlain(p1: Port, p2: Port, routing: string, curve: number, radius: number): Omit<EdgePath, 'mids'> {
  if (routing === 'straight' || curve === 0) {
    return { d: `M${P(p1.x, p1.y)} L${P(p2.x, p2.y)}`, at: (t) => polylinePoint([p1, p2], t) };
  }
  if (routing === 'orthogonal') {
    const pts = orthoPoints(p1, p2);
    return { d: roundedPolyline(pts, radius), at: (t) => polylinePoint(pts, t) };
  }
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const k = clamp(dist * 0.42, 24, 220) * curve;
  const c1 = { x: p1.x + p1.n.x * k, y: p1.y + p1.n.y * k };
  const c2 = { x: p2.x + p2.n.x * k, y: p2.y + p2.n.y * k };
  return {
    d: `M${P(p1.x, p1.y)} C${P(c1.x, c1.y)} ${P(c2.x, c2.y)} ${P(p2.x, p2.y)}`,
    at: (t) => bezierPoint(p1, c1, c2, p2, t),
  };
}

function orthoPoints(p1: Port, p2: Port): Point[] {
  const off = 18;
  const a = { x: p1.x + p1.n.x * off, y: p1.y + p1.n.y * off };
  const b = { x: p2.x + p2.n.x * off, y: p2.y + p2.n.y * off };
  const v1 = p1.n.y !== 0, v2 = p2.n.y !== 0;
  let mid: Point[];
  if (v1 && v2) {
    const my = (a.y + b.y) / 2;
    mid = [{ x: a.x, y: my }, { x: b.x, y: my }];
  } else if (!v1 && !v2) {
    const mx = (a.x + b.x) / 2;
    mid = [{ x: mx, y: a.y }, { x: mx, y: b.y }];
  } else if (v1) mid = [{ x: a.x, y: b.y }];
  else mid = [{ x: b.x, y: a.y }];
  const pts: Point[] = [p1, a, ...mid, b, p2];
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) > 0.5);
}

function roundedPolyline(pts: readonly Point[], rad: number): string {
  const p0 = pts[0]!;
  let d = `M${P(p0.x, p0.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!, a = pts[i - 1]!, b = pts[i + 1]!;
    const la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.min(rad, la / 2, lb / 2);
    const s = { x: p.x + ((a.x - p.x) / la) * r, y: p.y + ((a.y - p.y) / la) * r };
    const e = { x: p.x + ((b.x - p.x) / lb) * r, y: p.y + ((b.y - p.y) / lb) * r };
    d += ` L${P(s.x, s.y)} Q${P(p.x, p.y)} ${P(e.x, e.y)}`;
  }
  const l = pts[pts.length - 1]!;
  return d + ` L${P(l.x, l.y)}`;
}

/** Crow's-foot cardinality marker at port p (n points away from the entity). */
export function crowFoot(p: Port, card: string, color: string | undefined, width = 1, bg = '#fff'): SceneNode[] {
  const n = p.n, t = { x: -n.y, y: n.x };
  const at = (d: number, s = 0): Point => ({ x: p.x + n.x * d + t.x * s, y: p.y + n.y * d + t.y * s });
  const line = (a: Point, b: Point): string => `M${P(a.x, a.y)} L${P(b.x, b.y)}`;
  const bar = (d: number): string => line(at(d, -6), at(d, 6));
  const circ = (d: number): SceneNode => {
    const c = at(d);
    return el('circle', { cx: c.x, cy: c.y, r: 4, fill: bg, stroke: color, 'stroke-width': width });
  };
  let path = '';
  let extra: SceneNode | null = null;
  const many = card === 'one-many' || card === 'zero-many';
  if (many) path += line(at(0, -7), at(12)) + line(at(0, 7), at(12)) + line(at(0), at(12));
  if (card === 'one') path += bar(7) + bar(12);
  if (card === 'zero-one') {
    path += bar(7);
    extra = circ(17);
  }
  if (card === 'one-many') path += bar(16);
  if (card === 'zero-many') extra = circ(19);
  const out: SceneNode[] = [el('path', { d: path || undefined, fill: 'none', stroke: color, 'stroke-width': width })];
  if (extra) out.push(extra);
  return out;
}

/** A metadata number (validated by core/meta; checked again here because the scene must never see NaN). */
export const metaNum = (v: unknown): number | undefined => toNumber(v);

/** Bend points `[[x, y], …]`; anything malformed is dropped. */
export function metaPoints(v: unknown): [number, number][] {
  if (!Array.isArray(v)) return [];
  const out: [number, number][] = [];
  for (const p of v) {
    if (!Array.isArray(p)) continue;
    const x = toNumber(p[0]), y = toNumber(p[1]);
    if (x !== undefined && y !== undefined) out.push([x, y]);
  }
  return out;
}

/** Auto layout through the caller's bounded cache (`ctx.layoutCache`), keyed by the full layout input. */
export function cachedLayout(
  ctx: RenderContext,
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
  opts: LayeredOptions,
  run: () => Map<string, Point>,
): Map<string, Point> {
  const cache = ctx.layoutCache;
  if (!cache) return run();
  const key = 'layered' + hash(JSON.stringify([nodes, edges, opts]));
  const hit = cache.get(key);
  if (hit) return hit;
  const pos = run();
  cache.set(key, pos);
  return pos;
}

/** The node shape a flowchart preset draws (its own shape, else the shape it was saved for). */
export const presetShape = (p: StyleProps | undefined): string => {
  const n = p?.shape || p?.for || 'rect';
  // a Mermaid name (`cyl`) is the shape's id (`cylinder`)
  return shapeIdOf(n) ?? n;
};

/** The participant shape a sequence preset draws. */
export const participantPresetShape = (p: StyleProps | undefined): string => p?.shape || p?.for || 'box';
