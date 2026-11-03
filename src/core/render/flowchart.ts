// Flowchart renderer: nodes, nested groups (lanes / wrappers), styled curved edges (prototype render/flowchart.js);
// icon and image nodes (an asset with a caption), markdown labels and icon tokens as rich text, invisible links, edge
// animation, tooltips and the diagram's title (T06).
import { layered, type LayoutEdge, type LayoutNode } from '../layout/layered.js';
import { ancestorsOf, layoutCompound, type CompoundContainer, type CompoundNode, type CompoundResult } from '../layout/compound.js';
import { polylineCrosses, routeAround } from '../layout/route.js';
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type { FlowEdge, FlowGroup, FlowNode, FlowchartModel, MermaidStyle } from '../model.js';
import { el, g, title as tooltip } from '../scene/build.js';
import type { SceneNode, TextRun } from '../scene/types.js';
import type { StyleProps } from '../style.js';
import { textBlockWidth, wrap } from '../text/wrap.js';
import type { ImageFit } from '../media/image.js';
import { mediaKit, type MediaKit } from '../media/kit.js';
import { ICON_TOKEN } from '../icons/names.js';
import type { IconResolver } from '../text/rich.js';
import type { FontSpec } from '../text/measure.js';
import { diag } from '../types.js';
import type { CenterBox, Point } from '../types.js';
import {
  assignPorts, baseStyle, cachedLayout, type PortLink, metaNum, metaPoints, type RenderEnv, type SubResult, byLine, countBy, Defs, edgePath, firstLine, font, haloLabel, hiddenOf, isSide, itemGroup,
  itemLink, LINK_COLOR, linkAttr, mergeStyle, outerBox, pickStyle, presetOf, presets, shapeNodes, sideToward, stackedShapeNodes,
  textBlock, urlRef, withLink,
} from './common.js';
import type { BoxGeom, EdgeGeom, FlowGeometry, Port } from './types.js';
import { onOutline } from '../shapes/outline.js';
import type { ResolvedTheme } from '../theme/types.js';
import { byShapeId, shapeDef } from '../shapes/registry.js';
import type { ShapeDef } from '../shapes/types.js';
import type { Rect } from '../types.js';

// the presets and the edge metadata lookup live apart, so code that needs only them (the portable export, the editor's
// base) does not load the renderer
export { edgeMeta, edgePreset, flowPresets, groupPreset, nodePreset, presetShape, type FlowPresets } from './flow-presets.js';
import { edgeMeta, edgePreset, flowPresets, groupPreset, nodePreset, type FlowPresets } from './flow-presets.js';
import { dashAttrs } from './dash.js';

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

/** An icon or image node: the asset (with its frame) and the caption beside it, relative to the node's centre. */
interface MediaBox {
  kind: 'icon' | 'image';
  /** The frame's centre offset (y) and size: the icon plus its padding, or the picture. */
  dy: number;
  fw: number;
  fh: number;
  /** The icon or the picture inside the frame. */
  aw: number;
  ah: number;
  /** An icon's frame (none: a bare icon). */
  form?: 'square' | 'circle' | 'rounded';
  /** The caption above the asset (`pos: t`), else below. */
  top: boolean;
  captionH: number;
  fit: ImageFit;
  /** The colour of a monochrome icon (the code's stroke, else the text colour). */
  color: string | undefined;
}

/** Mermaid's icon size when `h` / `w` are not given, the padding of an icon's frame and the gap before a caption. */
const ICON_SIZE = 48, FRAME_PAD = 8, CAPTION_GAP = 8;
/** An image node's box while its size is not known. */
const IMAGE_SIZE = 96;
/** Where markdown labels and captions wrap (Mermaid's `flowchart.wrappingWidth`). */
const WRAP_WIDTH = 200;
const FORMS = new Set(['square', 'circle', 'rounded']);
const FITS = new Set(['contain', 'cover', 'stretch']);

