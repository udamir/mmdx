// ER renderer: entity cards (compact "title + attribute list" or table), crow's-foot relations
// (prototype render/er.js).
import { layered, type LayoutEdge, type LayoutNode } from '../layout/layered.js';
import type { AttrHighlight, DiagramMeta, ItemMeta } from '../meta/types.js';
import type { Entity, ErModel, ErRel } from '../model.js';
import { el, text } from '../scene/build.js';
import type { SceneNode, SvgAttrs } from '../scene/types.js';
import type { StyleProps } from '../style.js';
import type { ResolvedTheme } from '../theme/types.js';
import type { CenterBox } from '../types.js';
import type { SafeUrl } from '../validate.js';
import { fmt } from '../scene/serialize.js';
import {
  assignPorts, baseStyle, byLine, cachedLayout, countBy, crowFoot, edgePath, firstLine, font, haloLabel, hiddenOf, isSide,
  itemGroup, itemLink, LINK_COLOR, linkAttr, mergeStyle, metaNum, metaPoints, outerBox, pickStyle, presetOf, presets,
  sideToward, stackedShapeNodes, textBlock, withLink, type RenderEnv, type SubResult,
} from './common.js';
import type { BoxGeom, EdgeGeom, ErGeometry, RenderContext } from './types.js';

const ENTITY_KEYS = ['mode', 'showTypes', 'showComments', 'pkUnderline', 'attrSize', 'attrColor', 'maxW', 'minW'];

export interface ErPresets {
  entity: Record<string, StyleProps>;
  rel: Record<string, StyleProps>;
}

