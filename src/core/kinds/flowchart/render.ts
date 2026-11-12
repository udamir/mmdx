// Flowchart renderer: nodes, nested groups (lanes / wrappers), styled curved edges (prototype render/flowchart.js);
// icon and image nodes (an asset with a caption), markdown labels and icon tokens as rich text, invisible links, edge
// animation, tooltips and the diagram's title (T06).
import { a11yOf, Bounds, depthOf, EMPTY_META, hiddenGroups, str } from '../../render/graph-kit.js';
import { diagramTitle } from '../../render/title.js';
import { layered, type LayoutEdge, type LayoutNode } from '../../layout/layered.js';
import { containerBox, crossedOf, edgeLabel, edgeStroke, groupFrame, handFrame, mediaKitOnce, placeAuto, placedContainer, placePorts, rectOf, routeAroundScopes, withinOf, type Ports } from '../../render/graph-scene.js';
import { layoutCompound, type CompoundContainer, type CompoundNode, type CompoundResult } from '../../layout/compound.js';
import type { ItemMeta } from '../../meta/types.js';
import type { FlowEdge, FlowGroup, FlowNode, FlowchartModel, MermaidStyle } from '../../model.js';
import { title as tooltip } from '../../scene/build.js';
import type { SceneNode, TextRun } from '../../scene/types.js';
import type { StyleProps } from '../../style.js';
import { textBlockWidth, wrap } from '../../text/wrap.js';
import type { MediaKit } from '../../media/kit.js';
import { ICON_TOKEN } from '../../icons/names.js';
import type { IconResolver } from '../../text/rich.js';
import type { FontSpec } from '../../text/measure.js';
import type { CenterBox, Point, Rect } from '../../types.js';
import { cachedLayout, metaNum, metaPoints, byLine, countBy, Defs, edgePath, firstLine, font, hiddenOf, itemGroup, itemLink, LINK_COLOR, linkAttr, mergeStyle, outerBox, pickStyle, presetOf, stackedShapeNodes, textBlock, urlRef, withLink } from '../../render/common.js';
import { type RenderEnv, type SubResult, type MediaSource } from '../../render/types.js';
import type { BoxGeom, EdgeGeom, FlowGeometry, Port } from '../../render/types.js';
import { onOutline } from '../../shapes/outline.js';
import { shapeDef } from '../../shapes/registry.js';
import type { ShapeDef } from '../../shapes/types.js';

// the presets and the edge metadata lookup live apart, so code that needs only them (the portable export, the editor's
// base) does not load the renderer
export { edgeMeta, edgePreset, flowPresets, groupPreset, nodePreset, presetShape, type FlowPresets } from './presets.js';
import { edgeMeta, edgePreset, flowPresets, groupPreset, nodePreset, type FlowPresets } from './presets.js';
import { edgeStyleLayers, flowNodeShape, groupStyleLayers, nodeStyleLayers } from './style.js';
import { dashAttrs } from '../../shapes/dash.js';
import { assetBox, captionY, mediaAssetNodes, mediaLayout, mediaPort, type MediaBox } from '../../render/media-node.js';

interface NodeItem extends CenterBox {
  n: FlowNode;
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  lines: string[];
  /** The label as runs (a markdown string, icon tokens), when it is more than plain text. */
  rich?: TextRun[][];
  auto?: boolean;
  /** An icon or image node's asset and caption. */
  media?: MediaBox;
}

/** Where markdown labels and captions wrap (Mermaid's `flowchart.wrappingWidth`). */
const WRAP_WIDTH = 200;

/** Mermaid's curve names as the routings mmdx draws: `linear` straight, the steps orthogonal, the rest curved. */
function curveRouting(curve: string | undefined): string | undefined {
  if (!curve) return undefined;
  if (curve === 'linear') return 'straight';
  return curve.startsWith('step') ? 'orthogonal' : 'curved';
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
  /** The title as runs (markdown, icon tokens). */
  rich?: TextRun[][];
  box: GroupBox;
  empty: boolean;
  depth: number;
}


/** A label's lines, its runs when it is more than plain text, and its width. */
interface FlowLabel {
  lines: string[];
  rich?: TextRun[][];
  w: number;
}

/** What every phase reads (5.8, R1): the model and its environment, the presets, the media kit and the label reader. */
interface FlowRun {
  model: FlowchartModel;
  env: RenderEnv;
  P: FlowPresets;
  family: string;
  /** Where a markdown label wraps (Mermaid's `flowchart.wrappingWidth`). */
  wrapWidth: number;
  kit: () => MediaKit | null;
  given: () => MediaKit | null;
  /** A label's lines: plain text as before, or runs (markdown, icon tokens) wrapped at `maxW` (markdown at its own width unless turned off). */
  labelLines(label: string, md: boolean | undefined, fnt: FontSpec, color: string | undefined, line: number | null, maxW: number, mdW: number): FlowLabel;
}

