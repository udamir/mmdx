// Mindmap renderer (T08): nodes laid out as a tidy tree (core/layout/tree.ts), the root in its own look, a node
// without delimiters as its label over an underline in its section's colour (Mermaid's default node), the other
// shapes filled with the section colour; branches as curves from the parent's outer edge to the child's inner edge,
// tapering with depth (11 / 8 / 5 / 3 px, Mermaid's classic look). Labels are markdown, as Mermaid reads every mindmap
// label (bold, italic, icon tokens; wrapped at `maxNodeWidth`), `::icon(…)` and a metadata image stand above the
// label (render/decorate.ts, as in every kind: `iconPos` moves the icon or a leading token below or beside the text),
// and a folded subtree shows a +N badge. Rich text, icons and images draw through the media kit (a lazy chunk):
// without it the render draws plain text and empty boxes and counts a miss, and the viewer renders again once it loaded.
import { layoutTree, type TreeMode, type TreeNode } from '../layout/tree.js';
import type { ItemMeta } from '../meta/types.js';
import type { MindmapModel, MindNode } from '../model.js';
import { descendantsOf } from '../parse/mindmap.js';
import { el, text } from '../scene/build.js';
import type { SceneNode, TextRun } from '../scene/types.js';
import type { StyleProps } from '../style.js';
import { textBlockWidth, wrap } from '../text/wrap.js';
import type { MediaKit } from '../media/kit.js';
import { ICON_TOKEN } from '../icons/names.js';
import { fmt } from '../scene/serialize.js';
import { onOutline } from '../shapes/outline.js';
import { shapeDef } from '../shapes/registry.js';
import type { Point } from '../types.js';
import { baseStyle, countBy, font, hiddenOf, itemGroup, itemLink, LINK_COLOR, linkAttr, mergeStyle, metaNum, pickStyle, presetOf, stackedShapeNodes, textBlock, withLink } from './common.js';
import { type RenderEnv, type SubResult } from './types.js';
import { decorate, decoratedSize, decoration, lazyKit, type Decoration } from './decorate.js';
import { assetBox, captionY, mediaAssetNodes, mediaLayout, mediaPort, type MediaBox } from './media-node.js';
import { metaMediaSource } from '../media/meta-source.js';
import { mindPreset, mindPresets } from './mind-presets.js';
import type { MindmapGeometry } from './types.js';

export { mindPreset, mindPresets, type MindPresets } from './mind-presets.js';

/** Branch widths by the child's depth (1, 2, 3, deeper) for a first-level width of 11. */
const TAPER = [11, 8, 5, 3];
const NO_META: ItemMeta = {};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

interface Item {
  n: MindNode;
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  shape: string;
  section: number;
  /** Branch and underline colour. */
  color: string | undefined;
  lines: string[];
  rich?: TextRun[][];
  textW: number;
  textH: number;
  /** The icon and the image beside the label. */
  deco: Decoration;
  /** An image or icon node's asset and caption (metadata `img` or `icon`, drawn as the flowchart's image node). */
  media?: MediaBox;
  w: number;
  h: number;
  x: number;
  y: number;
  side?: 'l' | 'r' | 'd';
  hidden: boolean;
  /** Folded: how many nodes the badge counts. */
  folded: number;
}

/** The section a node takes: its own metadata `section`, else its parent's, else the code's (Mermaid's rule). */
function sections(model: MindmapModel, meta: (id: string) => ItemMeta): Map<string, number> {
  const out = new Map<string, number>();
  const root = model.root ? model.nodes.get(model.root) : undefined;
  if (!root) return out;
  // `forced`: an ancestor's own section, which its subtree takes
  const stack: [MindNode, number | null][] = [[root, null]];
  while (stack.length) {
    const [n, forced] = stack.pop()!;
    if (out.has(n.id)) continue;
    const v = metaNum(meta(n.id).section);
    const own = v !== undefined && n.depth > 0 ? Math.abs(Math.round(v)) % 12 : null;
    out.set(n.id, own ?? forced ?? n.section);
    for (const c of n.children) {
      const k = model.nodes.get(c);
      if (k) stack.push([k, own ?? forced]);
    }
  }
  return out;
}