export function erPresets(T: ResolvedTheme, meta: DiagramMeta): ErPresets {
  return { entity: presets(T.er.entityPresets, meta.styles['entity']), rel: presets(T.er.relPresets, meta.styles['rel']) };
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

const NO_META: ItemMeta = {};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const pos = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** Built-in looks of an attribute; colours are theme palette references, so they follow theme switches. */
export const ATTR_PRESETS: Readonly<Record<string, AttrHighlight>> = {
  key: { bold: true, underline: true },
  foreign: { italic: true, color: '@blue' },
  important: { bold: true, color: '@red' },
  muted: { color: '@grey' },
  note: { italic: true, color: '@slate' },
};

/** An attribute's look (or the title's, `__title`): its preset overridden by its own highlight keys. */
export function attrLook(hl: Readonly<Record<string, AttrHighlight>> | undefined, name: string): AttrHighlight {
  const own = highlight((hl ?? {}) as Record<string, AttrHighlight>, name);
  const p = typeof own.preset === 'string' && Object.hasOwn(ATTR_PRESETS, own.preset) ? ATTR_PRESETS[own.preset] : undefined;
  return p ? { ...p, ...own } : own;
}

export function renderER(model: ErModel, env: RenderEnv): SubResult {
  const { ctx, theme: T, meta, opts } = env;
  const E = T.er;
  const P = erPresets(T, meta);
  const family = T.font;
  const hidden = { entity: hiddenOf(opts, 'entity'), rel: hiddenOf(opts, 'rel') };
  const tableView = new Set(opts.tableView ?? []);

  const ents = new Map<string, Ent>();
  for (const e of model.entities.values()) {
    const m = meta.entities?.[e.id] ?? NO_META;
    const preset = str(m.preset) ?? '';
    const st = mergeStyle(ctx, E.entity, baseStyle(meta, 'entity'), presetOf(P.entity, preset), pickStyle(m, ENTITY_KEYS));
    const href = itemLink(ctx, m.link);
    const fam = st.fontFamily || family;
    const editing = tableView.has(e.id);
    const card = st.mode === 'table' || editing ? tableLayout(ctx, e, st, m, fam, href, editing) : compactLayout(ctx, e, st, m, fam, href);
    const x = metaNum(m.x), y = metaNum(m.y);
    ents.set(e.id, { e, m, st, preset, ...card, x: x ?? NaN, y: y ?? NaN, hidden: hidden.entity.has(e.id), href });
  }

  // auto layout
  const missing = [...ents.values()].filter((x) => Number.isNaN(x.x) || Number.isNaN(x.y));
  if (missing.length) {
    const ln: LayoutNode[] = missing.map((x) => ({ id: x.e.id, w: x.w, h: x.h, path: [] }));
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

  // relations
  interface RelItem {
    r: ErRel;
    m: ItemMeta;
    st: StyleProps;
    preset: string;
    hidden: boolean;
    points: [number, number][];
  }
  const rels: RelItem[] = model.rels.map((r) => {
    const m = meta.rels?.[r.id] ?? NO_META;
    const preset = str(m.preset) ?? '';
    const st = mergeStyle(ctx, E.rel, baseStyle(meta, 'rel'), presetOf(P.rel, preset), pickStyle(m), str(m.routing) ? { routing: m.routing } : null);
    const isHidden = !!ents.get(r.from)?.hidden || !!ents.get(r.to)?.hidden || hidden.rel.has(r.id);
    return { r, m, st, preset, hidden: isHidden, points: metaPoints(m.points) };
  });
  const vis = rels.filter((x) => !x.hidden && x.r.from !== x.r.to && ents.has(x.r.from) && ents.has(x.r.to));
  const ports = assignPorts(
    vis.map((x) => {
      const A = ents.get(x.r.from)!, B = ents.get(x.r.to)!;
      const p0 = x.points[0], pn = x.points[x.points.length - 1];
      return {
        id: x.r.id,
        a: outerBox(A, A.st.stack),
        b: outerBox(B, B.st.stack),
        aKey: x.r.from,
        bKey: x.r.to,
        fromSide: (isSide(x.m.fromSide) ? x.m.fromSide : undefined) || (p0 ? sideToward(A, { x: p0[0], y: p0[1] }) : undefined),
        toSide: (isSide(x.m.toSide) ? x.m.toSide : undefined) || (pn ? sideToward(B, { x: pn[0], y: pn[1] }) : undefined),
        fromAt: metaNum(x.m.fromAt),
        toAt: metaNum(x.m.toAt),
      };
    }),
    { spacing: 26 },
  );

  const relNodes: SceneNode[] = [], labelNodes: SceneNode[] = [], entNodes: SceneNode[] = [];
  const relGeom = new Map<string, EdgeGeom>();
  for (const x of vis) {
    const { r, m, st } = x;
    const p = ports.get(r.id);
    if (!p) continue;
    const routing = meta.canvas.routing && !m.routing ? meta.canvas.routing : st.routing;
    const path = edgePath(p.a, p.b, { routing, curve: st.curve, points: x.points });
    const width = st.width ?? 1;
    relNodes.push(
      itemGroup(
        'rel',
        r.id,
        'rel',
        [
          el('path', { class: 'hit', d: path.d, fill: 'none', stroke: 'transparent', 'stroke-width': 12 }),
          el('path', {
            d: path.d, fill: 'none', stroke: st.color, 'stroke-width': width, 'stroke-opacity': st.strokeOpacity,
            'stroke-dasharray': r.identifying ? undefined : st.dash || undefined,
          }),
          ...crowFoot(p.a, r.fromCard, st.color, width, env.paper),
          ...crowFoot(p.b, r.toCard, st.color, width, env.paper),
        ],
        { 'data-from': r.from, 'data-to': r.to },
      ),
    );
    let labelBox: BoxGeom | null = null;
    if (r.label && !opts.hideLabels) {
      const lp = path.at(metaNum(m.labelAt) ?? 1 - (st.labelAt ?? 0.18));
      const lx = lp.x + (metaNum(m.labelDx) || 0), ly = lp.y + (metaNum(m.labelDy) || 0);
      const lines = r.label.split('\n');
      const size = st.labelSize ?? 13;
      const href = itemLink(ctx, m.link);
      labelNodes.push(
        itemGroup(
          'rel',
          r.id,
          'elabel',
          withLink(href, [
            haloLabel(lines, lx, ly, {
              size, color: href ? LINK_COLOR : st.labelColor ?? undefined, family: st.fontFamily || family, weight: st.fontWeight || 400,
              halo: env.paper, underline: !!href,
            }),
          ]),
          { 'data-part': 'label', ...linkAttr(href) },
          'label',
        ),
      );
      let lw = 0;
      for (const l of lines) lw = Math.max(lw, ctx.measure.width(l, font(size, 400, st.fontFamily || family)));
      labelBox = { x: lx, y: ly, w: lw, h: lines.length * size * 1.25 };
    }
    relGeom.set(r.id, { a: p.a, b: p.b, label: labelBox, points: x.points, mids: path.mids, d: path.d });
  }
  // self relations: small loop on the right side
  for (const x of rels) {
    if (x.hidden || x.r.from !== x.r.to) continue;
    const en = ents.get(x.r.from);
    if (!en) continue;
    const rx = en.x + en.w / 2, y0 = en.y - 14, y1 = en.y + 14;
    relNodes.push(
      itemGroup('rel', x.r.id, 'rel', [
        el('path', {
          d: `M${fmt(rx)},${fmt(y0)} C${fmt(rx + 60)},${fmt(y0 - 30)} ${fmt(rx + 60)},${fmt(y1 + 30)} ${fmt(rx)},${fmt(y1)}`,
          fill: 'none', stroke: x.st.color, 'stroke-width': x.st.width ?? 1,
        }),
      ]),
    );
  }

  const lineOf = (x: Ent): number => firstLine(x.e.defLine, x.e.lines);
  // a table being edited (table view, larger than its card) is drawn over its neighbours
  const order = (a: [string, Ent], b: [string, Ent]): number => Number(tableView.has(a[0])) - Number(tableView.has(b[0])) || byLine(lineOf(a[1]), lineOf(b[1]));
  for (const [id, x] of [...ents].sort(order)) {
    if (x.hidden) continue;
    entNodes.push(itemGroup('entity', id, 'entity', [...stackedShapeNodes('rect', x, x.st), ...x.draw(x.x, x.y)], linkAttr(x.href)));
  }

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const x of ents.values()) {
    if (x.hidden) continue;
    x0 = Math.min(x0, x.x - x.w / 2);
    y0 = Math.min(y0, x.y - x.h / 2);
    x1 = Math.max(x1, x.x + x.w / 2);
    y1 = Math.max(y1, x.y + x.h / 2);
  }
  if (x0 === Infinity) {
    x0 = 0;
    y0 = 0;
    x1 = 400;
    y1 = 300;
  }
  const pad = env.pad + 20;
  const bounds = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };

  const geom: ErGeometry = {
    type: 'er',
    entities: new Map(
      [...ents].map(([id, x]) => {
        const b: BoxGeom & { head?: number; rows?: { name: string; y: number; h: number; add?: boolean }[] } = { x: x.x, y: x.y, w: x.w, h: x.h, head: x.head, stack: x.st.stack, hidden: x.hidden };
        if (x.rows) b.rows = x.rows.map((r) => ({ ...r, y: x.y - x.h / 2 + r.y }));
        return [id, b];
      }),
    ),
    rels: relGeom,
  };
  return {
    defs: [],
    body: [...relNodes, ...entNodes, ...labelNodes],
    bounds,
    geom,
    presetsUsed: {
      entity: countBy([...ents.values()].map((x) => x.preset || '(none)')),
      rel: countBy(rels.map((x) => x.preset || '(none)')),
    },
  };
}

