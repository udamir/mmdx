// Sequence diagram renderer (prototype render/sequence.js). Layout is computed from message order; metadata can
// move participants horizontally (x), add vertical space (dy) and restyle anything.
import { ActivationTracker } from '../ids.js';
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type { Participant, SeqBlockStart, SeqMessage, SeqNote, SequenceModel } from '../model.js';
import { el, g } from '../scene/build.js';
import type { SceneNode } from '../scene/types.js';
import type { StyleProps } from '../style.js';
import type { ResolvedTheme } from '../theme/types.js';
import { textBlockWidth, wrap } from '../text/wrap.js';
import { fmt } from '../scene/serialize.js';
import {
  baseStyle, countBy, Defs, font, hiddenOf, itemGroup, itemLink, LINK_COLOR, linkAttr, mergeStyle, metaNum, pickStyle,
  presetOf, presets, shapeNodes, stackedShapeNodes, textBlock, urlRef, withLink, type RenderEnv, type SubResult,
} from './common.js';
import type { BoxGeom, SequenceGeometry } from './types.js';

/** A participant preset belongs to one shape (like node presets): its own "shape", else "for", else the box. */
export const participantPresetShape = (p: StyleProps | undefined): string => p?.shape || p?.for || 'box';

export interface SeqPresets {
  participant: Record<string, StyleProps>;
  message: Record<string, StyleProps>;
  block: Record<string, StyleProps>;
  activation: Record<string, StyleProps>;
  box: Record<string, StyleProps>;
  note: Record<string, StyleProps>;
}

export function seqPresets(T: ResolvedTheme, meta: DiagramMeta): SeqPresets {
  const S = T.sequence;
  return {
    participant: presets(S.participantPresets, meta.styles['participant']),
    message: presets(S.messagePresets, meta.styles['message']),
    block: presets(S.blockPresets, meta.styles['block']),
    activation: presets(S.activationPresets, meta.styles['activation']),
    box: presets(S.boxPresets, meta.styles['box']),
    note: presets(S.notePresets, meta.styles['note']),
  };
}

interface Layout {
  gap: number;
  top: number;
  rowH: number;
  lineH: number;
  blockGapTop: number;
  blockGapBottom: number;
  blockPad: number;
  mirror: boolean;
  margin: number;
  blockSpan: string | undefined;
}

interface Part {
  p: Participant;
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  lines: string[];
  w: number;
  h: number;
  hidden: boolean;
}

interface Act {
  y0: number;
  st: StyleProps;
  w: number;
  from?: string;
}

interface MsgOut {
  it: SeqMessage;
  st: StyleProps;
  m: ItemMeta;
  preset: string;
  hidden: boolean;
  self: boolean;
  y: number;
  x0: number;
  x1: number;
  lines: string[];
  lh: number;
  num: number;
  bg: string;
}

interface BlockOut {
  it: SeqBlockStart;
  m: ItemMeta;
  st: StyleProps;
  y0: number;
  y1: number;
  parts: Set<number>;
  elses: { y: number; label: string }[];
  depth: number;
  hidden: boolean;
}

const NO_META: ItemMeta = {};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

