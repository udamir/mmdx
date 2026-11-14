// What the UIs show of each diagram type (A11c `KindUi`): its names, the look of its items' previews, the "Start a
// diagram" pictogram and a theme editor sample. The built-in types' are here; a kind plugin registers its own
// (`registerKindUi`, A11e). Names a type without one gets: its id.
import { KIND_NAMES, type KindNames } from '../../core/kinds/names.js';
import type { DiagramMeta } from '../../core/meta/index.js';
import type { BuiltinType, DiagramType, ItemKind } from '../../core/types.js';

/** One element of a pictogram: its tag and attributes. */
export type CardShape = [string, Record<string, string>];
const P = (d: string, extra: Record<string, string> = {}): CardShape => ['path', { d, ...extra }];
const R = (x: number, y: number, w: number, hh: number, rx: number): CardShape => ['rect', { x: String(x), y: String(y), width: String(w), height: String(hh), rx: String(rx) }];

/** The chooser's pictograms (fixed, trusted geometry from the prototype). */
const CARDS: Readonly<Record<BuiltinType, readonly CardShape[]>> = {
  flowchart: [R(4, 22, 26, 18, 4), P('M48 18l14 13-14 13-14-13z'), R(66, 6, 26, 16, 8), R(66, 42, 26, 16, 3), P('M30 31h4M62 31l3-17h1M62 31l3 18h1', { 'stroke-linecap': 'round' })],
  sequence: [R(6, 4, 24, 12, 3), R(66, 4, 24, 12, 3), P('M18 16v44M78 16v44', { 'stroke-dasharray': '3 3' }), P('M18 28h56M70 24l4 4-4 4M78 44H22M26 40l-4 4 4 4', { 'stroke-linecap': 'round' })],
  er: [R(4, 6, 34, 40, 4), P('M4 16h34M10 24h20M10 32h16'), R(58, 18, 34, 40, 4), P('M58 28h34M64 36h20M64 44h16M38 26h10v12h10M52 34l6 4-6 4', { 'stroke-linecap': 'round' })],
  mindmap: [R(34, 24, 28, 16, 8), P('M34 32C26 32 26 14 18 14M34 32C26 32 26 50 18 50M62 32C70 32 70 14 78 14M62 32C70 32 70 50 78 50', { 'stroke-linecap': 'round' }), P('M4 14h14M4 50h14M78 14h14M78 50h14', { 'stroke-linecap': 'round' })],
  // start dot → state → end ring, a composite frame around the state
  state: [['circle', { cx: '8', cy: '32', r: '4', fill: 'currentColor' }], P('M12 32h10M19 29l3 3-3 3', { 'stroke-linecap': 'round' }), R(24, 10, 48, 44, 8), P('M24 20h48'), R(32, 26, 32, 18, 6), P('M72 32h10M79 29l3 3-3 3', { 'stroke-linecap': 'round' }), ['circle', { cx: '88', cy: '32', r: '5' }], ['circle', { cx: '88', cy: '32', r: '2', fill: 'currentColor' }]],
};

/** The sample an item preview draws (item-preview-core.ts): an item kind's, or a type's own look of it. */
export type PreviewKind =
  | 'node' | 'group' | 'edge' | 'participant' | 'message' | 'note' | 'block' | 'box' | 'lifeline' | 'activation' | 'entity' | 'rel'
  // mindmap: the root, a node, a branch, a section's colours (a section preset is its number)
  | 'mm-root' | 'mm-node' | 'mm-branch' | 'mm-section'
  // state diagram: a state, the pseudo-states and bars, a composite, a composite colour (its number), a note, a transition
  | 'st-state' | 'st-start' | 'st-end' | 'st-choice' | 'st-fork' | 'st-composite' | 'st-composite-color' | 'st-note' | 'st-transition'
  // a kind plugin's own samples
  | (string & {});