/** Highlight of an attribute (or `__title`): colour, bold, underline. */
function highlight(hl: Record<string, AttrHighlight>, name: string): AttrHighlight {
  return Object.prototype.hasOwnProperty.call(hl, name) && hl[name] && typeof hl[name] === 'object' ? hl[name] : {};
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
function compactLayout(ctx: RenderContext, e: Entity, st: StyleProps, m: ItemMeta, family: string, href: SafeUrl | null): Card {
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
  const titleLines = e.label.split('\n');
  let tw = 0;
  for (const t of titleLines) tw = Math.max(tw, ctx.measure.width(t, font(titleSize, st.titleWeight, family)));
  let inner = Math.max(tw, 0);
  for (const l of lines) inner = Math.max(inner, l.w);
  const w = metaNum(m.w) || Math.max(st.minW ?? 0, inner + padX * 2);
  const lh = size * 1.32, tlh = titleSize * 1.3;
  // a line with a larger attribute font is taller
  const lineH = lines.map((l) => Math.max(size, ...l.words.map((wd) => wd.size ?? size)) * 1.32);
  const even = lineH.every((x) => x === lh);
  const linesH = even ? lines.length * lh : lineH.reduce((a, b) => a + b, 0);
  const h = metaNum(m.h) || padY * 2 + titleLines.length * tlh + linesH;
  return {
    w,
    h,
    head: padY + titleLines.length * tlh,
    draw(cx, cy) {
      const top = cy - h / 2 + padY;
      const out: SceneNode[] = withLink(href, [
        textBlock(titleLines, cx, top + (titleLines.length * tlh) / 2, { size: titleSize, weight: look.weight, color: look.color, family, underline: look.underline }),
      ]);
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
function tableLayout(ctx: RenderContext, e: Entity, st: StyleProps, m: ItemMeta, family: string, href: SafeUrl | null, editing = false): Card {
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
  const tw = ctx.measure.width(e.label, font(titleSize, st.titleWeight, family)) + 32;
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
      const out: SceneNode[] = withLink(href, [
        textBlock([e.label], cx, y0 + headH / 2, { size: titleSize, weight: look.weight, color: look.color, family, underline: look.underline }),
      ]);
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
