// ER renderer: entity cards (compact "title + attribute list" or table), crow's-foot relations (prototype
// render/er.js), and since T11: Mermaid's classes and styles on entities (`classDef`, `class`, `:::`, `style`,
// `classDef default`; a class that names a preset gives the entity that preset, as in the flowchart), aliases drawn
// as markdown (bold and italic runs through the media kit, a lazy chunk; plain text without it), a relationship to
// itself as a loop with both cardinality markers, its label and its line, the title above the diagram and the SVG's
// `<title>` / `<desc>`. Subgraphs (11.17+, T11.6) are laid out with the compound layout (T07: each subgraph in its own
// direction, Mermaid's rule for it) and drawn as the flowchart draws its subgraphs; relationships between auto-placed
// ends go around the subgraphs that hold neither end. A diagram without subgraphs keeps the earlier layered layout.
import { a11yOf, Bounds, depthOf, EMPTY_META, hiddenGroups, str } from '../../render/graph-kit.js';
import { diagramTitle } from '../../render/title.js';
import { containerBox, crossedOf, edgeLabel, edgeStroke, groupFrame, mediaKitOnce, placeAuto, placedContainer, placePorts, rectOf, routeAroundScopes, withinOf, type Ports } from '../../render/graph-scene.js';
import { ancestorsOf, layoutCompound, type CompoundContainer, type CompoundEdge, type CompoundNode, type CompoundResult } from '../../layout/compound.js';
import { layered, type LayoutEdge, type LayoutNode } from '../../layout/layered.js';
import type { MediaKit } from '../../media/kit.js';
import type { AttrHighlight, ItemMeta } from '../../meta/types.js';
import type { Direction, Entity, ErGroup, ErModel, ErRel, MermaidStyle } from '../../model.js';
import { el, text } from '../../scene/build.js';
import type { SceneNode, SvgAttrs, TextRun } from '../../scene/types.js';
import type { StyleProps } from '../../style.js';
import { textBlockWidth } from '../../text/wrap.js';
import type { CenterBox, Rect } from '../../types.js';
import type { SafeUrl } from '../../validate.js';
import { baseStyle, byLine, cachedLayout, countBy, crowFoot, edgePath, firstLine, font, hiddenOf, itemGroup, itemLink, LINK_COLOR, linkAttr, mergeStyle, metaNum, metaPoints, outerBox, pickStyle, presetOf, stackedShapeNodes, textBlock, withLink } from '../../render/common.js';
import { type RenderEnv, type SubResult } from '../../render/types.js';
import type { BoxGeom, EdgeGeom, ErGeometry, Port, RenderContext } from '../../render/types.js';
import { dashAttrs } from '../../shapes/dash.js';
import { attrLook, entityPreset, erGroupPreset, erPresets, highlight, relPreset } from './presets.js';
import { maxOf } from '../../geom.js';

export { ATTR_PRESETS, attrLook, entityPreset, erGroupPreset, erPresets, relPreset, type ErPresets } from './presets.js';

const ENTITY_KEYS = ['mode', 'showTypes', 'showComments', 'pkUnderline', 'attrSize', 'attrColor', 'maxW', 'minW'];

/** A Mermaid style on an entity: `color` colours its title and attributes; font sizes stay the card's. */
const entityCode = (s: MermaidStyle | undefined): StyleProps | undefined => {
  if (!s) return undefined;
  const { fontSize: _f, interpolate: _i, ...rest } = s;
  return (s.text ? { ...rest, attrColor: s.text } : rest) as StyleProps;
};
/** A Mermaid style on a subgraph: `color` colours its title. */
const groupCode = (s: MermaidStyle | undefined): StyleProps | undefined => {
  if (!s) return undefined;
  const { fontSize: _f, interpolate: _i, text: c, ...rest } = s;
  return (c ? { ...rest, titleColor: c } : rest) as StyleProps;
};

interface Title {
  lines: string[];
  /** Runs of a markdown alias (bold, italic), when the media kit is there. */
  rich?: TextRun[][];
}

interface Card {
  w: number;
  h: number;
  /** Height of the title section (from the top); the attributes are below it. */
  head: number;
  rows?: { name: string; y: number; h: number; add?: boolean }[];
  draw(cx: number, cy: number): SceneNode[];
}

interface Ent extends CenterBox, Card {
  e: Entity;
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  hidden: boolean;
  auto?: boolean;
  href: SafeUrl | null;
}

interface GroupItem {
  g: ErGroup;
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  title: Title | null;
  titleW: number;
  box: CenterBox & { fixed?: boolean };
  depth: number;
}

const pos = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
const across = (d: Direction): boolean => d === 'LR' || d === 'RL';

