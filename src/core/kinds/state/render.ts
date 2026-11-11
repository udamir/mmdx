// State diagram renderer (T09): states, pseudo-states and composites laid out by the compound layout (core/layout/
// compound.ts: each composite and each of its concurrency regions in its own direction, Mermaid's rule for that
// direction), notes beside their state, transitions routed around the composites that hold neither end (the
// flowchart's pattern, T07.3). A state is a rounded box with its title (and, with description rows, a divider and the
// rows under it); start a filled dot, end a dot in a ring, choice a diamond, fork and join a bar across the flow; a
// composite a rounded frame with a title band and dashed lines between its regions; a note a folded-corner box with a
// dashed line to its state; a transition an arrow with its label on a halo. A state's icon (the leading label token,
// where `iconPos` puts it) and its metadata image draw as in every kind (render/decorate.ts), the image above the
// title. Labels with markdown or icon tokens and images draw through the media kit (a lazy chunk), as in the flowchart.
import { a11yOf, Bounds, depthOf, EMPTY_META, hiddenGroups, str } from '../../render/graph-kit.js';
import { diagramTitle } from '../../render/title.js';
import { ancestorsOf, layoutCompound, type CompoundContainer, type CompoundEdge, type CompoundNode, type CompoundResult } from '../../layout/compound.js';
import { polylineCrosses, routeAround } from '../../layout/route.js';
import type { ItemMeta } from '../../meta/types.js';
import type { Direction, MermaidStyle, StateGroup, StateModel, StateNode, StateNote } from '../../model.js';
import { el, title as tooltip } from '../../scene/build.js';
import type { SceneNode, TextRun } from '../../scene/types.js';
import type { StyleProps } from '../../style.js';
import { textBlockWidth, wrap } from '../../text/wrap.js';
import { ICON_TOKEN } from '../../icons/names.js';
import type { FontSpec } from '../../text/measure.js';
import type { CenterBox, Point, Rect } from '../../types.js';
import { onOutline } from '../../shapes/outline.js';
import { byShapeId, shapeDef } from '../../shapes/registry.js';
import { assignPorts, baseStyle, countBy, Defs, edgePath, font, haloLabel, hiddenOf, isSide, itemGroup, itemLink, LINK_COLOR, linkAttr, mergeStyle, metaNum, metaPoints, pickStyle, presetOf, sideToward, stackedShapeNodes, textBlock, urlRef, withLink, type PortLink, boxGrid, memoBy } from '../../render/common.js';
import { type RenderEnv, type SubResult } from '../../render/types.js';
import { DECO_GAP, decorate, decoratedSize, decoration, lazyKit, type Decoration } from '../../render/decorate.js';
import { assetBox, captionY, mediaAssetNodes, mediaLayout, mediaPort, type MediaBox } from '../../render/media-node.js';
import { metaMediaSource } from '../../media/meta-source.js';
import { stateEdgePreset, stateGroupPreset, stateNodePreset, stateNotePreset, statePresets } from './presets.js';
import type { BoxGeom, EdgeGeom, Port, StateGeometry } from '../../render/types.js';
import { fmt } from '../../scene/serialize.js';
import { minOf } from '../../geom.js';

export { statePresets, stateNodePreset, stateGroupPreset, stateEdgePreset, stateNotePreset, type StatePresets } from './presets.js';

/** A style whose border colour is `c` (filled marks take the border colour: the start dot, the fork bar). */
const withStroke = (st: StyleProps, c: string | undefined): StyleProps => {
  const out = { ...st };
  if (c !== undefined) out.stroke = c;
  return out;
};

/** Where labels wrap (Mermaid's default wrapping width). */
const WRAP = 200;
/** The layout's key of a note (a note id may equal a state id). */
const noteKey = (id: string): string => `\u0001note:${id}`;

interface Label {
  lines: string[];
  rich?: TextRun[][];
  w: number;
  h: number;
}

interface NodeItem extends CenterBox {
  n: StateNode;
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  /** The catalogue shape drawn. */
  shape: string;
  title: Label | null;
  rows: Label | null;
  /** The icon and the image beside the title (null: pseudo-states, bars and image states). */
  deco: Decoration | null;
  /** An image or icon state's asset and caption (the title, then the description rows). */
  media?: MediaBox;
  auto?: boolean;
}

interface GroupItem {
  g: StateGroup;
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  title: Label | null;
  box: CenterBox & { fixed?: boolean };
  depth: number;
}

interface NoteItem extends CenterBox {
  note: StateNote;
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  label: Label;
}