/** A group's style and title, before the layout (its box comes after it). */
interface GroupLook {
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  lines: string[];
  title: FlowLabel | null;
  /** The frame placed by hand (x / y / w / h: top-left and size). */
  frame: Rect | null;
}

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

/** The items hidden by layers: a hidden group hides its contents, a hidden node its edges. */
interface FlowHidden {
  edge: ReadonlySet<string>;
  groups: ReadonlySet<string>;
  nodes: ReadonlySet<string>;
}

export function renderFlowchart(model: FlowchartModel, env: RenderEnv): SubResult {
  const { ctx, meta, opts } = env;
  const r = flowRun(model, env);
  const defs = new Defs(ctx.idPrefix);
  const routingDefault = meta.canvas.routing || 'curved';

  // ---- layout input: node styles and sizes, what the layers hide, group styles and titles
  const nodes = measureNodes(r);
  const hidden = { node: hiddenOf(opts, 'node'), group: hiddenOf(opts, 'group'), edge: hiddenOf(opts, 'edge') };
  const groupHidden = hiddenGroups(model.groups, hidden.group);
  const hiddenNodes = new Set<string>();
  for (const [id, N] of nodes) {
    if (hidden.node.has(id)) hiddenNodes.add(id);
    if (N.n.parent && groupHidden.has(N.n.parent)) hiddenNodes.add(id);
  }
  const H: FlowHidden = { edge: hidden.edge, groups: groupHidden, nodes: hiddenNodes };
  const depth = depthOf(model.groups);
  const groupsSorted = [...model.groups.values()].sort((a, b) => depth(b.id) - depth(a.id));
  const looks = groupLooks(r, groupsSorted);

  // ---- layout: the nodes without a place, then the group boxes (inner first)
  const { CR, visibleIn } = layoutFlow(r, nodes, looks, hiddenNodes);
  const groups = groupBoxes(groupsSorted, looks, CR, visibleIn, nodes, H, depth);

  // ---- routing: the edges, their ports, and the lines around the subgraphs that hold neither end
  const edgeItems = flowEdges(r, nodes, groups, H);
  const visibleEdges = edgeItems.filter((x) => !x.hidden);
  /** Bend points the compound layout's router gave an edge (never stored: the edge's own `points` win). */
  const routed = new Map<string, [number, number][]>();
  /** The end was placed by the layout: an auto-placed node, or a subgraph that moved as a unit. */
  const autoEnd = (id: string): boolean => {
    const N = nodes.get(id);
    return N ? !!N.auto : !!CR?.containers.get(id)?.auto;
  };
  const place = (): Ports => placePorts(visibleEdges, routed, CR, autoEnd, { prefer: model.direction === 'LR' || model.direction === 'RL' ? 'h' : 'v' });
  let ports = place();
  const onShape = (id: string, b: CenterBox, port: Port): Port => {
    const N = nodes.get(id);
    if (N?.media) return mediaPort(N, N.media, N.lines.length > 0, port);
    return N ? onOutline(shapeDef(N.st.shape), b, port) : port;
  };
  const routingOf = (x: EdgeItem): { routing: string; curve: number } => {
    // the code's curve (the edge's `curve`, `linkStyle … interpolate`, `flowchart.curve`) unless metadata routes it
    const { e, m: em, st } = x;
    const curve = e.data?.curve ?? model.linkStyles[String(e.index)]?.interpolate ?? model.linkStyles['default']?.interpolate ?? model.config?.curve;
    return { routing: str(em.routing) || curveRouting(curve) || routingDefault, curve: st.curve ?? 1 };
  };
  if (CR) routeAroundGroups(CR, { groups, nodes, H, visibleEdges, routed, autoEnd, onShape, routingOf, ports, replacePorts: () => (ports = place()) });

  // ---- draw
  const groupNodes: SceneNode[] = [];
  for (const G of [...groups.values()].sort((a, b) => a.depth - b.depth || a.g.order - b.g.order)) {
    if (groupHidden.has(G.g.id) || G.empty) continue;
    const { box, st, lines } = G;
    const title = lines.length && st.titleSize ? { lines, ...(G.rich ? { rich: G.rich } : {}) } : null;
    groupNodes.push(groupFrame({ id: G.g.id, box, st, title, href: itemLink(ctx, G.m.link), family: r.family, cls: 'group', dy: G.preset === 'lane' ? -6 : 0 }, ctx, r.kit));
  }
  const { edgeNodes, labelNodes, edgeGeom } = drawEdges(r, defs, visibleEdges, ports, routed, onShape, routingOf);
  const { nodeNodes, belowLabels } = drawNodes(r, nodes, hiddenNodes);

  // ---- finish: bounds, the title, the geometry
  const box = new Bounds(6);
  const grow = (b: CenterBox): void => box.grow(b);
  for (const [id, N] of nodes) if (!hiddenNodes.has(id)) grow(N);
  for (const G of groups.values()) if (!G.empty && !groupHidden.has(G.g.id)) grow(G.box);
  for (const eg of edgeGeom.values()) if (eg.label) grow(eg.label);
  for (const b of belowLabels) grow(b);
  const pad = env.pad;
  const bounds = box.rect(pad);
  // the diagram's `title`, above it as the sequence diagram draws its title
  const titleNodes = diagramTitle(bounds, model.title, ctx, r.family, pad);

  const geom: FlowGeometry = {
    type: 'flowchart',
    nodes: new Map(
      [...nodes].map(([id, N]) => {
        const b: BoxGeom & { auto?: boolean } = { x: N.x, y: N.y, w: N.w, h: N.h, stack: N.st.stack, hidden: hiddenNodes.has(id) };
        if (N.auto) b.auto = true;
        if (N.media) b.asset = assetBox(N, N.media);
        else if (N.st.shape && N.st.shape !== 'rect') b.shape = N.st.shape;
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
  const out: SubResult = {
    defs: defs.nodes(),
    body: [...titleNodes, ...groupNodes, ...edgeNodes, ...nodeNodes, ...labelNodes],
    bounds,
    geom,
    presetsUsed: {
      node: countBy([...nodes.values()].map((N) => N.preset || '(none)')),
      edge: countBy(edgeItems.map((x) => x.preset || '(none)')),
    },
  };
  // `accTitle` / `accDescr`: the SVG's <title> and <desc>, the component's accessible name
  const a11y = a11yOf(model);
  if (a11y) out.a11y = a11y;
  return out;
}

const metaOf = (meta: RenderEnv['meta'], k: 'nodes' | 'groups', id: string): ItemMeta => meta[k]?.[id] ?? EMPTY_META;

/** The phases' shared reader: the presets, the media kit (asked for only when a label needs it) and the label lines. */
function flowRun(model: FlowchartModel, env: RenderEnv): FlowRun {
  const { ctx } = env;
  const cfg = model.config ?? {};
  // rich labels, icons and images draw through the media kit, a lazy chunk (core/media/kit.ts): asked for only when a
  // diagram needs it; without it the render draws plain text and empty boxes, and runs again once it has loaded
  const { kit, given } = mediaKitOnce();
  /** A label needs runs: a markdown string, or a token of a registered pack or Font Awesome (the registry decides). */
  const needsRuns = (label: string, md: boolean | undefined): boolean =>
    !!md || (label.includes(':') && [...label.matchAll(ICON_TOKEN)].some((t) => ctx.icons.resolve(t[2]!, 'token') !== null));
  // label tokens of registered packs and Font Awesome become icon runs in the text's colour and size
  const icons = (k: MediaKit, color: string | undefined, size: number, line: number | null | undefined): IconResolver =>
    k.iconResolver(ctx, color, size, line == null ? { diagnostics: env.diagnostics } : { diagnostics: env.diagnostics, line });
  return {
    model, env, P: flowPresets(env.theme, env.meta), family: env.theme.font, wrapWidth: cfg.wrappingWidth ?? WRAP_WIDTH, kit, given,
    labelLines(label, md, fnt, color, line, maxW, mdW) {
      const k = needsRuns(label, md) ? kit() : null;
      const runs = k ? k.labelRuns(label, { markdown: !!md, icons: icons(k, color, fnt.size, line), iconSize: fnt.size }) : null;
      if (!k || !runs) {
        const lines = maxW ? wrap(label, maxW, fnt, ctx.measure) : label.split('\n');
        return { lines, w: textBlockWidth(lines, fnt, ctx.measure) };
      }
      const rich = k.wrapRuns(runs, md && cfg.markdownAutoWrap !== false ? maxW || mdW : maxW, fnt, ctx.measure);
      const out = { lines: rich.map(k.runsText), w: k.runsBlockWidth(rich, fnt, ctx.measure) };
      return k.richLines(rich) ? { ...out, rich } : out;
    },
  };
}

/** The nodes' styles and sizes: a shape's own theme style under the presets and classes, its label wrapped to fit; icon and image nodes as an asset with a caption. */
function measureNodes(r: FlowRun): Map<string, NodeItem> {
  const { model, env, P, family, wrapWidth } = r;
  const { ctx, theme: T, meta } = env;
  const nodes = new Map<string, NodeItem>();
  /** The last stroke the code gives (classes, then `style`): a monochrome icon's colour, as in Mermaid. */
  const codeColor = (layers: readonly (MermaidStyle | undefined)[]): string | undefined => {
    let c: string | undefined;
    for (const l of layers) if (l?.stroke) c = l.stroke;
    return c ? ctx.color(c) : undefined;
  };
  /** An icon or image node (§3.1, §3.2): its asset, its frame and the caption above or below. */
  const mediaNode = (n: FlowNode, nm: ItemMeta, preset: string, classes: readonly (MermaidStyle | undefined)[], line: number | null): NodeItem => {
    const d = n.data ?? {};
    const kind = d.img != null ? 'image' : 'icon';
    const st = mergeStyle(ctx, ...nodeStyleLayers(T, meta, P, kind, preset), ...classes, n.style, pickStyle(nm));
    st.shape = kind;
    const fontSize = st.fontSize ?? 14;
    const fnt = font(fontSize, st.fontWeight, st.fontFamily || family);
    // a resize in progress gives the asset's size in metadata (written to `h` / `w` when it ends)
    const src: MediaSource = { img: d.img, icon: d.icon, form: d.form, pos: d.pos, w: d.w, h: d.h, constraint: d.constraint, fit: str(nm['imgFit']) };
    // the caption wraps at the asset's width or Mermaid's wrapping width, whichever is wider
    const { box: M, caption: L, w, h } = mediaLayout(env, r.kit(), src, { w: metaNum(nm.w), h: metaNum(nm.h) }, fontSize, wrapWidth, codeColor([...classes, n.style]) ?? st.text, line,
      (cw) => (n.label ? r.labelLines(n.label, n.md, fnt, st.text, line, cw, cw) : { lines: [] as string[], w: 0 }));
    const N: NodeItem = { n, m: nm, st, preset, lines: L.lines, w, h, x: NaN, y: NaN, ...xy(nm), media: M };
    if ('rich' in L && L.rich) N.rich = L.rich;
    return N;
  };
  // `classDef default` styles every node, under its own classes (Mermaid's `default` class)
  const defaultClass = model.classDefs['default'];
  for (const n of model.nodes.values()) {
    const nm = metaOf(meta, 'nodes', n.id);
    const preset = nodePreset(n, meta, P);
    const pst = presetOf(P.node, preset);
    const classDefs = n.classes.filter((c) => !presetOf(P.node, c) && c !== 'default').map((c) => model.classDefs[c]);
    const line = firstLine(n.defLine, n.lines);
    if (n.data?.img != null || n.data?.icon) {
      nodes.set(n.id, mediaNode(n, nm, preset, [defaultClass, ...classDefs], Number.isFinite(line) ? line : null));
      continue;
    }
    // the shape first: each shape has its own default style in the theme (flowchart.nodeShapes.<shape>); names resolve
    // through the catalogue (a Mermaid name in metadata or a preset is the same shape)
    const shape = flowNodeShape(n, nm, pst, T.flowchart);
    const def = shapeDef(shape);
    const st = mergeStyle(ctx, ...nodeStyleLayers(T, meta, P, shape, preset), defaultClass, ...classDefs, n.style, pickStyle(nm));
    st.shape = shape;
    const fontSize = st.fontSize ?? 14, padX = st.padX ?? 0, padY = st.padY ?? 0;
    const fnt = font(fontSize, st.fontWeight, st.fontFamily || family);
    const fixedW = metaNum(nm.w);
    // word wrap: lines break to fit the shape's text box (in its own width, else the style's maxW, else 200)
    const wrapW = fixedW ?? st.maxW ?? Math.max(st.minW ?? 0, 200);
    const wrapAt = (ww: number): number => Math.max(20, (def.below ? ww : textBox(def, ww, ww).w) - padX * 2);
    // a markdown label wraps at the node's own width, else at Mermaid's wrapping width
    const L = r.labelLines(n.label, n.md, fnt, st.text, Number.isFinite(line) ? line : null, st.wrap ? wrapAt(wrapW) : 0, fixedW ? wrapAt(fixedW) : wrapWidth);
    const lines = L.lines;
    let w = Math.max(st.minW ?? 0, L.w + padX * 2);
    let h = Math.max(st.minH ?? 0, lines.length * fontSize * 1.3 + padY * 2);
    if (def.fit) ({ w, h } = def.fit(w, h));
    w = fixedW || w;
    // a wrapped label never overflows: the shape grows taller to fit its lines
    h = (st.wrap || n.md) && !def.below ? Math.max(metaNum(nm.h) ?? 0, h) : metaNum(nm.h) || h;
    const N: NodeItem = { n, m: nm, st, preset, lines, w, h, x: NaN, y: NaN, ...xy(nm) };
    if (L.rich) N.rich = L.rich;
    nodes.set(n.id, N);
  }
  return nodes;
}

/** The groups' styles and titles (inner first); their boxes come after the layout. */
function groupLooks(r: FlowRun, groupsSorted: readonly FlowGroup[]): Map<string, GroupLook> {
  const { model, env, P, family } = r;
  const { ctx, meta } = env;
  const looks = new Map<string, GroupLook>();
  for (const g of groupsSorted) {
    const gm = metaOf(meta, 'groups', g.id);
    const preset = groupPreset(g, meta, P);
    // classes on a subgraph (`class s1 c`) style its frame, as in Mermaid
    const classDefs = (g.classes ?? []).filter((c) => !presetOf(P.group, c)).map((c) => model.classDefs[c]);
    const st = mergeStyle(ctx, ...groupStyleLayers(env.theme, meta, P, preset), ...classDefs, g.style, pickStyle(gm));
    const tfont = font(st.titleSize ?? 14, st.titleWeight, st.fontFamily || family);
    const title = (g.label || '').trim() ? r.labelLines(g.label, g.md, tfont, st.titleColor, g.line, 0, r.wrapWidth) : null;
    looks.set(g.id, { m: gm, st, preset, lines: title?.lines ?? [], title, frame: handFrame(gm) });
  }
  return looks;
}

/**
 * Auto layout for the nodes without positions: subgraphs as nested containers (T07), or the earlier layout for a
 * flowchart without subgraphs and with `canvas.layout: "legacy"`. `visibleIn`: the groups holding a node not hidden by
 * a layer.
 */
function layoutFlow(r: FlowRun, nodes: ReadonlyMap<string, NodeItem>, looks: ReadonlyMap<string, GroupLook>, hiddenNodes: ReadonlySet<string>): { CR: CompoundResult | null; visibleIn: Set<string> } {
  const { model, env } = r;
  const compound = model.groups.size > 0 && env.meta.canvas.layout !== 'legacy';
  /** Groups holding a node (any depth), and those holding a node not hidden by a layer. */
  const holdsNode = new Set<string>(), visibleIn = new Set<string>();
  for (const n of model.nodes.values()) {
    const seen = new Set<string>();
    for (let gid = n.parent; gid && !seen.has(gid); gid = model.groups.get(gid)?.parent ?? null) {
      seen.add(gid);
      holdsNode.add(gid);
      if (!hiddenNodes.has(n.id)) visibleIn.add(gid);
    }
  }
  const missing = [...nodes.values()].filter((N) => Number.isNaN(N.x) || Number.isNaN(N.y));
  if (compound) return { CR: flowCompound(model, env.ctx, nodes, looks, holdsNode, hiddenNodes), visibleIn };
  if (missing.length) legacyLayout(model, env.ctx, nodes, missing);
  return { CR: null, visibleIn };
}

/** The earlier layered layout: nodes in nested groups by their group path, a link to a group to its first node; auto-placed nodes go below the hand-placed ones. */
function legacyLayout(model: FlowchartModel, ctx: RenderEnv['ctx'], nodes: ReadonlyMap<string, NodeItem>, missing: readonly NodeItem[]): void {
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

/**
 * The compound layout (T07): every subgraph holding a node is a container laid out in its own direction (Mermaid's
 * rule: a `direction` is honoured unless a link from outside reaches a node inside), hand-placed nodes and frames kept as
 * the mixed rules say (core/layout/compound.ts); an empty subgraph takes no space, as before.
 */
function flowCompound(model: FlowchartModel, ctx: RenderEnv['ctx'], nodes: ReadonlyMap<string, NodeItem>, looks: ReadonlyMap<string, GroupLook>, holdsNode: ReadonlySet<string>, hiddenNodes: ReadonlySet<string>): CompoundResult {
  const lineOf = (n: FlowNode): number | undefined => {
    const l = firstLine(n.defLine, n.lines);
    return Number.isFinite(l) ? l : undefined;
  };
  // a link to a node inside from outside crosses the border; a link to the subgraph itself does not (Mermaid)
  const crossed = crossedOf(model.edges, withinOf((id) => model.nodes.get(id)?.parent ?? model.groups.get(id)?.parent ?? null));
  const containers: CompoundContainer[] = [];
  for (const g of model.groups.values()) {
    if (!holdsNode.has(g.id)) continue;
    const { st, lines, title, frame, m: gm } = looks.get(g.id)!;
    const pad = st.pad ?? 0, padTop = st.padTop ?? pad;
    const c: CompoundContainer = { id: g.id, parent: g.parent && holdsNode.has(g.parent) ? g.parent : null, order: g.line, pad };
    if (g.dir && !crossed(g.id)) c.dir = g.dir;
    if (lines.length) c.title = { w: title?.w ?? 0, h: st.titleSize ? padTop : pad };
    containers.push(placedContainer(c, gm, frame));
  }
  const cn: CompoundNode[] = [...nodes.values()].map((N) => {
    const n = N.n;
    const c: CompoundNode = { id: n.id, w: N.w, h: N.h, parent: n.parent && holdsNode.has(n.parent) ? n.parent : null, order: lineOf(n) };
    if (!Number.isNaN(N.x) && !Number.isNaN(N.y)) c.fixed = { x: N.x, y: N.y };
    if (hiddenNodes.has(n.id)) c.hidden = true;
    return c;
  });
  // invisible links (`~~~`) place their ends too
  const ce = model.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, minlen: e.minlen }));
  const R = layoutCompound(
    { nodes: cn, containers, edges: ce },
    { dir: model.direction, rankSep: 70, nodeSep: 46, padding: 14, margin: 60, placedGap: 60, cache: ctx.layoutCache },
  );
  placeAuto(R, nodes);
  return R;
}

/** The group boxes, inner first: the compound layout's containers, a frame placed by hand, else the box around the visible children plus padding and the title band. */
function groupBoxes(groupsSorted: readonly FlowGroup[], looks: ReadonlyMap<string, GroupLook>, CR: CompoundResult | null, visibleIn: ReadonlySet<string>, nodes: ReadonlyMap<string, NodeItem>, H: FlowHidden, depth: (id: string) => number): Map<string, GroupItem> {
  const groups = new Map<string, GroupItem>();
  for (const g of groupsSorted) {
    const { m: gm, st, preset, lines, title, frame } = looks.get(g.id)!;
    const pad = st.pad ?? 0, padTop = st.padTop ?? pad;
    let box: GroupBox;
    const r = CR?.containers.get(g.id);
    if (r) box = { ...containerBox(r, !!frame), ...(frame ? {} : { empty: !visibleIn.has(g.id) }) };
    else if (frame) box = { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2, w: frame.w, h: frame.h, fixed: true };
    else {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of g.children) {
        const N = nodes.get(c);
        let b: CenterBox | null = null;
        if (N && !H.nodes.has(c)) b = N;
        else {
          const G = groups.get(c);
          if (G && !H.groups.has(c) && !G.empty) b = G.box;
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
      const titleW = lines.length ? (title?.w ?? 0) + 2 * pad : 0;
      let w = x1 - x0 + 2 * pad;
      const cx = (x0 + x1) / 2;
      w = Math.max(w, titleW);
      box = { x: cx, y: (y0 - titleH + y1 + pad) / 2, w, h: y1 - y0 + titleH + pad, empty };
    }
    const G: GroupItem = { g, m: gm, st, preset, lines, box, empty: !!box.empty, depth: depth(g.id) };
    if (title && 'rich' in title && title.rich) G.rich = title.rich;
    groups.set(g.id, G);
  }
  return groups;
}

/** The drawn edges (an invisible link `~~~` places its nodes and is not drawn): their styles, end boxes and whether the layers hide them. */
function flowEdges(r: FlowRun, nodes: ReadonlyMap<string, NodeItem>, groups: ReadonlyMap<string, GroupItem>, H: FlowHidden): EdgeItem[] {
  const { model, env, P } = r;
  const { ctx, theme: T, meta } = env;
  const edgeItems: EdgeItem[] = [];
  const boxOf = (id: string): CenterBox | undefined => {
    const N = nodes.get(id);
    if (N?.media) return N;
    if (N) return outerBox(N, N.st.stack);
    const G = groups.get(id);
    return G ? outerBox(G.box, G.st.stack) : undefined;
  };
  for (const e of model.edges) {
    if (e.line === 'invisible') continue;
    const a = boxOf(e.from), b = boxOf(e.to);
    if (!a || !b) continue;
    const em = edgeMeta(e, meta) ?? EMPTY_META;
    const preset = edgePreset(e, meta, P);
    const ls = model.linkStyles[String(e.index)] ?? model.linkStyles['default'];
    const lsMapped = ls ? { color: ls.stroke, width: ls.strokeWidth, dash: ls.dash, labelColor: ls.text } : null;
    const st = mergeStyle(ctx, ...edgeStyleLayers(T, meta, P, preset), lsMapped, pickStyle(em));
    const isHidden = H.nodes.has(e.from) || H.nodes.has(e.to) || H.groups.has(e.from) || H.groups.has(e.to) || H.edge.has(e.id);
    edgeItems.push({ e, m: em, st, preset, a, b, hidden: isHidden, points: metaPoints(em.points) });
  }
  return edgeItems;
}

/** What routing around subgraphs reads, and how it places the ports again (5.8, R1). */
interface FlowRoute {
  groups: ReadonlyMap<string, GroupItem>;
  nodes: ReadonlyMap<string, NodeItem>;
  H: FlowHidden;
  visibleEdges: readonly EdgeItem[];
  routed: Map<string, [number, number][]>;
  autoEnd: (id: string) => boolean;
  onShape: (id: string, b: CenterBox, port: Port) => Port;
  routingOf: (x: EdgeItem) => { routing: string; curve: number };
  ports: Ports;
  replacePorts(): Ports;
}

/**
 * T07.3 (render/graph-scene.ts routeAroundScopes): a line that leaves a subgraph was laid out between the subgraphs,
 * not between the nodes, so it also keeps off the other nodes near it and the titles of the subgraphs it leaves (one
 * laid out inside a scope keeps the layered engine's place).
 */
function routeAroundGroups(R: CompoundResult, c: FlowRoute): void {
  const { groups, nodes, H, autoEnd, onShape } = c;
  const frames: { id: string; r: Rect }[] = [];
  for (const [id, G] of groups) if (!G.empty && !H.groups.has(id)) frames.push({ id, r: rectOf(G.box) });
  if (!frames.length) return;
  const boxes: { id: string; r: Rect }[] = [];
  for (const [id, N] of nodes) if (!H.nodes.has(id)) boxes.push({ id, r: rectOf(N) });
  const parentOf = (id: string): string | null => (R.containers.has(id) ? id : R.parent.get(id) ?? null);
  routeAroundScopes(R, {
    todo: c.visibleEdges.filter((x) => !x.points.length && autoEnd(x.e.from) && autoEnd(x.e.to)),
    frames, boxes, near: (x) => parentOf(x.e.from) !== parentOf(x.e.to),
    more: (x, holders) => {
      const bands: Rect[] = [];
      for (const id of holders) {
        const G = groups.get(id);
        if (!G || G.empty || !G.lines.length || !G.st.titleSize || id === x.e.from || id === x.e.to) continue;
        const band = G.st.padTop ?? G.st.pad ?? 0;
        if (band > 0) bands.push({ x: G.box.x - G.box.w / 2, y: G.box.y - G.box.h / 2, w: G.box.w, h: band });
      }
      return bands;
    },
    ends: (x, pp) => [onShape(x.e.from, x.a, pp.a), onShape(x.e.to, x.b, pp.b)],
    path: c.routingOf, margins: [18, 32], ports: c.ports, replacePorts: c.replacePorts, routed: c.routed,
  });
}

/** The edges: each line from its ports moved onto the end shapes' outlines, its markers, animation and dashes, its label on a halo; and their geometry. */
function drawEdges(r: FlowRun, defs: Defs, visibleEdges: readonly EdgeItem[], ports: Ports, routed: ReadonlyMap<string, [number, number][]>, onShape: FlowRoute['onShape'], routingOf: FlowRoute['routingOf']): { edgeNodes: SceneNode[]; labelNodes: SceneNode[]; edgeGeom: Map<string, EdgeGeom> } {
  const { env, family } = r;
  const { ctx, opts } = env;
  const edgeNodes: SceneNode[] = [], labelNodes: SceneNode[] = [];
  const labelFont = (st: StyleProps): FontSpec => font(st.labelSize ?? 12, 400, st.fontFamily || family);
  const edgeGeom = new Map<string, EdgeGeom>();
  for (const x of visibleEdges) {
    const { e, m: em, st } = x;
    const pp = ports.get(e.id);
    if (!pp) continue;
    // the layout's ports sit on the sides of the boxes: each end moves onto its node's outline (T02.3)
    const p = { a: onShape(e.from, x.a, pp.a), b: onShape(e.to, x.b, pp.b) };
    const auto = routed.get(e.id);
    const path = edgePath(p.a, p.b, { ...routingOf(x), points: x.points.length ? x.points : auto });
    const endType = str(em.endArrow) || (e.end === 'arrow' ? st.arrow : e.end);
    const startType = str(em.startArrow) || (e.start === 'arrow' ? st.arrow : e.start);
    const width = st.width ?? 1;
    const mkE = defs.marker(endType, st.color, 9 + width * 1.5);
    const mkS = defs.marker(startType, st.color, 9 + width * 1.5);
    // `e1@{ animate: true }`: dashes flowing along the line in the DOM (CSS, dom/canvas.ts), a still dash in exports
    const anim = e.data?.animate || e.data?.animation ? (e.data.animation === 'slow' ? ' mmdx-flow mmdx-flow-slow' : ' mmdx-flow') : '';
    const dash = anim ? { 'stroke-dasharray': '9 5', 'stroke-linecap': 'round' as const } : dashAttrs(st.dash, width);
    edgeNodes.push(edgeStroke('edge', e.id, 'edge', e, { class: `line${anim}`, d: path.d, fill: 'none', stroke: st.color, 'stroke-width': width, 'stroke-opacity': st.strokeOpacity, ...dash, 'marker-end': urlRef(mkE), 'marker-start': urlRef(mkS) }));
    let labelBox: BoxGeom | null = null;
    if (e.label && !opts.hideLabels) {
      const lp = path.at(metaNum(em.labelAt) ?? 0.5);
      const lx = lp.x + (metaNum(em.labelDx) || 0), ly = lp.y + (metaNum(em.labelDy) || 0);
      const labelSize = st.labelSize ?? 12;
      const href = itemLink(ctx, em.link);
      const color = href ? LINK_COLOR : st.labelColor || st.color;
      // markdown and icon tokens as runs; a markdown label wraps at Mermaid's wrapping width
      const L = r.labelLines(e.label, e.md, labelFont(st), color, e.src, 0, r.wrapWidth);
      const lo = { size: labelSize, color, family: st.fontFamily || family, halo: env.paper, weight: st.fontWeight || 400, underline: !!href };
      labelNodes.push(edgeLabel('edge', e.id, L, lx, ly, lo, href, ctx, r.kit, e));
      labelBox = { x: lx, y: ly, w: L.w, h: L.lines.length * labelSize * 1.25 };
    }
    // a routed line has one handle in its middle, as a line without bend points (the route is not stored)
    edgeGeom.set(e.id, { a: p.a, b: p.b, label: labelBox, points: x.points, mids: auto && !x.points.length ? [path.at(0.5)] : path.mids, d: path.d });
  }
  return { edgeNodes, labelNodes, edgeGeom };
}

/** The visible nodes in code order: the shape and its label (under a small mark: `belowLabels`, which the bounds hold too), or an icon or image node's asset and caption. */
function drawNodes(r: FlowRun, nodes: ReadonlyMap<string, NodeItem>, hiddenNodes: ReadonlySet<string>): { nodeNodes: SceneNode[]; belowLabels: CenterBox[] } {
  const { env, family } = r;
  const { ctx } = env;
  const nodeNodes: SceneNode[] = [];
  const belowLabels: CenterBox[] = [];
  const lineOf = (N: NodeItem): number => firstLine(N.n.defLine, N.n.lines);
  for (const [id, N] of [...nodes].sort((a, b) => byLine(lineOf(a[1]), lineOf(b[1])))) {
    if (hiddenNodes.has(id)) continue;
    const { st } = N;
    const href = itemLink(ctx, N.m.link, N.n.link);
    // `click A "url" "tooltip"`: shown by browsers on hover (last, so the shape stays the group's first child)
    const tip: SceneNode[] = N.n.tooltip ? [tooltip(N.n.tooltip)] : [];
    if (N.media) {
      nodeNodes.push(itemGroup('node', id, 'node', [...mediaNodes(r, id, N, N.media, href), ...tip], linkAttr(href)));
      continue;
    }
    const fontSize = st.fontSize ?? 14, padX = st.padX ?? 0, padY = st.padY ?? 0;
    const def = shapeDef(st.shape);
    const blockH = N.lines.length * fontSize * 1.3;
    let align = st.align || 'center';
    let tx: number, ty: number;
    if (def.below) {
      // small marks keep their size: the label goes under them (none when it is only the id, as Mermaid shows none)
      align = 'center';
      tx = N.x;
      ty = N.y + N.h / 2 + 6 + blockH / 2;
      if (N.n.label !== N.n.id) belowLabels.push({ x: tx, y: ty, w: textBlockWidth(N.lines, font(fontSize, st.fontWeight, st.fontFamily || family), ctx.measure), h: blockH });
    } else {
      const tb = textBox(def, N.w, N.h);
      tx = align === 'left' ? N.x + tb.x + padX : align === 'right' ? N.x + tb.x + tb.w - padX : N.x + tb.x + tb.w / 2;
      ty = st.valign === 'top' ? N.y + tb.y + padY + blockH / 2 : st.valign === 'bottom' ? N.y + tb.y + tb.h - padY - blockH / 2 : N.y + tb.y + tb.h / 2;
    }
    const to = {
      size: fontSize,
      weight: st.fontWeight,
      color: href ? LINK_COLOR : st.text,
      family: st.fontFamily || family,
      lh: 1.3,
      anchor: align === 'left' ? ('start' as const) : align === 'right' ? ('end' as const) : ('middle' as const),
      underline: !!href,
    };
    const label = N.rich ? r.given()!.richText(N.rich, tx, ty, { ...to, measure: ctx.measure }) : [textBlock(N.lines, tx, ty, to)];
    const shown = !def.below || N.n.label !== N.n.id;
    nodeNodes.push(itemGroup('node', id, 'node', [...stackedShapeNodes(st.shape, N, st), ...(shown ? withLink(href, label) : []), ...tip], linkAttr(href)));
  }
  return { nodeNodes, belowLabels };
}

/** An icon or image node's scene: the frame, the asset in it, the caption; a transparent box makes the caption pickable too. */
function mediaNodes(r: FlowRun, id: string, N: NodeItem, M: MediaBox, href: ReturnType<typeof itemLink>): SceneNode[] {
  const { env, family } = r;
  const { st } = N;
  const line = firstLine(N.n.defLine, N.n.lines);
  const d = N.n.data ?? {};
  const out = mediaAssetNodes(env, r.kit(), N, M, { img: d.img, icon: d.icon }, st, { key: `node-${id}`, family, ...(Number.isFinite(line) ? { line } : {}) });
  if (!N.lines.length) return out;
  const fontSize = st.fontSize ?? 14;
  const cy = captionY(N, M);
  const to = { size: fontSize, weight: st.fontWeight, color: href ? LINK_COLOR : st.text, family: st.fontFamily || family, lh: 1.3, underline: !!href };
  out.push(...withLink(href, N.rich ? r.given()!.richText(N.rich, N.x, cy, { ...to, measure: env.ctx.measure }) : [textBlock(N.lines, N.x, cy, to)]));
  return out;
}

/** Where a shape's label goes, relative to its centre (the whole box unless the catalogue says otherwise). */
const textBox = (def: ShapeDef, w: number, h: number): Rect => def.textBox?.(w, h) ?? { x: -w / 2, y: -h / 2, w, h };

function xy(m: ItemMeta): Partial<Point> {
  const o: Partial<Point> = {};
  const x = metaNum(m.x), y = metaNum(m.y);
  if (x !== undefined) o.x = x;
  if (y !== undefined) o.y = y;
  return o;
}