export function renderER(model: ErModel, env: RenderEnv): SubResult {
  const { ctx, theme: T, meta, opts } = env;
  const E = T.er;
  const P = erPresets(T, meta);
  const family = T.font;
  const hidden = { entity: hiddenOf(opts, 'entity'), rel: hiddenOf(opts, 'rel'), group: hiddenOf(opts, 'group') };
  const tableView = new Set(opts.tableView ?? []);

  // markdown aliases draw through the media kit (a lazy chunk), asked for only when an alias needs it
  const { kit, given } = mediaKitOnce();
  /** A title's lines: an alias with markdown emphasis as runs (Mermaid draws ER aliases as markdown), else plain. */
  const titleOf = (text: string, markdown: boolean, size: number, weight: number | string | undefined, fam: string): Title => {
    const lines = text.split('\n');
    if (!markdown || !/[*_]/.test(text)) return { lines };
    const k = kit();
    const runs = k?.labelRuns(text, { markdown: true });
    if (!k || !runs) return { lines };
    const r = k.wrapRuns(runs, 0, font(size, weight, fam), ctx.measure);
    return k.richLines(r) ? { lines: r.map(k.runsText), rich: r } : { lines };
  };
  const titleWidth = (t: Title, size: number, weight: number | string | undefined, fam: string): number =>
    t.rich && given() ? given()!.runsBlockWidth(t.rich, font(size, weight, fam), ctx.measure) : textBlockWidth(t.lines, font(size, weight, fam), ctx.measure);

  // ---- hidden by layers: a hidden subgraph hides what is in it
  const groupHidden = hiddenGroups(model.groups, hidden.group);

  // ---- entities: styles (theme < diagram base < preset < `classDef default` < classes < `style` < own) and cards
  const defaultClass = model.classDefs['default'];
  const ents = new Map<string, Ent>();
  for (const e of model.entities.values()) {
    const m = meta.entities?.[e.id] ?? EMPTY_META;
    const preset = entityPreset(e, meta, P);
    const classes = e.classes.filter((c) => !presetOf(P.entity, c) && c !== 'default').map((c) => entityCode(model.classDefs[c]));
    const st = mergeStyle(ctx, E.entity, baseStyle(meta, 'entity'), presetOf(P.entity, preset), entityCode(defaultClass), ...classes, entityCode(e.style), pickStyle(m, ENTITY_KEYS));
    const href = itemLink(ctx, m.link);
    const fam = st.fontFamily || family;
    const editing = tableView.has(e.id);
    const title = titleOf(e.label, e.alias !== undefined, st.titleSize ?? 16, st.titleWeight, fam);
    const card = st.mode === 'table' || editing ? tableLayout(ctx, e, st, m, fam, href, title, given(), editing) : compactLayout(ctx, e, st, m, fam, href, title, given());
    const x = metaNum(m.x), y = metaNum(m.y);
    const isHidden = hidden.entity.has(e.id) || (!!e.parent && groupHidden.has(e.parent));
    ents.set(e.id, { e, m, st, preset, ...card, x: x ?? NaN, y: y ?? NaN, hidden: isHidden, href });
  }

  // ---- subgraphs: styles and titles (their boxes come from the layout)
  const depth = depthOf(model.groups);
  const groups = new Map<string, GroupItem>();
  for (const gr of model.groups.values()) {
    const gm = meta.groups?.[gr.id] ?? EMPTY_META;
    const preset = erGroupPreset(gr, meta, P);
    const classes = gr.classes.filter((c) => !presetOf(P.group, c) && c !== 'default').map((c) => groupCode(model.classDefs[c]));
    const st = mergeStyle(ctx, T.flowchart.group, baseStyle(meta, 'group'), presetOf(P.group, preset), ...classes, groupCode(gr.style), pickStyle(gm));
    const size = st.titleSize ?? 14, fam = st.fontFamily || family;
    const title = gr.label.trim() && size > 0 ? titleOf(gr.label, true, size, st.titleWeight, fam) : null;
    groups.set(gr.id, { g: gr, m: gm, st, preset, title, titleW: title ? titleWidth(title, size, st.titleWeight, fam) : 0, box: { x: NaN, y: NaN, w: 0, h: 0 }, depth: depth(gr.id) });
  }

  // ---- auto layout: the compound layout with subgraphs, else the layered layout of the earlier renderer. A table
  // with a relationship to itself takes the room of its loop and label (beside it, or below it left to right).
  const loopRoom = new Map<string, number>();
  for (const r of model.rels) {
    if (r.from !== r.to || hidden.rel.has(r.id) || !ents.has(r.from)) continue;
    const st = mergeStyle(ctx, E.rel, baseStyle(meta, 'rel'), presetOf(P.rel, relPreset(r, meta)), pickStyle(meta.rels?.[r.id] ?? EMPTY_META));
    const size = st.labelSize ?? 13, lines = r.label && !opts.hideLabels ? r.label.split('\n') : [];
    const lw = textBlockWidth(lines, font(size, 400, st.fontFamily || family), ctx.measure);
    loopRoom.set(r.from, Math.max(loopRoom.get(r.from) ?? 0, 62 + (across(model.direction) ? (lines.length ? lines.length * size * 1.25 + 4 : 0) : lw + 4)));
  }
  const layoutSize = (x: Ent): { w: number; h: number } => {
    const room = loopRoom.get(x.e.id) ?? 0;
    return across(model.direction) ? { w: x.w, h: x.h + 2 * room } : { w: x.w + 2 * room, h: x.h };
  };
  const CR = model.groups.size ? erCompoundLayout(model, ctx, ents, groups, layoutSize) : null;
  const missing = [...ents.values()].filter((x) => Number.isNaN(x.x) || Number.isNaN(x.y));
  if (!CR && missing.length) {
    const ln: LayoutNode[] = missing.map((x) => ({ id: x.e.id, ...layoutSize(x), path: [] }));
    const le: LayoutEdge[] = model.rels.map((r) => ({ from: r.from, to: r.to, minlen: 1 }));
    const lo = { dir: model.direction, rankSep: 90, nodeSep: 60 };
    const pos = cachedLayout(ctx, ln, le, lo, () => layered(ln, le, lo));
    let maxY = -Infinity;
    for (const x of ents.values()) if (!Number.isNaN(x.x) && !Number.isNaN(x.y)) maxY = Math.max(maxY, x.y + x.h / 2);
    const dy = maxY > -Infinity ? maxY + 80 : 0;
    for (const x of missing) {
      const p = pos.get(x.e.id) ?? { x: 0, y: 0 };
      x.x = p.x;
      x.y = p.y + dy;
      x.auto = true;
    }
  }

  // ---- relations: to entities and to subgraphs (their frames)
  const boxOf = (id: string): CenterBox | undefined => {
    const en = ents.get(id);
    if (en) return outerBox(en, en.st.stack);
    const G = groups.get(id);
    return G && Number.isFinite(G.box.x) ? G.box : undefined;
  };
  const endHidden = (id: string): boolean => !!ents.get(id)?.hidden || groupHidden.has(id);
  const rels: RelItem[] = [];
  for (const r of model.rels) {
    const m = meta.rels?.[r.id] ?? EMPTY_META;
    const preset = relPreset(r, meta);
    const st = mergeStyle(ctx, E.rel, baseStyle(meta, 'rel'), presetOf(P.rel, preset), pickStyle(m), str(m.routing) ? { routing: m.routing } : null);
    const a = boxOf(r.from), b = boxOf(r.to);
    if (!a || !b) continue;
    rels.push({ e: r, m, st, preset, hidden: endHidden(r.from) || endHidden(r.to) || hidden.rel.has(r.id), points: metaPoints(m.points), a, b });
  }
  const vis = rels.filter((x) => !x.hidden && x.e.from !== x.e.to);
  const routed = new Map<string, [number, number][]>();
  const bendsOf = (x: RelItem): [number, number][] => (x.points.length ? x.points : routed.get(x.e.id) ?? x.points);
  const autoEnd = (id: string): boolean => (ents.get(id) ? !!ents.get(id)!.auto : !!CR?.containers.get(id)?.auto);
  const place = (): Ports => placePorts(vis, routed, CR, autoEnd, CR ? { spacing: 26, prefer: across(model.direction) ? 'h' : 'v' } : { spacing: 26 });
  let ports = place();
  const routingOf = (x: RelItem): string => (meta.canvas.routing && !x.m.routing ? meta.canvas.routing : x.st.routing ?? 'curved');
  /**
   * A relationship to itself (E5): a loop with a marker at each end, on the right side of the table, or below it when
   * the diagram runs left to right (where the next table is on the right).
   */
  const loopOf = (x: RelItem): { pa: Port; pb: Port; pts: [number, number][] } => {
    const b = x.a;
    if (across(model.direction)) {
      const dx = Math.min(14, b.w / 4), by = b.y + b.h / 2;
      return {
        pa: { x: b.x - dx, y: by, n: { x: 0, y: 1 } }, pb: { x: b.x + dx, y: by, n: { x: 0, y: 1 } },
        pts: x.points.length ? x.points : [[b.x - dx - 22, by + 56], [b.x + dx + 22, by + 56]],
      };
    }
    const dy = Math.min(14, b.h / 4), rx = b.x + b.w / 2;
    return {
      pa: { x: rx, y: b.y - dy, n: { x: 1, y: 0 } }, pb: { x: rx, y: b.y + dy, n: { x: 1, y: 0 } },
      pts: x.points.length ? x.points : [[rx + 56, b.y - dy - 22], [rx + 56, b.y + dy + 22]],
    };
  };
  if (CR) routeErRels(CR, { groups, groupHidden, ents, vis, routed, autoEnd, routingOf, ports, replacePorts: () => (ports = place()) });

  const relNodes: SceneNode[] = [], labelNodes: SceneNode[] = [], entNodes: SceneNode[] = [];
  const relGeom = new Map<string, EdgeGeom>();
  for (const x of rels) {
    if (x.hidden) continue;
    const { e: r, m, st } = x;
    let pa: Port, pb: Port, pts: readonly (readonly [number, number])[];
    if (r.from === r.to) {
      ({ pa, pb, pts } = loopOf(x));
    } else {
      const p = ports.get(r.id);
      if (!p) continue;
      pa = p.a;
      pb = p.b;
      pts = bendsOf(x);
    }
    const path = edgePath(pa, pb, { routing: routingOf(x), curve: st.curve, points: pts });
    const width = st.width ?? 1;
    relNodes.push(edgeStroke('rel', r.id, 'rel', r, { d: path.d, fill: 'none', stroke: st.color, 'stroke-width': width, 'stroke-opacity': st.strokeOpacity, ...(r.identifying ? {} : dashAttrs(st.dash, width)) }, [
      ...crowFoot(pa, r.fromCard, st.color, width, env.paper),
      ...crowFoot(pb, r.toCard, st.color, width, env.paper),
    ]));
    let labelBox: BoxGeom | null = null;
    if (r.label && !opts.hideLabels) {
      const lp = path.at(metaNum(m.labelAt) ?? (r.from === r.to ? 0.5 : 1 - (st.labelAt ?? 0.18)));
      const lines = r.label.split('\n');
      const size = st.labelSize ?? 13;
      const href = itemLink(ctx, m.link);
      const lw = textBlockWidth(lines, font(size, 400, st.fontFamily || family), ctx.measure);
      // a loop's label sits outside it, past its far side
      const loop = r.from === r.to && metaNum(m.labelAt) === undefined;
      const below = loop && across(model.direction);
      const cx = lp.x + (metaNum(m.labelDx) || 0) + (loop && !below ? 4 + lw / 2 : 0);
      const ly = lp.y + (metaNum(m.labelDy) || 0) + (below ? 4 + (lines.length * size * 1.25) / 2 : 0);
      const lo = { size, color: href ? LINK_COLOR : st.labelColor ?? undefined, family: st.fontFamily || family, weight: st.fontWeight || 400, halo: env.paper, underline: !!href };
      labelNodes.push(edgeLabel('rel', r.id, { lines }, cx, ly, lo, href, ctx, given));
      labelBox = { x: cx, y: ly, w: lw, h: lines.length * size * 1.25 };
    }
    const auto = routed.get(r.id);
    relGeom.set(r.id, { a: pa, b: pb, label: labelBox, points: x.points, mids: auto && !x.points.length ? [path.at(0.5)] : path.mids, d: path.d });
  }

  // ---- subgraph frames, outer first
  const groupNodes = drawErFrames(groups, groupHidden, ctx, family, given);

  const lineOf = (x: Ent): number => firstLine(x.e.defLine, x.e.lines);
  // a table being edited (table view, larger than its card) is drawn over its neighbours
  const order = (a: [string, Ent], b: [string, Ent]): number => Number(tableView.has(a[0])) - Number(tableView.has(b[0])) || byLine(lineOf(a[1]), lineOf(b[1]));
  for (const [id, x] of [...ents].sort(order)) {
    if (x.hidden) continue;
    entNodes.push(itemGroup('entity', id, 'entity', [...stackedShapeNodes('rect', x, x.st), ...x.draw(x.x, x.y)], linkAttr(x.href)));
  }

  const box = new Bounds();
  const grow = (b: CenterBox): void => box.grow(b);
  for (const x of ents.values()) if (!x.hidden) grow(x);
  for (const G of groups.values()) if (!groupHidden.has(G.g.id)) grow(G.box);
  // loops reach out of their entity's box (with their labels)
  for (const x of rels)
    if (!x.hidden && x.e.from === x.e.to) {
      const ge = relGeom.get(x.e.id);
      if (ge?.d) {
        const L = loopOf(x);
        for (const t of [0.25, 0.5, 0.75]) grow({ ...edgePath(L.pa, L.pb, { routing: routingOf(x), curve: x.st.curve, points: L.pts }).at(t), w: 2, h: 2 });
      }
      if (ge?.label) grow(ge.label);
    }
  const pad = env.pad + 20;
  const bounds: Rect = box.rect(pad);
  // the title (frontmatter, or a `title` statement), above the diagram
  const titleNodes = diagramTitle(bounds, model.title, ctx, family, pad);

  const geom: ErGeometry = {
    type: 'er',
    entities: new Map(
      [...ents].map(([id, x]) => {
        const b: BoxGeom & { head?: number; rows?: { name: string; y: number; h: number; add?: boolean }[]; auto?: boolean } = { x: x.x, y: x.y, w: x.w, h: x.h, head: x.head, stack: x.st.stack, hidden: x.hidden };
        if (x.rows) b.rows = x.rows.map((r) => ({ ...r, y: x.y - x.h / 2 + r.y }));
        if (CR && x.auto) b.auto = true;
        return [id, b];
      }),
    ),
    rels: relGeom,
    groups: new Map([...groups].map(([id, G]) => [id, { x: G.box.x, y: G.box.y, w: G.box.w, h: G.box.h, stack: G.st.stack, fixed: !!G.box.fixed, hidden: groupHidden.has(id) }])),
  };
  const presetsUsed: SubResult['presetsUsed'] = {
    entity: countBy([...ents.values()].map((x) => x.preset || '(none)')),
    rel: countBy(rels.map((x) => x.preset || '(none)')),
  };
  if (groups.size) presetsUsed.group = countBy([...groups.values()].map((G) => G.preset || '(none)'));
  const out: SubResult = { defs: [], body: [...titleNodes, ...groupNodes, ...relNodes, ...entNodes, ...labelNodes], bounds, geom, presetsUsed };
  const a11y = a11yOf(model);
  if (a11y) out.a11y = a11y;
  return out;
}