export function renderState(model: StateModel, env: RenderEnv): SubResult {
  const { ctx, theme: T, meta, opts } = env;
  const S = T.state;
  const P = statePresets(T, meta);
  const family = T.font;
  const defs = new Defs(ctx.idPrefix);
  const routingDefault = meta.canvas.routing || 'curved';
  const m = (coll: 'nodes' | 'groups' | 'edges' | 'notes', id: string): ItemMeta => meta[coll]?.[id] ?? EMPTY_META;

  // rich labels, icons and images draw through the media kit (a lazy chunk), asked for only when a label needs it
  const kit = lazyKit();
  const needsRuns = (label: string): boolean =>
    /[*_]/.test(label) || (label.includes(':') && [...label.matchAll(ICON_TOKEN)].some((t) => ctx.icons.resolve(t[2]!, 'token') !== null));
  /** A text's lines: plain, or runs (markdown, icon tokens) when it needs them; wrapped at `maxW`. */
  const labelOf = (text: string, fnt: FontSpec, color: string | undefined, line: number | null, maxW: number): Label => {
    const k = needsRuns(text) ? kit() : null;
    const runs = k ? k.labelRuns(text, { markdown: true, icons: k.iconResolver(ctx, color, fnt.size, line == null ? { diagnostics: env.diagnostics } : { diagnostics: env.diagnostics, line }), iconSize: fnt.size }) : null;
    if (k && runs) {
      const r = k.wrapRuns(runs, maxW, fnt, ctx.measure);
      const out: Label = { lines: r.map(k.runsText), w: k.runsBlockWidth(r, fnt, ctx.measure), h: 0 };
      if (k.richLines(r)) out.rich = r;
      out.h = out.lines.length * fnt.size * 1.3;
      return out;
    }
    const lines = text.split('\n').flatMap((l) => wrap(l, maxW, fnt, ctx.measure));
    return { lines, w: textBlockWidth(lines, fnt, ctx.measure), h: lines.length * fnt.size * 1.3 };
  };

  // ---- hidden by layers: a hidden composite hides its contents; a hidden state its transitions and notes
  const hidden = { node: hiddenOf(opts, 'node'), group: hiddenOf(opts, 'group'), edge: hiddenOf(opts, 'edge'), note: hiddenOf(opts, 'note') };
  const groupHidden = hiddenGroups(model.groups, hidden.group);
  const hiddenNodes = new Set<string>();
  for (const n of model.nodes.values()) if (hidden.node.has(n.id) || (n.parent && groupHidden.has(n.parent))) hiddenNodes.add(n.id);
  const endHidden = (id: string): boolean => hiddenNodes.has(id) || groupHidden.has(id);

  // ---- the direction each composite is laid out in (Mermaid: its own `direction`, top to bottom without one, unless
  // a transition from outside reaches a state inside: then its parent's)
  const parentOf = (id: string): string | null => model.nodes.get(id)?.parent ?? model.groups.get(id)?.parent ?? null;
  const within = (id: string, gid: string): boolean => {
    const seen = new Set<string>();
    for (let p: string | null = id; p && !seen.has(p); p = parentOf(p)) {
      if (p === gid) return true;
      seen.add(p);
    }
    return false;
  };
  const crossed = (gid: string): boolean => model.edges.some((e) => e.from !== gid && e.to !== gid && within(e.from, gid) !== within(e.to, gid));
  const ownDir = new Map<string, Direction | undefined>();
  for (const g of model.groups.values()) ownDir.set(g.id, crossed(g.id) ? undefined : g.dir ?? 'TB');
  const dirMemo = new Map<string | null, Direction>();
  const dirIn = (scope: string | null): Direction => {
    if (scope === null) return model.direction;
    const known = dirMemo.get(scope);
    if (known) return known;
    let d: Direction = model.direction;
    const chain: string[] = [];
    for (let s: string | null = scope; s !== null && chain.length <= model.groups.size; s = model.groups.get(s)?.parent ?? null) chain.push(s);
    for (let k = chain.length - 1; k >= 0; k--) d = ownDir.get(chain[k]!) ?? d;
    dirMemo.set(scope, d);
    return d;
  };
  const across = (d: Direction): boolean => d === 'LR' || d === 'RL';

  // ---- composites: order, colours, styles and titles (their boxes come from the layout)
  const groupOrder = [...model.groups.values()].sort((a, b) => a.order - b.order).map((g) => g.id);
  const palette = meta.canvas.composites === 'palette' ? Object.keys(S.compositeColors).sort((a, b) => Number(a) - Number(b)).map((k) => S.compositeColors[k]!) : [];
  const depth = depthOf(model.groups);
  const classStyles = (classes: readonly string[], presetsOf: Record<string, StyleProps>): (MermaidStyle | undefined)[] =>
    classes.filter((c) => !presetOf(presetsOf, c) && c !== 'default').map((c) => model.classDefs[c]);
  const groups = new Map<string, GroupItem>();
  for (const g of model.groups.values()) {
    const gm = m('groups', g.id);
    const preset = stateGroupPreset(g, meta, P);
    const colour = palette.length ? palette[groupOrder.indexOf(g.id) % palette.length] : undefined;
    const st = mergeStyle(ctx, S.composite, colour, baseStyle(meta, 'group'), presetOf(P.group, preset), ...classStyles(g.classes, P.group), g.style, pickStyle(gm));
    const tfont = font(st.titleSize ?? 14, st.titleWeight, st.fontFamily || family);
    const title = g.label.trim() && (st.titleSize ?? 14) > 0 ? labelOf(g.label, tfont, st.titleColor, g.line, 0) : null;
    groups.set(g.id, { g, m: gm, st, preset, title, box: { x: NaN, y: NaN, w: 0, h: 0 }, depth: depth(g.id) });
  }

  // ---- states: styles and sizes
  const shapeStyles = byShapeId(S.nodeShapes);
  const defaultClass = model.classDefs['default'];
  const nodes = new Map<string, NodeItem>();
  for (const n of model.nodes.values()) {
    const nm = m('nodes', n.id);
    const preset = stateNodePreset(n, meta, P);
    const pst = presetOf(P.node, preset);
    const line = n.defLine ?? minOf(n.lines);
    const xy = { x: metaNum(nm.x) ?? NaN, y: metaNum(nm.y) ?? NaN };
    if (n.kind !== 'state') {
      // pseudo-states and bars: their own look, sizes from the theme, across the flow for bars
      const base = n.kind === 'start' ? S.start : n.kind === 'end' ? S.end : n.kind === 'choice' ? S.choice : S.fork;
      const st = mergeStyle(ctx, base, baseStyle(meta, 'node'), pst, ...classStyles(n.classes, P.node), n.style, pickStyle(nm));
      let w: number, h: number, shape: string, look: StyleProps;
      if (n.kind === 'fork' || n.kind === 'join') {
        const long = metaNum(nm.w) ?? st.w ?? 70, thick = st.h ?? 7;
        [w, h] = across(dirIn(n.parent)) ? [thick, long] : [long, thick];
        shape = 'fork';
        look = withStroke(st, st.fill);
      } else if (n.kind === 'choice') {
        w = h = st.w ?? 28;
        shape = 'choice';
        look = st;
      } else if (n.kind === 'start') {
        w = h = st.w ?? 14;
        shape = 'sm-circ';
        look = withStroke(st, st.fill);
      } else {
        w = h = st.w ?? 16;
        shape = 'fr-circ';
        look = st;
      }
      nodes.set(n.id, { n, m: nm, st: look, preset, shape, title: null, rows: null, deco: null, w, h, ...xy });
      continue;
    }
    // an image or icon state (metadata `img` or `icon`, Mermaid having no syntax for them): the picture or the icon is the
    // state, captioned above or below, sized and fitted by the flowchart's image node keys (`w`, `h`, `constraint`,
    // `form`, `pos`, `imgFit`)
    const src = metaMediaSource(nm);
    if (src) {
      const kind = src.img != null ? 'image' : 'icon';
      const st = mergeStyle(ctx, S.node, shapeStyles?.[kind], baseStyle(meta, 'node'), pst, defaultClass, ...classStyles(n.classes, P.node), n.style, pickStyle(nm));
      st.shape = kind;
      const fs = st.fontSize ?? 14;
      const fnt = font(fs, st.fontWeight, st.fontFamily || family);
      const text = [n.label, ...n.descriptions].join('\n');
      const color = n.style?.stroke ? ctx.color(n.style.stroke) : st.text;
      const { box, caption, w, h } = mediaLayout(env, kit(), src, {}, fs, WRAP, color, Number.isFinite(line) ? line : null, (cw) => labelOf(text, fnt, st.text, line, cw));
      nodes.set(n.id, { n, m: nm, st, preset, shape: kind, title: caption, rows: null, deco: null, media: box, w, h, ...xy });
      continue;
    }
    const def = shapeDef(str(nm.shape) || pst?.shape || S.node.shape || 'rect');
    const shape = def.id;
    const st = mergeStyle(ctx, S.node, shapeStyles?.[shape], baseStyle(meta, 'node'), pst, defaultClass, ...classStyles(n.classes, P.node), n.style, pickStyle(nm));
    st.shape = shape;
    const fs = st.fontSize ?? 14, padX = st.padX ?? 12, padY = st.padY ?? 8;
    const maxW = Math.max(40, (metaNum(nm.w) ?? st.maxW ?? WRAP) - 2 * padX);
    // the title's icon and the image: the title block (the description rows go under it)
    const deco = decoration(ctx, kit, { label: n.label, meta: nm, fontSize: fs, color: st.text });
    const beside = deco.icon && deco.pos === 'l' ? deco.icon.size + DECO_GAP : 0;
    const title = labelOf(deco.label, font(fs, n.descriptions.length ? 600 : st.fontWeight, st.fontFamily || family), deco.inlineColor ?? st.text, line, Math.max(40, maxW - beside));
    const rows = n.descriptions.length ? labelOf(n.descriptions.join('\n'), font(Math.max(8, fs - 1), st.fontWeight, st.fontFamily || family), st.text, line, maxW) : null;
    const block = decoratedSize(deco, title);
    const cw = Math.max(block.w, rows?.w ?? 0);
    const ch = block.h + (rows ? rows.h + padY + 1 : 0);
    let w = cw + 2 * padX, h = ch + 2 * padY;
    if (def.fit && !rows) ({ w, h } = def.fit(w, h));
    w = Math.max(st.minW ?? 0, metaNum(nm.w) ?? w);
    h = Math.max(st.minH ?? 0, metaNum(nm.h) ?? h);
    nodes.set(n.id, { n, m: nm, st, preset, shape, title, rows, deco, w, h, ...xy });
  }

  // ---- notes: styles and sizes (beside their state)
  const notes = new Map<string, NoteItem>();
  for (const note of model.notes) {
    if (!nodes.has(note.target) && !groups.has(note.target)) continue;
    const nm = m('notes', note.id);
    const preset = stateNotePreset(note, meta);
    const st = mergeStyle(ctx, S.note, baseStyle(meta, 'note'), presetOf(P.note, preset), pickStyle(nm));
    st.shape = 'note';
    const fs = st.fontSize ?? 13, padX = st.padX ?? 10, padY = st.padY ?? 8;
    const label = labelOf(note.text, font(fs, st.fontWeight, st.fontFamily || family), st.text, note.line, WRAP);
    notes.set(note.id, { note, m: nm, st, preset, label, w: Math.max(st.minW ?? 0, label.w + 2 * padX + 8), h: Math.max(st.minH ?? 0, label.h + 2 * padY), x: NaN, y: NaN });
  }

  // ---- layout
  const CR = stateLayout(model, ctx, groups, nodes, notes, ownDir, hiddenNodes);
  for (const N of nodes.values()) {
    if (!CR.auto.has(N.n.id)) continue;
    const p = CR.nodes.get(N.n.id)!;
    N.x = p.x;
    N.y = p.y;
    N.auto = true;
  }
  for (const it of notes.values()) {
    const p = CR.nodes.get(noteKey(it.note.id));
    if (p) {
      it.x = p.x;
      it.y = p.y;
    }
  }
  for (const G of groups.values()) {
    const r = CR.containers.get(G.g.id);
    if (r) G.box = { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h, ...(G.m.w != null && G.m.h != null ? { fixed: true } : {}) };
  }
  // a note of a state placed by hand sits beside it (the layout places notes beside auto-placed states only)
  for (const it of notes.values()) {
    const t = nodes.get(it.note.target), G = groups.get(it.note.target);
    const placed = t ? !t.auto : G ? !CR.containers.get(it.note.target)?.auto : false;
    const tb: CenterBox | undefined = t ?? G?.box;
    if ((!placed && Number.isFinite(it.x)) || !tb || !Number.isFinite(tb.x)) continue;
    const dx = (tb.w + it.w) / 2 + 24;
    it.x = tb.x + (it.note.side === 'left' ? -dx : dx);
    it.y = tb.y;
  }

  // ---- transitions
  const boxOf = (id: string): CenterBox | undefined => nodes.get(id) ?? groups.get(id)?.box;
  const edgeItems: EdgeItem[] = [];
  for (const e of model.edges) {
    const a = boxOf(e.from), b = boxOf(e.to);
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
    const em = m('edges', e.id);
    const preset = stateEdgePreset(e, meta);
    const st = mergeStyle(ctx, S.transition, baseStyle(meta, 'edge'), presetOf(P.edge, preset), pickStyle(em));
    edgeItems.push({ e, m: em, st, preset, a, b, hidden: endHidden(e.from) || endHidden(e.to) || hidden.edge.has(e.id), points: metaPoints(em.points) });
  }
  const visibleEdges = edgeItems.filter((x) => !x.hidden);
  const routed = new Map<string, [number, number][]>();
  const bendsOf = (x: EdgeItem): [number, number][] => (x.points.length ? x.points : routed.get(x.e.id) ?? x.points);
  const autoEnd = (id: string): boolean => (nodes.get(id) ? !!nodes.get(id)!.auto : !!CR.containers.get(id)?.auto);
  const placePorts = (): ReturnType<typeof assignPorts> => assignPorts(
    visibleEdges.filter((x) => x.e.from !== x.e.to).map((x) => {
      const pts = bendsOf(x);
      const p0 = pts[0], pn = pts[pts.length - 1];
      const link: PortLink = {
        id: x.e.id, a: x.a, b: x.b, aKey: x.e.from, bKey: x.e.to,
        fromSide: (isSide(x.m.fromSide) ? x.m.fromSide : undefined) || (p0 ? sideToward(x.a, { x: p0[0], y: p0[1] }) : undefined),
        toSide: (isSide(x.m.toSide) ? x.m.toSide : undefined) || (pn ? sideToward(x.b, { x: pn[0], y: pn[1] }) : undefined),
        fromAt: metaNum(x.m.fromAt), toAt: metaNum(x.m.toAt),
      };
      const r = autoEnd(x.e.from) && autoEnd(x.e.to) ? CR.edges.get(x.e.id) : undefined;
      if (r) link.prefer = across(r.dir) ? 'h' : 'v';
      return link;
    }),
    { prefer: across(model.direction) ? 'h' : 'v' },
  );
  let ports = placePorts();
  const onShape = (id: string, b: CenterBox, port: Port): Port => {
    const N = nodes.get(id);
    if (N?.media) return mediaPort(b, N.media, !!N.title?.lines.length, port);
    return N ? onOutline(shapeDef(N.shape), b, port) : port;
  };
  const routingOf = (x: EdgeItem): { routing: string; curve: number } => ({ routing: str(x.m.routing) || routingDefault, curve: x.st.curve ?? 1 });
  routeStateEdges(CR, {
    groups, groupHidden, nodes, hiddenNodes, notes, visibleEdges, routed, within, onShape, routingOf, autoEnd, ports,
    replacePorts: () => (ports = placePorts()),
  });

  // ---- draw
  const { groupNodes, edgeNodes, labelNodes, edgeGeom, nodeNodes, noteNodes, noteLines } = drawState({
    model, env, family, defs, kit, labelOf, nodes, groups, notes, hidden, groupHidden, hiddenNodes, endHidden, boxOf, CR, visibleEdges, routed, ports, onShape, routingOf,
  });

  // ---- bounds
  const box = new Bounds(6);
  const grow = (b: CenterBox): void => box.grow(b);
  for (const [id, N] of nodes) if (!hiddenNodes.has(id)) grow(N);
  for (const G of groups.values()) if (!groupHidden.has(G.g.id)) grow(G.box);
  for (const it of notes.values()) if (!hidden.note.has(it.note.id) && !endHidden(it.note.target)) grow(it);
  for (const eg of edgeGeom.values()) {
    if (eg.label) grow(eg.label);
    for (const [px, py] of eg.points) grow({ x: px, y: py, w: 0, h: 0 });
  }
  for (const x of visibleEdges) if (x.e.from === x.e.to) grow({ x: x.a.x + x.a.w / 2 + 30, y: x.a.y, w: 8, h: 40 });
  const pad = env.pad;
  const bounds: Rect = box.rect(pad);
  // the frontmatter's `title`, above the diagram
  const titleNodes = diagramTitle(bounds, model.title, ctx, family, pad);

  const geom: StateGeometry = {
    type: 'state',
    nodes: new Map([...nodes].map(([id, N]) => {
      const b: BoxGeom & { auto?: boolean } = { x: N.x, y: N.y, w: N.w, h: N.h, stack: N.st.stack, hidden: hiddenNodes.has(id) };
      if (N.auto) b.auto = true;
      if (N.media) b.asset = assetBox(N, N.media);
      else if (N.shape !== 'rect') b.shape = N.shape;
      return [id, b];
    })),
    groups: new Map([...groups].map(([id, G]) => [id, { x: G.box.x, y: G.box.y, w: G.box.w, h: G.box.h, stack: G.st.stack, fixed: !!G.box.fixed, hidden: groupHidden.has(id) }])),
    edges: edgeGeom,
    notes: new Map([...notes].map(([id, it]) => [id, { x: it.x, y: it.y, w: it.w, h: it.h, shape: 'note', hidden: hidden.note.has(id) || endHidden(it.note.target) }])),
  };
  const out: SubResult = {
    defs: defs.nodes(),
    body: [...titleNodes, ...groupNodes, ...noteLines, ...edgeNodes, ...nodeNodes, ...noteNodes, ...labelNodes],
    bounds,
    geom,
    presetsUsed: {
      node: countBy([...nodes.values()].filter((N) => N.n.kind === 'state').map((N) => N.preset || '(none)')),
      group: countBy([...groups.values()].map((G) => G.preset || '(none)')),
      edge: countBy(edgeItems.map((x) => x.preset || '(none)')),
      note: countBy([...notes.values()].map((x) => x.preset || '(none)')),
    },
  };
  const a11y = a11yOf(model);
  if (a11y) out.a11y = a11y;
  return out;
}


