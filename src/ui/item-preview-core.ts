// Preview of one item type in one style (default or a preset), drawn by the real renderer so it looks exactly like
// the diagram (prototype item-preview.js). Used by the theme editor tiles and the preset pickers of the editor.
//
// Production: rendering goes through the pipeline (parse → render → scene → the DOM patcher), with a RenderContext
// made for this one call (`renderContext()`), whose idPrefix is unique per preview so marker and pattern ids never
// collide between tiles. There is no global colour resolver: the context resolves against the given theme.
//
// This module takes the diagram kinds (parsers and renderers) and the core context from its caller (§9.1:
// `drawItemPreviewWith`, `renderItemSampleWith`), so it loads no parser itself. ui/item-preview.ts wraps it with
// every kind and the shared configuration (`drawItemPreview`, `renderItemSample`).
import { opsKind } from '../core/kinds/registry.js';
import type { CoreContext } from '../core/context.js';
import { nextIdPrefix } from '../core/context.js';
import { emptyMeta, type DiagramMeta } from '../core/meta/index.js';
import { parseWith } from '../core/parse/dispatch.js';
import { renderContext, type Kinds } from '../core/pipeline-core.js';
import { renderWith } from '../core/render/dispatch.js';
import type { GeometryIndex, RenderResult } from '../core/render/types.js';
import type { ResolvedTheme } from '../core/theme/types.js';
import type { DiagramType, ItemKind, Rect } from '../core/types.js';
import { patchChildren } from '../dom/patch.js';
import { maxOf, minOf } from '../core/geom.js';

const NS = 'http://www.w3.org/2000/svg';

export type PreviewKind =
  | 'node' | 'group' | 'edge' | 'participant' | 'message' | 'note' | 'block' | 'box' | 'lifeline' | 'activation' | 'entity' | 'rel'
  // mindmap: the root, a node, a branch, a section's colours (a section preset is its number)
  | 'mm-root' | 'mm-node' | 'mm-branch' | 'mm-section'
  // state diagram: a state, the pseudo-states and bars, a composite, a composite colour (its number), a note, a transition
  | 'st-state' | 'st-start' | 'st-end' | 'st-choice' | 'st-fork' | 'st-composite' | 'st-composite-color' | 'st-note' | 'st-transition';

/** The preview of an item kind in a diagram type whose items look unlike the flowchart's of the same kind. */
const TYPE_PREVIEWS: Partial<Record<DiagramType, Partial<Record<ItemKind, PreviewKind>>>> = {
  mindmap: { node: 'mm-node' },
  state: { node: 'st-state', group: 'st-composite', edge: 'st-transition', note: 'st-note' },
};

/** The sample an item kind of a diagram type is previewed with. */
export const previewKind = (type: DiagramType | null | undefined, kind: ItemKind): PreviewKind =>
  (type ? TYPE_PREVIEWS[type]?.[kind] : undefined) ?? (kind as PreviewKind);

type Sample = (preset: string | undefined, shape?: string) => [string, Partial<DiagramMeta>];