/** Title of a card: link > `__title` highlight (colour, bold, underline; Q7) > style. */
function titleLook(ctx: RenderContext, st: StyleProps, hl: Record<string, AttrHighlight>, href: SafeUrl | null): { color: string | undefined; weight: number | string | undefined; underline: boolean } {
  const t = highlight(hl, '__title');
  return {
    color: href ? LINK_COLOR : ctx.color(t.color) ?? st.text,
    weight: t.bold === true ? 700 : t.bold === false ? 400 : st.titleWeight,
    underline: !!href || t.underline === true,
  };
}

interface Word {
  w: string;
  color: string | undefined;
  bold: boolean;
  underline: boolean;
  italic?: boolean;
  family?: string | undefined;
  size?: number | undefined;
}

// "title + comma separated attributes" card, like hand-made Miro ERDs.
function compactLayout(ctx: RenderContext, e: Entity, st: StyleProps, m: ItemMeta, family: string, href: SafeUrl | null, title: Title, K: MediaKit | null): Card {
  const hl = (m.attrs && typeof m.attrs === 'object' ? m.attrs : {}) as Record<string, AttrHighlight>;
  const words: Word[] = [];
  e.attrs.forEach((a, i) => {
    let t = st.showTypes ? `${a.type} ${a.name}` : a.name;
    if (st.showComments && a.comment) t += ` (${a.comment})`;
    if (i < e.attrs.length - 1) t += ',';
    const h = attrLook(hl, a.name);
    const look: Omit<Word, 'w'> = { color: ctx.color(h.color), bold: h.bold === true, underline: h.underline ?? (!!st.pkUnderline && a.keys.includes('PK')) };
    if (h.italic === true) look.italic = true;
    if (str(h.fontFamily)) look.family = h.fontFamily;
    if (pos(h.fontSize)) look.size = h.fontSize;
    for (const w of t.split(' ')) words.push({ w, ...look });
  });
  const size = st.attrSize ?? 14;
  const padX = st.padX ?? 0, padY = st.padY ?? 0;
  const maxInner = (metaNum(m.w) || st.maxW || 0) - padX * 2;
  const space = ctx.measure.width(' ', font(size, 400, family));
  const ww = (wd: Word): number => ctx.measure.width(wd.w, font(wd.size ?? size, wd.bold ? 700 : 400, wd.family ?? family));
  const lines: { words: Word[]; w: number }[] = [];
  let cur: Word[] = [], cw = 0;
  for (const wd of words) {
    const w = ww(wd);
    if (cur.length && cw + space + w > maxInner) {
      lines.push({ words: cur, w: cw });
      cur = [];
      cw = 0;
    }
    cw += (cur.length ? space : 0) + w;
    cur.push(wd);
  }
  if (cur.length) lines.push({ words: cur, w: cw });
  const look = titleLook(ctx, st, hl, href);
  const titleSize = st.titleSize ?? 16;
  const titleLines = title.lines;
  const rich = title.rich && K ? title.rich : null;
  const tw = rich ? K!.runsBlockWidth(rich, font(titleSize, st.titleWeight, family), ctx.measure) : textBlockWidth(titleLines, font(titleSize, st.titleWeight, family), ctx.measure);
  let inner = Math.max(tw, 0);
  for (const l of lines) inner = Math.max(inner, l.w);
  const w = metaNum(m.w) || Math.max(st.minW ?? 0, inner + padX * 2);
  const lh = size * 1.32, tlh = titleSize * 1.3;
  // a line with a larger attribute font is taller
  const lineH = lines.map((l) => Math.max(size, maxOf(l.words.map((wd) => wd.size ?? size))) * 1.32);
  const even = lineH.every((x) => x === lh);
  const linesH = even ? lines.length * lh : lineH.reduce((a, b) => a + b, 0);
  const h = metaNum(m.h) || padY * 2 + titleLines.length * tlh + linesH;
  return {
    w,
    h,
    head: padY + titleLines.length * tlh,
    draw(cx, cy) {
      const top = cy - h / 2 + padY;
      const to = { size: titleSize, weight: look.weight, color: look.color, family, underline: look.underline };
      const ty = top + (titleLines.length * tlh) / 2;
      const out: SceneNode[] = withLink(href, rich ? K!.richText(rich, cx, ty, { ...to, measure: ctx.measure }) : [textBlock(titleLines, cx, ty, to)]);
      let acc = 0;
      lines.forEach((l, i) => {
        const y = top + titleLines.length * tlh + (even ? lh * (i + 0.5) : acc + lineH[i]! / 2);
        acc += lineH[i]!;
        out.push(...attrLine(l.words, cx, y, l.w, size, family, st.attrColor, space, ww));
      });
      return out;
    },
  };
}

