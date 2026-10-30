// Flowchart renderer: nodes, nested groups (lanes / wrappers), styled curved edges (prototype render/flowchart.js).
import { layered, type LayoutEdge, type LayoutNode } from '../layout/layered.js';
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type { FlowEdge, FlowGroup, FlowNode, FlowchartModel } from '../model.js';
import { el } from '../scene/build.js';
import type { SceneNode } from '../scene/types.js';
import type { StyleProps } from '../style.js';
import { textBlockWidth, wrap } from '../text/wrap.js';
import type { CenterBox, Point } from '../types.js';
import {
  assignPorts, baseStyle, cachedLayout, metaNum, metaPoints, type RenderEnv, type SubResult, byLine, countBy, Defs, edgePath, firstLine, font, haloLabel, hiddenOf, isSide, itemGroup,
  itemLink, LINK_COLOR, linkAttr, mergeStyle, outerBox, pickStyle, presetOf, presets, sideToward, stackedShapeNodes,
  textBlock, urlRef, withLink,
} from './common.js';
import type { BoxGeom, EdgeGeom, FlowGeometry } from './types.js';
import type { ResolvedTheme } from '../theme/types.js';

export interface FlowPresets {
  node: Record<string, StyleProps>;
  group: Record<string, StyleProps>;
  edge: Record<string, StyleProps>;
}

export function flowPresets(T: ResolvedTheme, meta: DiagramMeta): FlowPresets {
  return {
    node: presets(T.flowchart.nodePresets, meta.styles['node']),
    group: presets(T.flowchart.groupPresets, meta.styles['group']),
    edge: presets(T.flowchart.edgePresets, meta.styles['edge']),
  };
}

/** Which shape a node preset belongs to (theme editor / preset pickers): its "shape", else "for", else rectangle. */
export const presetShape = (p: StyleProps | undefined): string => p?.shape || p?.for || 'rect';

export function nodePreset(n: FlowNode, meta: DiagramMeta, P: FlowPresets): string {
  const m = meta.nodes?.[n.id];
  if (typeof m?.preset === 'string' && m.preset) return m.preset;
  const c = n.classes.find((c) => presetOf(P.node, c));
  if (c) return c;
  if (n.shape === 'cylinder' && presetOf(P.node, 'db')) return 'db';
  if (n.shape === 'diamond' && presetOf(P.node, 'decision')) return 'decision';
  return '';
}

export function edgePreset(e: FlowEdge, meta: DiagramMeta, P: FlowPresets): string {
  const m = meta.edges?.[e.id];
  if (typeof m?.preset === 'string' && m.preset) return m.preset;
  if (e.line === 'dotted' && presetOf(P.edge, 'sync')) return 'sync';
  if (e.line === 'thick' && presetOf(P.edge, 'strong')) return 'strong';
  return '';
}

export function groupPreset(g: FlowGroup, meta: DiagramMeta, P: FlowPresets): string {
  const m = meta.groups?.[g.id];
  if (typeof m?.preset === 'string' && m.preset) return m.preset;
  const c = (g.classes ?? []).find((c) => presetOf(P.group, c));
  if (c) return c;
  return 'box';
}

interface NodeItem extends CenterBox {
  n: FlowNode;
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  lines: string[];
  auto?: boolean;
}

interface GroupBox extends CenterBox {
  fixed?: boolean;
  empty?: boolean;
}

interface GroupItem {
  g: FlowGroup;
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  lines: string[];
  box: GroupBox;
  empty: boolean;
  depth: number;
}

const NO_META: ItemMeta = {};

/** Width available to text inside a shape of outer width `w` (diamonds and circles leave less room at the sides). */
function textAreaWidth(shape: string, w: number): number {
  if (shape === 'diamond') return w / 1.3;
  if (shape === 'circle' || shape === 'doublecircle') return w * 0.75;
  if (shape === 'hexagon') return w - 30;
  return w;
}