/** A tiny diagram per item type; the preset is applied through metadata, as on the canvas. */
export const ITEM_SAMPLES: Readonly<Record<PreviewKind, Sample>> = {
  node: (p, shape) => ['flowchart LR\n  n["Label"]', { nodes: { n: def({ preset: p, shape }) } }],
  group: (p) => ['flowchart LR\n  subgraph g ["Group"]\n    a["Item"]\n  end', { groups: { g: def({ preset: p }) } }],
  edge: (p) => ['flowchart LR\n  a["A"] -->|"label"| b["B"]', { edges: { 'a->b': def({ preset: p }) } }],
  participant: (p, shape) => ['sequenceDiagram\n  participant A as Participant', { participants: { A: def({ preset: p, shape }) } }],
  message: (p) => ['sequenceDiagram\n  participant A\n  participant B\n  A->>B: message', { messages: { m1: def({ preset: p }) } }],
  note: (p) => ['sequenceDiagram\n  participant A\n  Note over A: a note', { notes: { n1: def({ preset: p }) } }],
  block: (p) => ['sequenceDiagram\n  participant A\n  participant B\n  loop condition\n    A->>B: call\n  end', { blocks: { b1: def({ preset: p }) } }],
  box: (p) => ['sequenceDiagram\n  box Group\n    participant A\n    participant B\n  end', { boxes: { box1: def({ preset: p }) } }],
  lifeline: () => ['sequenceDiagram\n  participant A\n  participant B\n  A->>B: call\n  B-->>A: reply', {}],
  activation: (p) => ['sequenceDiagram\n  participant A\n  participant B\n  A->>+B: call\n  B-->>-A: reply', { activations: { 'B:1': def({ preset: p }) } }],
  entity: (p) => ['erDiagram\n  TABLE {\n    string id PK\n    string name\n  }', { entities: { TABLE: def({ preset: p }) } }],
  rel: (p) => ['erDiagram\n  A ||--o{ B : label', { rels: { 'A--B': def({ preset: p }) } }],
  'mm-root': () => ['mindmap\n  r((Topic))', {}],
  'mm-node': (p, shape) => ['mindmap\n  r((Topic))\n    n[Idea]', { nodes: { n: def({ preset: p, shape }) } }],
  'mm-branch': () => ['mindmap\n  r((Topic))\n    a\n      b\n        c', {}],
  'mm-section': (p) => ['mindmap\n  r((Topic))\n    n[Idea]\n      m\n    o', { nodes: { n: { section: Number(p ?? 0) || 0 } } }],
  'st-state': (p, shape) => ['stateDiagram-v2\n  state "State" as s', { nodes: { s: def({ preset: p, shape }) } }],
  'st-start': () => ['stateDiagram-v2\n  [*] --> s', {}],
  'st-end': () => ['stateDiagram-v2\n  s --> [*]', {}],
  'st-choice': () => ['stateDiagram-v2\n  state c <<choice>>', {}],
  'st-fork': () => ['stateDiagram-v2\n  state f <<fork>>', {}],
  'st-composite': (p) => ['stateDiagram-v2\n  state "Composite" as g {\n    a\n  }', { groups: { g: def({ preset: p }) } }],
  // a composite colour is previewed on the "Coloured composites" page: the colour's number picks the composite
  // the composites before it take the colours before it (the preview is centred on the last one, `g`)
  'st-composite-color': (p) => ['stateDiagram-v2\n' + [...Array.from({ length: Number(p ?? 0) || 0 }, (_, i) => `  state c${i} {\n    a${i}\n  }`), '  state "Composite" as g {\n    a\n  }'].join('\n'), { canvas: { composites: 'palette' } }],
  'st-note': (p) => ['stateDiagram-v2\n  s\n  note right of s : a note', { notes: { n1: def({ preset: p }) } }],
  'st-transition': (p) => ['stateDiagram-v2\n  a --> b : label', { edges: { 'a->b': def({ preset: p }) } }],
};

