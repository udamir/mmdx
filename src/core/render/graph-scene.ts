// The graph render kit's scene part (X1, R1; the pieces 4.4d deferred): what the flowchart, state and ER renderers each
// did in their own copy between their items and their scene — the media kit asked for once, the scope tests behind a
// subgraph's own direction, a container placed from its group's metadata and the compound result applied, the ports,
// the routing around the scopes a line must not cross, an edge's stroke and its label on a halo, and a group's frame.
// The kinds' differences (margins, which items a line keeps off, the frame's class and title offset) are parameters.
// Apart from graph-kit.ts, whose pure helpers the mindmap and sequence renderers and the presets load too, so they do
// not load the router.
import { ancestorsOf, type CompoundContainer, type CompoundResult } from '../layout/compound.js';
import { polylineCrosses, routeAround } from '../layout/route.js';
import { mediaKit, type MediaKit } from '../media/kit.js';
import type { ItemMeta } from '../meta/types.js';
import { el } from '../scene/build.js';
import type { SceneNode, SvgAttrs, TextRun } from '../scene/types.js';
import type { StyleProps } from '../style.js';
import type { CenterBox, ItemKind, Point, Rect } from '../types.js';
import type { SafeUrl } from '../validate.js';
import { assignPorts, edgePath, haloLabel, isSide, itemGroup, LINK_COLOR, linkAttr, memoBy, metaNum, sideToward, stackedShapeNodes, textBlock, withLink, type PortLink } from './common.js';
import type { Port, RenderContext } from './types.js';

/** The media kit, asked for once per render (`kit()`: each first ask without it counts a miss), and what that ask gave (`given()`: null before it). */
export function mediaKitOnce(): { kit: () => MediaKit | null; given: () => MediaKit | null } {
  let asked = false, K: MediaKit | null = null;
  return {
    kit: () => {
      if (!asked) {
        asked = true;
        K = mediaKit();
      }
      return K;
    },
    given: () => K,
  };
}

/** `within(id, gid)`: the item is the group or inside it, by the parents `parentOf` gives (a cycle stops). */
export function withinOf(parentOf: (id: string) => string | null): (id: string, gid: string) => boolean {
  return (id, gid) => {
    const seen = new Set<string>();
    for (let p: string | null = id; p && !seen.has(p); p = parentOf(p)) {
      if (p === gid) return true;
      seen.add(p);
    }
    return false;
  };
}

/** A link from outside to an item inside crosses the group's border, a link to the group itself does not: Mermaid lays such a group out in its parent's direction. */
export function crossedOf(edges: readonly { readonly from: string; readonly to: string }[], within: (id: string, gid: string) => boolean): (gid: string) => boolean {
  return (gid) => edges.some((e) => e.from !== gid && e.to !== gid && within(e.from, gid) !== within(e.to, gid));
}

/** A frame placed by hand in a group's metadata (x / y / w / h: top-left and size), else null. */
export function handFrame(gm: ItemMeta): Rect | null {
  const fx = metaNum(gm.x), fy = metaNum(gm.y), fw = metaNum(gm.w), fh = metaNum(gm.h);
  return fw && fh && fx !== undefined && fy !== undefined ? { x: fx, y: fy, w: fw, h: fh } : null;
}

/** A compound container placed as its group's metadata says: a frame placed by hand is fixed, else a kept top-left ("Reset positions in this group": x / y without a size) is `at`. */
export function placedContainer(c: CompoundContainer, gm: ItemMeta, frame = handFrame(gm)): CompoundContainer {
  if (frame) c.fixed = frame;
  else {
    const ax = metaNum(gm.x), ay = metaNum(gm.y);
    if (ax !== undefined && ay !== undefined) c.at = { x: ax, y: ay };
  }
  return c;
}

/** The compound layout's places applied: every item the layout placed takes its centre and is marked auto. */
export function placeAuto(R: CompoundResult, items: Iterable<readonly [string, { x: number; y: number; auto?: boolean }]>): void {
  for (const [id, it] of items) {
    if (!R.auto.has(id)) continue;
    const p = R.nodes.get(id)!;
    it.x = p.x;
    it.y = p.y;
    it.auto = true;
  }
}

/** A container's rect (top-left) as a centre box, `fixed` when its frame was placed by hand. */
export const containerBox = (r: Rect, fixed: boolean): CenterBox & { fixed?: boolean } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h, ...(fixed ? { fixed: true } : {}) });

/** A centre box as a rect (top-left). */
export const rectOf = (b: CenterBox): Rect => ({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });

/** An edge as the ports and the router see it: its ends (`e`), its metadata, its end boxes and its own bend points. */
export interface GraphEdge {
  e: { readonly id: string; readonly from: string; readonly to: string };
  m: ItemMeta;
  a: CenterBox;
  b: CenterBox;
  points: [number, number][];
}

export type Ports = ReturnType<typeof assignPorts>;

const across = (d: string): boolean => d === 'LR' || d === 'RL';

