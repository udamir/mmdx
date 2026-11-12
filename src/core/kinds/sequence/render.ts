// Sequence diagram renderer (prototype render/sequence.js). Layout is computed from message order; metadata can
// move participants horizontally (x), add vertical space (dy) and restyle anything.
//
// As Mermaid draws them (T11.1): message numbers follow every `autonumber` statement (start, step, off; self messages
// numbered too); half arrows draw a half head above or below the line, at the receiver or, reversed, at the sender;
// a central connection (`()`) ends the arrow at a small circle on the lifeline's centre; a created participant's head
// sits at its creating message's row and its lifeline starts there; a destroyed one's lifeline ends at its destroying
// message with a cross. A participant's Mermaid links (`link`, `links`) are its item link (the first one) and the
// viewer's menu (`data-links`, all of them).
//
// Participant types and media (T10.2): Mermaid's 8 types draw natively — box, database (the cylinder), collections
// (stacked boxes) and queue (the horizontal cylinder) with the name inside; actor, boundary, control and entity as
// their catalogue figure (core/shapes/figures.ts) with the name under it. A participant's icon (the leading token of
// its name, above the name unless `iconPos` says otherwise) and its image (metadata `img`, else its `properties` icon
// URL, Mermaid's undocumented corner image) draw as in every kind (render/decorate.ts), and its head grows to hold
// them. Icon tokens in names, messages and notes draw through the media kit (a lazy chunk; Mermaid has no markdown in
// sequence diagrams, so only the tokens); emoji are text.
import { a11yOf, EMPTY_META, str } from '../../render/graph-kit.js';
import { diagramTitle } from '../../render/title.js';
import { ICON_TOKEN } from '../../icons/names.js';
import { ActivationTracker } from '../../ids.js';
import type { ItemMeta } from '../../meta/types.js';
import type { Participant, SeqBlockStart, SeqMessage, SeqNote, SequenceModel } from '../../model.js';
import { messageNumbers } from './parse.js';
import { el, g } from '../../scene/build.js';
import type { SceneNode, TextRun } from '../../scene/types.js';
import { shapeDef } from '../../shapes/registry.js';
import type { StyleProps } from '../../style.js';
import type { FontSpec } from '../../text/measure.js';
import { textBlockWidth, wrap } from '../../text/wrap.js';
import { fmt } from '../../scene/serialize.js';
import { baseStyle, countBy, Defs, font, hiddenOf, itemGroup, itemLink, LINK_COLOR, linkAttr, mergeStyle, metaNum, pickStyle, presetOf, shapeNodes, stackedShapeNodes, textBlock, urlRef, withLink } from '../../render/common.js';
import { type RenderEnv, type SubResult, type MediaSource } from '../../render/types.js';
import { decorate, decorated, decoratedSize, decoration, lazyKit, type Decoration } from '../../render/decorate.js';
import { assetBox, captionY, mediaAssetNodes, mediaLayout, type MediaBox } from '../../render/media-node.js';
import { metaMediaSource } from '../../media/meta-source.js';
import type { BoxGeom, SequenceGeometry, TextOpts } from '../../render/types.js';
import { dashAttrs } from '../../shapes/dash.js';
import { seqPresets } from './presets.js';
import { minOf } from '../../geom.js';

/** A participant preset belongs to one shape (like node presets): its own "shape", else "for", else the box. */
export { participantPresetShape } from '../../render/common.js';


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
  /** The page shows the blocks' kind tags (false: a page preset hides them; a block's own `showTag` still wins). */
  blockTags: boolean;
}

/** A text's lines, plain or as runs (icon tokens), and its width. */
interface Txt {
  lines: string[];
  rich?: TextRun[][];
  w: number;
}