/** Drops undefined values (exactOptionalPropertyTypes; metadata never stores undefined). */
function def(o: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

const FOCUS: Readonly<Partial<Record<PreviewKind, string>>> = {
  participant: '[data-kind="participant"][data-id="A"]',
  lifeline: '[data-kind="participant"][data-id="B"]',
  activation: '[data-kind="participant"][data-id="B"]',
  'mm-root': '[data-kind="node"][data-id="r"]',
  'mm-node': '[data-kind="node"][data-id="n"]',
  'mm-section': '[data-kind="node"][data-id="n"]',
  'st-state': '[data-kind="node"][data-id="s"]',
  'st-start': '[data-kind="node"][data-id="[*]start"]',
  'st-end': '[data-kind="node"][data-id="[*]end"]',
  'st-choice': '[data-kind="node"][data-id="c"]',
  'st-fork': '[data-kind="node"][data-id="f"]',
  'st-composite': '[data-kind="group"][data-id="g"]',
  'st-composite-color': '[data-kind="group"][data-id="g"]',
  'st-note': '[data-kind="note"]',
  'st-transition': '[data-kind="edge"]',
};
const LEFT_ALIGNED = new Set<PreviewKind>(['block', 'box']); // their title sits at the top left

export interface ItemPreviewOptions {
  /** Real size × zoom (default 1). */
  zoom?: number;
  minH?: number;
  maxH?: number;
  /** Scale the item down (never up) to fit the element's width × h. */
  fit?: { h: number } | null;
  /** Local presets of the diagram (meta.styles), so they can be previewed too. */
  styles?: DiagramMeta['styles'] | null;
  /** Draw a node / participant in this shape (the shape tabs of the theme editor). */
  shape?: string;
  /** Measurer and link policy (ui/item-preview.ts's wrappers default it to the shared configuration). */
  ctx?: CoreContext;
  /** Page settings for the sample (the theme editor previews page presets with it). */
  canvas?: DiagramMeta['canvas'];
}

interface Box {
  x: number;
  y: number;
  x2: number;
  y2: number;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** What a preview renders with: the diagram kinds (only the sample's own type is needed) and the core context. */
export interface PreviewEnv {
  kinds: Kinds;
  /** Measurer and link policy; `opts.ctx` overrides it. */
  ctx: CoreContext;
}

export type SampleOptions = Pick<ItemPreviewOptions, 'styles' | 'shape' | 'ctx' | 'canvas'>;
export interface Sampled {
  result: RenderResult;
  background: string;
  color: (v: unknown) => string | undefined;
}

/** Renders the sample of `kind` with the given kinds and returns the scene and the context used (no DOM). */
export function renderItemSampleWith(env: PreviewEnv, kind: PreviewKind, preset: string | null | undefined, theme: ResolvedTheme, opts: SampleOptions = {}): Sampled {
  const [src, m] = ITEM_SAMPLES[kind](preset || undefined, opts.shape);
  const meta: DiagramMeta = { ...emptyMeta(), ...clone(m) };
  if (opts.styles) meta.styles = clone(opts.styles);
  if (opts.canvas) meta.canvas = clone(opts.canvas);
  const base = opts.ctx ?? env.ctx;
  // one context per preview: a unique idPrefix keeps marker ids apart between tiles on one page
  const ctx: CoreContext = { ...base, idPrefix: nextIdPrefix() };
  const model = parseWith(src, env.kinds);
  const rctx = renderContext(ctx, theme, { code: src, meta });
  const result = renderWith(env.kinds, model, meta, theme, rctx);
  const background = rctx.color(theme.canvas.background) ?? rctx.color(theme.palette['paper']) ?? '#ffffff';
  return { result, background: background === 'none' || background === 'transparent' ? rctx.color(theme.palette['paper']) ?? '#ffffff' : background, color: rctx.color };
}

/**
 * Draws `kind` in `preset` (null: its default style) with theme `theme` into `pic`, with the given kinds.
 *   default: real size × zoom — a window the width of pic, centred on the item, at least minH tall; the rest is cropped
 *   fit: { h } — the item scaled down (never up) to fit pic's width × h
 */
export function drawItemPreviewWith(env: PreviewEnv, pic: HTMLElement, kind: PreviewKind, preset: string | null | undefined, theme: ResolvedTheme, opts: ItemPreviewOptions = {}): void {
  const { zoom = 1, minH = 90, maxH = 230, fit = null } = opts;
  try {
    const { result, background } = renderItemSampleWith(env, kind, preset, theme, opts);
    const svgEl = document.createElementNS(NS, 'svg');
    svgEl.setAttribute('aria-hidden', 'true');
    svgEl.style.background = background;
    const defs = document.createElementNS(NS, 'defs');
    const g = document.createElementNS(NS, 'g');
    patchChildren(defs, result.defs);
    patchChildren(g, result.body);
    svgEl.append(defs, g);
    pic.replaceChildren(svgEl);
    // the item's box in diagram units (its label included): measured when laid out, else from the geometry
    let F = measured(svgEl, FOCUS[kind] ?? `[data-kind="${kind}"]`) ?? fromGeom(result.geom, kind);
    const B: Rect = result.contentBounds.w ? result.contentBounds : result.bounds;
    F ??= { x: B.x, y: B.y, x2: B.x + B.w, y2: B.y + B.h };
    const pad = 12;
    if (fit) {
      // lifeline / activation: show the head and a piece of the line under it
      if (kind === 'lifeline' || kind === 'activation') F = { ...F, y2: Math.min(B.y + B.h, F.y2 + 120) };
      const w = F.x2 - F.x + 2 * pad, hh = F.y2 - F.y + 2 * pad;
      const W = Math.max(40, pic.clientWidth), k = Math.min(1, W / w, fit.h / hh);
      // window = the box's size in diagram units, centred on the item
      const vw = W / k, vh = fit.h / k;
      svgEl.setAttribute('viewBox', `${(F.x + F.x2) / 2 - vw / 2} ${(F.y + F.y2) / 2 - vh / 2} ${vw} ${vh}`);
      svgEl.setAttribute('width', String(W));
      svgEl.setAttribute('height', String(fit.h));
      pic.style.height = `${fit.h}px`;
      return;
    }
    const W = Math.max(60, pic.clientWidth || 160) / zoom;
    let H = Math.min(maxH, Math.max(minH, F.y2 - F.y + 2 * pad));
    let y0 = (F.y + F.y2) / 2 - H / 2;
    // lifeline / activation: the window starts at the bottom of the participant head and goes down
    if (kind === 'lifeline' || kind === 'activation') {
      y0 = F.y2 - 24;
      H = Math.max(40, Math.min(maxH, B.y + B.h - y0));
    }
    // messages are wider than a tile: keep the arrow head (their right end) in view
    const x0 = LEFT_ALIGNED.has(kind) ? F.x - pad : kind === 'message' ? F.x2 + pad - W : (F.x + F.x2) / 2 - W / 2;
    svgEl.setAttribute('viewBox', `${x0} ${y0} ${W} ${H}`);
    svgEl.setAttribute('width', String(W * zoom));
    svgEl.setAttribute('height', String(H * zoom));
    pic.style.height = `${H * zoom}px`;
  } catch {
    pic.textContent = '—';
  }
}

/** Union of the laid-out boxes of the matching elements (null when the engine cannot measure). */
function measured(svgEl: SVGSVGElement, selector: string): Box | null {
  let F: Box | null = null;
  for (const e of Array.from(svgEl.querySelectorAll(selector))) {
    const ge = e as SVGGraphicsElement;
    if (typeof ge.getBBox !== 'function' || !svgEl.isConnected) return null;
    let b: DOMRect;
    try {
      b = ge.getBBox();
    } catch {
      return null;
    }
    if (!b.width && !b.height) continue;
    F = F ? { x: Math.min(F.x, b.x), y: Math.min(F.y, b.y), x2: Math.max(F.x2, b.x + b.width), y2: Math.max(F.y2, b.y + b.height) } : { x: b.x, y: b.y, x2: b.x + b.width, y2: b.y + b.height };
  }
  return F;
}

const centred = (b: { x: number; y: number; w: number; h: number }): Box => ({ x: b.x - b.w / 2, y: b.y - b.h / 2, x2: b.x + b.w / 2, y2: b.y + b.h / 2 });
const union = (boxes: Box[]): Box | null =>
  boxes.length ? boxes.reduce((a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) })) : null;

/** The item's box from the render geometry (engines without SVG layout, e.g. jsdom). */
function fromGeom(g: GeometryIndex, kind: PreviewKind): Box | null {
  const k = g.type ? opsKind(g.type) : undefined;
  if (!k) return null;
  // the participant sample is A; lifelines and processes are shown on B
  if (kind === 'participant' || kind === 'lifeline' || kind === 'activation') {
    const b = k.box(g, { kind: 'participant', id: kind === 'participant' ? 'A' : 'B' });
    return b ? centred(b) : null;
  }
  const lineBox = (e: { points: [number, number][]; a: { x: number; y: number }; b: { x: number; y: number }; label: { x: number; y: number; w: number; h: number } | null }): Box => {
    const xs = [e.a.x, e.b.x, ...e.points.map((p) => p[0])], ys = [e.a.y, e.b.y, ...e.points.map((p) => p[1])];
    const b: Box = { x: minOf(xs), y: minOf(ys), x2: maxOf(xs), y2: maxOf(ys) };
    return e.label ? union([b, centred(e.label)])! : b;
  };
  const boxes: Box[] = [];
  for (const it of k.drawn(g)) {
    if (it.ref.kind !== kind) continue;
    if ('box' in it) boxes.push(centred(it.box));
    else {
      const e = k.edge?.(g, it.ref);
      if (e) boxes.push(lineBox(e));
      else if (it.points?.length) {
        // a straight message: its line with room for the text above it
        const xs = it.points.map((p) => p[0]), ys = it.points.map((p) => p[1]);
        boxes.push({ x: minOf(xs), y: minOf(ys) - 16, x2: maxOf(xs), y2: maxOf(ys) + 4 });
      }
    }
  }
  return union(boxes);
}