export function renderSequence(model: SequenceModel, env: RenderEnv): SubResult {
  const { ctx, theme: T, meta, opts } = env;
  const S = T.sequence;
  const P = seqPresets(T, meta);
  const c = meta.canvas;
  const SL = S.layout;
  const L: Layout = {
    gap: metaNum(c.gap) ?? SL.gap ?? 90,
    top: SL.top ?? 30,
    rowH: metaNum(c.rowH) ?? SL.rowH ?? 52,
    lineH: SL.lineH ?? 1.35,
    blockGapTop: SL.blockGapTop ?? 58,
    blockGapBottom: SL.blockGapBottom ?? 26,
    blockPad: SL.blockPad ?? 12,
    mirror: typeof c.mirror === 'boolean' ? c.mirror : !!SL.mirror,
    margin: metaNum(c.margin) ?? SL.margin ?? 26,
    blockSpan: str(c.blockSpan),
  };
  const family = T.font;
  const defs = new Defs(ctx.idPrefix);
  const hidden = {
    participant: hiddenOf(opts, 'participant'), message: hiddenOf(opts, 'message'), note: hiddenOf(opts, 'note'),
    block: hiddenOf(opts, 'block'), box: hiddenOf(opts, 'box'), activation: hiddenOf(opts, 'activation'),
  };
  const mt = <K extends 'participants' | 'messages' | 'notes' | 'blocks' | 'boxes' | 'activations'>(k: K, id: string): ItemMeta =>
    meta[k]?.[id] ?? NO_META;

  // ---- participants
  const parts: Part[] = model.participants.map((p) => {
    const m = mt('participants', p.id);
    const preset = str(m.preset) ?? '';
    const pst = presetOf(P.participant, preset);
    // the shape first (own > Mermaid's declaration / actor > preset > theme): each shape has its own default style
    // in the theme (sequence.participantShapes.<shape>)
    const shape = str(m.shape) || p.shape || (p.kind === 'actor' ? 'actor' : null) || pst?.shape || S.participant.shape || 'box';
    const st = mergeStyle(ctx, S.participant, S.participantShapes?.[shape], baseStyle(meta, 'participant'), pst, pickStyle(m));
    st.shape = shape;
    const fontSize = st.fontSize ?? 14, padX = st.padX ?? 0;
    const fnt = font(fontSize, st.fontWeight, st.fontFamily || family);
    const fixedW = metaNum(m.w);
    // word wrap: lines break to fit the participant's width (its own width, else the style's maxW, else minW / 200)
    const lines = st.wrap
      ? wrap(p.label, Math.max(20, (fixedW || st.maxW || Math.max(st.minW ?? 0, 200)) - padX * 2), fnt, ctx.measure)
      : p.label.split('\n');
    const w = fixedW || Math.max(st.minW ?? 0, textBlockWidth(lines, fnt, ctx.measure) + 2 * padX);
    let h = metaNum(m.h) || st.h || 40;
    // a wrapped name never overflows: the head grows taller to fit its lines (an actor's name sits under the figure)
    if (st.wrap && shape !== 'actor') h = Math.max(h, lines.length * fontSize * 1.3 + 2 * (st.padY ?? 8));
    return { p, m, st, preset, lines, w, h, hidden: hidden.participant.has(p.id) };
  });
  const idx = new Map(parts.map((x, i) => [x.p.id, i]));
  const msgStyle = (it: SeqMessage): { m: ItemMeta; preset: string; st: StyleProps } => {
    const m = mt('messages', it.id);
    const preset = str(m.preset) ?? '';
    return { m, preset, st: mergeStyle(ctx, S.message, baseStyle(meta, 'message'), presetOf(P.message, preset), pickStyle(m, ['labelOnLine'])) };
  };

  // auto x: base gaps, then widen for message labels
  const cx: number[] = [];
  parts.forEach((x, i) => {
    cx[i] = i === 0 ? L.margin + x.w / 2 : cx[i - 1]! + parts[i - 1]!.w / 2 + L.gap + x.w / 2;
  });
  const need: [number, number, number][] = [];
  for (const it of model.items) {
    if (it.kind !== 'message') continue;
    const { st } = msgStyle(it);
    const lw = textBlockWidth(it.text.split('\n'), font(st.labelSize ?? 14, 400, family), ctx.measure);
    const a = idx.get(it.from), b = idx.get(it.to);
    if (a === undefined || b === undefined) continue;
    if (a === b) need.push([a, a + 1, lw + 90]);
    else need.push([Math.min(a, b), Math.max(a, b), lw + 70]);
  }
  need.sort((p, q) => p[1] - p[0] - (q[1] - q[0]));
  for (const [a, b, d] of need) {
    if (b >= cx.length) continue;
    const def = d - (cx[b]! - cx[a]!);
    if (def > 0) for (let i = b; i < cx.length; i++) cx[i]! += def;
  }
  // metadata overrides keep the following participants' relative spacing
  const auto = [...cx];
  parts.forEach((x, i) => {
    const mx = metaNum(x.m.x);
    if (mx !== undefined) cx[i] = mx;
    else if (i > 0) cx[i] = cx[i - 1]! + (auto[i]! - auto[i - 1]!);
  });
  const cxOf = (pid: string): number => cx[idx.get(pid) ?? -1] ?? 0;

  // ---- vertical pass
  const top = L.top;
  let headH = 40;
  for (const x of parts) headH = Math.max(headH, x.h);
  let y = top + headH + 40;
  const msgs: MsgOut[] = [];
  const notes: { it: SeqNote; st: StyleProps; m: ItemMeta; x0: number; x1: number; y0: number; h: number; lines: string[]; hidden: boolean }[] = [];
  const blocks: BlockOut[] = [];
  const acts: { id: string; pid: string; y0: number; y1: number; level: number; st: StyleProps; w: number; from?: string; to?: string }[] = [];
  const blockStack: BlockOut[] = [];
  const minX = L.margin / 2;
  const totalW = (): number => {
    if (!cx.length) return 400; // no participants yet: a default page
    let m = -Infinity;
    cx.forEach((v, i) => (m = Math.max(m, v + parts[i]!.w / 2)));
    return m + L.margin / 2;
  };
  let num = 0;

  // a process is identified by its participant and its order on it: B:1, B:2… (core/ids);
  // its look: the theme's activation + its own overrides (meta.activations)
  const tracker = new ActivationTracker<Act>();
  const actEdge = (pid: string, dir: number): number => {
    const s = tracker.active(pid);
    const lv = s.length;
    if (!lv) return cxOf(pid);
    return cxOf(pid) + (lv - 1) * 5 + dir * (s[lv - 1]!.data.w / 2);
  };
  const activate = (pid: string, y0: number, from?: string): void => {
    tracker.open(pid, (id) => {
      const m = mt('activations', id);
      const pr = presetOf(P.activation, str(m.preset));
      const st = mergeStyle(ctx, S.activation, baseStyle(meta, 'activation'), pr, pickStyle(m));
      const a: Act = { y0, st, w: metaNum(m.w) || toNum(pr?.w) || S.activation.w || 14 };
      if (from !== undefined) a.from = from;
      return a;
    });
  };
  const deactivate = (pid: string, y1: number, to?: string): void => {
    const a = tracker.close(pid);
    if (!a) return;
    const out: (typeof acts)[number] = { id: a.id, pid, y0: a.data.y0, y1, level: a.level, st: a.data.st, w: a.data.w };
    if (a.data.from !== undefined) out.from = a.data.from;
    if (to !== undefined) out.to = to;
    acts.push(out);
  };
  const touched = (pids: readonly string[]): void => {
    for (const b of blockStack) for (const p of pids) {
      const i = idx.get(p);
      if (i !== undefined) b.parts.add(i);
    }
  };
  const currentFill = (): string => {
    for (let i = blockStack.length - 1; i >= 0; i--) {
      const f = blockStack[i]!.st.fill;
      if (f && f !== 'none') return f;
    }
    return env.paper;
  };
  const inHiddenBlock = (): boolean => blockStack.some((x) => x.hidden);

  for (const it of model.items) {
    if (it.kind === 'message') {
      const { m, st, preset } = msgStyle(it);
      const isHidden = hidden.participant.has(it.from) || hidden.participant.has(it.to) || hidden.message.has(it.id) || inHiddenBlock();
      y += metaNum(m.dy) || 0;
      const lines = it.text.split('\n');
      const lh = (st.labelSize ?? 14) * L.lineH;
      const labelH = lines.length * lh;
      const self = it.from === it.to;
      if (self) {
        const ly = y + 14;
        const x0 = actEdge(it.from, 1);
        msgs.push({ it, st, m, preset, hidden: isHidden, self: true, y: ly, x0, x1: x0 + 60, lines, lh, num: 0, bg: currentFill() });
        y = ly + 34 + Math.max(0, labelH - 30);
      } else {
        const ly = y + (st.labelOnLine ? Math.max(L.rowH, labelH + 18) / 2 : labelH + 8);
        const dir = cxOf(it.to) > cxOf(it.from) ? 1 : -1;
        if (it.activate) activate(it.to, ly - 12, it.id);
        const x0 = actEdge(it.from, dir);
        const x1 = actEdge(it.to, -dir);
        if (model.autonumber) num++;
        msgs.push({ it, st, m, preset, hidden: isHidden, self: false, y: ly, x0, x1, lines, lh, num, bg: currentFill() });
        if (it.deactivate) deactivate(it.from, ly + 12, it.id);
        y = ly + (st.labelOnLine ? Math.max(L.rowH, labelH + 18) / 2 : 12);
      }
      touched([it.from, it.to]);
    } else if (it.kind === 'activate') {
      activate(it.who, y - 10);
    } else if (it.kind === 'deactivate') {
      deactivate(it.who, y);
    } else if (it.kind === 'note') {
      const m = mt('notes', it.id);
      const st = mergeStyle(ctx, S.note, baseStyle(meta, 'note'), presetOf(P.note, str(m.preset)), pickStyle(m));
      y += metaNum(m.dy) || 0;
      const lines = it.text.split('\n');
      const fontSize = st.fontSize ?? 14;
      const tw = textBlockWidth(lines, font(fontSize, 400, family), ctx.measure) + 24;
      const xs = it.targets.map(cxOf);
      let x0: number, x1: number;
      if (it.pos === 'over') {
        let lo = Infinity, hi = -Infinity;
        for (const v of xs) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
        x0 = lo - (xs.length > 1 ? 40 : 0);
        x1 = hi + (xs.length > 1 ? 40 : 0);
        if (x1 - x0 < tw) {
          const cm = (x0 + x1) / 2;
          x0 = cm - tw / 2;
          x1 = cm + tw / 2;
        }
      } else if (it.pos === 'left of') {
        x1 = (xs[0] ?? 0) - 14;
        x0 = x1 - tw;
      } else {
        x0 = (xs[0] ?? 0) + 14;
        x1 = x0 + tw;
      }
      const h = lines.length * fontSize * 1.3 + 16;
      notes.push({
        it, st, m, x0, x1, y0: y + 6, h, lines,
        hidden: it.targets.some((t) => hidden.participant.has(t)) || hidden.note.has(it.id) || inHiddenBlock(),
      });
      y += h + 18;
      touched(it.targets);
    } else if (it.kind === 'blockStart') {
      const m = mt('blocks', it.id);
      const fill = it.color ? it.color : undefined;
      const st = mergeStyle(ctx, S.block, baseStyle(meta, 'block'), fill ? { fill } : null, presetOf(P.block, str(m.preset)), pickStyle(m, ['showTag']));
      y += metaNum(m.dy) || 0;
      const b: BlockOut = { it, m, st, y0: y, y1: y, parts: new Set(), elses: [], depth: blockStack.length, hidden: hidden.block.has(it.id) || inHiddenBlock() };
      blockStack.push(b);
      y += L.blockGapTop * (it.label || st.showTag ? 1 : 0.5);
    } else if (it.kind === 'blockElse') {
      const b = blockStack[blockStack.length - 1];
      if (b) {
        y += 8;
        b.elses.push({ y, label: it.label });
        y += 38;
      }
    } else if (it.kind === 'blockEnd') {
      const b = blockStack.pop();
      if (b) {
        y += L.blockGapBottom;
        b.y1 = y;
        blocks.push(b);
        y += 16;
      }
    }
  }
  for (const a of tracker.drain()) {
    const out: (typeof acts)[number] = { id: a.id, pid: a.participant, y0: a.data.y0, y1: y, level: a.level, st: a.data.st, w: a.data.w };
    if (a.data.from !== undefined) out.from = a.data.from;
    acts.push(out);
  }
  const bottom = y + 30;

  // ---- draw
  const W = totalW();
  const body: SceneNode[] = [];
  // participant boxes (mermaid "box")
  const boxGeom = new Map<string, BoxGeom>(), blockGeom = new Map<string, BoxGeom & { y0: number; y1: number }>(), noteGeom = new Map<string, BoxGeom>();
  for (const bx of model.boxes) {
    if (hidden.box.has(bx.id)) continue;
    const ids = bx.members.map((id) => idx.get(id)).filter((i): i is number => i !== undefined);
    if (!ids.length) continue;
    const bm = mt('boxes', bx.id);
    // theme → preset → Mermaid's own colour (box rgb(…) Label) → this box's overrides
    const bst = mergeStyle(ctx, S.box, baseStyle(meta, 'box'), presetOf(P.box, str(bm.preset)), bx.color ? { fill: bx.color } : null, pickStyle(bm));
    // with participants repeated at the bottom, the box reaches down around those copies too
    let maxH = -Infinity, x0 = Infinity, x1 = -Infinity;
    for (const i of ids) {
      const pt = parts[i]!;
      maxH = Math.max(maxH, pt.h);
      x0 = Math.min(x0, cx[i]! - pt.w / 2);
      x1 = Math.max(x1, cx[i]! + pt.w / 2);
    }
    x0 -= 12;
    x1 += 12;
    const boxBottom = L.mirror ? bottom + maxH + 12 : bottom + 10;
    const href = itemLink(ctx, bm.link);
    const children: SceneNode[] = [
      el('rect', {
        x: x0, y: top - 30, width: x1 - x0, height: boxBottom - top + 30, rx: 8,
        fill: bst.fill, stroke: bst.stroke, 'stroke-width': bst.strokeWidth, 'stroke-dasharray': bst.dash || undefined,
      }),
    ];
    if (bx.label)
      children.push(
        ...withLink(href, [
          textBlock([bx.label], (x0 + x1) / 2, top - 14, { size: bst.labelSize ?? 14, color: href ? LINK_COLOR : bst.text || '#333', family, underline: !!href }),
        ]),
      );
    body.push(itemGroup('box', bx.id, 'box', children, linkAttr(href)));
    boxGeom.set(bx.id, { x: (x0 + x1) / 2, y: (top - 30 + boxBottom) / 2, w: x1 - x0, h: boxBottom - top + 30 });
  }
  // blocks (outer first)
  const fullX0 = minX, fullX1 = W;
  for (const b of [...blocks].sort((p, q) => p.depth - q.depth)) {
    if (b.hidden) continue;
    const { st } = b;
    const labelSize = st.labelSize ?? 14, sw = st.strokeWidth ?? 1.5;
    let x0: number, x1: number;
    const inset = b.depth * (L.blockPad + 6);
    if ((L.blockSpan || 'full') === 'full' || !b.parts.size) {
      x0 = fullX0 + inset;
      x1 = fullX1 - inset;
    } else {
      let lo = Infinity, hi = -Infinity;
      for (const i of b.parts) {
        lo = Math.min(lo, cx[i]!);
        hi = Math.max(hi, cx[i]!);
      }
      x0 = lo - 60 - inset;
      x1 = hi + 60 + inset;
    }
    const tag = st.showTag && b.it.block !== 'rect' ? b.it.block : '';
    const inner: SceneNode[] = shapeNodes('rect', { x: (x0 + x1) / 2, y: (b.y0 + b.y1) / 2, w: x1 - x0, h: b.y1 - b.y0 }, st);
    let lx = x0 + 12;
    if (tag) {
      const tw = ctx.measure.width(tag, font(labelSize * 0.8, 700, family)) + 16;
      inner.push(
        el('path', { d: `M${fmt(x0)},${fmt(b.y0)} h${fmt(tw)} v${fmt(labelSize + 4)} l-8,8 H${fmt(x0)} Z`, fill: st.stroke }),
        textBlock([tag], x0 + tw / 2 - 2, b.y0 + (labelSize + 10) / 2, { size: labelSize * 0.8, weight: 700, color: '#fff', family }),
      );
      lx += tw;
    }
    const href = itemLink(ctx, b.m.link);
    if (b.it.label)
      inner.push(
        ...withLink(href, [
          textBlock([tag ? `[${b.it.label}]` : b.it.label], lx, b.y0 + 28, {
            size: labelSize, weight: st.fontWeight || 400, color: href ? LINK_COLOR : st.labelColor ?? undefined,
            family: st.fontFamily || family, anchor: 'start', underline: !!href,
          }),
        ]),
      );
    for (const e of b.elses) {
      inner.push(el('line', { x1: x0, y1: e.y, x2: x1, y2: e.y, stroke: st.stroke, 'stroke-width': sw * 0.6, 'stroke-dasharray': '7 5' }));
      if (e.label) inner.push(textBlock([`[${e.label}]`], lx, e.y + 20, { size: labelSize * 0.85, color: st.labelColor ?? undefined, family, anchor: 'start' }));
    }
    body.push(itemGroup('block', b.it.id, 'block', inner, linkAttr(href)));
    blockGeom.set(b.it.id, { x: (x0 + x1) / 2, y: (b.y0 + b.y1) / 2, w: x1 - x0, h: b.y1 - b.y0, y0: b.y0, y1: b.y1 });
  }
  // lifelines
  const LL = mergeStyle(ctx, S.lifeline);
  const lifelines = new Map<string, { x: number; y0: number; y1: number }>();
  parts.forEach((x, i) => {
    if (x.hidden) return;
    const lx = cx[i]!;
    const y0 = top + x.h, y1 = L.mirror ? bottom : bottom + 20;
    const dash = LL.dash || undefined;
    body.push(
      el('line', {
        x1: lx, y1: y0, x2: lx, y2: y1, stroke: LL.color, 'stroke-width': LL.width, 'stroke-dasharray': dash,
        'stroke-linecap': dash?.startsWith('0') ? 'round' : undefined,
      }, `lifeline:${x.p.id}`),
      // the editor's lifeline handle (drag sideways for a message, up or down for a process)
      el('line', {
        class: 'lifeline-hit', 'data-handle': 'lifeline', 'data-id': x.p.id,
        x1: lx, y1: y0 + 8, x2: lx, y2: y1, stroke: 'transparent', 'stroke-width': 18,
      }, `lifeline-hit:${x.p.id}`),
    );
    lifelines.set(x.p.id, { x: lx, y0, y1 });
  });
  // activations (processes)
  const actGeom: SequenceGeometry['activations'] = new Map();
  for (const a of acts) {
    const i = idx.get(a.pid);
    if (i === undefined || parts[i]!.hidden || hidden.activation.has(a.id)) continue;
    const { st, w } = a;
    const hitPad = 9; // easier to hover / click than the thin bar itself
    const x = cx[i]! - w / 2 + a.level * 5, h = Math.max(8, a.y1 - a.y0);
    body.push(
      itemGroup('activation', a.id, 'activation', [
        el('rect', { class: 'act-hit', x: x - hitPad, y: a.y0 - 4, width: w + 2 * hitPad, height: h + 8, rx: 4, fill: 'transparent' }),
        el('rect', {
          x, y: a.y0, width: w, height: h, fill: st.fill, stroke: st.stroke, 'stroke-width': st.strokeWidth,
          'stroke-dasharray': st.dash || undefined, 'pointer-events': 'none',
        }),
      ]),
    );
    const geo: SequenceGeometry['activations'] extends Map<string, infer V> ? V : never = { x: x + w / 2, y0: a.y0, y1: a.y0 + h, w, participant: a.pid };
    if (a.from !== undefined) geo.from = a.from;
    if (a.to !== undefined) geo.to = a.to;
    actGeom.set(a.id, geo);
  }
  // notes
  for (const n of notes) {
    const box = { x: (n.x0 + n.x1) / 2, y: n.y0 + n.h / 2, w: n.x1 - n.x0, h: n.h };
    noteGeom.set(n.it.id, { ...box, hidden: n.hidden });
    if (n.hidden) continue;
    const { st } = n;
    const href = itemLink(ctx, n.m.link);
    body.push(
      itemGroup('note', n.it.id, 'note', [
        ...shapeNodes('rect', box, st),
        ...withLink(href, [
          textBlock(n.lines, box.x, box.y, {
            size: st.fontSize ?? 14, weight: st.fontWeight || 400, color: href ? LINK_COLOR : st.text, family: st.fontFamily || family, underline: !!href,
          }),
        ]),
      ], linkAttr(href)),
    );
  }
  // messages
  const msgGeom: SequenceGeometry['messages'] = new Map();
  for (const gm of msgs) {
    if (gm.hidden) continue;
    const { it, st } = gm;
    const width = st.width ?? 1.5, labelSize = st.labelSize ?? 14;
    const reply = it.line === 'dotted';
    const dash = (reply ? st.replyDash || st.dash : st.dash) || undefined;
    const head = it.head === 'arrow' ? st.arrow : it.head === 'open' ? 'none' : it.head === 'cross' ? 'cross' : 'open';
    const mk = defs.marker(head, st.color, 10 + width * 3);
    const mkS = it.both ? mk : null;
    const href = itemLink(ctx, gm.m.link);
    const labelColor = href ? LINK_COLOR : st.labelColor ?? undefined;
    const inner: SceneNode[] = [];
    if (gm.self) {
      const x = gm.x0, yy = gm.y;
      const d = `M${fmt(x)},${fmt(yy)} H${fmt(x + 40)} Q${fmt(x + 54)},${fmt(yy)} ${fmt(x + 54)},${fmt(yy + 12)} Q${fmt(x + 54)},${fmt(yy + 24)} ${fmt(x + 40)},${fmt(yy + 24)} H${fmt(x + 2)}`;
      inner.push(
        el('path', { class: 'hit', d, fill: 'none', stroke: 'transparent', 'stroke-width': 14 }),
        el('path', { d, fill: 'none', stroke: st.color, 'stroke-width': width * 0.75, 'stroke-dasharray': dash, 'marker-end': urlRef(mk) }),
        el('circle', { cx: x + 54, cy: yy + 12, r: 2.5, fill: st.color }),
        ...withLink(href, [
          textBlock(gm.lines, x + 66, yy + 12, {
            size: labelSize, color: labelColor, family: st.fontFamily || family, weight: st.fontWeight || 400, anchor: 'start', lh: L.lineH, underline: !!href,
          }),
        ]),
      );
      msgGeom.set(it.id, { x0: x, x1: x + 60, y: yy, self: true });
    } else {
      const { x0, x1, y: yy } = gm;
      inner.push(
        el('line', { class: 'hit', x1: x0, y1: yy, x2: x1, y2: yy, stroke: 'transparent', 'stroke-width': 14 }),
        el('line', {
          x1: x0, y1: yy, x2: x1, y2: yy, stroke: st.color, 'stroke-width': width, 'stroke-opacity': st.strokeOpacity,
          'stroke-dasharray': dash, 'marker-end': urlRef(mk), 'marker-start': urlRef(mkS),
        }),
      );
      if (it.text && !opts.hideLabels) {
        const cxm = (x0 + x1) / 2;
        const tw = textBlockWidth(gm.lines, font(labelSize, st.fontWeight || 400, st.fontFamily || family), ctx.measure);
        const th = gm.lines.length * gm.lh;
        const ty = st.labelOnLine ? yy : yy - th / 2 - 6;
        if (st.labelOnLine) inner.push(el('rect', { x: cxm - tw / 2 - 6, y: ty - th / 2, width: tw + 12, height: th, fill: gm.bg }));
        inner.push(
          ...withLink(href, [
            textBlock(gm.lines, cxm, ty, {
              size: labelSize, color: labelColor, family: st.fontFamily || family, weight: st.fontWeight || 400, lh: L.lineH, underline: !!href,
            }),
          ]),
        );
      }
      if (gm.num) {
        const nx = x0 + (x1 > x0 ? 12 : -12);
        inner.push(el('circle', { cx: nx, cy: yy, r: 9, fill: st.color }), textBlock([String(gm.num)], nx, yy, { size: 10, weight: 700, color: '#fff', family }));
      }
      msgGeom.set(it.id, { x0, x1, y: yy });
    }
    body.push(itemGroup('message', it.id, 'message', inner, { 'data-from': it.from, 'data-to': it.to, ...linkAttr(href) }));
  }
  // participant heads (and optional mirrored feet)
  const partGeom = new Map<string, BoxGeom>(), footGeom = new Map<string, BoxGeom>();
  parts.forEach((x, i) => {
    if (x.hidden) return;
    const px = cx[i]!;
    const href = itemLink(ctx, x.m.link);
    body.push(itemGroup('participant', x.p.id, 'participant', participantNodes(x, px, top + x.h / 2, family, href), linkAttr(href)));
    if (L.mirror) {
      // the copy at the bottom: selectable / resizable like the head (data-foot tells the editor which one was picked)
      body.push(
        itemGroup('participant', x.p.id, 'participant', participantNodes(x, px, bottom + x.h / 2, family, href), { 'data-foot': '1', ...linkAttr(href) }, 'foot'),
      );
      footGeom.set(x.p.id, { x: px, y: bottom + x.h / 2, w: x.w, h: x.h });
    }
    partGeom.set(x.p.id, { x: px, y: top + x.h / 2, w: x.w, h: x.h });
  });

  const pad = env.pad;
  const bounds = {
    x: 0,
    y: top - (model.boxes.length ? 40 : 14) - pad,
    w: W + L.margin / 2 + pad,
    h: (L.mirror ? bottom + headH : bottom + 24) - top + 40 + pad * 2,
  };

  // the diagram's `title` (parsed but never drawn by the prototype, A.13): a page title above the participants
  const title = (model.title ?? '').trim();
  if (title) {
    const lines = title.split('\n');
    const size = 22, lh = 1.3;
    const blockH = lines.length * size * lh;
    const titleH = blockH + 14;
    bounds.y -= titleH;
    bounds.h += titleH;
    body.unshift(
      g({ class: 'title', 'data-part': 'title' }, [
        textBlock(lines, bounds.x + bounds.w / 2, bounds.y + pad + blockH / 2, { size, weight: 600, color: ctx.color('@title') ?? '#333', family }),
      ], { key: 'title' }),
    );
  }

  const geom: SequenceGeometry = {
    type: 'sequence',
    participants: partGeom,
    participantFeet: footGeom,
    messages: msgGeom,
    activations: actGeom,
    boxes: boxGeom,
    blocks: blockGeom,
    notes: noteGeom,
    autoX: new Map(parts.map((x, i) => [x.p.id, auto[i]!])),
    lifelines,
  };
  return {
    defs: defs.nodes(),
    body,
    bounds,
    geom,
    presetsUsed: { message: countBy(msgs.map((x) => x.preset || '(none)')) },
  };
}