interface Part {
  p: Participant;
  m: ItemMeta;
  st: StyleProps;
  preset: string;
  /** The name (without the icon token when the icon is drawn apart). */
  name: Txt;
  /** The size the name is drawn at (a figure's name is smaller). */
  nameSize: number;
  /** The icon beside the name (a token in it); `fromCode`: the image is the `properties` icon. */
  deco: Decoration;
  fromCode: boolean;
  /** An image or icon participant: its picture or icon and asset box (the head drawn as the flowchart's image node). */
  media?: { box: MediaBox; src: MediaSource };
  /** The figure drawn above the name (actor, boundary, control, entity), else null: the name is inside the shape. */
  figure: { w: number; h: number } | null;
  w: number;
  h: number;
  hidden: boolean;
  /** Created by a message: the centre height of its head (at that message's row). */
  createdY?: number;
  /** Destroyed by a message: where its lifeline ends (that message's row). */
  destroyedY?: number;
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
  text: Txt;
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


/** The shapes Mermaid draws as a figure with the name under it; the actor's own stick figure is 52 px tall, the others 40. */
const FIGURES = new Set(['actor', 'boundary', 'control', 'entity']);
const ACTOR_H = 52, FIGURE_H = 40;

/** The image a participant shows: metadata `img`, else the URL of its `properties` icon (`@…`, an embedded picture, is not read). */
/**
 * A participant's picture or icon: its metadata (`img` or `icon`, with the flowchart image node's keys), else the URL
 * of Mermaid's `properties A: {"icon": …}` (read, never written; `@…` embedded pictures are not read).
 */
function mediaOf(m: ItemMeta, p: Participant): { src: MediaSource; fromCode: boolean } | null {
  const own = metaMediaSource(m);
  if (own) return { src: own, fromCode: false };
  const icon = p.properties?.['icon'];
  const url = typeof icon === 'string' ? icon.trim() : '';
  return url && !url.startsWith('@') ? { src: { img: url }, fromCode: true } : null;
}

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
    blockTags: c.blockTags !== false,
  };
  const family = T.font;
  const defs = new Defs(ctx.idPrefix);
  const hidden = {
    participant: hiddenOf(opts, 'participant'), message: hiddenOf(opts, 'message'), note: hiddenOf(opts, 'note'),
    block: hiddenOf(opts, 'block'), box: hiddenOf(opts, 'box'), activation: hiddenOf(opts, 'activation'),
  };
  const mt = <K extends 'participants' | 'messages' | 'notes' | 'blocks' | 'boxes' | 'activations'>(k: K, id: string): ItemMeta =>
    meta[k]?.[id] ?? EMPTY_META;

  // icon tokens in names, messages and notes draw through the media kit (a lazy chunk), asked for only when a text has one
  const kit = lazyKit();
  const hasIcons = (s: string): boolean => s.includes(':') && [...s.matchAll(ICON_TOKEN)].some((t) => ctx.icons.resolve(t[2]!, 'token') !== null);
  /** A text's lines (wrapped at `maxW` when given): runs when it holds icon tokens, else plain as before. */
  const textOf = (text: string, fnt: FontSpec, color: string | undefined, line: number | undefined, maxW?: number): Txt => {
    const k = hasIcons(text) ? kit() : null;
    const runs = k ? k.labelRuns(text, { icons: k.iconResolver(ctx, color, fnt.size, line === undefined ? { diagnostics: env.diagnostics } : { diagnostics: env.diagnostics, line }), iconSize: fnt.size }) : null;
    if (k && runs) {
      const r = k.wrapRuns(runs, maxW ?? 0, fnt, ctx.measure);
      const out: Txt = { lines: r.map(k.runsText), w: k.runsBlockWidth(r, fnt, ctx.measure) };
      if (k.richLines(r)) out.rich = r;
      return out;
    }
    const lines = maxW !== undefined ? wrap(text, maxW, fnt, ctx.measure) : text.split('\n');
    return { lines, w: textBlockWidth(lines, fnt, ctx.measure) };
  };
  const drawText = (t: Txt, x: number, y: number, o: TextOpts): SceneNode[] => {
    const k = t.rich ? kit() : null;
    return k && t.rich ? k.richText(t.rich, x, y, { ...o, measure: ctx.measure }) : [textBlock(t.lines, x, y, o)];
  };

  // ---- participants
  const parts: Part[] = model.participants.map((p) => {
    const m = mt('participants', p.id);
    const preset = str(m.preset) ?? '';
    const pst = presetOf(P.participant, preset);
    // the shape first (own > Mermaid's type / actor > preset > theme): each shape has its own default style in the
    // theme (sequence.participantShapes.<shape>)
    const shape = str(m.shape) || p.shape || (p.kind === 'actor' ? 'actor' : null) || pst?.shape || S.participant.shape || 'box';
    const st = mergeStyle(ctx, S.participant, S.participantShapes?.[shape], baseStyle(meta, 'participant'), pst, pickStyle(m));
    st.shape = shape;
    const fontSize = st.fontSize ?? 14, padX = st.padX ?? 0, padY = st.padY ?? 8;
    const fnt = font(fontSize, st.fontWeight, st.fontFamily || family);
    // the figures beyond the actor are catalogue geometry (in the viewer, loaded on demand: core/shapes/registry.ts)
    const def = FIGURES.has(shape) && shape !== 'actor' ? shapeDef(shape) : null;
    const figure = shape === 'actor' ? { w: 28, h: ACTOR_H } : def ? { w: (def.size.w * FIGURE_H) / def.size.h, h: FIGURE_H } : null;
    const nameSize = figure ? fontSize * 0.6 : fontSize;
    const line = p.defLine ?? minOf(p.lines);
    // an image or icon participant: the picture or the icon is its head, the name the caption, as the flowchart's image
    // node (the figure and the box give way to it)
    const media = mediaOf(m, p);
    if (media) {
      st.shape = media.src.img != null ? 'image' : 'icon';
      const ln = Number.isFinite(line) ? line : undefined;
      const { box, caption, w, h } = mediaLayout(env, kit(), media.src, {}, fontSize, 200, st.text, ln ?? null, (cw) => textOf(p.label, fnt, st.text, ln, cw));
      const deco = decoration(ctx, kit, { label: '', meta: {}, fontSize, color: st.text });
      return { p, m, st, preset, name: caption, nameSize: fontSize, deco, fromCode: media.fromCode, figure: null, w, h, hidden: hidden.participant.has(p.id), media: { box, src: media.src } };
    }
    // the icon (above the name by default): a token in the name
    const deco = decoration(ctx, kit, { label: p.label, meta: m, fontSize: nameSize, color: st.text, pos: 't' });
    const fixedW = metaNum(m.w);
    // word wrap: lines break to fit the participant's width (its own width, else the style's maxW, else minW / 200)
    const maxW = st.wrap ? Math.max(20, (fixedW || st.maxW || Math.max(st.minW ?? 0, 200)) - padX * 2) : undefined;
    // a figure's name with inline icons is laid out at the size it is drawn at (a plain one keeps its width measured at
    // the head's size, as before)
    const nameFnt = figure && hasIcons(deco.label) ? font(nameSize, st.fontWeight, st.fontFamily || family) : fnt;
    const name = textOf(deco.label, nameFnt, deco.inlineColor ?? st.text, Number.isFinite(line) ? line : undefined, maxW);
    const textH = name.lines.length * nameSize * 1.3;
    const block = decorated(deco) ? decoratedSize(deco, { w: name.w, h: textH }) : null;
    const w = fixedW || Math.max(st.minW ?? 0, (block?.w ?? name.w) + 2 * padX);
    let h = metaNum(m.h) || st.h || 40;
    // a wrapped name never overflows: the head grows taller to fit its lines (a figure's name sits under the figure)
    if (st.wrap && !figure) h = Math.max(h, textH + 2 * padY);
    // the icon and the image too: inside the shape, or with the name under the figure
    if (block) h = Math.max(h, figure ? 4 + figure.h + 6 + block.h + 4 : block.h + 2 * padY);
    return { p, m, st, preset, name, nameSize, deco, fromCode: false, figure, w, h, hidden: hidden.participant.has(p.id) };
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
  // a message's text, read once (its icon tokens report their misses once)
  const msgTexts = new Map<string, Txt>();
  const msgText = (it: SeqMessage, st: StyleProps): Txt => {
    let t = msgTexts.get(it.id);
    if (!t) msgTexts.set(it.id, (t = textOf(it.text, font(st.labelSize ?? 14, st.fontWeight || 400, st.fontFamily || family), st.labelColor ?? undefined, it.src)));
    return t;
  };
  const need: [number, number, number][] = [];
  for (const it of model.items) {
    if (it.kind !== 'message') continue;
    const { st } = msgStyle(it);
    const T = msgText(it, st);
    const lw = T.rich ? T.w : textBlockWidth(T.lines, font(st.labelSize ?? 14, 400, family), ctx.measure);
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
  for (const x of parts) if (!x.p.createdBy) headH = Math.max(headH, x.h);
  let y = top + headH + 40;
  const msgs: MsgOut[] = [];
  const notes: { it: SeqNote; st: StyleProps; m: ItemMeta; x0: number; x1: number; y0: number; h: number; text: Txt; hidden: boolean }[] = [];
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
  const numbers = messageNumbers(model);
  // participants created / destroyed by a message (their heads and lifelines start / end at its row)
  const createdBy = new Map<string, Part>(), destroyedBy = new Map<string, Part>();
  for (const x of parts) {
    if (x.p.createdBy) createdBy.set(x.p.createdBy, x);
    if (x.p.destroyedBy) destroyedBy.set(x.p.destroyedBy, x);
  }

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
      const text = msgText(it, st);
      const lines = text.lines;
      const lh = (st.labelSize ?? 14) * L.lineH;
      const labelH = lines.length * lh;
      const self = it.from === it.to;
      const num = numbers.get(it.id) ?? 0;
      if (self) {
        const ly = y + 14;
        const x0 = actEdge(it.from, 1);
        msgs.push({ it, st, m, preset, hidden: isHidden, self: true, y: ly, x0, x1: x0 + 60, text, lines, lh, num, bg: currentFill() });
        y = ly + 34 + Math.max(0, labelH - 30);
      } else {
        const made = createdBy.get(it.id);
        // a created participant's head is centred on its creating message: room for its upper half first
        if (made && made.p.id === it.to) y += made.h / 2;
        const ly = y + (st.labelOnLine ? Math.max(L.rowH, labelH + 18) / 2 : labelH + 8);
        const dir = cxOf(it.to) > cxOf(it.from) ? 1 : -1;
        if (it.activate) activate(it.to, ly - 12, it.id);
        let x0 = actEdge(it.from, dir);
        let x1 = actEdge(it.to, -dir);
        // central connections end at the circle on the lifeline's centre
        if (it.central === 'from' || it.central === 'both') x0 = cxOf(it.from) + dir * CENTRAL_R;
        if (it.central === 'to' || it.central === 'both') x1 = cxOf(it.to) - dir * CENTRAL_R;
        if (made && made.p.id === it.to) {
          made.createdY = ly;
          x1 = cxOf(it.to) - dir * (made.w / 2 + 3);
        }
        msgs.push({ it, st, m, preset, hidden: isHidden, self: false, y: ly, x0, x1, text, lines, lh, num, bg: currentFill() });
        if (it.deactivate) deactivate(it.from, ly + 12, it.id);
        y = ly + (st.labelOnLine ? Math.max(L.rowH, labelH + 18) / 2 : 12);
        if (made && made.p.id === it.to) y += made.h / 2;
      }
      const gone = destroyedBy.get(it.id);
      if (gone) {
        gone.destroyedY = msgs[msgs.length - 1]!.y;
        y += 12;
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
      const fontSize = st.fontSize ?? 14;
      const text = textOf(it.text, font(fontSize, 400, family), st.text, it.src);
      const lines = text.lines;
      const tw = text.w + 24;
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
        it, st, m, x0, x1, y0: y + 6, h, text,
        hidden: it.targets.some((t) => hidden.participant.has(t)) || hidden.note.has(it.id) || inHiddenBlock(),
      });
      y += h + 18;
      touched(it.targets);
    } else if (it.kind === 'blockStart') {
      const m = mt('blocks', it.id);
      const fill = it.color ? it.color : undefined;
      const st = mergeStyle(ctx, S.block, L.blockTags ? null : { showTag: false }, baseStyle(meta, 'block'), fill ? { fill } : null, presetOf(P.block, str(m.preset)), pickStyle(m, ['showTag']));
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
        fill: bst.fill, stroke: bst.stroke, 'stroke-width': bst.strokeWidth, ...dashAttrs(bst.dash, bst.strokeWidth ?? 1.5),
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
    const y0 = x.createdY !== undefined ? x.createdY + x.h / 2 : top + x.h;
    const y1 = x.destroyedY ?? (L.mirror ? bottom : bottom + 20);
    const dash = LL.dash || undefined;
    // destroyed: a cross where the lifeline ends
    if (x.destroyedY !== undefined) {
      const c = 9;
      body.push(el('path', {
        d: `M${fmt(lx - c)},${fmt(y1 - c)} L${fmt(lx + c)},${fmt(y1 + c)} M${fmt(lx + c)},${fmt(y1 - c)} L${fmt(lx - c)},${fmt(y1 + c)}`,
        stroke: LL.color, 'stroke-width': Math.max(2, (LL.width ?? 1) * 1.6), 'stroke-linecap': 'round', fill: 'none',
      }, `destroy:${x.p.id}`));
    }
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
          ...dashAttrs(st.dash, st.strokeWidth ?? 1.5), 'pointer-events': 'none',
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
          ...drawText(n.text, box.x, box.y, {
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
    // a reply (dotted arrow) is dashed with the theme's replyDash unless a preset or the message itself sets a dash
    const dash = (reply ? st.dash || st.replyDash : st.dash) || undefined;
    const dashOf = (w: number): ReturnType<typeof dashAttrs> => dashAttrs(dash, w);
    const head = it.head === 'arrow' ? st.arrow : it.head === 'open' ? 'none' : it.head === 'cross' ? 'cross' : 'open';
    const size = 10 + width * 3;
    // a half head is drawn as a path of its own (no marker); a reversed one sits at the sender's end
    const mk = it.half || it.reverse ? null : defs.marker(head, st.color, size);
    const mkS = it.both ? mk : null;
    const href = itemLink(ctx, gm.m.link);
    const labelColor = href ? LINK_COLOR : st.labelColor ?? undefined;
    const inner: SceneNode[] = [];
    if (gm.self) {
      const x = gm.x0, yy = gm.y;
      const d = `M${fmt(x)},${fmt(yy)} H${fmt(x + 40)} Q${fmt(x + 54)},${fmt(yy)} ${fmt(x + 54)},${fmt(yy + 12)} Q${fmt(x + 54)},${fmt(yy + 24)} ${fmt(x + 40)},${fmt(yy + 24)} H${fmt(x + 2)}`;
      inner.push(
        el('path', { class: 'hit', d, fill: 'none', stroke: 'transparent', 'stroke-width': 14 }),
        el('path', { d, fill: 'none', stroke: st.color, 'stroke-width': width * 0.75, ...dashOf(width * 0.75), 'marker-end': urlRef(mk) }),
        el('circle', { cx: x + 54, cy: yy + 12, r: 2.5, fill: st.color }),
        // the loop comes back leftwards; a reversed head sits where it leaves the lifeline
        ...halfHead(it, it.reverse ? x : x + 2, it.reverse ? yy : yy + 24, -1, -1, size, width * 0.75, st.color),
        ...withLink(href, [
          ...drawText(gm.text, x + 66, yy + 12, {
            size: labelSize, color: labelColor, family: st.fontFamily || family, weight: st.fontWeight || 400, anchor: 'start', lh: L.lineH, underline: !!href,
          }),
        ]),
      );
      if (gm.num) inner.push(...numberBadge(gm.num, x + 12, yy, st.color, family));
      msgGeom.set(it.id, { x0: x, x1: x + 60, y: yy, self: true });
    } else {
      const { x0, x1, y: yy } = gm;
      inner.push(
        el('line', { class: 'hit', x1: x0, y1: yy, x2: x1, y2: yy, stroke: 'transparent', 'stroke-width': 14 }),
        el('line', {
          x1: x0, y1: yy, x2: x1, y2: yy, stroke: st.color, 'stroke-width': width, 'stroke-opacity': st.strokeOpacity,
          ...dashOf(width), 'marker-end': urlRef(mk), 'marker-start': urlRef(mkS),
        }),
      );
      const dir = x1 >= x0 ? 1 : -1;
      if (it.reverse) inner.push(...halfHead(it, x0, yy, -dir, dir, size, width, st.color));
      else if (it.half) inner.push(...halfHead(it, x1, yy, dir, dir, size, width, st.color));
      if (it.central === 'to' || it.central === 'both') inner.push(el('circle', { cx: x1 + dir * CENTRAL_R, cy: yy, r: CENTRAL_R, fill: st.color }));
      if (it.central === 'from' || it.central === 'both') inner.push(el('circle', { cx: x0 - dir * CENTRAL_R, cy: yy, r: CENTRAL_R, fill: st.color }));
      if (it.text && !opts.hideLabels) {
        const cxm = (x0 + x1) / 2;
        const tw = gm.text.rich ? gm.text.w : textBlockWidth(gm.lines, font(labelSize, st.fontWeight || 400, st.fontFamily || family), ctx.measure);
        const th = gm.lines.length * gm.lh;
        const ty = st.labelOnLine ? yy : yy - th / 2 - 6;
        if (st.labelOnLine) inner.push(el('rect', { x: cxm - tw / 2 - 6, y: ty - th / 2, width: tw + 12, height: th, fill: gm.bg }));
        inner.push(
          ...withLink(href, [
            ...drawText(gm.text, cxm, ty, {
              size: labelSize, color: labelColor, family: st.fontFamily || family, weight: st.fontWeight || 400, lh: L.lineH, underline: !!href,
            }),
          ]),
        );
      }
      if (gm.num) inner.push(...numberBadge(gm.num, x0 + (x1 > x0 ? 12 : -12), yy, st.color, family));
      msgGeom.set(it.id, { x0, x1, y: yy });
    }
    body.push(itemGroup('message', it.id, 'message', inner, { 'data-from': it.from, 'data-to': it.to, ...linkAttr(href) }));
  }
  // participant heads (and optional mirrored feet)
  /** A participant's head centred on (px, cy): its shape or figure, its icon and image, its name. */
  const headNodes = (x: Part, px: number, cy: number, href: ReturnType<typeof itemLink>, foot: boolean): SceneNode[] => {
    const { st, figure, deco } = x;
    const color = href ? LINK_COLOR : st.text;
    const to: TextOpts = { size: x.nameSize, weight: st.fontWeight, color, family: st.fontFamily || family, underline: !!href };
    if (x.media) {
      // an image or icon participant: the asset, then the name under (or above) it; the foot's assets are the head's again
      const box = { x: px, y: cy, w: x.w, h: x.h };
      const out = mediaAssetNodes(foot ? { ...env, diagnostics: [] } : env, kit(), box, x.media.box, x.media.src, st, {
        key: foot ? `${x.p.id}:foot` : x.p.id, family, line: x.p.defLine ?? minOf(x.p.lines), source: x.fromCode ? 'code' : 'meta',
      });
      if (x.name.lines.length) out.push(...withLink(href, drawText(x.name, px, captionY(box, x.media.box), { ...to, lh: 1.3 })));
      return out;
    }
    const text = { w: x.name.w, h: x.name.lines.length * x.nameSize * 1.3 };
    // the assets of the foot are the head's again: its diagnostics are not repeated, its images get keys of their own
    const at = (top: number): { nodes: SceneNode[]; y: number; x: number } => {
      if (!decorated(deco)) return { nodes: [], x: px, y: top + text.h / 2 };
      const D = decorate(foot ? { ctx, diagnostics: [] } : env, kit, deco, px, top, text, {
        key: foot ? `${x.p.id}:foot` : x.p.id, line: x.p.defLine ?? minOf(x.p.lines), family, ...(st.text ? { color: st.text } : {}), source: x.fromCode ? 'code' : 'meta',
      });
      return { nodes: D.nodes, x: D.contentBox.x, y: D.contentBox.y };
    };
    if (figure) {
      // the figure at the top, the name (with its icon and image) under it
      const top = cy - x.h / 2 + 4;
      const fig = st.shape === 'actor'
        ? [g({ fill: 'none', stroke: st.stroke, 'stroke-width': 2 }, [
          el('circle', { cx: px, cy: top + 8, r: 8 }),
          el('path', { d: `M${fmt(px)},${fmt(top + 16)} v20 M${fmt(px - 14)},${fmt(top + 24)} h28 M${fmt(px)},${fmt(top + 36)} l-12,16 M${fmt(px)},${fmt(top + 36)} l12,16` }),
        ])]
        : shapeDef(st.shape).draw({ x: px, y: top + figure.h / 2, w: figure.w, h: figure.h }, st, {});
      const name = at(top + figure.h + 6);
      return [...fig, ...name.nodes, ...withLink(href, drawText(x.name, name.x, name.y, to))];
    }
    const shape = st.shape === 'database' ? 'cylinder' : st.shape === 'box' ? 'rect' : st.shape;
    const block = decorated(deco) ? decoratedSize(deco, text) : text;
    const name = at(cy + (shape === 'cylinder' ? 4 : 0) - block.h / 2);
    return [...stackedShapeNodes(shape, { x: px, y: cy, w: x.w, h: x.h }, st), ...name.nodes, ...withLink(href, drawText(x.name, name.x, name.y, to))];
  };
  const partGeom = new Map<string, BoxGeom>(), footGeom = new Map<string, BoxGeom>();
  parts.forEach((x, i) => {
    if (x.hidden) return;
    const px = cx[i]!;
    // its own link first, else the first of its Mermaid links; all of them make the viewer's menu
    const href = x.m.link ? itemLink(ctx, x.m.link) : firstLink(ctx, x.p);
    const attrs = { ...linkAttr(href), ...menuAttr(ctx, x.p) };
    const hy = x.createdY ?? top + x.h / 2;
    body.push(itemGroup('participant', x.p.id, 'participant', headNodes(x, px, hy, href, false), attrs));
    if (L.mirror) {
      // the copy at the bottom: selectable / resizable like the head (data-foot tells the editor which one was picked);
      // a destroyed participant's copy sits under its cross
      const fy = x.destroyedY !== undefined ? x.destroyedY + 14 + x.h / 2 : bottom + x.h / 2;
      body.push(
        itemGroup('participant', x.p.id, 'participant', headNodes(x, px, fy, href, true), { 'data-foot': '1', ...attrs }, 'foot'),
      );
      footGeom.set(x.p.id, { x: px, y: fy, w: x.w, h: x.h, ...(x.media ? { asset: assetBox({ x: px, y: fy, w: x.w, h: x.h }, x.media.box) } : {}) });
    }
    partGeom.set(x.p.id, { x: px, y: hy, w: x.w, h: x.h, ...(x.media ? { asset: assetBox({ x: px, y: hy, w: x.w, h: x.h }, x.media.box) } : {}) });
  });

  const pad = env.pad;
  const bounds = {
    x: 0,
    y: top - (model.boxes.length ? 40 : 14) - pad,
    w: W + L.margin / 2 + pad,
    h: (L.mirror ? bottom + headH : bottom + 24) - top + 40 + pad * 2,
  };

  // the diagram's `title` (parsed but never drawn by the prototype, A.13): a page title above the participants
  body.unshift(...diagramTitle(bounds, model.title, ctx, family, pad));

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
  const out: SubResult = { defs: defs.nodes(), body, bounds, geom, presetsUsed: { message: countBy(msgs.map((x) => x.preset || '(none)')) } };
  // `accTitle` / `accDescr`: the SVG's <title> and <desc>
  const a11y = a11yOf(model);
  if (a11y) out.a11y = a11y;
  return out;
}

/** Radius of a central connection's circle. */
const CENTRAL_R = 5;

/** A message number in its disc. */
function numberBadge(n: number, x: number, y: number, color: string | undefined, family: string): SceneNode[] {
  return [el('circle', { cx: x, cy: y, r: 9, fill: color }), textBlock([String(n)], x, y, { size: n >= 100 ? 8 : 10, weight: 700, color: '#fff', family })];
}

/**
 * A half arrow head at (x, y), pointing `dir` (±1 along x). `run` is the way the line runs from sender to receiver:
 * Mermaid's `top` head is above the line when it runs to the right, below when it runs to the left (its marker turns
 * with the line). Filled: a right triangle with its tip on the line; stick: one stroke back from the tip.
 */
function halfHead(it: SeqMessage, x: number, y: number, dir: number, run: number, size: number, width: number, color: string | undefined): SceneNode[] {
  if (!it.half) return [];
  const len = size * 0.8, h = size * 0.5;
  const up = (it.half === 'top') === run > 0 ? -1 : 1;
  const bx = x - dir * len, by = y + up * h;
  if (it.stick) return [el('path', { d: `M${fmt(x)},${fmt(y)} L${fmt(bx)},${fmt(by)}`, fill: 'none', stroke: color, 'stroke-width': Math.max(1.5, width), 'stroke-linecap': 'round' })];
  return [el('path', { d: `M${fmt(x)},${fmt(y)} L${fmt(bx)},${fmt(y)} L${fmt(bx)},${fmt(by)} Z`, fill: color, stroke: color, 'stroke-width': 1, 'stroke-linejoin': 'round' })];
}

/** The first of a participant's Mermaid links that passes the link policy. */
function firstLink(ctx: RenderEnv['ctx'], p: Participant): ReturnType<typeof itemLink> {
  for (const l of p.links ?? []) {
    const href = itemLink(ctx, l.url);
    if (href) return href;
  }
  return null;
}

/** `data-links`: a participant's Mermaid links that pass the link policy, for the viewer's menu (only with two or more). */
function menuAttr(ctx: RenderEnv['ctx'], p: Participant): Record<string, string> {
  const list: [string, string][] = [];
  for (const l of p.links ?? []) {
    const href = itemLink(ctx, l.url);
    if (href) list.push([l.label || l.url, href]);
  }
  return list.length > 1 ? { 'data-links': JSON.stringify(list) } : {};
}

const toNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