/** How an item preview draws one sample (item-preview-core.ts): a tiny diagram of the type, the preset (and shape) applied through metadata, as on the canvas. */
export interface PreviewSample {
  /** The sample's source and metadata for a preset and a shape. */
  readonly source: (preset: string | undefined, shape?: string) => [string, Partial<DiagramMeta>];
  /** The elements the preview is centred on (default: the items of the sample's kind, `[data-kind="<kind>"]`). */
  readonly focus?: string;
  /** Kept in view at its start (a title at the top left) or its end (a message's arrow head); default centred. */
  readonly align?: 'start' | 'end';
}

export interface KindUi {
  readonly names: KindNames;
  /** The preview of an item kind whose items look unlike the flowchart's of the same kind. */
  readonly previews?: Readonly<Partial<Record<ItemKind, PreviewKind>>>;
  /** The "Start a diagram" pictogram (a 96 × 64 viewBox, stroked in the accent colour). */
  readonly card?: readonly CardShape[];
  /** The theme editor's sample source (the built-in types' are the theme editor's own). */
  readonly sample?: string;
  /** The item previews' samples this type supplies, by preview kind (X21: each type its own, no central table). */
  readonly previewSamples?: Readonly<Record<string, PreviewSample>>;
}

/** Drops undefined values (exactOptionalPropertyTypes; metadata never stores undefined). */
function def(o: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

/** Each built-in type's preview samples (a type's KindUi `previewSamples`; a kind plugin brings its own). */
const SAMPLES: Readonly<Record<BuiltinType, Readonly<Record<string, PreviewSample>>>> = {
  flowchart: {
    node: { source: (p, shape) => ['flowchart LR\n  n["Label"]', { nodes: { n: def({ preset: p, shape }) } }] },
    group: { source: (p) => ['flowchart LR\n  subgraph g ["Group"]\n    a["Item"]\n  end', { groups: { g: def({ preset: p }) } }] },
    edge: { source: (p) => ['flowchart LR\n  a["A"] -->|"label"| b["B"]', { edges: { 'a->b': def({ preset: p }) } }] },
  },
  sequence: {
    participant: { source: (p, shape) => ['sequenceDiagram\n  participant A as Participant', { participants: { A: def({ preset: p, shape }) } }], focus: '[data-kind="participant"][data-id="A"]' },
    message: { source: (p) => ['sequenceDiagram\n  participant A\n  participant B\n  A->>B: message', { messages: { m1: def({ preset: p }) } }], align: 'end' },
    note: { source: (p) => ['sequenceDiagram\n  participant A\n  Note over A: a note', { notes: { n1: def({ preset: p }) } }] },
    block: { source: (p) => ['sequenceDiagram\n  participant A\n  participant B\n  loop condition\n    A->>B: call\n  end', { blocks: { b1: def({ preset: p }) } }], align: 'start' },
    box: { source: (p) => ['sequenceDiagram\n  box Group\n    participant A\n    participant B\n  end', { boxes: { box1: def({ preset: p }) } }], align: 'start' },
    lifeline: { source: () => ['sequenceDiagram\n  participant A\n  participant B\n  A->>B: call\n  B-->>A: reply', {}], focus: '[data-kind="participant"][data-id="B"]' },
    activation: { source: (p) => ['sequenceDiagram\n  participant A\n  participant B\n  A->>+B: call\n  B-->>-A: reply', { activations: { 'B:1': def({ preset: p }) } }], focus: '[data-kind="participant"][data-id="B"]' },
  },
  er: {
    entity: { source: (p) => ['erDiagram\n  TABLE {\n    string id PK\n    string name\n  }', { entities: { TABLE: def({ preset: p }) } }] },
    rel: { source: (p) => ['erDiagram\n  A ||--o{ B : label', { rels: { 'A--B': def({ preset: p }) } }] },
  },
  mindmap: {
    'mm-root': { source: () => ['mindmap\n  r((Topic))', {}], focus: '[data-kind="node"][data-id="r"]' },
    'mm-node': { source: (p, shape) => ['mindmap\n  r((Topic))\n    n[Idea]', { nodes: { n: def({ preset: p, shape }) } }], focus: '[data-kind="node"][data-id="n"]' },
    'mm-branch': { source: () => ['mindmap\n  r((Topic))\n    a\n      b\n        c', {}] },
    'mm-section': { source: (p) => ['mindmap\n  r((Topic))\n    n[Idea]\n      m\n    o', { nodes: { n: { section: Number(p ?? 0) || 0 } } }], focus: '[data-kind="node"][data-id="n"]' },
  },
  state: {
    'st-state': { source: (p, shape) => ['stateDiagram-v2\n  state "State" as s', { nodes: { s: def({ preset: p, shape }) } }], focus: '[data-kind="node"][data-id="s"]' },
    'st-start': { source: () => ['stateDiagram-v2\n  [*] --> s', {}], focus: '[data-kind="node"][data-id="[*]start"]' },
    'st-end': { source: () => ['stateDiagram-v2\n  s --> [*]', {}], focus: '[data-kind="node"][data-id="[*]end"]' },
    'st-choice': { source: () => ['stateDiagram-v2\n  state c <<choice>>', {}], focus: '[data-kind="node"][data-id="c"]' },
    'st-fork': { source: () => ['stateDiagram-v2\n  state f <<fork>>', {}], focus: '[data-kind="node"][data-id="f"]' },
    'st-composite': { source: (p) => ['stateDiagram-v2\n  state "Composite" as g {\n    a\n  }', { groups: { g: def({ preset: p }) } }], focus: '[data-kind="group"][data-id="g"]' },
    // a composite colour is previewed on the "Coloured composites" page: the colour's number picks the composite
    // the composites before it take the colours before it (the preview is centred on the last one, `g`)
    'st-composite-color': { source: (p) => ['stateDiagram-v2\n' + [...Array.from({ length: Number(p ?? 0) || 0 }, (_, i) => `  state c${i} {\n    a${i}\n  }`), '  state "Composite" as g {\n    a\n  }'].join('\n'), { canvas: { composites: 'palette' } }], focus: '[data-kind="group"][data-id="g"]' },
    'st-note': { source: (p) => ['stateDiagram-v2\n  s\n  note right of s : a note', { notes: { n1: def({ preset: p }) } }], focus: '[data-kind="note"]' },
    'st-transition': { source: (p) => ['stateDiagram-v2\n  a --> b : label', { edges: { 'a->b': def({ preset: p }) } }], focus: '[data-kind="edge"]' },
  },
};


const PREVIEWS: Readonly<Partial<Record<BuiltinType, Partial<Record<ItemKind, PreviewKind>>>>> = {
  mindmap: { node: 'mm-node' },
  state: { node: 'st-state', group: 'st-composite', edge: 'st-transition', note: 'st-note' },
};

const UI = new Map<DiagramType, KindUi>((Object.keys(KIND_NAMES) as BuiltinType[]).map((t) => [t, { names: KIND_NAMES[t], card: CARDS[t], ...(PREVIEWS[t] ? { previews: PREVIEWS[t] } : {}), previewSamples: SAMPLES[t] }]));

/** A kind plugin's UI (A11e); registering a type again replaces it. */
export function registerKindUi(type: DiagramType, ui: KindUi): void {
  UI.set(type, ui);
}

/** A type's UI; a type that registered none is named by its id. */
export const kindUi = (type: DiagramType): KindUi => UI.get(type) ?? { names: { name: type, title: type, blurb: '' } };

/** The sample of a preview kind: from the registered type that supplies it, or undefined. */
export function previewSample(kind: PreviewKind): PreviewSample | undefined {
  for (const ui of UI.values()) {
    const s = ui.previewSamples?.[kind];
    if (s) return s;
  }
  return undefined;
}