interface EdgeItem {
  e: StateModel['edges'][number];
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  a: CenterBox;
  b: CenterBox;
  hidden: boolean;
  points: [number, number][];
}

/** The compound layout's input: states and notes as nodes, composites as containers, transitions as edges. */
function stateLayout(model: StateModel, ctx: RenderEnv['ctx'], groups: ReadonlyMap<string, GroupItem>, nodes: ReadonlyMap<string, NodeItem>, notes: ReadonlyMap<string, NoteItem>, ownDir: ReadonlyMap<string, Direction | undefined>, hiddenNodes: ReadonlySet<string>): CompoundResult {
  const containers: CompoundContainer[] = [];
  for (const G of groups.values()) {
    const { g, st, title, m: gm } = G;
    const pad = st.pad ?? 14, padTop = st.padTop ?? pad;
    const c: CompoundContainer = { id: g.id, parent: g.parent && groups.has(g.parent) ? g.parent : null, region: g.region, order: g.line, pad, regions: g.regions };
    const d = ownDir.get(g.id);
    if (d) c.dir = d;
    c.title = { w: title?.w ?? 0, h: title ? padTop : pad };
    const fx = metaNum(gm.x), fy = metaNum(gm.y), fw = metaNum(gm.w), fh = metaNum(gm.h);
    if (fx !== undefined && fy !== undefined && fw && fh) c.fixed = { x: fx, y: fy, w: fw, h: fh };
    else if (fx !== undefined && fy !== undefined) c.at = { x: fx, y: fy };
    containers.push(c);
  }
  const cn: CompoundNode[] = [];
  for (const N of nodes.values()) {
    const n = N.n;
    const c: CompoundNode = { id: n.id, w: N.w, h: N.h, parent: n.parent && groups.has(n.parent) ? n.parent : null, region: n.region, order: n.defLine ?? minOf(n.lines) };
    if (Number.isFinite(N.x) && Number.isFinite(N.y)) c.fixed = { x: N.x, y: N.y };
    if (hiddenNodes.has(n.id)) c.hidden = true;
    cn.push(c);
  }
  for (const it of notes.values()) {
    const t = model.nodes.get(it.note.target) ?? model.groups.get(it.note.target);
    if (!t) continue;
    cn.push({ id: noteKey(it.note.id), w: it.w, h: it.h, parent: t.parent && groups.has(t.parent) ? t.parent : null, region: t.region, order: it.note.line, beside: { of: it.note.target, side: it.note.side } });
  }
  const ce: CompoundEdge[] = model.edges.map((e) => ({ id: e.id, from: e.from, to: e.to }));
  return layoutCompound({ nodes: cn, containers, edges: ce }, { dir: model.direction, rankSep: 56, nodeSep: 40, padding: 14, margin: 60, placedGap: 60, besideGap: 24, cache: ctx.layoutCache });
}