const sameLook = (a: Word, b: Word): boolean =>
  a.color === b.color && a.bold === b.bold && a.underline === b.underline && !!a.italic === !!b.italic && a.family === b.family && a.size === b.size;
const plain = (w: Word): boolean => w.color === undefined && !w.bold && !w.underline && !w.italic && !w.family && !w.size;

/**
 * One line of the compact card. The prototype drew it as one centred `<text>` with a styled `<tspan>` per word; the
 * scene's text node has no styled spans, so a line with highlights becomes one `<text>` per run of equally styled
 * words, placed from the measured widths (the same positions the browser computes for the spans).
 */
function attrLine(
  words: Word[],
  cx: number,
  y: number,
  lineW: number,
  size: number,
  family: string,
  color: string | undefined,
  space: number,
  ww: (w: Word) => number,
): SceneNode[] {
  const base: SvgAttrs = { 'dominant-baseline': 'central', 'font-family': family, 'font-size': size, fill: color };
  if (words.every(plain)) return [text({ 'text-anchor': 'middle', ...base }, [{ text: words.map((w) => w.w).join(' '), x: cx, y }])];
  const out: SceneNode[] = [];
  let x = cx - lineW / 2;
  let i = 0;
  while (i < words.length) {
    const first = words[i]!;
    let j = i + 1;
    while (j < words.length && sameLook(words[j]!, first)) j++;
    const run = words.slice(i, j);
    let rw = 0;
    run.forEach((w, k) => (rw += ww(w) + (k ? space : 0)));
    out.push(
      text(
        {
          'text-anchor': 'start',
          ...base,
          fill: first.color ?? color,
          'font-weight': first.bold ? 700 : undefined,
          'text-decoration': first.underline ? 'underline' : undefined,
          'font-style': first.italic ? 'italic' : undefined,
          'font-family': first.family ?? family,
          'font-size': first.size ?? size,
        },
        [{ text: run.map((w) => w.w).join(' '), x, y }],
      ),
    );
    x += rw + space;
    i = j;
  }
  return out;
}