/**
 * The edges' ports (`assignPorts`). With bend points (its own, else the router's) a line leaves and enters on the sides
 * facing its first and last point, unless they are set by hand; between auto-placed ends the ports follow the direction
 * of the scope the compound layout laid the edge out in.
 */
export function placePorts(
  edges: readonly GraphEdge[],
  routed: ReadonlyMap<string, [number, number][]>,
  R: CompoundResult | null,
  autoEnd: (id: string) => boolean,
  opts: Parameters<typeof assignPorts>[1],
): Ports {
  return assignPorts(
    edges.map((x) => {
      const pts = x.points.length ? x.points : routed.get(x.e.id) ?? x.points;
      const p0 = pts[0], pn = pts[pts.length - 1];
      const link: PortLink = {
        id: x.e.id, a: x.a, b: x.b, aKey: x.e.from, bKey: x.e.to,
        fromSide: (isSide(x.m.fromSide) ? x.m.fromSide : undefined) || (p0 ? sideToward(x.a, { x: p0[0], y: p0[1] }) : undefined),
        toSide: (isSide(x.m.toSide) ? x.m.toSide : undefined) || (pn ? sideToward(x.b, { x: pn[0], y: pn[1] }) : undefined),
        fromAt: metaNum(x.m.fromAt), toAt: metaNum(x.m.toAt),
      };
      const r = R && autoEnd(x.e.from) && autoEnd(x.e.to) ? R.edges.get(x.e.id) : undefined;
      if (r) link.prefer = across(r.dir) ? 'h' : 'v';
      return link;
    }),
    opts,
  );
}

/** What routing around scopes reads (5.8, R1); the kinds differ in the boxes a line keeps off and in the margins. */
export interface RouteAround<X extends GraphEdge> {
  /** The lines to route: between auto-placed ends, without bend points of their own. */
  todo: readonly X[];
  /** The visible group frames; a line keeps off those that hold neither end. */
  frames: readonly { id: string; r: Rect }[];
  /** The items a line keeps off when they are near it (other than its ends): `near(x)` whether it looks at them, `keep(x, id)` whether this one is in its way. */
  boxes: readonly { id: string; r: Rect }[];
  near(x: X): boolean;
  keep?(x: X, id: string): boolean;
  /** More obstacles of a line that looks at the boxes (the flowchart: the title bands of the groups it leaves); `holders`: the groups holding its ends. */
  more?(x: X, holders: ReadonlySet<string>): Rect[];
  /** The line's ends from its ports (on the shapes' outlines, or the ports themselves), and how it is drawn. */
  ends(x: X, pp: { a: Port; b: Port }): [Port, Port];
  path(x: X): { routing: string; curve: number | undefined };
  /** The margins around the obstacles: the first route, and the second one from the ports placed again. */
  margins: readonly [number, number];
  ports: Ports;
  /** Places the ports again (facing the new bend points) and returns them. */
  replacePorts(): Ports;
  /** The bend points found, by edge id (never stored: an edge's own points win). */
  routed: Map<string, [number, number][]>;
}

/**
 * T07.3: a line between auto-placed ends must not cross a group that holds neither end. Such a line goes through the
 * points the layout kept free for it, else around the obstacles in its way (core/layout/route.ts); the ports are then
 * placed again, facing the first and last bend point, and a curve that still clips a corner is routed once more from
 * them with the wider margin.
 */
export function routeAroundScopes<X extends GraphEdge>(R: CompoundResult, o: RouteAround<X>): void {
  const { todo, frames, boxes, routed, margins } = o;
  let ports = o.ports;
  const holders = (id: string): string[] => (R.containers.has(id) ? [id, ...ancestorsOf(R.parent, id)] : ancestorsOf(R.parent, id));
  const drawn = (x: X, pts: readonly (readonly [number, number])[]): Point[] | null => {
    const pp = ports.get(x.e.id);
    if (!pp) return null;
    const path = edgePath(...o.ends(x, pp), { ...o.path(x), points: pts });
    return Array.from({ length: 41 }, (_, i) => path.at(i / 40));
  };
  const straight = memoBy((x: X) => drawn(x, [])); // sampled once for both passes (P7)
  const around = (x: X, obs: readonly Rect[], margin: number): void => {
    const pp = ports.get(x.e.id);
    const r = pp && routeAround(...o.ends(x, pp), obs, margin);
    if (r) routed.set(x.e.id, r.map((q) => [q.x, q.y]));
  };
  const obstacles = new Map<X, Rect[]>();
  for (const x of todo) {
    const skip = new Set([...holders(x.e.from), ...holders(x.e.to)]);
    const obs = frames.filter((f) => !skip.has(f.id)).map((f) => f.r);
    const line = o.near(x) ? straight(x) : null;
    if (line) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of line) {
        x0 = Math.min(x0, q.x);
        y0 = Math.min(y0, q.y);
        x1 = Math.max(x1, q.x);
        y1 = Math.max(y1, q.y);
      }
      const near = { x: x0 - 60, y: y0 - 60, w: x1 - x0 + 120, h: y1 - y0 + 120 };
      for (const b of boxes)
        if (b.id !== x.e.from && b.id !== x.e.to && (!o.keep || o.keep(x, b.id)) && b.r.x < near.x + near.w && b.r.x + b.r.w > near.x && b.r.y < near.y + near.h && b.r.y + b.r.h > near.y) obs.push(b.r);
      if (o.more) obs.push(...o.more(x, skip));
    }
    obstacles.set(x, obs);
  }
  for (const x of todo) {
    const obs = obstacles.get(x)!;
    const line = obs.length ? straight(x) : null;
    if (!line || !polylineCrosses(line, obs)) continue;
    const hint = R.edges.get(x.e.id)?.points ?? [];
    const viaHint = hint.length ? drawn(x, hint.map((q) => [q.x, q.y])) : null;
    if (viaHint && !polylineCrosses(viaHint, obs)) routed.set(x.e.id, hint.map((q) => [q.x, q.y]));
    else around(x, obs, margins[0]);
  }
  if (!routed.size) return;
  ports = o.replacePorts();
  for (const x of todo) {
    if (!routed.has(x.e.id)) continue;
    const obs = obstacles.get(x)!;
    const line = drawn(x, routed.get(x.e.id)!);
    if (line && polylineCrosses(line, obs)) around(x, obs, margins[1]);
  }
}