function participantNodes(x: Part, cx: number, cy: number, family0: string, href: ReturnType<typeof itemLink>): SceneNode[] {
  const { st, lines } = x;
  const family = st.fontFamily || family0;
  const color = href ? LINK_COLOR : st.text;
  const fontSize = st.fontSize ?? 14;
  if (st.shape === 'actor') {
    const top = cy - x.h / 2 + 4;
    // the name of a stick figure (figure: top … top + 52, centred on cx), under the figure
    const size = fontSize * 0.6, half = (lines.length * size * 1.3) / 2;
    return [
      g({ fill: 'none', stroke: st.stroke, 'stroke-width': 2 }, [
        el('circle', { cx, cy: top + 8, r: 8 }),
        el('path', {
          d: `M${fmt(cx)},${fmt(top + 16)} v20 M${fmt(cx - 14)},${fmt(top + 24)} h28 M${fmt(cx)},${fmt(top + 36)} l-12,16 M${fmt(cx)},${fmt(top + 36)} l12,16`,
        }),
      ]),
      ...withLink(href, [textBlock(lines, cx, top + 58 + half, { size, weight: st.fontWeight, color, family, underline: !!href })]),
    ];
  }
  const shape = st.shape === 'database' ? 'cylinder' : st.shape === 'box' ? 'rect' : st.shape;
  return [
    ...stackedShapeNodes(shape, { x: cx, y: cy, w: x.w, h: x.h }, st),
    ...withLink(href, [textBlock(lines, cx, cy + (shape === 'cylinder' ? 4 : 0), { size: fontSize, weight: st.fontWeight, color, family, underline: !!href })]),
  ];
}

const toNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