// Classic table: title bar + type | keys | name (comment) rows; the comment follows the name in brackets. `editing`
// (the editor's attribute editing): every column shown whatever the style hides, row separators and an empty last row
// where a new attribute is typed.
function tableLayout(ctx: RenderContext, e: Entity, st: StyleProps, m: ItemMeta, family: string, href: SafeUrl | null, title: Title, K: MediaKit | null, editing = false): Card {
  const hl = (m.attrs && typeof m.attrs === 'object' ? m.attrs : {}) as Record<string, AttrHighlight>;
  const size = st.attrSize ?? 14, titleSize = st.titleSize ?? 16;
  const rowH = size * 1.9, headH = titleSize * 2.2;
  const showTypes = editing || !!st.showTypes, showComments = editing || !!st.showComments;
  // columns: type, keys, name (its comment after it)
  const KEYS = 1, NAME = 2;
  const cols = e.attrs.map((a) => [showTypes ? a.type : '', a.keys.join(','), a.name]);
  const notes = e.attrs.map((a) => (showComments && a.comment ? `(${a.comment})` : ''));
  // each row's own look (highlights and presets); a larger font makes its row taller
  const looks = e.attrs.map((a) => {
    const l = attrLook(hl, a.name);
    const underline = l.underline ?? (!!st.pkUnderline && a.keys.includes('PK'));
    return { color: ctx.color(l.color), bold: l.bold === true, italic: l.italic === true, underline: underline === true, family: str(l.fontFamily) ?? family, size: pos(l.fontSize) ?? size };
  });
  const weightOf = (i: number, c: number): number => (looks[i]!.bold ? 700 : c === NAME ? 600 : 400);
  const widthOf = (t: string, i: number, weight: number): number => ctx.measure.width(t, font(looks[i]!.size, weight, looks[i]!.family));
  // the name and, after a space, its comment
  const nameW = cols.map((r, i) => (r[NAME] ? widthOf(r[NAME], i, weightOf(i, NAME)) : 0));
  const noteX = (i: number): number => nameW[i]! + widthOf(' ', i, 400);
  const cw = [0, 1, 2].map((c) => {
    let mx = 0;
    cols.forEach((r, i) => {
      const t = r[c];
      const note = c === NAME ? notes[i]! : '';
      if (t || note) mx = Math.max(mx, (c === NAME ? nameW[i]! + (note ? noteX(i) - nameW[i]! + widthOf(note, i, 400) : 0) : widthOf(t!, i, weightOf(i, c))) + 16);
    });
    return mx;
  });
  const rowHs = looks.map((l) => Math.max(size, l.size) * 1.9);
  // equal rows keep the plain arithmetic (sums drift in the last digit)
  const even = rowHs.every((x) => x === rowH);
  const tops: number[] = [];
  let acc = headH;
  for (let i = 0; i < rowHs.length; i++) {
    tops.push(even ? headH + rowH * i : acc);
    acc += rowHs[i]!;
  }
  const bodyH = !cols.length ? rowH : even ? cols.length * rowH : acc - headH;
  const rich = title.rich && K ? title.rich : null;
  const tw = (rich ? K!.runsBlockWidth(rich, font(titleSize, st.titleWeight, family), ctx.measure) : ctx.measure.width(e.label, font(titleSize, st.titleWeight, family))) + 32;
  const addW = editing ? ctx.measure.width('+ attribute', font(size, 400, family)) + 32 : 0;
  const w = metaNum(m.w) || Math.max(st.minW ?? 0, tw, addW, cw.reduce((a, b) => a + b, 0) + 16);
  const need = headH + (editing ? (cols.length ? bodyH : 0) + rowH : bodyH) + 6;
  const h = editing ? Math.max(metaNum(m.h) || 0, need) : metaNum(m.h) || need;
  const look = titleLook(ctx, st, hl, href);
  const addTop = headH + (cols.length ? bodyH : 0);
  const rows: { name: string; y: number; h: number; add?: boolean }[] = e.attrs.map((a, i) => ({ name: a.name, y: tops[i]!, h: rowHs[i]! }));
  if (editing) rows.push({ name: '', y: addTop, h: rowH, add: true });
  return {
    w,
    h,
    head: headH,
    rows,
    draw(cx, cy) {
      const x0 = cx - w / 2, y0 = cy - h / 2;
      const to = { size: titleSize, weight: look.weight, color: look.color, family, underline: look.underline };
      const out: SceneNode[] = withLink(href, rich ? K!.richText(rich, cx, y0 + headH / 2, { ...to, measure: ctx.measure }) : [textBlock([e.label], cx, y0 + headH / 2, to)]);
      out.push(el('line', { x1: x0, y1: y0 + headH, x2: x0 + w, y2: y0 + headH, stroke: st.stroke, 'stroke-width': (st.strokeWidth ?? 1.5) * 0.7 }));
      cols.forEach((r, i) => {
        const L = looks[i]!;
        const y = even ? y0 + headH + rowH * (i + 0.5) + 3 : y0 + tops[i]! + rowHs[i]! / 2 + 3;
        let x = x0 + 8;
        r.forEach((t, c) => {
          if (t)
            out.push(textBlock([t], x + 8, y, {
              size: L.size, weight: weightOf(i, c), color: c === KEYS ? '#6366f1' : L.color ?? st.attrColor, family: L.family, anchor: 'start',
              underline: c === NAME && L.underline, ...(L.italic ? { extra: { 'font-style': 'italic' } } : {}),
            }));
          const note = c === NAME ? notes[i]! : '';
          if (note)
            out.push(textBlock([note], x + 8 + noteX(i), y, {
              size: L.size, weight: 400, color: L.color ?? st.attrColor, family: L.family, anchor: 'start',
              extra: { 'fill-opacity': 0.6, ...(L.italic ? { 'font-style': 'italic' } : {}) },
            }));
          x += cw[c]!;
        });
        if (editing && i > 0) out.push(el('line', { x1: x0 + 6, y1: y0 + tops[i]!, x2: x0 + w - 6, y2: y0 + tops[i]!, stroke: st.stroke, 'stroke-opacity': 0.2, 'stroke-width': 0.7 }));
      });
      if (editing) {
        const ay = y0 + addTop;
        if (cols.length) out.push(el('line', { x1: x0 + 6, y1: ay, x2: x0 + w - 6, y2: ay, stroke: st.stroke, 'stroke-opacity': 0.2, 'stroke-width': 0.7 }));
        out.push(textBlock(['+ attribute'], x0 + 16, ay + rowH / 2 + 3, { size, color: '#94a3b8', family, anchor: 'start', extra: { 'font-style': 'italic' } }));
      }
      return out;
    },
  };
}