/** An edge's group: a wide transparent line to hit, the drawn line (`line`: its attributes, `d` among them), then `extra` (an ER relationship's crow's feet). */
export function edgeStroke(kind: ItemKind, id: string, cls: string, ends: { from: string; to: string }, line: SvgAttrs & { d: string }, extra: SceneNode[] = []): SceneNode {
  return itemGroup(kind, id, cls, [el('path', { class: 'hit', d: line.d, fill: 'none', stroke: 'transparent', 'stroke-width': 12 }), el('path', line), ...extra], { 'data-from': ends.from, 'data-to': ends.to });
}

/** A label's text: its lines, and its runs when it is more than plain text (markdown, icon tokens). */
export interface Label {
  lines: string[];
  rich?: TextRun[][];
}

/** How an edge label is drawn on its halo (render/common.ts `haloLabel`). */
export type HaloOpts = Parameters<typeof haloLabel>[3];

/**
 * An edge's label on a halo at (x, y): its runs through the media kit (`kit()` is asked only for runs), else its
 * lines; `ends` gives the label group the edge's ends (the flowchart's and state's, not the ER's).
 */
export function edgeLabel(kind: ItemKind, id: string, L: Label, x: number, y: number, lo: HaloOpts, href: SafeUrl | null, ctx: RenderContext, kit: () => MediaKit | null, ends?: { from: string; to: string }): SceneNode {
  const label: SceneNode[] = L.rich && kit()
    ? kit()!.richText(L.rich, x, y, { ...lo, lh: 1.25, measure: ctx.measure, extra: { stroke: lo.halo, 'stroke-width': 4, 'stroke-linejoin': 'round', 'paint-order': 'stroke' } })
    : [haloLabel(L.lines, x, y, lo)];
  return itemGroup(kind, id, 'elabel', withLink(href, label), { 'data-part': 'label', ...(ends ? { 'data-from': ends.from, 'data-to': ends.to } : {}), ...linkAttr(href) }, 'label');
}

/** A group's frame as a graph kind draws it. */
export interface Frame {
  id: string;
  box: CenterBox;
  st: StyleProps;
  /** The title in its band (null: none drawn). */
  title: Label | null;
  href: SafeUrl | null;
  family: string;
  cls: string;
  /** The title's offset from the middle of its band (the flowchart's lanes: −6). */
  dy?: number;
  /** Drawn after the title (the state composites' band line, region lines and tooltip). */
  after?: SceneNode[];
}

/** A group's frame: the (stacked) rectangle, the title centred in the band at its top (or at the left with `titleAlign`), what comes after. */
export function groupFrame(f: Frame, ctx: RenderContext, kit: () => MediaKit | null): SceneNode {
  const { box, st, title, href } = f;
  const parts = stackedShapeNodes('rect', box, st);
  if (title) {
    const pad = st.pad ?? 0;
    const ty = box.y - box.h / 2 + (st.padTop ?? pad) / 2 + (f.dy ?? 0);
    const left = st.titleAlign === 'left';
    const to = { size: st.titleSize ?? 14, weight: st.titleWeight, color: href ? LINK_COLOR : st.titleColor, family: st.fontFamily || f.family, anchor: left ? ('start' as const) : ('middle' as const), lh: 1.25, underline: !!href };
    const tx = left ? box.x - box.w / 2 + pad : box.x;
    parts.push(...withLink(href, title.rich && kit() ? kit()!.richText(title.rich, tx, ty, { ...to, measure: ctx.measure }) : [textBlock(title.lines, tx, ty, to)]));
  }
  if (f.after) parts.push(...f.after);
  return itemGroup('group', f.id, f.cls, parts, linkAttr(href));
}