export function renderMindmap(model: MindmapModel, env: RenderEnv): SubResult {
  const { ctx, theme: T, meta, opts } = env;
  const MT = T.mindmap;
  const P = mindPresets(T, meta);
  const family = T.font;
  const m = (id: string): ItemMeta => meta.nodes?.[id] ?? NO_META;
  const hiddenSet = hiddenOf(opts, 'node');
  const wrapW = model.maxNodeWidth;

  const kit = lazyKit();
  // Mermaid reads every mindmap label as markdown: emphasis and icon tokens need runs, plain text does not
  const needsRuns = (label: string): boolean =>
    /[*_]/.test(label) || (label.includes(':') && [...label.matchAll(ICON_TOKEN)].some((t) => ctx.icons.resolve(t[2]!, 'token') !== null));

  // folded subtrees and nodes hidden by layers (a hidden node hides its subtree)
  const hiddenNodes = new Set<string>(), folded = new Set<string>(), inFold = new Set<string>();
  for (const n of model.nodes.values()) {
    if (hiddenSet.has(n.id) && !hiddenNodes.has(n.id)) for (const d of [n.id, ...descendantsOf(model, n.id)]) hiddenNodes.add(d);
    if (m(n.id).collapsed === true && n.children.length && !inFold.has(n.id)) {
      folded.add(n.id);
      for (const d of descendantsOf(model, n.id)) inFold.add(d);
    }
  }
  const sec = sections(model, m);

  const items = new Map<string, Item>();
  for (const n of model.nodes.values()) {
    if (inFold.has(n.id)) continue;
    const nm = m(n.id);
    const isRoot = n.id === model.root;
    const preset = mindPreset(n, meta, P);
    const pst = presetOf(P.node, preset);
    const section = sec.get(n.id) ?? 0;
    const S = MT.sections[String(Math.max(0, section) % 12)] ?? {};
    const shape = shapeDef(str(nm.shape) || pst?.shape || (n.shape !== 'mm-default' ? n.shape : isRoot ? MT.root.shape || 'rounded' : 'mm-default')).id;
    const plain = shape === 'mm-default';
    // the section's colours: a filled shape takes fill, text and border; an underlined label only the line's colour
    const look = isRoot ? null : plain ? { color: S.color } : { fill: S.fill, text: S.text, stroke: S.color, color: S.color };
    const st = mergeStyle(ctx, isRoot ? MT.root : MT.node, MT.nodeShapes?.[shape], look, baseStyle(meta, 'node'), pst, pickStyle(nm));
    st.shape = shape;
    const fs = st.fontSize ?? 16;
    const fnt = font(fs, st.fontWeight, st.fontFamily || family);
    const line = n.line;
    /** The label's lines at `maxW`: plain, or runs (markdown, icon tokens). */
    const labelAt = (label: string, color: string | undefined, maxW: number): { lines: string[]; w: number; rich?: TextRun[][] } => {
      const k = needsRuns(label) ? kit() : null;
      const runs = k ? k.labelRuns(label, { markdown: true, icons: k.iconResolver(ctx, color, fs, { diagnostics: env.diagnostics, line }), iconSize: fs }) : null;
      if (k && runs) {
        const r = k.wrapRuns(runs, maxW, fnt, ctx.measure);
        const out: { lines: string[]; w: number; rich?: TextRun[][] } = { lines: r.map(k.runsText), w: k.runsBlockWidth(r, fnt, ctx.measure) };
        if (k.richLines(r)) out.rich = r;
        return out;
      }
      const lines = wrap(label, maxW, fnt, ctx.measure);
      return { lines, w: textBlockWidth(lines, fnt, ctx.measure) };
    };
    // an image or icon node (metadata `img` or `icon`): the picture or the icon is the node, its label the caption, as
    // the flowchart's image node
    const src = metaMediaSource(nm);
    if (src) {
      const kind = src.img != null ? 'image' : 'icon';
      st.shape = kind;
      const { box, caption, w, h } = mediaLayout(env, kit(), src, {}, fs, wrapW, st.text, line, (cw) => labelAt(n.label, st.text, cw));
      const it: Item = {
        n, m: nm, st, preset, shape: kind, section, color: st.color, lines: caption.lines, textW: caption.w, textH: caption.lines.length * fs * 1.3,
        deco: decoration(ctx, kit, { label: '', meta: {}, fontSize: fs, color: st.text }), media: box, w, h, x: 0, y: 0,
        hidden: hiddenNodes.has(n.id), folded: folded.has(n.id) ? descendantsOf(model, n.id).length : 0,
      };
      if (caption.rich) it.rich = caption.rich;
      items.set(n.id, it);
      continue;
    }
    // `::icon(…)` above the label; a leading token where `iconPos` puts it
    const deco = decoration(ctx, kit, { label: n.label, meta: nm, fontSize: fs, color: st.text, icon: n.icon ? { written: n.icon, form: 'class' } : null });
    const L = labelAt(deco.label, deco.inlineColor ?? st.text, wrapW);
    const lines = L.lines, textW = L.w, rich = L.rich;
    const textH = lines.length * fs * 1.3;
    const block = decoratedSize(deco, { w: textW, h: textH });
    let w = block.w + (st.padX ?? 10) * 2, h = block.h + (st.padY ?? 6) * 2;
    const def = shapeDef(shape);
    if (!plain && def.fit) ({ w, h } = def.fit(w, h));
    w = Math.max(st.minW ?? 0, metaNum(nm.w) ?? w);
    h = Math.max(st.minH ?? 0, metaNum(nm.h) ?? h);
    const it: Item = {
      n, m: nm, st, preset, shape, section, color: st.color, lines, textW, textH, deco, w, h, x: 0, y: 0,
      hidden: hiddenNodes.has(n.id), folded: folded.has(n.id) ? descendantsOf(model, n.id).length : 0,
    };
    if (rich) it.rich = rich;
    items.set(n.id, it);
  }

  // ---- layout
  const mode: TreeMode = meta.canvas.mindLayout === 'right' || meta.canvas.mindLayout === 'down' ? meta.canvas.mindLayout : 'both';
  const tree = new Map<string, TreeNode>();
  for (const [id, it] of items) {
    const t: TreeNode = { id, w: it.w, h: it.h, children: it.n.children.filter((c) => items.has(c)) };
    const side = it.m.side;
    if (it.n.depth === 1 && (side === 'l' || side === 'r')) t.side = side;
    const dx = metaNum(it.m.dx), dy = metaNum(it.m.dy);
    if (dx) t.dx = dx;
    if (dy) t.dy = dy;
    tree.set(id, t);
  }
  const down = mode === 'down';
  const lo = model.root ? layoutTree(model.root, tree, { mode, levelGap: down ? 44 : 60, siblingGap: down ? 18 : 10, branchGap: down ? 28 : 20, ...(ctx.layoutCache ? { cache: ctx.layoutCache } : {}) }) : { pos: new Map<string, Point>(), side: new Map<string, 'l' | 'r' | 'd'>() };
  for (const [id, it] of items) {
    const p = lo.pos.get(id);
    if (p) {
      it.x = p.x;
      it.y = p.y;
    }
    const s = lo.side.get(id);
    if (s) it.side = s;
  }

  // ---- branches
  const first = (MT.branch.width ?? 11) / 11;
  const branchNodes: SceneNode[] = [];
  const branches = new Map<string, string>();
  /** Where a branch leaves a node (`out`) or reaches it: an edge's middle, or an underline's end. */
  const anchor = (it: Item, side: 'l' | 'r' | 'd', out: boolean): Point => {
    // an image or icon node: on the asset's frame (past the caption on its side), as a flowchart connector
    if (it.media) {
      const dir = side === 'd' ? (out ? 1 : -1) : (side === 'r') === out ? 1 : -1;
      const p = side === 'd' ? { x: it.x, y: it.y + (dir * it.h) / 2, n: { x: 0, y: dir } } : { x: it.x + (dir * it.w) / 2, y: it.y + it.media.dy, n: { x: dir, y: 0 } };
      return mediaPort(it, it.media, it.lines.length > 0, p);
    }
    const plain = it.shape === 'mm-default';
    if (side === 'd') {
      const dir = out ? 1 : -1;
      const p = { x: it.x, y: it.y + (dir * it.h) / 2, n: { x: 0, y: dir } };
      return plain ? p : onOutline(shapeDef(it.shape), it, p);
    }
    const dir = (side === 'r') === out ? 1 : -1;
    const p = { x: it.x + (dir * it.w) / 2, y: plain ? it.y + it.h / 2 : it.y, n: { x: dir, y: 0 } };
    // a shape's own outline (a cloud, a circle) rather than its box
    return plain ? p : onOutline(shapeDef(it.shape), it, p);
  };
  for (const [id, it] of items) {
    const p = it.n.parent ? items.get(it.n.parent) : undefined;
    if (!p || !it.side || it.hidden) continue;
    const a = anchor(p, it.side, true), b = anchor(it, it.side, false);
    const d = it.side === 'd'
      ? `M${fmt(a.x)},${fmt(a.y)} C${fmt(a.x)},${fmt((a.y + b.y) / 2)} ${fmt(b.x)},${fmt((a.y + b.y) / 2)} ${fmt(b.x)},${fmt(b.y)}`
      : `M${fmt(a.x)},${fmt(a.y)} C${fmt((a.x + b.x) / 2)},${fmt(a.y)} ${fmt((a.x + b.x) / 2)},${fmt(b.y)} ${fmt(b.x)},${fmt(b.y)}`;
    branches.set(id, d);
    const width = Math.max(1, TAPER[Math.min(it.n.depth, TAPER.length) - 1]! * first);
    branchNodes.push(itemGroup('node', id, 'branch', [el('path', { d, fill: 'none', stroke: it.color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-opacity': it.st.strokeOpacity })], { 'data-part': 'branch' }, 'branch'));
  }

  // ---- nodes
  /** A folded subtree: +N on the node's outer side. */
  const foldBadge = (it: Item, box: { x: number; y: number; w: number; h: number }): SceneNode[] => {
    if (!it.folded) return [];
    const tl = `+${it.folded}`;
    const tw = ctx.measure.width(tl, font(11, 700, family)) + 12;
    const side = it.side ?? 'r';
    const bx = side === 'd' ? box.x : side === 'l' ? box.x - box.w / 2 - 6 - tw / 2 : box.x + box.w / 2 + 6 + tw / 2;
    const by = side === 'd' ? box.y + box.h / 2 + 12 : box.y;
    return [
      el('rect', { class: 'mm-fold', x: bx - tw / 2, y: by - 9, width: tw, height: 18, rx: 9, fill: it.color ?? it.st.text, stroke: env.paper, 'stroke-width': 1.5 }),
      text({ 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': family, 'font-size': 11, 'font-weight': 700, fill: env.paper }, [{ text: tl, x: bx, y: by }]),
    ];
  };
  const nodeNodes: SceneNode[] = [];
  for (const [id, it] of items) {
    if (it.hidden) continue;
    const { st } = it;
    const href = itemLink(ctx, it.m.link);
    const fs = st.fontSize ?? 16;
    const box = { x: it.x, y: it.y, w: it.w, h: it.h };
    const parts: SceneNode[] = [];
    if (it.media) {
      // an image or icon node: the asset, then its caption
      const src = metaMediaSource(it.m)!;
      parts.push(...mediaAssetNodes(env, kit(), box, it.media, src, st, { key: `node-${id}`, family, line: it.n.line, source: 'meta' }));
      if (it.lines.some((l) => l)) {
        const cy = captionY(box, it.media);
        const to = { size: fs, weight: st.fontWeight, color: href ? LINK_COLOR : st.text, family: st.fontFamily || family, lh: 1.3, underline: !!href };
        const K = it.rich ? kit() : null;
        parts.push(...withLink(href, it.rich && K ? (K as MediaKit).richText(it.rich, box.x, cy, { ...to, measure: ctx.measure }) : [textBlock(it.lines, box.x, cy, to)]));
      }
      parts.push(...foldBadge(it, box));
      nodeNodes.push(itemGroup('node', id, `mm-node mm-${it.media.kind}${it.n.id === model.root ? ' mm-root' : ''}`, parts, { ...linkAttr(href), ...(it.folded ? { 'data-folded': it.folded } : {}) }));
      continue;
    }
    if (it.shape === 'mm-default') {
      // the label over an underline (a transparent box keeps the whole node clickable)
      // a fill of its own (a preset, the node's style) draws a box behind the label
      const own = it.m.fill ?? presetOf(P.node, it.preset)?.fill;
      parts.push(el('rect', { x: box.x - box.w / 2, y: box.y - box.h / 2, width: box.w, height: box.h, rx: own ? st.radius ?? 8 : undefined, fill: own ? st.fill : 'transparent', stroke: 'none' }));
      const y = box.y + box.h / 2;
      parts.push(el('path', { d: `M${fmt(box.x - box.w / 2)},${fmt(y)} L${fmt(box.x + box.w / 2)},${fmt(y)}`, stroke: it.color, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }));
    } else parts.push(...stackedShapeNodes(it.shape, box, st));
    // the content: the image, the icon and the label, centred as one block
    const tb = { w: it.textW, h: it.textH };
    const D = decorate(env, kit, it.deco, box.x, box.y - decoratedSize(it.deco, tb).h / 2, tb, { key: id, line: it.n.line, family, ...(st.text ? { color: st.text } : {}) });
    parts.push(...D.nodes);
    const { x: tx, y: ty } = D.contentBox;
    const to = { size: fs, weight: st.fontWeight, color: href ? LINK_COLOR : st.text, family: st.fontFamily || family, underline: !!href };
    const K = it.rich ? kit() : null;
    const label = it.rich && K ? (K as MediaKit).richText(it.rich, tx, ty, { ...to, measure: ctx.measure }) : [textBlock(it.lines, tx, ty, to)];
    if (it.lines.some((l) => l)) parts.push(...withLink(href, label));
    parts.push(...foldBadge(it, box));
    nodeNodes.push(itemGroup('node', id, `mm-node${it.n.id === model.root ? ' mm-root' : ''}`, parts, { ...linkAttr(href), ...(it.folded ? { 'data-folded': it.folded } : {}) }));
  }

  // ---- bounds and geometry
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items.values()) {
    if (it.hidden) continue;
    const extra = it.folded ? 50 : 0;
    x0 = Math.min(x0, it.x - it.w / 2 - (it.side === 'l' ? extra : 0));
    x1 = Math.max(x1, it.x + it.w / 2 + (it.side !== 'l' && it.side !== 'd' ? extra : 0));
    y0 = Math.min(y0, it.y - it.h / 2);
    y1 = Math.max(y1, it.y + it.h / 2 + (it.side === 'd' && it.folded ? 24 : 0));
  }
  if (x0 === Infinity) {
    x0 = 0;
    y0 = 0;
    x1 = 400;
    y1 = 300;
  }
  const pad = env.pad + 20;
  const geom: MindmapGeometry = {
    type: 'mindmap',
    root: model.root,
    branches,
    nodes: new Map(
      [...items].map(([id, it]) => {
        const b: MindmapGeometry['nodes'] extends Map<string, infer V> ? V : never = { x: it.x, y: it.y, w: it.w, h: it.h, depth: it.n.depth, parent: it.n.parent, section: it.section, hidden: it.hidden };
        if (it.side) b.side = it.side;
        if (it.media) b.asset = assetBox(it, it.media);
        else if (it.shape !== 'mm-default') b.shape = it.shape;
        return [id, b];
      }),
    ),
  };
  return {
    defs: [],
    body: [...branchNodes, ...nodeNodes],
    bounds: { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 },
    geom,
    presetsUsed: { node: countBy([...items.values()].map((x) => x.preset || '(none)')) },
  };
}