interface RelItem {
  e: ErRel;
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  hidden: boolean;
  points: [number, number][];
  a: CenterBox;
  b: CenterBox;
}

/**
 * The compound layout's input (T11.6): entities as nodes (a hand-placed one fixed), subgraphs as containers (a frame
 * placed by hand fixed, a kept top-left after "Reset positions"), relationships as edges (to a subgraph: its frame).
 * A subgraph's `direction` is honoured unless a relationship from outside reaches an entity inside (Mermaid's rule).
 */
function erCompoundLayout(model: ErModel, ctx: RenderEnv['ctx'], ents: ReadonlyMap<string, Ent>, groups: ReadonlyMap<string, GroupItem>, layoutSize: (x: Ent) => { w: number; h: number }): CompoundResult {
  const crossed = crossedOf(model.rels, withinOf((id) => model.entities.get(id)?.parent ?? model.groups.get(id)?.parent ?? null));
  const containers: CompoundContainer[] = [];
  for (const G of groups.values()) {
    const { g: gr, st, title, m: gm } = G;
    const pad = st.pad ?? 14, padTop = st.padTop ?? pad;
    const c: CompoundContainer = { id: gr.id, parent: gr.parent && groups.has(gr.parent) ? gr.parent : null, order: gr.line, pad };
    if (gr.dir && !crossed(gr.id)) c.dir = gr.dir;
    c.title = { w: G.titleW, h: title && st.titleSize ? padTop : pad };
    containers.push(placedContainer(c, gm));
  }
  const cn: CompoundNode[] = [];
  for (const x of ents.values()) {
    const e = x.e;
    const line = firstLine(e.defLine, e.lines);
    const c: CompoundNode = { id: e.id, ...layoutSize(x), parent: e.parent && groups.has(e.parent) ? e.parent : null, order: Number.isFinite(line) ? line : e.order };
    if (Number.isFinite(x.x) && Number.isFinite(x.y)) c.fixed = { x: x.x, y: x.y };
    if (x.hidden) c.hidden = true;
    cn.push(c);
  }
  const ce: CompoundEdge[] = model.rels.filter((r) => r.from !== r.to).map((r) => ({ id: r.id, from: r.from, to: r.to }));
  const R = layoutCompound({ nodes: cn, containers, edges: ce }, { dir: model.direction, rankSep: 90, nodeSep: 60, padding: 14, margin: 60, placedGap: 80, cache: ctx.layoutCache });
  placeAuto(R, ents);
  for (const G of groups.values()) {
    const r = R.containers.get(G.g.id);
    if (r) G.box = containerBox(r, !!(metaNum(G.m.w) && metaNum(G.m.h)));
  }
  return R;
}