/** Mermaid's curve names as the routings mmdx draws: `linear` straight, the steps orthogonal, the rest curved. */
export function curveRouting(curve: string | undefined): string | undefined {
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

const NO_META: ItemMeta = {};

export function renderFlowchart(model: FlowchartModel, env: RenderEnv): SubResult {
  const { ctx, theme: T, meta, opts } = env;
  const F = T.flowchart;
  const P = flowPresets(T, meta);
  const family = T.font;
  const defs = new Defs(ctx.idPrefix);
  const routingDefault = meta.canvas.routing || 'curved';
  const m = <K extends 'nodes' | 'groups' | 'edges'>(k: K, id: string): ItemMeta => meta[k]?.[id] ?? NO_META;

  const cfg = model.config ?? {};
  const wrapWidth = cfg.wrappingWidth ?? WRAP_WIDTH;
  // rich labels, icons and images draw through the media kit, a lazy chunk (core/media/kit.ts): asked for only when a
  // diagram needs it; without it the render draws plain text and empty boxes, and runs again once it has loaded
  let kitAsked = false, K: MediaKit | null = null;
  const kit = (): MediaKit | null => {
    if (!kitAsked) {
      kitAsked = true;
      K = mediaKit();
    }
    return K;
  };
  /** A label needs runs: a markdown string, or a token of a registered pack or Font Awesome (the registry decides). */
  const needsRuns = (label: string, md: boolean | undefined): boolean =>
    !!md || (label.includes(':') && [...label.matchAll(ICON_TOKEN)].some((t) => ctx.icons.resolve(t[2]!, 'token') !== null));
  // label tokens of registered packs and Font Awesome become icon runs in the text's colour and size
  const icons = (k: MediaKit, color: string | undefined, size: number, line: number | null | undefined): IconResolver =>
    k.iconResolver(ctx, color, size, line == null ? { diagnostics: env.diagnostics } : { diagnostics: env.diagnostics, line });
  /** A label's lines: plain text as before, or runs (markdown, icon tokens) wrapped at `maxW` (markdown at its own width unless turned off). */
  const labelLines = (label: string, md: boolean | undefined, fnt: FontSpec, color: string | undefined, line: number | null, maxW: number, mdW: number): { lines: string[]; rich?: TextRun[][]; w: number } => {
    const k = needsRuns(label, md) ? kit() : null;
    const runs = k ? k.labelRuns(label, { markdown: !!md, icons: icons(k, color, fnt.size, line), iconSize: fnt.size }) : null;
    if (!k || !runs) {
      const lines = maxW ? wrap(label, maxW, fnt, ctx.measure) : label.split('\n');
      return { lines, w: textBlockWidth(lines, fnt, ctx.measure) };
    }
    const rich = k.wrapRuns(runs, md && cfg.markdownAutoWrap !== false ? maxW || mdW : maxW, fnt, ctx.measure);
    const out = { lines: rich.map(k.runsText), w: k.runsBlockWidth(rich, fnt, ctx.measure) };
    return k.richLines(rich) ? { ...out, rich } : out;
  };

  // ---- resolve node styles & sizes
  const nodes = new Map<string, NodeItem>();
  const shapeStyles = byShapeId(F.nodeShapes);
  const clampSize = (v: number): number => Math.max(8, Math.min(4000, v));

  /** The last stroke the code gives (classes, then `style`): a monochrome icon's colour, as in Mermaid. */
  const codeColor = (layers: readonly (MermaidStyle | undefined)[]): string | undefined => {
    let c: string | undefined;
    for (const l of layers) if (l?.stroke) c = l.stroke;
    return c ? ctx.color(c) : undefined;
  };

  /**
   * An image node's picture size (§3.2): `w` and `h` as written; with the aspect lock (`constraint: on`) the width
   * follows `h` × the picture's aspect; what is not written comes from the picture's natural size, which the browser
   * knows once it has loaded it (until then, and where it cannot know it, 96 × 96).
   */
  const imageSize = (url: string, w0: number | undefined, h0: number | undefined, lock: boolean, line: number | null): { w: number; h: number } => {
    if (w0 && h0 && !lock) return { w: clampSize(w0), h: clampSize(h0) };
    const k = kit();
    const ok = k ? k.checkImageUrl(url, ctx.imagePolicy) : null;
    // undefined: the browser is loading it (the component renders again when it arrives); null: it cannot be known
    const nat = !ok || !('url' in ok) ? undefined : ctx.imageSizes ? ctx.imageSizes.get(ok.url) : null;
    if (nat) {
      const k = nat.w / nat.h;
      if (h0) return { w: clampSize(h0 * k), h: clampSize(h0) };
      if (w0) return { w: clampSize(w0), h: clampSize(w0 / k) };
      return { w: clampSize(nat.w), h: clampSize(nat.h) };
    }
    if (w0 || h0) return { w: clampSize(w0 ?? h0!), h: clampSize(h0 ?? w0!) };
    if (nat === null)
      env.diagnostics.push(diag('info', 'image.size-unknown', `The image's size is not known here — it is drawn ${IMAGE_SIZE} × ${IMAGE_SIZE} (give it "w" and "h")`, line ?? undefined, { params: { url: url.length > 80 ? `${url.slice(0, 77)}…` : url } }));
    return { w: IMAGE_SIZE, h: IMAGE_SIZE };
  };

  /** An icon or image node (§3.1, §3.2): its asset, its frame and the caption above or below. */
  const mediaNode = (n: FlowNode, nm: ItemMeta, preset: string, classes: readonly (MermaidStyle | undefined)[], line: number | null): NodeItem => {
    const d = n.data ?? {};
    const kind = d.img ? 'image' : 'icon';
    const st = mergeStyle(ctx, F.node, shapeStyles?.[kind], baseStyle(meta, 'node'), presetOf(P.node, preset), ...classes, n.style, pickStyle(nm));
    st.shape = kind;
    const fontSize = st.fontSize ?? 14;
    const fnt = font(fontSize, st.fontWeight, st.fontFamily || family);
    // a resize in progress gives the asset's size in metadata (written to `h` / `w` when it ends)
    const mw = metaNum(nm.w), mh = metaNum(nm.h);
    let aw: number, ah: number, fw: number, fh: number;
    let form: MediaBox['form'];
    if (kind === 'icon') {
      // Mermaid draws the icon `max(h, w)` square, 48 by default
      const size = clampSize(mw || mh ? Math.max(mw ?? 0, mh ?? 0) : Math.max(d.h ?? ICON_SIZE, d.w ?? ICON_SIZE));
      aw = ah = size;
      if (d.form && FORMS.has(d.form)) form = d.form as MediaBox['form'];
      fw = fh = form ? size + 2 * FRAME_PAD : size;
    } else {
      ({ w: aw, h: ah } = imageSize(String(d.img), mw ?? d.w, mh ?? d.h, d.constraint === 'on', line));
      fw = aw;
      fh = ah;
    }
    // the caption wraps at the asset's width or Mermaid's wrapping width, whichever is wider
    const cw = Math.max(fw, wrapWidth);
    const L = n.label ? labelLines(n.label, n.md, fnt, st.text, line, cw, cw) : { lines: [] as string[], w: 0 };
    const captionH = L.lines.length * fontSize * 1.3;
    const w = Math.max(fw, L.w), h = fh + (L.lines.length ? CAPTION_GAP : 0) + captionH;
    const top = d.pos === 't';
    const fit = str(nm['imgFit']);
    const M: MediaBox = {
      kind, dy: top ? h / 2 - fh / 2 : -h / 2 + fh / 2, fw, fh, aw, ah, top, captionH,
      fit: fit && FITS.has(fit) ? (fit as ImageFit) : 'contain', color: codeColor([...classes, n.style]) ?? st.text,
    };
    if (form) M.form = form;
    const N: NodeItem = { n, m: nm, st, preset, lines: L.lines, w, h, x: NaN, y: NaN, ...xy(nm), media: M };
    if ('rich' in L && L.rich) N.rich = L.rich;
    return N;
  };
  // `classDef default` styles every node, under its own classes (Mermaid's `default` class)
  const defaultClass = model.classDefs['default'];
  for (const n of model.nodes.values()) {
    const nm = m('nodes', n.id);
    const preset = nodePreset(n, meta, P);
    const pst = presetOf(P.node, preset);
    const classDefs = n.classes.filter((c) => !presetOf(P.node, c) && c !== 'default').map((c) => model.classDefs[c]);
    const line = firstLine(n.defLine, n.lines);
    if (n.data?.img || n.data?.icon) {
      nodes.set(n.id, mediaNode(n, nm, preset, [defaultClass, ...classDefs], Number.isFinite(line) ? line : null));
      continue;
    }
    // the shape first: each shape has its own default style in the theme (flowchart.nodeShapes.<shape>); names resolve
    // through the catalogue (a Mermaid name in metadata or a preset is the same shape)
    const def = shapeDef(str(nm.shape) || pst?.shape || (n.shape !== 'rect' ? n.shape : F.node.shape || 'rect'));
    const shape = def.id;
    const st = mergeStyle(ctx, F.node, shapeStyles?.[shape], baseStyle(meta, 'node'), pst, defaultClass, ...classDefs, n.style, pickStyle(nm));
    st.shape = shape;
    const fontSize = st.fontSize ?? 14, padX = st.padX ?? 0, padY = st.padY ?? 0;
    const fnt = font(fontSize, st.fontWeight, st.fontFamily || family);
    const fixedW = metaNum(nm.w);
    // word wrap: lines break to fit the shape's text box (in its own width, else the style's maxW, else 200)
    const wrapW = fixedW ?? st.maxW ?? Math.max(st.minW ?? 0, 200);
    const wrapAt = (ww: number): number => Math.max(20, (def.below ? ww : textBox(def, ww, ww).w) - padX * 2);
    // a markdown label wraps at the node's own width, else at Mermaid's wrapping width
    const L = labelLines(n.label, n.md, fnt, st.text, Number.isFinite(line) ? line : null, st.wrap ? wrapAt(wrapW) : 0, fixedW ? wrapAt(fixedW) : wrapWidth);
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

  // ---- groups: style and title (their boxes come after the layout)
  const groupDepthCache = new Map<string, number>();
  const depth = (g: FlowGroup): number => {
    const c = groupDepthCache.get(g.id);
    if (c !== undefined) return c;
    let d = 0;
    const seen = new Set([g.id]);
    let p = g.parent;
    while (p && !seen.has(p)) {
      seen.add(p);
      d++;
      p = model.groups.get(p)?.parent ?? null;
    }
    groupDepthCache.set(g.id, d);
    return d;
  };
  const groupsSorted = [...model.groups.values()].sort((a, b) => depth(b) - depth(a));
  interface GroupLook {
    m: ItemMeta;
    st: StyleProps;
    preset: string;
    lines: string[];
    T: ReturnType<typeof labelLines> | null;
    /** The frame placed by hand (x / y / w / h: top-left and size). */
    frame: Rect | null;
  }
  const looks = new Map<string, GroupLook>();
  for (const g of groupsSorted) {
    const gm = m('groups', g.id);
    const preset = groupPreset(g, meta, P);
    // classes on a subgraph (`class s1 c`) style its frame, as in Mermaid
    const classDefs = (g.classes ?? []).filter((c) => !presetOf(P.group, c)).map((c) => model.classDefs[c]);
    const st = mergeStyle(ctx, F.group, baseStyle(meta, 'group'), presetOf(P.group, preset), ...classDefs, g.style, pickStyle(gm));
    const tfont = font(st.titleSize ?? 14, st.titleWeight, st.fontFamily || family);
    const T = (g.label || '').trim() ? labelLines(g.label, g.md, tfont, st.titleColor, g.line, 0, wrapWidth) : null;
    const fx = metaNum(gm.x), fy = metaNum(gm.y), fw = metaNum(gm.w), fh = metaNum(gm.h);
    const frame = fw && fh && fx !== undefined && fy !== undefined ? { x: fx, y: fy, w: fw, h: fh } : null;
    looks.set(g.id, { m: gm, st, preset, lines: T?.lines ?? [], T, frame });
  }

  // ---- auto layout for nodes without positions: subgraphs as nested containers (T07), or the earlier layout for a
  // flowchart without subgraphs and with `canvas.layout: "legacy"`
  const compound = model.groups.size > 0 && meta.canvas.layout !== 'legacy';
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
  let CR: CompoundResult | null = null;
  const missing = [...nodes.values()].filter((N) => Number.isNaN(N.x) || Number.isNaN(N.y));
  if (compound) CR = compoundLayout();
  else if (missing.length) {
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

  // ---- group boxes (inner first)
  const groups = new Map<string, GroupItem>();
  for (const g of groupsSorted) {
    const { m: gm, st, preset, lines, T, frame } = looks.get(g.id)!;
    const pad = st.pad ?? 0, padTop = st.padTop ?? pad;
    let box: GroupBox;
    const r = CR?.containers.get(g.id);
    if (r) box = { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h, ...(frame ? { fixed: true } : { empty: !visibleIn.has(g.id) }) };
    else if (frame) box = { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2, w: frame.w, h: frame.h, fixed: true };
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
      const titleW = lines.length ? (T?.w ?? 0) + 2 * pad : 0;
      let w = x1 - x0 + 2 * pad;
      const cx = (x0 + x1) / 2;
      w = Math.max(w, titleW);
      box = { x: cx, y: (y0 - titleH + y1 + pad) / 2, w, h: y1 - y0 + titleH + pad, empty };
    }
    const G: GroupItem = { g, m: gm, st, preset, lines, box, empty: !!box.empty, depth: depth(g) };
    if (T && 'rich' in T && T.rich) G.rich = T.rich;
    groups.set(g.id, G);
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
    if (N?.media) return N;
    if (N) return outerBox(N, N.st.stack);
    const G = groups.get(id);
    return G ? outerBox(G.box, G.st.stack) : undefined;
  };
  for (const e of model.edges) {
    // an invisible link (`~~~`) places its nodes and is not drawn
    if (e.line === 'invisible') continue;
    const a = boxOf(e.from), b = boxOf(e.to);
    if (!a || !b) continue;
    const em = edgeMeta(e, meta) ?? NO_META;
    const preset = edgePreset(e, meta, P);
    const ls = model.linkStyles[String(e.index)] ?? model.linkStyles['default'];
    const lsMapped = ls ? { color: ls.stroke, width: ls.strokeWidth, dash: ls.dash, labelColor: ls.text } : null;
    const st = mergeStyle(ctx, F.edge, baseStyle(meta, 'edge'), presetOf(P.edge, preset), lsMapped, pickStyle(em));
    const isHidden =
      hiddenNodes.has(e.from) || hiddenNodes.has(e.to) || groupHidden.has(e.from) || groupHidden.has(e.to) || hidden.edge.has(e.id);
    edgeItems.push({ e, m: em, st, preset, a, b, hidden: isHidden, points: metaPoints(em.points) });
  }
  const visibleEdges = edgeItems.filter((x) => !x.hidden);
  /** Bend points the compound layout's router gave an edge (never stored: the edge's own `points` win). */
  const routed = new Map<string, [number, number][]>();
  const bendsOf = (x: EdgeItem): [number, number][] => (x.points.length ? x.points : routed.get(x.e.id) ?? x.points);
  const horizontal = (d: string): boolean => d === 'LR' || d === 'RL';
  const placePorts = (): ReturnType<typeof assignPorts> => assignPorts(
    visibleEdges.map((x) => {
      const pts = bendsOf(x);
      const p0 = pts[0], pn = pts[pts.length - 1];
      const link: PortLink = {
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
      // between auto-placed ends, the ports follow the direction of the subgraph the edge was laid out in
      const r = CR && autoEnd(x.e.from) && autoEnd(x.e.to) ? CR.edges.get(x.e.id) : undefined;
      if (r) link.prefer = horizontal(r.dir) ? 'h' : 'v';
      return link;
    }),
    { prefer: horizontal(model.direction) ? 'h' : 'v' },
  );
  let ports = placePorts();

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
      const to = {
        size: st.titleSize,
        weight: st.titleWeight,
        color: href ? LINK_COLOR : st.titleColor,
        family: st.fontFamily || family,
        anchor: left ? ('start' as const) : ('middle' as const),
        lh: 1.25,
        underline: !!href,
      };
      const tx = left ? box.x - box.w / 2 + pad : box.x;
      children.push(...withLink(href, G.rich ? K!.richText(G.rich, tx, ty, { ...to, measure: ctx.measure }) : [textBlock(lines, tx, ty, to)]));
    }
    groupNodes.push(itemGroup('group', G.g.id, 'group', children, linkAttr(href)));
  }

  const edgeNodes: SceneNode[] = [], labelNodes: SceneNode[] = [];
  const onShape = (id: string, b: CenterBox, port: Port): Port => {
    const N = nodes.get(id);
    if (N?.media) return mediaPort(N, N.media, port);
    return N ? onOutline(shapeDef(N.st.shape), b, port) : port;
  };
  const routingOf = (x: EdgeItem): { routing: string; curve: number } => {
    // the code's curve (the edge's `curve`, `linkStyle … interpolate`, `flowchart.curve`) unless metadata routes it
    const { e, m: em, st } = x;
    const curve = e.data?.curve ?? model.linkStyles[String(e.index)]?.interpolate ?? model.linkStyles['default']?.interpolate ?? cfg.curve;
    return { routing: str(em.routing) || curveRouting(curve) || routingDefault, curve: st.curve ?? 1 };
  };
  if (CR) routeAroundGroups(CR);
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
    edgeNodes.push(
      itemGroup(
        'edge',
        e.id,
        'edge',
        [
          el('path', { class: 'hit', d: path.d, fill: 'none', stroke: 'transparent', 'stroke-width': 12 }),
          el('path', {
            class: `line${anim}`,
            d: path.d,
            fill: 'none',
            stroke: st.color,
            'stroke-width': width,
            'stroke-opacity': st.strokeOpacity,
            ...dash,
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
      const labelSize = st.labelSize ?? 12;
      const href = itemLink(ctx, em.link);
      const color = href ? LINK_COLOR : st.labelColor || st.color;
      // markdown and icon tokens as runs; a markdown label wraps at Mermaid's wrapping width
      const L = labelLines(e.label, e.md, labelFont(st), color, e.src, 0, wrapWidth);
      const lines = L.lines;
      const lo = { size: labelSize, color, family: st.fontFamily || family, halo: env.paper, weight: st.fontWeight || 400, underline: !!href };
      const label: SceneNode[] = L.rich
        ? K!.richText(L.rich, lx, ly, { ...lo, lh: 1.25, measure: ctx.measure, extra: { stroke: env.paper, 'stroke-width': 4, 'stroke-linejoin': 'round', 'paint-order': 'stroke' } })
        : [haloLabel(lines, lx, ly, lo)];
      labelNodes.push(itemGroup('edge', e.id, 'elabel', withLink(href, label), { 'data-part': 'label', 'data-from': e.from, 'data-to': e.to, ...linkAttr(href) }, 'label'));
      labelBox = { x: lx, y: ly, w: L.w, h: lines.length * labelSize * 1.25 };
    }
    // a routed line has one handle in its middle, as a line without bend points (the route is not stored)
    edgeGeom.set(e.id, { a: p.a, b: p.b, label: labelBox, points: x.points, mids: auto && !x.points.length ? [path.at(0.5)] : path.mids, d: path.d });
  }

  const nodeNodes: SceneNode[] = [];
  // labels drawn under their shapes, which the bounds must hold too
  const belowLabels: CenterBox[] = [];
  const lineOf = (N: NodeItem): number => firstLine(N.n.defLine, N.n.lines);
  for (const [id, N] of [...nodes].sort((a, b) => byLine(lineOf(a[1]), lineOf(b[1])))) {
    if (hiddenNodes.has(id)) continue;
    const { st } = N;
    const href = itemLink(ctx, N.m.link, N.n.link);
    // `click A "url" "tooltip"`: shown by browsers on hover (last, so the shape stays the group's first child)
    const tip: SceneNode[] = N.n.tooltip ? [tooltip(N.n.tooltip)] : [];
    if (N.media) {
      nodeNodes.push(itemGroup('node', id, 'node', [...mediaNodes(id, N, N.media, href), ...tip], linkAttr(href)));
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
    const label = N.rich ? K!.richText(N.rich, tx, ty, { ...to, measure: ctx.measure }) : [textBlock(N.lines, tx, ty, to)];
    const shown = !def.below || N.n.label !== N.n.id;
    nodeNodes.push(itemGroup('node', id, 'node', [...stackedShapeNodes(st.shape, N, st), ...(shown ? withLink(href, label) : []), ...tip], linkAttr(href)));
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
  for (const b of belowLabels) grow(b);
  if (x0 === Infinity) {
    x0 = 0;
    y0 = 0;
    x1 = 400;
    y1 = 300;
  }
  const pad = env.pad;
  const bounds = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  // the diagram's `title`, above it as the sequence diagram draws its title
  const titleNodes: SceneNode[] = [];
  const titleText = (model.title ?? '').trim();
  if (titleText) {
    const tl = titleText.split('\n');
    const size = 22, blockH = tl.length * size * 1.3;
    const tw = textBlockWidth(tl, font(size, 600, family), ctx.measure);
    bounds.y -= blockH + 14;
    bounds.h += blockH + 14;
    if (tw + 2 * pad > bounds.w) {
      bounds.x -= (tw + 2 * pad - bounds.w) / 2;
      bounds.w = tw + 2 * pad;
    }
    titleNodes.push(g({ class: 'title', 'data-part': 'title' }, [
      textBlock(tl, bounds.x + bounds.w / 2, bounds.y + pad + blockH / 2, { size, weight: 600, color: ctx.color('@title') ?? '#333', family }),
    ], { key: 'title' }));
  }

  const geom: FlowGeometry = {
    type: 'flowchart',
    nodes: new Map(
      [...nodes].map(([id, N]) => {
        const b: BoxGeom & { auto?: boolean } = { x: N.x, y: N.y, w: N.w, h: N.h, stack: N.st.stack, hidden: hiddenNodes.has(id) };
        if (N.auto) b.auto = true;
        if (N.media) b.asset = { x: N.x, y: N.y + N.media.dy, w: N.media.aw, h: N.media.ah };
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
  if (model.accTitle || model.accDescr) out.a11y = { ...(model.accTitle ? { title: model.accTitle } : {}), ...(model.accDescr ? { desc: model.accDescr } : {}) };
  return out;

  /** The end was placed by the layout: an auto-placed node, or a subgraph that moved as a unit. */
  function autoEnd(id: string): boolean {
    const N = nodes.get(id);
    return N ? !!N.auto : !!CR?.containers.get(id)?.auto;
  }

  /**
   * T07.3: a line between auto-placed ends must not cross a subgraph that holds neither end. Such a line goes through
   * the points the layout kept free for it, else around the subgraphs in the way (core/layout/route.ts); the ports
   * are then placed again, facing the first and last bend point. Lines with bend points of their own are left alone.
   */
  function routeAroundGroups(R: CompoundResult): void {
    const frames: { id: string; r: Rect }[] = [];
    for (const [id, G] of groups) if (!G.empty && !groupHidden.has(id)) frames.push({ id, r: { x: G.box.x - G.box.w / 2, y: G.box.y - G.box.h / 2, w: G.box.w, h: G.box.h } });
    if (!frames.length) return;
    const holders = (id: string): string[] => (R.containers.has(id) ? [id, ...ancestorsOf(R.parent, id)] : ancestorsOf(R.parent, id));
    const obstaclesOf = (x: EdgeItem): Rect[] => {
      const skip = new Set([...holders(x.e.from), ...holders(x.e.to)]);
      return frames.filter((f) => !skip.has(f.id)).map((f) => f.r);
    };
    const drawn = (x: EdgeItem, pts: readonly (readonly [number, number])[]): Point[] | null => {
      const pp = ports.get(x.e.id);
      if (!pp) return null;
      const path = edgePath(onShape(x.e.from, x.a, pp.a), onShape(x.e.to, x.b, pp.b), { ...routingOf(x), points: pts });
      return Array.from({ length: 41 }, (_, i) => path.at(i / 40));
    };
    const ends = (x: EdgeItem): [Point, Point] | null => {
      const pp = ports.get(x.e.id);
      return pp ? [onShape(x.e.from, x.a, pp.a), onShape(x.e.to, x.b, pp.b)] : null;
    };
    const asPairs = (pts: readonly Point[]): [number, number][] => pts.map((q) => [q.x, q.y]);
    const todo = visibleEdges.filter((x) => !x.points.length && autoEnd(x.e.from) && autoEnd(x.e.to));
    // a line that leaves a subgraph was laid out between the subgraphs, not between the nodes: it also keeps off the
    // other nodes near it (one laid out inside a scope keeps the layered engine's place)
    const boxes: { id: string; r: Rect }[] = [];
    for (const [id, N] of nodes) if (!hiddenNodes.has(id)) boxes.push({ id, r: { x: N.x - N.w / 2, y: N.y - N.h / 2, w: N.w, h: N.h } });
    const parentOf = (id: string): string | null => (R.containers.has(id) ? id : R.parent.get(id) ?? null);
    const obstacles = new Map<EdgeItem, Rect[]>();
    for (const x of todo) {
      const obs = obstaclesOf(x);
      if (parentOf(x.e.from) !== parentOf(x.e.to)) {
        const line = drawn(x, []);
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
            if (b.id !== x.e.from && b.id !== x.e.to && b.r.x < near.x + near.w && b.r.x + b.r.w > near.x && b.r.y < near.y + near.h && b.r.y + b.r.h > near.y) obs.push(b.r);
          // nor through the titles of the subgraphs it leaves
          for (const id of new Set([...holders(x.e.from), ...holders(x.e.to)])) {
            const G = groups.get(id);
            if (!G || G.empty || !G.lines.length || !G.st.titleSize || id === x.e.from || id === x.e.to) continue;
            const band = G.st.padTop ?? G.st.pad ?? 0;
            if (band > 0) obs.push({ x: G.box.x - G.box.w / 2, y: G.box.y - G.box.h / 2, w: G.box.w, h: band });
          }
        }
      }
      obstacles.set(x, obs);
    }
    for (const x of todo) {
      const obs = obstacles.get(x)!;
      const line = obs.length ? drawn(x, []) : null;
      if (!line || !polylineCrosses(line, obs)) continue;
      const hint = R.edges.get(x.e.id)?.points ?? [];
      const viaHint = hint.length ? drawn(x, asPairs(hint)) : null;
      if (viaHint && !polylineCrosses(viaHint, obs)) {
        routed.set(x.e.id, asPairs(hint));
        continue;
      }
      const ab = ends(x);
      const around = ab && routeAround(ab[0], ab[1], obs, 18);
      if (around) routed.set(x.e.id, asPairs(around));
    }
    if (!routed.size) return;
    ports = placePorts();
    // with the ports placed again a curve may still clip a corner: once more from the new ports, with a wider margin
    for (const x of todo) {
      if (!routed.has(x.e.id)) continue;
      const obs = obstacles.get(x)!;
      const line = drawn(x, routed.get(x.e.id)!);
      if (!line || !polylineCrosses(line, obs)) continue;
      const ab = ends(x);
      const around = ab && routeAround(ab[0], ab[1], obs, 32);
      if (around) routed.set(x.e.id, asPairs(around));
    }
  }

  /**
   * The compound layout (T07): every subgraph holding a node is a container laid out in its own direction (Mermaid's
   * rule: a `direction` is honoured unless a link from outside reaches a node inside), hand-placed nodes and frames kept as
   * the mixed rules say (core/layout/compound.ts); an empty subgraph takes no space, as before.
   */
  function compoundLayout(): CompoundResult {
    const lineOf = (n: FlowNode): number | undefined => {
      const l = firstLine(n.defLine, n.lines);
      return Number.isFinite(l) ? l : undefined;
    };
    /** `id` is the group or inside it. */
    const within = (id: string, gid: string): boolean => {
      const seen = new Set<string>();
      for (let p: string | null = id; p && !seen.has(p); p = model.nodes.get(p)?.parent ?? model.groups.get(p)?.parent ?? null) {
        if (p === gid) return true;
        seen.add(p);
      }
      return false;
    };
    // a link to a node inside from outside crosses the border; a link to the subgraph itself does not (Mermaid)
    const crossed = (gid: string): boolean => model.edges.some((e) => e.from !== gid && e.to !== gid && within(e.from, gid) !== within(e.to, gid));
    const containers: CompoundContainer[] = [];
    for (const g of model.groups.values()) {
      if (!holdsNode.has(g.id)) continue;
      const { st, lines, T, frame, m: gm } = looks.get(g.id)!;
      const pad = st.pad ?? 0, padTop = st.padTop ?? pad;
      const c: CompoundContainer = { id: g.id, parent: g.parent && holdsNode.has(g.parent) ? g.parent : null, order: g.line, pad };
      if (g.dir && !crossed(g.id)) c.dir = g.dir;
      if (lines.length) c.title = { w: T?.w ?? 0, h: st.titleSize ? padTop : pad };
      if (frame) c.fixed = frame;
      else {
        // "Reset positions in this group" keeps the group's top-left (x / y without a size)
        const ax = metaNum(gm.x), ay = metaNum(gm.y);
        if (ax !== undefined && ay !== undefined) c.at = { x: ax, y: ay };
      }
      containers.push(c);
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
    for (const N of nodes.values()) {
      if (!R.auto.has(N.n.id)) continue;
      const p = R.nodes.get(N.n.id)!;
      N.x = p.x;
      N.y = p.y;
      N.auto = true;
    }
    return R;
  }

  /**
   * Where a connector ends on an icon or image node (Mermaid's outline of these shapes): on the asset's frame, except on
   * the caption's side, where it ends past the caption.
   */
  function mediaPort(N: NodeItem, M: MediaBox, port: Port): Port {
    const f = { x: N.x, y: N.y + M.dy, w: M.fw, h: M.fh };
    const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
    const vertical = Math.abs(port.n.y) > Math.abs(port.n.x);
    if (vertical && N.lines.length && (port.n.y < 0) === M.top) return port;
    const p: Port = vertical
      ? { x: clamp(port.x, f.x - f.w / 2, f.x + f.w / 2), y: f.y + (port.n.y < 0 ? -f.h / 2 : f.h / 2), n: port.n }
      : { x: f.x + (port.n.x < 0 ? -f.w / 2 : f.w / 2), y: clamp(port.y, f.y - f.h / 2, f.y + f.h / 2), n: port.n };
    return M.form === 'circle' ? onOutline(shapeDef('circle'), f, p) : p;
  }

  /** An icon or image node's scene: the frame, the asset in it, the caption; a transparent box makes the caption pickable too. */
  function mediaNodes(id: string, N: NodeItem, M: MediaBox, href: ReturnType<typeof itemLink>): SceneNode[] {
    const { st } = N;
    const fx = N.x, fy = N.y + M.dy;
    const out: SceneNode[] = [el('rect', { x: N.x - N.w / 2, y: N.y - N.h / 2, width: N.w, height: N.h, fill: 'transparent', stroke: 'none' })];
    if (M.form) out.push(...shapeNodes(M.form === 'circle' ? 'circle' : M.form === 'rounded' ? 'rounded' : 'rect', { x: fx, y: fy, w: M.fw, h: M.fh }, st));
    const box = { x: fx - M.aw / 2, y: fy - M.ah / 2, w: M.aw, h: M.ah };
    const line = firstLine(N.n.defLine, N.n.lines);
    const at = Number.isFinite(line) ? { line } : {};
    // without the kit (it is loading), the asset's box stays empty until the render runs again
    const k = kit();
    if (k && M.kind === 'icon') out.push(...k.drawIcon(env, N.n.data?.icon ?? '', { box, ...(M.color ? { color: M.color } : {}), ...at }));
    else if (k) out.push(...k.drawImage(env, N.n.data?.img, { box, fit: M.fit, key: `node-${id}`, family: st.fontFamily || family, ...at }));
    if (!N.lines.length) return out;
    const fontSize = st.fontSize ?? 14;
    const cy = M.top ? N.y - N.h / 2 + M.captionH / 2 : N.y + N.h / 2 - M.captionH / 2;
    const to = { size: fontSize, weight: st.fontWeight, color: href ? LINK_COLOR : st.text, family: st.fontFamily || family, lh: 1.3, underline: !!href };
    out.push(...withLink(href, N.rich ? K!.richText(N.rich, N.x, cy, { ...to, measure: ctx.measure }) : [textBlock(N.lines, N.x, cy, to)]));
    return out;
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** Where a shape's label goes, relative to its centre (the whole box unless the catalogue says otherwise). */
const textBox = (def: ShapeDef, w: number, h: number): Rect => def.textBox?.(w, h) ?? { x: -w / 2, y: -h / 2, w, h };

function xy(m: ItemMeta): Partial<Point> {
  const o: Partial<Point> = {};
  const x = metaNum(m.x), y = metaNum(m.y);
  if (x !== undefined) o.x = x;
  if (y !== undefined) o.y = y;
  return o;
}