type Ports = ReturnType<typeof assignPorts>;

/** What routing around composites reads, and how it places the ports again (5.8, R1). */
interface StateRoute {
  groups: ReadonlyMap<string, GroupItem>;
  groupHidden: ReadonlySet<string>;
  nodes: ReadonlyMap<string, NodeItem>;
  hiddenNodes: ReadonlySet<string>;
  notes: ReadonlyMap<string, NoteItem>;
  visibleEdges: readonly EdgeItem[];
  routed: Map<string, [number, number][]>;
  within: (id: string, gid: string) => boolean;
  onShape: (id: string, b: CenterBox, port: Port) => Port;
  routingOf: (x: EdgeItem) => { routing: string; curve: number };
  autoEnd: (id: string) => boolean;
  ports: Ports;
  /** Places the ports again (facing the new bend points) and returns them. */
  replacePorts(): Ports;
}

/**
 * A transition between auto-placed ends must not cross a composite that holds neither end (T07.3, as the
 * flowchart): through the points the layout kept free for it, else around the composites in the way; the ports are
 * placed again facing the first and last bend point. Transitions with bend points of their own are left alone.
 */
function routeStateEdges(R: CompoundResult, c: StateRoute): void {
  const { groups, groupHidden, nodes, hiddenNodes, notes, visibleEdges, routed, within, onShape, routingOf, autoEnd } = c;
  let ports = c.ports;
  const frames: { id: string; r: Rect }[] = [];
  for (const [id, G] of groups) if (!groupHidden.has(id) && Number.isFinite(G.box.x)) frames.push({ id, r: { x: G.box.x - G.box.w / 2, y: G.box.y - G.box.h / 2, w: G.box.w, h: G.box.h } });
  // states and notes too: transitions in a cycle (a back edge) would otherwise cut through the states between
  const boxes: { id: string; r: Rect }[] = [];
  for (const [id, N] of nodes) if (!hiddenNodes.has(id) && Number.isFinite(N.x)) boxes.push({ id, r: { x: N.x - N.w / 2, y: N.y - N.h / 2, w: N.w, h: N.h } });
  for (const it of notes.values()) if (Number.isFinite(it.x)) boxes.push({ id: it.note.target, r: { x: it.x - it.w / 2, y: it.y - it.h / 2, w: it.w, h: it.h } });
  if (!frames.length && !boxes.length) return;
  const holders = (id: string): string[] => (R.containers.has(id) ? [id, ...ancestorsOf(R.parent, id)] : ancestorsOf(R.parent, id));
  const drawn = (x: EdgeItem, pts: readonly (readonly [number, number])[]): Point[] | null => {
    const pp = ports.get(x.e.id);
    if (!pp) return null;
    const path = edgePath(onShape(x.e.from, x.a, pp.a), onShape(x.e.to, x.b, pp.b), { ...routingOf(x), points: pts });
    return Array.from({ length: 41 }, (_, i) => path.at(i / 40));
  };
  const straight = memoBy((x: EdgeItem) => drawn(x, [])); // sampled once for both passes (P7)
  const ends = (x: EdgeItem): [Point, Point] | null => {
    const pp = ports.get(x.e.id);
    return pp ? [onShape(x.e.from, x.a, pp.a), onShape(x.e.to, x.b, pp.b)] : null;
  };
  const asPairs = (pts: readonly Point[]): [number, number][] => pts.map((q) => [q.x, q.y]);
  const todo = visibleEdges.filter((x) => x.e.from !== x.e.to && !x.points.length && autoEnd(x.e.from) && autoEnd(x.e.to));
  const obstacles = new Map<EdgeItem, Rect[]>();
  for (const x of todo) {
    const skip = new Set([...holders(x.e.from), ...holders(x.e.to)]);
    const obs = frames.filter((f) => !skip.has(f.id)).map((f) => f.r);
    // the states near the line, other than its ends and what an end composite holds
    const line = straight(x);
    if (line) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of line) {
        x0 = Math.min(x0, q.x);
        y0 = Math.min(y0, q.y);
        x1 = Math.max(x1, q.x);
        y1 = Math.max(y1, q.y);
      }
      const near = { x: x0 - 60, y: y0 - 60, w: x1 - x0 + 120, h: y1 - y0 + 120 };
      const inEnd = (id: string): boolean => (groups.has(x.e.from) && within(id, x.e.from)) || (groups.has(x.e.to) && within(id, x.e.to));
      for (const b of boxes)
        if (b.id !== x.e.from && b.id !== x.e.to && !inEnd(b.id) && b.r.x < near.x + near.w && b.r.x + b.r.w > near.x && b.r.y < near.y + near.h && b.r.y + b.r.h > near.y) obs.push(b.r);
    }
    obstacles.set(x, obs);
  }
  for (const x of todo) {
    const obs = obstacles.get(x)!;
    const line = obs.length ? straight(x) : null;
    if (!line || !polylineCrosses(line, obs)) continue;
    const hint = R.edges.get(x.e.id)?.points ?? [];
    const viaHint = hint.length ? drawn(x, asPairs(hint)) : null;
    if (viaHint && !polylineCrosses(viaHint, obs)) {
      routed.set(x.e.id, asPairs(hint));
      continue;
    }
    const ab = ends(x);
    const around = ab && routeAround(ab[0], ab[1], obs, 14);
    if (around) routed.set(x.e.id, asPairs(around));
  }
  if (!routed.size) return;
  ports = c.replacePorts();
  for (const x of todo) {
    if (!routed.has(x.e.id)) continue;
    const obs = obstacles.get(x)!;
    const line = drawn(x, routed.get(x.e.id)!);
    if (!line || !polylineCrosses(line, obs)) continue;
    const ab = ends(x);
    const around = ab && routeAround(ab[0], ab[1], obs, 24);
    if (around) routed.set(x.e.id, asPairs(around));
  }
}