export function renderFlowchart(model: FlowchartModel, env: RenderEnv): SubResult {
  const { ctx, theme: T, meta, opts } = env;
  const F = T.flowchart;
  const P = flowPresets(T, meta);
  const family = T.font;
  const defs = new Defs(ctx.idPrefix);
  const routingDefault = meta.canvas.routing || 'curved';
  const m = <K extends 'nodes' | 'groups' | 'edges'>(k: K, id: string): ItemMeta => meta[k]?.[id] ?? NO_META;

  // ---- resolve node styles & sizes
  const nodes = new Map<string, NodeItem>();
  for (const n of model.nodes.values()) {
    const nm = m('nodes', n.id);
    const preset = nodePreset(n, meta, P);
    const pst = presetOf(P.node, preset);
    const classDefs = n.classes.filter((c) => !presetOf(P.node, c)).map((c) => model.classDefs[c]);
    // the shape first: each shape has its own default style in the theme (flowchart.nodeShapes.<shape>)
    const shape = str(nm.shape) || pst?.shape || (n.shape !== 'rect' ? n.shape : F.node.shape || 'rect');
    const st = mergeStyle(ctx, F.node, F.nodeShapes?.[shape], baseStyle(meta, 'node'), pst, ...classDefs, n.style, pickStyle(nm));
    st.shape = shape;
    const fontSize = st.fontSize ?? 14, padX = st.padX ?? 0, padY = st.padY ?? 0;
    const fnt = font(fontSize, st.fontWeight, st.fontFamily || family);
    const fixedW = metaNum(nm.w);
    // word wrap: lines break to fit the shape's width (its own width, else the style's maxW, else 200)
    const lines = st.wrap
      ? wrap(n.label, Math.max(20, textAreaWidth(shape, fixedW ?? st.maxW ?? Math.max(st.minW ?? 0, 200)) - padX * 2), fnt, ctx.measure)
      : n.label.split('\n');
    const tw = textBlockWidth(lines, fnt, ctx.measure);
    let w = Math.max(st.minW ?? 0, tw + padX * 2);
    let h = Math.max(st.minH ?? 0, lines.length * fontSize * 1.3 + padY * 2);
    if (shape === 'diamond') {
      w = Math.max(w * 1.3, h * 1.6);
      h = Math.max(h * 1.4, 70);
    }
    if (shape === 'circle' || shape === 'doublecircle') w = h = Math.max(w, h);
    if (shape === 'hexagon') w += 30;
    w = fixedW || w;
    // a wrapped label never overflows: the shape grows taller to fit its lines
    h = st.wrap ? Math.max(metaNum(nm.h) ?? 0, h) : metaNum(nm.h) || h;
    nodes.set(n.id, { n, m: nm, st, preset, lines, w, h, x: NaN, y: NaN, ...xy(nm) });
  }

  // ---- hidden elements (layers): a hidden group hides its contents; a hidden node hides its edges
  const hidden = { node: hiddenOf(opts, 'node'), group: hiddenOf(opts, 'group'), edge: hiddenOf(opts, 'edge') };
  const groupHidden = new Set<string>();
  const markGroup = (gid: string): void => {
    // iterative (nesting depth is user input)
    const stack = [gid];
    while (stack.length) {
      const id = stack.pop()!;
      if (groupHidden.has(id)) continue;
      groupHidden.add(id);
      for (const c of model.groups.get(id)?.children ?? []) if (model.groups.has(c)) stack.push(c);
    }
  };
  for (const g of model.groups.values()) if (hidden.group.has(g.id)) markGroup(g.id);
  const hiddenNodes = new Set<string>();
  for (const [id, N] of nodes) {
    if (hidden.node.has(id)) hiddenNodes.add(id);
    if (N.n.parent && groupHidden.has(N.n.parent)) hiddenNodes.add(id);
  }

  // ---- auto layout for nodes without positions
  const missing = [...nodes.values()].filter((N) => Number.isNaN(N.x) || Number.isNaN(N.y));
  if (missing.length) {
    const pathOf = (id: string): string[] => {
      const p: string[] = [];
      const seen = new Set<string>();
      let g = model.nodes.get(id)?.parent;
      while (g && !seen.has(g)) {
        seen.add(g);
        p.unshift(g);
        g = model.groups.get(g)?.parent;
      }
      return p;
    };
    const firstNodeCache = new Map<string, string | null>();
    const firstNode = (gid: string): string | null => {
      // depth-first through nested groups, iteratively
      if (firstNodeCache.has(gid)) return firstNodeCache.get(gid)!;
      const stack: { id: string; k: number }[] = [{ id: gid, k: 0 }];
      const seen = new Set([gid]);
      let found: string | null = null;
      while (stack.length && found === null) {
        const top = stack[stack.length - 1]!;
        const ch = model.groups.get(top.id)?.children ?? [];
        if (top.k >= ch.length) {
          stack.pop();
          continue;
        }
        const c = ch[top.k++]!;
        if (model.nodes.has(c)) found = c;
        else if (model.groups.has(c) && !seen.has(c)) {
          seen.add(c);
          stack.push({ id: c, k: 0 });
        }
      }
      firstNodeCache.set(gid, found);
      return found;
    };
    const ln: LayoutNode[] = missing.map((N) => ({ id: N.n.id, w: N.w, h: N.h, path: pathOf(N.n.id) }));
    const le: LayoutEdge[] = model.edges.map((e) => ({
      from: model.groups.has(e.from) ? firstNode(e.from) : e.from,
      to: model.groups.has(e.to) ? firstNode(e.to) : e.to,
      minlen: e.minlen,
    }));
    const lo = { dir: model.direction, rankSep: model.groups.size ? 110 : 70, nodeSep: 46, groupGap: 60 };
    const pos = cachedLayout(ctx, ln, le, lo, () => layered(ln, le, lo));
    // Offset auto-placed nodes below manually placed ones.
    let dy = 0;
    let maxY = -Infinity;
    for (const N of nodes.values()) if (!Number.isNaN(N.x) && !Number.isNaN(N.y)) maxY = Math.max(maxY, N.y + N.h / 2);
    if (maxY > -Infinity) dy = maxY + 60;
    for (const N of missing) {
      const p = pos.get(N.n.id) ?? { x: 0, y: 0 };
      N.x = p.x;
      N.y = p.y + dy;
      N.auto = true;
    }
  }

  // ---- groups (inner first)
  const depthCache = new Map<string, number>();
  const depth = (g: FlowGroup): number => {
    const c = depthCache.get(g.id);
    if (c !== undefined) return c;
    let d = 0;
    const seen = new Set([g.id]);
    let p = g.parent;
    while (p && !seen.has(p)) {
      seen.add(p);
      d++;
      p = model.groups.get(p)?.parent ?? null;
    }
    depthCache.set(g.id, d);
    return d;
  };
  const groupsSorted = [...model.groups.values()].sort((a, b) => depth(b) - depth(a));
  const groups = new Map<string, GroupItem>();
  for (const g of groupsSorted) {
    const gm = m('groups', g.id);
    const preset = groupPreset(g, meta, P);
    const st = mergeStyle(ctx, F.group, baseStyle(meta, 'group'), presetOf(P.group, preset), g.style, pickStyle(gm));
    const pad = st.pad ?? 0, padTop = st.padTop ?? pad;
    const lines = (g.label || '').trim() ? g.label.split('\n') : [];
    let box: GroupBox;
    const fx = metaNum(gm.x), fy = metaNum(gm.y), fw = metaNum(gm.w), fh = metaNum(gm.h);
    if (fw && fh && fx !== undefined && fy !== undefined) box = { x: fx + fw / 2, y: fy + fh / 2, w: fw, h: fh, fixed: true };
    else {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of g.children) {
        const N = nodes.get(c);
        let b: CenterBox | null = null;
        if (N && !hiddenNodes.has(c)) b = N;
        else {
          const G = groups.get(c);
          if (G && !groupHidden.has(c) && !G.empty) b = G.box;
        }
        if (!b) continue;
        x0 = Math.min(x0, b.x - b.w / 2);
        y0 = Math.min(y0, b.y - b.h / 2);
        x1 = Math.max(x1, b.x + b.w / 2);
        y1 = Math.max(y1, b.y + b.h / 2);
      }
      const titleH = lines.length && st.titleSize ? padTop : pad;
      const empty = x0 === Infinity;
      if (empty) {
        x0 = 0;
        y0 = 0;
        x1 = 160;
        y1 = 60;
      }
      const titleW = lines.length ? textBlockWidth(lines, font(st.titleSize ?? 14, st.titleWeight, st.fontFamily || family), ctx.measure) + 2 * pad : 0;
      let w = x1 - x0 + 2 * pad;
      const cx = (x0 + x1) / 2;
      w = Math.max(w, titleW);
      box = { x: cx, y: (y0 - titleH + y1 + pad) / 2, w, h: y1 - y0 + titleH + pad, empty };
    }
    groups.set(g.id, { g, m: gm, st, preset, lines, box, empty: !!box.empty, depth: depth(g) });
  }

  // ---- edges
  interface EdgeItem {
    e: FlowEdge;
    m: ItemMeta;
    st: StyleProps;
    preset: string;
    a: CenterBox;
    b: CenterBox;
    hidden: boolean;
    points: [number, number][];
  }
  const edgeItems: EdgeItem[] = [];
  const boxOf = (id: string): CenterBox | undefined => {
    const N = nodes.get(id);
    if (N) return outerBox(N, N.st.stack);
    const G = groups.get(id);
    return G ? outerBox(G.box, G.st.stack) : undefined;
  };
  for (const e of model.edges) {
    const a = boxOf(e.from), b = boxOf(e.to);
    if (!a || !b) continue;
    const em = m('edges', e.id);
    const preset = edgePreset(e, meta, P);
    const ls = model.linkStyles[String(e.index)] ?? model.linkStyles['default'];
    const lsMapped = ls ? { color: ls.stroke, width: ls.strokeWidth, dash: ls.dash } : null;
    const st = mergeStyle(ctx, F.edge, baseStyle(meta, 'edge'), presetOf(P.edge, preset), lsMapped, pickStyle(em));
    const isHidden =
      hiddenNodes.has(e.from) || hiddenNodes.has(e.to) || groupHidden.has(e.from) || groupHidden.has(e.to) || hidden.edge.has(e.id);
    edgeItems.push({ e, m: em, st, preset, a, b, hidden: isHidden, points: metaPoints(em.points) });
  }
  const visibleEdges = edgeItems.filter((x) => !x.hidden);
  const ports = assignPorts(
    visibleEdges.map((x) => {
      const p0 = x.points[0], pn = x.points[x.points.length - 1];
      return {
        id: x.e.id,
        a: x.a,
        b: x.b,
        aKey: x.e.from,
        bKey: x.e.to,
        // with bend points, the line leaves / enters on the sides facing its first / last point (unless set by hand)
        fromSide: (isSide(x.m.fromSide) ? x.m.fromSide : undefined) || (p0 ? sideToward(x.a, { x: p0[0], y: p0[1] }) : undefined),
        toSide: (isSide(x.m.toSide) ? x.m.toSide : undefined) || (pn ? sideToward(x.b, { x: pn[0], y: pn[1] }) : undefined),
        fromAt: metaNum(x.m.fromAt),
        toAt: metaNum(x.m.toAt),
      };
    }),
    { prefer: model.direction === 'LR' || model.direction === 'RL' ? 'h' : 'v' },
  );

  // ---- draw
  const groupNodes: SceneNode[] = [];
  for (const G of [...groups.values()].sort((a, b) => a.depth - b.depth || a.g.order - b.g.order)) {
    if (groupHidden.has(G.g.id) || G.empty) continue;
    const { box, st, lines } = G;
    const href = itemLink(ctx, G.m.link);
    const children = stackedShapeNodes('rect', box, st);
    if (lines.length && st.titleSize) {
      const pad = st.pad ?? 0;
      const ty = box.y - box.h / 2 + (st.padTop ?? pad) / 2 + (G.preset === 'lane' ? -6 : 0);
      const left = st.titleAlign === 'left';
      const title = textBlock(lines, left ? box.x - box.w / 2 + pad : box.x, ty, {
        size: st.titleSize,
        weight: st.titleWeight,
        color: href ? LINK_COLOR : st.titleColor,
        family: st.fontFamily || family,
        anchor: left ? 'start' : 'middle',
        lh: 1.25,
        underline: !!href,
      });
      children.push(...withLink(href, [title]));
    }
    groupNodes.push(itemGroup('group', G.g.id, 'group', children, linkAttr(href)));
  }

  const edgeNodes: SceneNode[] = [], labelNodes: SceneNode[] = [];
  const edgeGeom = new Map<string, EdgeGeom>();
  for (const x of visibleEdges) {
    const { e, m: em, st } = x;
    const p = ports.get(e.id);
    if (!p) continue;
    const routing = str(em.routing) || routingDefault;
    const path = edgePath(p.a, p.b, { routing, curve: st.curve ?? 1, points: x.points });
    const endType = str(em.endArrow) || (e.end === 'arrow' ? st.arrow : e.end);
    const startType = str(em.startArrow) || (e.start === 'arrow' ? st.arrow : e.start);
    const width = st.width ?? 1;
    const mkE = defs.marker(endType, st.color, 9 + width * 1.5);
    const mkS = defs.marker(startType, st.color, 9 + width * 1.5);
    const dash = st.dash || undefined;
    edgeNodes.push(
      itemGroup(
        'edge',
        e.id,
        'edge',
        [
          el('path', { class: 'hit', d: path.d, fill: 'none', stroke: 'transparent', 'stroke-width': 12 }),
          el('path', {
            class: 'line',
            d: path.d,
            fill: 'none',
            stroke: st.color,
            'stroke-width': width,
            'stroke-opacity': st.strokeOpacity,
            'stroke-dasharray': dash,
            'stroke-linecap': dash && dash.startsWith('1') ? 'round' : undefined,
            'marker-end': urlRef(mkE),
            'marker-start': urlRef(mkS),
          }),
        ],
        { 'data-from': e.from, 'data-to': e.to },
      ),
    );
    let labelBox: BoxGeom | null = null;
    if (e.label && !opts.hideLabels) {
      const lp = path.at(metaNum(em.labelAt) ?? 0.5);
      const lx = lp.x + (metaNum(em.labelDx) || 0), ly = lp.y + (metaNum(em.labelDy) || 0);
      const lines = e.label.split('\n');
      const labelSize = st.labelSize ?? 12;
      const href = itemLink(ctx, em.link);
      const label = haloLabel(lines, lx, ly, {
        size: labelSize,
        color: href ? LINK_COLOR : st.labelColor || st.color,
        family: st.fontFamily || family,
        halo: env.paper,
        weight: st.fontWeight || 400,
        underline: !!href,
      });
      labelNodes.push(itemGroup('edge', e.id, 'elabel', withLink(href, [label]), { 'data-part': 'label', 'data-from': e.from, 'data-to': e.to, ...linkAttr(href) }, 'label'));
      const lw = textBlockWidth(lines, font(labelSize, 400, st.fontFamily || family), ctx.measure);
      labelBox = { x: lx, y: ly, w: lw, h: lines.length * labelSize * 1.25 };
    }
    edgeGeom.set(e.id, { a: p.a, b: p.b, label: labelBox, points: x.points, mids: path.mids, d: path.d });
  }

  const nodeNodes: SceneNode[] = [];
  const lineOf = (N: NodeItem): number => firstLine(N.n.defLine, N.n.lines);
  for (const [id, N] of [...nodes].sort((a, b) => byLine(lineOf(a[1]), lineOf(b[1])))) {
    if (hiddenNodes.has(id)) continue;
    const { st } = N;
    const href = itemLink(ctx, N.m.link, N.n.link);
    const fontSize = st.fontSize ?? 14, padX = st.padX ?? 0, padY = st.padY ?? 0;
    const align = st.align || 'center';
    const tx = align === 'left' ? N.x - N.w / 2 + padX : align === 'right' ? N.x + N.w / 2 - padX : N.x + (st.shape === 'hcyl' ? -4 : 0);
    const blockH = N.lines.length * fontSize * 1.3;
    const ty =
      st.valign === 'top'
        ? N.y - N.h / 2 + padY + blockH / 2 + (st.shape === 'cylinder' ? 10 : 0)
        : st.valign === 'bottom'
          ? N.y + N.h / 2 - padY - blockH / 2
          : N.y + (st.shape === 'cylinder' ? 4 : 0);
    const label = textBlock(N.lines, tx, ty, {
      size: fontSize,
      weight: st.fontWeight,
      color: href ? LINK_COLOR : st.text,
      family: st.fontFamily || family,
      lh: 1.3,
      anchor: align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle',
      underline: !!href,
    });
    nodeNodes.push(itemGroup('node', id, 'node', [...stackedShapeNodes(st.shape, N, st), ...withLink(href, [label])], linkAttr(href)));
  }

  // ---- bounds
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (b: CenterBox): void => {
    x0 = Math.min(x0, b.x - b.w / 2);
    y0 = Math.min(y0, b.y - b.h / 2);
    x1 = Math.max(x1, b.x + b.w / 2 + 6);
    y1 = Math.max(y1, b.y + b.h / 2 + 6);
  };
  for (const [id, N] of nodes) if (!hiddenNodes.has(id)) grow(N);
  for (const G of groups.values()) if (!G.empty && !groupHidden.has(G.g.id)) grow(G.box);
  for (const eg of edgeGeom.values()) if (eg.label) grow(eg.label);
  if (x0 === Infinity) {
    x0 = 0;
    y0 = 0;
    x1 = 400;
    y1 = 300;
  }
  const pad = env.pad;
  const bounds = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };

  const geom: FlowGeometry = {
    type: 'flowchart',
    nodes: new Map(
      [...nodes].map(([id, N]) => {
        const b: BoxGeom & { auto?: boolean } = { x: N.x, y: N.y, w: N.w, h: N.h, stack: N.st.stack, hidden: hiddenNodes.has(id) };
        if (N.auto) b.auto = true;
        return [id, b];
      }),
    ),
    groups: new Map(
      [...groups].map(([id, G]) => [
        id,
        { x: G.box.x, y: G.box.y, w: G.box.w, h: G.box.h, stack: G.st.stack, fixed: !!G.box.fixed, hidden: groupHidden.has(id) || G.empty },
      ]),
    ),
    edges: edgeGeom,
  };
  return {
    defs: defs.nodes(),
    body: [...groupNodes, ...edgeNodes, ...nodeNodes, ...labelNodes],
    bounds,
    geom,
    presetsUsed: {
      node: countBy([...nodes.values()].map((N) => N.preset || '(none)')),
      edge: countBy(edgeItems.map((x) => x.preset || '(none)')),
    },
  };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function xy(m: ItemMeta): Partial<Point> {
  const o: Partial<Point> = {};
  const x = metaNum(m.x), y = metaNum(m.y);
  if (x !== undefined) o.x = x;
  if (y !== undefined) o.y = y;
  return o;
}