/** What routing around subgraphs reads, and how it places the ports again (5.8, R1). */
interface ErRoute {
  groups: ReadonlyMap<string, GroupItem>;
  groupHidden: ReadonlySet<string>;
  ents: ReadonlyMap<string, Ent>;
  vis: readonly RelItem[];
  routed: Map<string, [number, number][]>;
  autoEnd: (id: string) => boolean;
  routingOf: (x: RelItem) => string;
  ports: Ports;
  /** Places the ports again (facing the new bend points) and returns them. */
  replacePorts(): Ports;
}

/**
 * A relationship between auto-placed ends must not cross a subgraph that holds neither end (T07.3, as the flowchart):
 * through the points the layout kept free for it, else around the subgraphs in the way; the ports are placed again
 * facing the first and last bend point. Relationships with bend points of their own are left alone.
 */
function routeErRels(R: CompoundResult, c: ErRoute): void {
  const { groups, groupHidden, ents, vis, autoEnd, routingOf } = c;
  const frames: { id: string; r: Rect }[] = [];
  for (const [id, G] of groups) if (!groupHidden.has(id) && Number.isFinite(G.box.x)) frames.push({ id, r: rectOf(G.box) });
  // tables too: a relationship to a subgraph or across one would otherwise cut through the tables between
  const boxes: { id: string; r: Rect }[] = [];
  for (const [id, x] of ents) if (!x.hidden && Number.isFinite(x.x)) boxes.push({ id, r: rectOf(x) });
  const inGroup = (id: string, gid: string): boolean => groups.has(gid) && (ents.get(id)?.e.parent === gid || ancestorsOf(R.parent, id).includes(gid));
  routeAroundScopes(R, {
    todo: vis.filter((x) => !x.points.length && autoEnd(x.e.from) && autoEnd(x.e.to)),
    frames, boxes, near: () => true, keep: (x, id) => !inGroup(id, x.e.from) && !inGroup(id, x.e.to),
    ends: (_, pp) => [pp.a, pp.b], path: (x) => ({ routing: routingOf(x), curve: x.st.curve }),
    margins: [14, 24], ports: c.ports, replacePorts: c.replacePorts, routed: c.routed,
  });
}

/** The subgraph frames, outer first, with their titles. */
function drawErFrames(groups: ReadonlyMap<string, GroupItem>, groupHidden: ReadonlySet<string>, ctx: RenderEnv['ctx'], family: string, kit: () => MediaKit | null): SceneNode[] {
  const groupNodes: SceneNode[] = [];
  for (const G of [...groups.values()].sort((a, b) => a.depth - b.depth || a.g.order - b.g.order)) {
    if (groupHidden.has(G.g.id) || !Number.isFinite(G.box.x)) continue;
    groupNodes.push(groupFrame({ id: G.g.id, box: G.box, st: G.st, title: G.title && G.st.titleSize ? G.title : null, href: itemLink(ctx, G.m.link), family, cls: 'group' }, ctx, kit));
  }
  return groupNodes;
}