/** What the draw phase reads: the measured, placed and routed items (5.8, R1). */
interface StateRun {
  model: StateModel;
  env: RenderEnv;
  family: string;
  defs: Defs;
  kit: ReturnType<typeof lazyKit>;
  labelOf: (text: string, fnt: FontSpec, color: string | undefined, line: number | null, maxW: number) => Label;
  nodes: ReadonlyMap<string, NodeItem>;
  groups: ReadonlyMap<string, GroupItem>;
  notes: ReadonlyMap<string, NoteItem>;
  hidden: { note: ReadonlySet<string> };
  groupHidden: ReadonlySet<string>;
  hiddenNodes: ReadonlySet<string>;
  endHidden: (id: string) => boolean;
  boxOf: (id: string) => CenterBox | undefined;
  CR: CompoundResult;
  visibleEdges: readonly EdgeItem[];
  routed: ReadonlyMap<string, [number, number][]>;
  ports: Ports;
  onShape: (id: string, b: CenterBox, port: Port) => Port;
  routingOf: (x: EdgeItem) => { routing: string; curve: number };
}

/** Draws the composites (outer first) and their region lines, the transitions and their labels, the states and the notes. */
function drawState(r: StateRun): { groupNodes: SceneNode[]; edgeNodes: SceneNode[]; labelNodes: SceneNode[]; edgeGeom: Map<string, EdgeGeom>; nodeNodes: SceneNode[]; noteNodes: SceneNode[]; noteLines: SceneNode[] } {
  const { env, family, defs, kit, labelOf, nodes, groups, notes, hidden, groupHidden, hiddenNodes, endHidden, boxOf, CR, visibleEdges, routed, ports, onShape, routingOf } = r;
  const { ctx, opts } = env;
  // ---- draw: composites (outer first), their region lines
  const groupNodes: SceneNode[] = [];
  for (const G of [...groups.values()].sort((a, b) => a.depth - b.depth || a.g.order - b.g.order)) {
    if (groupHidden.has(G.g.id) || !Number.isFinite(G.box.x)) continue;
    const { box, st } = G;
    const href = itemLink(ctx, G.m.link, G.g.link);
    const parts = stackedShapeNodes('rect', box, st);
    const band = st.padTop ?? st.pad ?? 0;
    const x0 = box.x - box.w / 2, y0 = box.y - box.h / 2;
    if (G.title) {
      const pad = st.pad ?? 0;
      const ty = y0 + band / 2;
      const left = st.titleAlign === 'left';
      const to = { size: st.titleSize ?? 14, weight: st.titleWeight, color: href ? LINK_COLOR : st.titleColor, family: st.fontFamily || family, anchor: left ? ('start' as const) : ('middle' as const), lh: 1.25, underline: !!href };
      const tx = left ? x0 + pad : box.x;
      parts.push(...withLink(href, G.title.rich && kit() ? kit()!.richText(G.title.rich, tx, ty, { ...to, measure: ctx.measure }) : [textBlock(G.title.lines, tx, ty, to)]));
      // the title band's lower edge
      parts.push(el('path', { class: 'band', d: `M${fmt(x0)},${fmt(y0 + band)} L${fmt(x0 + box.w)},${fmt(y0 + band)}`, fill: 'none', stroke: st.stroke, 'stroke-width': Math.max(0.5, (st.strokeWidth ?? 1) * 0.75), 'stroke-opacity': 0.6 }));
    }
    // concurrency regions: dashed separators
    for (const L of CR.regionLines.get(G.g.id) ?? [])
      parts.push(el('path', { class: 'region', d: `M${fmt(L.x1)},${fmt(L.y1)} L${fmt(L.x2)},${fmt(L.y2)}`, fill: 'none', stroke: st.stroke, 'stroke-width': st.strokeWidth ?? 1, 'stroke-dasharray': '6 4' }));
    if (G.g.tooltip) parts.push(tooltip(G.g.tooltip));
    groupNodes.push(itemGroup('group', G.g.id, 'group st-composite', parts, linkAttr(href)));
  }

  // ---- transitions
  const edgeNodes: SceneNode[] = [], labelNodes: SceneNode[] = [];
  const edgeGeom = new Map<string, EdgeGeom>();
  // the visible states and the labels placed so far, for a label's place along its line
  const taken = boxGrid();
  for (const [nid, N] of nodes) if (!hiddenNodes.has(nid)) taken.add(N);
  for (const x of visibleEdges) {
    const { e, m: em, st } = x;
    let pa: Port, pb: Port, pts: readonly (readonly [number, number])[];
    if (e.from === e.to) {
      // a transition to itself: a loop on the right side
      const b = x.a;
      pa = { x: b.x + b.w / 2, y: b.y - Math.min(10, b.h / 4), n: { x: 1, y: 0 } };
      pb = { x: b.x + b.w / 2, y: b.y + Math.min(10, b.h / 4), n: { x: 1, y: 0 } };
      pts = x.points.length ? x.points : [[b.x + b.w / 2 + 30, b.y - 18], [b.x + b.w / 2 + 30, b.y + 18]];
    } else {
      const pp = ports.get(e.id);
      if (!pp) continue;
      pa = onShape(e.from, x.a, pp.a);
      pb = onShape(e.to, x.b, pp.b);
      pts = x.points.length ? x.points : routed.get(e.id) ?? [];
    }
    const path = edgePath(pa, pb, { ...routingOf(x), points: pts });
    const width = st.width ?? 1.3;
    const endType = str(em.endArrow) || st.arrow || 'filled';
    const startType = str(em.startArrow) || 'none';
    const mkE = defs.marker(endType, st.color, 9 + width * 1.5);
    const mkS = defs.marker(startType, st.color, 9 + width * 1.5);
    edgeNodes.push(itemGroup('edge', e.id, 'edge st-transition', [
      el('path', { class: 'hit', d: path.d, fill: 'none', stroke: 'transparent', 'stroke-width': 12 }),
      el('path', { class: 'line', d: path.d, fill: 'none', stroke: st.color, 'stroke-width': width, 'stroke-opacity': st.strokeOpacity, 'stroke-dasharray': st.dash || undefined, 'marker-end': urlRef(mkE), 'marker-start': urlRef(mkS) }),
    ], { 'data-from': e.from, 'data-to': e.to }));
    let labelBox: BoxGeom | null = null;
    if (e.label && !opts.hideLabels) {
      const size = st.labelSize ?? 12;
      const href = itemLink(ctx, em.link);
      const color = href ? LINK_COLOR : st.labelColor || st.color;
      const L = labelOf(e.label, font(size, 400, st.fontFamily || family), color, e.src, WRAP);
      const lh = L.lines.length * size * 1.25;
      // along the line, the first place where the label covers no state and no other label (unless set by hand)
      const set = metaNum(em.labelAt);
      let lp = path.at(set ?? 0.5);
      if (set === undefined) {
        const covers = (p: Point): boolean => taken.hits({ x: p.x - L.w / 2 - 2, y: p.y - lh / 2 - 2, w: L.w + 4, h: lh + 4 });
        for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.25, 0.75]) {
          const q = path.at(t);
          if (!covers(q)) {
            lp = q;
            break;
          }
        }
      }
      const lx = lp.x + (metaNum(em.labelDx) || 0), ly = lp.y + (metaNum(em.labelDy) || 0);
      const lo = { size, color, family: st.fontFamily || family, halo: env.paper, weight: st.fontWeight || 400, underline: !!href };
      const label: SceneNode[] = L.rich && kit()
        ? kit()!.richText(L.rich, lx, ly, { ...lo, lh: 1.25, measure: ctx.measure, extra: { stroke: env.paper, 'stroke-width': 4, 'stroke-linejoin': 'round', 'paint-order': 'stroke' } })
        : [haloLabel(L.lines, lx, ly, lo)];
      labelNodes.push(itemGroup('edge', e.id, 'elabel', withLink(href, label), { 'data-part': 'label', 'data-from': e.from, 'data-to': e.to, ...linkAttr(href) }, 'label'));
      labelBox = { x: lx, y: ly, w: L.w, h: lh };
      taken.add(labelBox);
    }
    const auto = routed.get(e.id);
    edgeGeom.set(e.id, { a: pa, b: pb, label: labelBox, points: x.points, mids: auto && !x.points.length ? [path.at(0.5)] : path.mids, d: path.d });
  }

  // ---- states
  const nodeNodes: SceneNode[] = [];
  for (const [id, N] of [...nodes].sort((a, b) => a[1].n.order - b[1].n.order)) {
    if (hiddenNodes.has(id) || !Number.isFinite(N.x)) continue;
    const { st } = N;
    const href = itemLink(ctx, N.m.link, N.n.link);
    const tip: SceneNode[] = N.n.tooltip ? [tooltip(N.n.tooltip)] : [];
    const kindCls = `st-${N.n.kind}`;
    if (!N.title) {
      // pseudo-states and bars: the shape alone (a transparent box widens the target of the small ones)
      const parts: SceneNode[] = [];
      if (N.w < 24 || N.h < 24) parts.push(el('rect', { x: N.x - Math.max(N.w, 24) / 2, y: N.y - Math.max(N.h, 24) / 2, width: Math.max(N.w, 24), height: Math.max(N.h, 24), fill: 'transparent', stroke: 'none' }));
      parts.push(...shapeDef(N.shape).draw(N, st, {}));
      nodeNodes.push(itemGroup('node', id, `node ${kindCls}`, [...withLink(href, parts), ...tip], linkAttr(href)));
      continue;
    }
    const fs = st.fontSize ?? 14, padY = st.padY ?? 8, padX = st.padX ?? 12;
    const color = href ? LINK_COLOR : st.text;
    if (N.media) {
      // an image or icon state: the asset, then its caption
      const parts = mediaAssetNodes(env, kit(), N, N.media, metaMediaSource(N.m)!, st, { key: `state-${id}`, family, source: 'meta', ...(N.n.defLine !== null ? { line: N.n.defLine } : {}) });
      if (N.title.lines.length) {
        const cy = captionY(N, N.media);
        const to = { size: fs, weight: st.fontWeight, color, family: st.fontFamily || family, lh: 1.3, underline: !!href };
        parts.push(...withLink(href, N.title.rich && kit() ? kit()!.richText(N.title.rich, N.x, cy, { ...to, measure: ctx.measure }) : [textBlock(N.title.lines, N.x, cy, to)]));
      }
      nodeNodes.push(itemGroup('node', id, `node ${kindCls} st-${N.media.kind}`, [...parts, ...tip], linkAttr(href)));
      continue;
    }
    const parts: SceneNode[] = [...stackedShapeNodes(N.shape, N, st)];
    const to = (size: number, weight: number | string | undefined, anchor: 'middle' | 'start'): Parameters<typeof textBlock>[3] => ({ size, weight, color, family: st.fontFamily || family, lh: 1.3, anchor, underline: !!href });
    // the title block: the image, the icon and the title (centred, or at the top above the description rows)
    const blockH = decoratedSize(N.deco!, N.title).h;
    const top = N.rows ? N.y - N.h / 2 + padY : N.y - blockH / 2;
    const D = decorate(env, kit, N.deco!, N.x, top, N.title, { key: id, ...(N.n.defLine !== null ? { line: N.n.defLine } : {}), family, ...(st.text ? { color: st.text } : {}) });
    parts.push(...D.nodes);
    const { x: tx, y: ty } = D.contentBox;
    const titleTo = to(fs, N.rows ? 600 : st.fontWeight, 'middle');
    const label = N.title.rich && kit() ? kit()!.richText(N.title.rich, tx, ty, { ...titleTo, measure: ctx.measure }) : [textBlock(N.title.lines, tx, ty, titleTo)];
    parts.push(...withLink(href, label));
    if (N.rows) {
      // the divider under the title, then the description rows (left-aligned)
      const dy = top + blockH + padY / 2;
      parts.push(el('path', { class: 'divider', d: `M${fmt(N.x - N.w / 2)},${fmt(dy)} L${fmt(N.x + N.w / 2)},${fmt(dy)}`, fill: 'none', stroke: st.stroke, 'stroke-width': Math.max(0.5, (st.strokeWidth ?? 1) * 0.75) }));
      const rs = Math.max(8, fs - 1);
      const ry = dy + padY / 2 + N.rows.h / 2;
      const rowTo = to(rs, st.fontWeight, 'start');
      const rx = N.x - N.w / 2 + padX;
      parts.push(...(N.rows.rich && kit() ? kit()!.richText(N.rows.rich, rx, ry, { ...rowTo, measure: ctx.measure }) : [textBlock(N.rows.lines, rx, ry, rowTo)]));
    }
    nodeNodes.push(itemGroup('node', id, `node ${kindCls}`, [...parts, ...tip], linkAttr(href)));
  }

  // ---- notes and their dashed lines
  const noteNodes: SceneNode[] = [], noteLines: SceneNode[] = [];
  for (const it of notes.values()) {
    if (hidden.note.has(it.note.id) || endHidden(it.note.target) || !Number.isFinite(it.x)) continue;
    const { st } = it;
    const t = boxOf(it.note.target);
    if (t) {
      const left = it.x < t.x;
      const a = { x: left ? it.x + it.w / 2 : it.x - it.w / 2, y: it.y };
      const b = { x: left ? t.x - t.w / 2 : t.x + t.w / 2, y: Math.max(t.y - t.h / 2 + 4, Math.min(t.y + t.h / 2 - 4, it.y)) };
      noteLines.push(itemGroup('note', it.note.id, 'note-line', [el('path', { d: `M${fmt(a.x)},${fmt(a.y)} L${fmt(b.x)},${fmt(b.y)}`, fill: 'none', stroke: st.color ?? st.stroke, 'stroke-width': 1, 'stroke-dasharray': '4 3' })], { 'data-part': 'line' }, 'line'));
    }
    const fs = st.fontSize ?? 13;
    const to = { size: fs, weight: st.fontWeight, color: st.text, family: st.fontFamily || family, lh: 1.3, anchor: 'start' as const };
    const tx = it.x - it.w / 2 + (st.padX ?? 10);
    const label = it.label.rich && kit() ? kit()!.richText(it.label.rich, tx, it.y, { ...to, measure: ctx.measure }) : [textBlock(it.label.lines, tx, it.y, to)];
    noteNodes.push(itemGroup('note', it.note.id, 'note st-note', [...shapeDef('note').draw(it, st, {}), ...label]));
  }
  return { groupNodes, edgeNodes, labelNodes, edgeGeom, nodeNodes, noteNodes, noteLines };
}
