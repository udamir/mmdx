// Diagram diff prototype: review what a merge request changes in a diagram.
// Five ways to look at one semantic diff (src/core/diff), with content / layout / style changes that can each be
// ignored. Everything here is prototype UI on top of the core API.
/// <reference types="vite/client" />
import { createContext, isSupported, joinSource, renderDocument, renderSource, splitSource, type Rendered } from '../../../src/core.js';
import {
  diffDiagrams, ignoreFacets, withLayoutOf, withoutStyle, type ChangeFacet, type DiagramDiff, type DiffIgnore, type FieldChange,
  type ItemChange,
} from '../../../src/core/diff/index.js';
import { createCanvasMeasurer } from '../../../src/dom/measure.js';
import {
  centreOf, dimOthers, drawHighlights, drawMoves, shapeOf, SharedView, svgEl, toSvgElement, union,
  type Highlight, type ItemShape, type Mark,
} from './canvas.js';
import { decorateText, highlightRuns, withLayout } from './decorate.js';
import { buildMerged, REMOVED, type Merged } from './merge.js';
import { Morph } from './morph.js';
import { Ink, INK_COLORS, INK_FADES, INK_SIZES } from './ink.js';
import { hunks, lineDiff } from './textdiff.js';
import { I_code, I_hand, I_list, I_palette, I_pen } from '../../../src/ui/icons.js';
import { icon } from '../../../src/ui/h.js';
import type { ItemKind } from '../../../src/core/types.js';

// ---- setup ------------------------------------------------------------------------------------------------------

const measure = createCanvasMeasurer();
const ctx = createContext(measure ? { measure } : {});
// the default themes are bundled already; register the others so samples can name them
const themeFiles = import.meta.glob<unknown>(['../../../themes/*.theme.json', '!**/default-*.theme.json'], { eager: true, import: 'default' });
for (const f of Object.values(themeFiles)) ctx.themes.register(f);

const samples = import.meta.glob<string>('../diff-samples/*.mmd', { eager: true, query: '?raw', import: 'default' });
const sample = (name: string, side: 'before' | 'after') => samples[`../diff-samples/${name}.${side}.mmd`] ?? '';
const histories = import.meta.glob<{ message: string; author: string; date: string; source?: string }[]>('../diff-samples/*.history.json', { eager: true, import: 'default' });

/** One version of the diagram in its history (oldest first in `state.versions`). */
interface Version {
  /** 1-based number, oldest = v1. */
  n: number;
  /** Short content hash, like a commit id. */
  id?: string;
  message: string;
  author: string;
  date: string;
  source: string;
  /** Changes against the previous version, computed when the history is loaded. */
  counts?: DiagramDiff['counts'];
}

const I_history = 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4.5V9h4.5M12 7.5V12l3 2';

/** The sample's history: generated versions when there are some, else its two sides. */
function historyOf(id: string): Version[] {
  const before = sample(id, 'before'), after = sample(id, 'after');
  const h = histories[`../diff-samples/${id}.history.json`];
  const day = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
  const list = h
    ? h.map((e, i) => ({ n: i + 1, message: e.message, author: e.author, date: e.date, source: e.source ?? (i === 0 ? before : after) }))
    : [
        { n: 1, message: 'Target branch', author: 'Damir', date: day(3), source: before },
        { n: 2, message: SAMPLES.find((x) => x.id === id)?.note ?? 'Merge request', author: 'Alex', date: day(0), source: after },
      ];
  return withCounts(list);
}

/** FNV-1a of the source as 7 hex digits. */
function shortId(src: string): string {
  let x = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) x = Math.imul(x ^ src.charCodeAt(i), 0x01000193) >>> 0;
  return x.toString(16).padStart(8, '0').slice(0, 7);
}

function withCounts(list: Version[]): Version[] {
  return list.map((v, i) => ({ ...v, id: shortId(`${i}\n${v.source}`), ...(i ? { counts: diffDiagrams(list[i - 1]!.source, v.source).counts } : {}) }));
}

const SAMPLES: { id: string; group: string; title: string; note: string }[] = [
  { id: 'flow-few', group: 'Flowchart', title: 'Few changes', note: 'A new service, one relabel, one move and an edge preset.' },
  { id: 'architecture', group: 'Flowchart', title: 'Medium: architecture change', note: 'Added and removed services, a renamed node, relabels, moves and restyles mixed together.' },
  { id: 'flow-many', group: 'Flowchart', title: 'Many changes (60+)', note: 'A large refactor of the microservice pattern map: relabels, new and deleted nodes and edges, moves and restyles.' },
  { id: 'restyle', group: 'Flowchart', title: 'Restyle with one hidden edit', note: 'Theme switch and class changes everywhere — switch the Style filter off in the left panel to find the one real edit.' },
  { id: 'small', group: 'Flowchart', title: 'Pure Mermaid, auto layout', note: 'No layout metadata: new nodes make the auto layout move things around.' },
  { id: 'sequence', group: 'Sequence', title: 'Few changes', note: 'One inserted and one removed message shift every message id; the text diff of the metadata is all noise.' },
  { id: 'seq-medium', group: 'Sequence', title: 'Medium', note: 'Edited, inserted and removed messages, new notes, a renamed and restyled participant.' },
  { id: 'seq-many', group: 'Sequence', title: 'Many changes', note: 'A reworked deployment flow: dozens of message edits, inserts, removals and notes.' },
  { id: 'schema', group: 'ER', title: 'Few changes', note: 'Renamed columns, a widened type, a moved table and a recoloured table.' },
  { id: 'er-medium', group: 'ER', title: 'Medium', note: 'Type changes, renamed, added and removed columns, a new and a dropped table.' },
  { id: 'er-many', group: 'ER', title: 'Many changes (50+)', note: 'A big schema migration across the 60-table archive database.' },
];

/** Views: one canvas stepping through the three states (animated), or the two versions side by side. */
type Mode = 'before' | 'merged' | 'after' | 'side';

const MODES: { id: Mode; label: string; key: string; help: string }[] = [
  { id: 'before', label: 'Before', key: '1', help: 'The target branch, with its removed and changed items highlighted.' },
  { id: 'merged', label: 'Merged', key: '2', help: 'One overlay: the new version with removed items kept in place, text changes marked word by word and an arrow from the old place of every moved item.' },
  { id: 'after', label: 'After', key: '3', help: 'The merge request, with its added and changed items highlighted.' },
  { id: 'side', label: 'Side by side', key: '4', help: 'Before and after next to each other, panned and zoomed together.' },
];
/** Index of a single-canvas view among the morph states. */
const STATE_OF: Partial<Record<Mode, number>> = { before: 0, merged: 1, after: 2 };

const FACET_INFO: Record<ChangeFacet, { label: string; help: string }> = {
  content: { label: 'Content', help: 'Changed content of kept items: labels, shapes, connections, attributes, message text' },
  layout: { label: 'Layout', help: 'Position, size, bend points, ports, layers' },
  style: { label: 'Style', help: 'Colours, fonts, presets, classes, theme' },
};

const state = {
  sample: 'architecture',
  before: sample('architecture', 'before'),
  after: sample('architecture', 'after'),
  mode: 'merged' as Mode,
  /** Editor-like side panels: code diff or history (left, one at a time) and the change list (right). */
  panels: { left: null as 'code' | 'history' | null, changes: true },
  /** History of the diagram, oldest first; `at` is the version shown (after), `base` the one it is compared with (before). */
  versions: [] as Version[],
  at: 0,
  base: 0,
  /** History panel: view one version as it is, or compare two. */
  historyMode: 'compare' as 'view' | 'compare',
  /** The version shown in view mode. */
  viewing: 0,
  ignore: {} as DiffIgnore,
  /** Added / removed items switched off in the left panel filters. */
  hide: {} as { added?: boolean; removed?: boolean },
  dim: true,
  codeTab: 'code' as 'code' | 'meta',
  filter: 'all' as 'all' | 'added' | 'removed' | 'changed',
  selected: null as string | null,
  open: new Set<string>(),
  swipe: 50,
  onion: 50,
  /** Left bar tool: drag pans the canvas, or draws review ink. */
  tool: 'pan' as 'pan' | 'draw',
  inkColor: INK_COLORS[0] as string,
  inkSize: INK_SIZES[1] as number,
  inkFade: INK_FADES[0] as number,
};

const ink = new Ink([], {
  active: () => state.tool === 'draw',
  color: () => state.inkColor,
  size: () => state.inkSize,
  fade: () => state.inkFade,
  onChange: () => renderTools(),
});

// ---- tiny DOM helper --------------------------------------------------------------------------------------------

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') e.className = String(v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k in e && typeof v !== 'string') (e as unknown as Record<string, unknown>)[k] = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
}
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// ---- derived data -----------------------------------------------------------------------------------------------

interface Derived {
  raw: DiagramDiff;
  diff: DiagramDiff;
  rb: Rendered;
  ra: Rendered;
  srcBefore: string;
  srcAfter: string;
  changes: ItemChange[];
  /** before-side element key → change key */
  fromBefore: Map<string, string>;
  layoutAligned: boolean;
  /** The merged diagram (after + removed items, text changes marked), null when the types differ. */
  merged: Merged | null;
  rm: Rendered | null;
}

let D: Derived;
/** Change key = the item's key in the merged diagram (removed items get a suffix there, except participants). */
const removedId = (kind: string, id: string) => (kind === 'participant' ? id : id + REMOVED);
const keyOf = (c: Pick<ItemChange, 'kind' | 'id' | 'status'>) => `${c.kind}:${c.status === 'removed' ? removedId(c.kind, c.id) : c.id}`;
const beforeKeyOf = (c: ItemChange) => `${c.kind}:${c.beforeId ?? c.id}`;

function derive(): Derived {
  const raw = diffDiagrams(state.before, state.after);
  const ignored = ignoreFacets(raw, state.ignore);
  const items = ignored.items.map((c) => (state.hide[c.status as 'added' | 'removed'] ? { ...c, status: 'unchanged' as const } : c));
  const diff: DiagramDiff = { ...ignored, items, counts: { ...ignored.counts, added: state.hide.added ? 0 : ignored.counts.added, removed: state.hide.removed ? 0 : ignored.counts.removed } };
  let srcBefore = state.before, srcAfter = state.after;
  if (state.ignore.style) {
    srcBefore = withoutStyle(srcBefore);
    srcAfter = withoutStyle(srcAfter);
  }
  // sequence metadata is keyed by position, so its layout cannot be transplanted by id
  const layoutAligned = !!state.ignore.layout && raw.type !== 'sequence' && !raw.typeChanged;
  if (layoutAligned) srcBefore = withLayoutOf(srcBefore, srcAfter);
  const rb = renderSource(srcBefore, ctx), ra = renderSource(srcAfter, ctx);
  const pos = (c: ItemChange) => {
    const s = c.status === 'removed' ? shapeOf(rb.result.geom, c.kind, c.beforeId ?? c.id) : shapeOf(ra.result.geom, c.kind, c.id);
    return s ? centreOf(s) : { x: 0, y: 0 };
  };
  const changes = diff.items
    .filter((c) => c.status !== 'unchanged')
    .map((c) => ({ c, p: pos(c) }))
    .sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x)
    .map((x) => x.c);
  const fromBefore = new Map(diff.items.map((c) => [beforeKeyOf(c), keyOf(c)]));
  const merged = isSupported(rb.model) && isSupported(ra.model) ? buildMerged(diff, rb.model, ra.model, rb.doc.meta, ra.doc.meta) : null;
  let rm: Rendered | null = null;
  if (merged) {
    const doc = { code: '', meta: merged.meta };
    rm = { ...renderDocument(doc, merged.model, ctx, state.ignore.style ? { theme: ra.themeId } : {}), doc, model: merged.model, tooLarge: false, diagnostics: [] };
  }
  return { raw, diff, rb, ra, srcBefore, srcAfter, changes, fromBefore, layoutAligned, merged, rm };
}

const markOf = (c: ItemChange): Mark => (c.status === 'added' ? 'added' : c.status === 'removed' ? 'removed' : c.facets[0] ?? 'content');
const badgeOf = (c: ItemChange): string => (c.status === 'added' ? '+' : c.status === 'removed' ? '−' : c.facets.map((f) => f[0]!.toUpperCase()).join(''));

function highlightsFor(side: 'before' | 'after'): Highlight[] {
  const r = side === 'before' ? D.rb : D.ra;
  const out: Highlight[] = [];
  for (const c of D.changes) {
    if (side === 'before' ? c.status === 'added' : c.status === 'removed') continue;
    const shape = shapeOf(r.result.geom, c.kind, side === 'before' ? c.beforeId ?? c.id : c.id);
    if (shape) out.push({ key: keyOf(c), shape, mark: markOf(c), badge: badgeOf(c), dashed: c.status === 'removed' });
  }
  return out;
}

function mergedHighlights(): Highlight[] {
  const out: Highlight[] = [];
  if (!D.rm) return out;
  for (const c of D.changes) {
    const key = keyOf(c);
    const [kind, ...rest] = key.split(':');
    const shape = shapeOf(D.rm.result.geom, kind as ItemKind, rest.join(':'));
    if (shape) out.push({ key, shape, mark: markOf(c), badge: badgeOf(c), dashed: c.status === 'removed' });
  }
  return out;
}

/** Old → new place of every moved item, for the merged picture. */
function mergedMoves(): { key: string; from: ItemShape; to: ItemShape }[] {
  const out: { key: string; from: ItemShape; to: ItemShape }[] = [];
  if (!D.rm) return out;
  for (const c of D.changes) {
    if (c.status !== 'changed' || !c.fields.some((f) => f.field === 'position')) continue;
    const from = shapeOf(D.rb.result.geom, c.kind, c.beforeId ?? c.id), to = shapeOf(D.rm.result.geom, c.kind, c.id);
    if (from?.t === 'rect' && to?.t === 'rect') out.push({ key: keyOf(c), from, to });
  }
  return out;
}

/** The merged diagram as an SVG: marked text, removed items faded, highlights and move arrows. */
function mergedSvg(): SVGSVGElement {
  const svg = toSvgElement(D.rm!);
  decorateText(svg);
  for (const c of D.changes) {
    if (c.status !== 'removed') continue;
    const [kind, ...rest] = keyOf(c).split(':');
    for (const e of svg.querySelectorAll<SVGGElement>(`g.el[data-kind="${kind}"][data-id="${CSS.escape(rest.join(':'))}"]`)) e.classList.add('dx-gone');
  }
  const layer = drawHighlights(svg, mergedHighlights());
  drawMoves(layer, mergedMoves());
  dimOthers(svg, state.dim ? new Set(D.changes.map(keyOf)) : null);
  return svg;
}

const keepSet = (side: 'before' | 'after'): Set<string> =>
  new Set(D.changes.filter((c) => (side === 'before' ? c.status !== 'added' : c.status !== 'removed')).map((c) => (side === 'before' ? beforeKeyOf(c) : keyOf(c))));

// ---- stage ------------------------------------------------------------------------------------------------------

let view: SharedView | null = null;
let svgs: { before?: SVGSVGElement; after?: SVGSVGElement } = {};

function renderStage(): void {
  tools = null;
  morph?.dispose();
  morph = null;
  view?.dispose();
  view = null;
  svgs = {};
  ink.reset();
  const stage = $('#stage');
  stage.replaceChildren();
  stage.className = `stage mode-${state.mode} tool-${state.tool}`;

  const bounds = union(D.rb.result.bounds, D.ra.result.bounds);
  view = new SharedView(bounds);
  view.blockPan = () => state.tool === 'draw';
  const pane = (title: string, sub: string, cls: string) =>
    h('div', { class: `pane ${cls}` }, h('div', { class: 'pane-title no-pan' }, h('b', {}, title), h('span', {}, sub)));

  if (viewOnly()) {
    // the standard viewer: the chosen version as it is, no diff
    const v = state.versions[state.viewing]!;
    const r = renderSource(v.source, ctx);
    view.bounds = r.result.bounds;
    const p = pane(versionLabel(state.viewing), `${v.message} · ${v.author}, ${ago(v.date)}`, 'single');
    stage.append(p);
    const svg = toSvgElement(r);
    p.append(svg);
    view.attach(svg, p);
    stage.append(toolPanel());
    ink.attach(svg);
    requestAnimationFrame(() => view?.fit());
    return;
  }
  if (state.mode === 'side') {
    const who = (i: number) => (state.versions[i] ? `${versionLabel(i)} · ${state.versions[i]!.author}, ${ago(state.versions[i]!.date)}` : '');
    const pb = pane('Before', who(state.base), 'before'), pa = pane('After', who(state.at), 'after');
    stage.append(pb, pa);
    svgs.before = mount(pb, D.rb, 'before');
    svgs.after = mount(pa, D.ra, 'after');
    for (const s of Object.values(svgs)) view.attach(s, s.parentElement!);
  } else {
    const p = h('div', { class: 'pane stack' });
    stage.append(p);
    morphStage(p, view);
    if (state.versions.length) p.append(h('div', { class: 'pane-title no-pan' }, h('b', { class: 'cmp' }, `${versionLabel(state.base)} → ${versionLabel(state.at)}`)));
  }
  diffBar = h('div', { class: 'dbar ds-float no-pan', role: 'toolbar', 'aria-label': 'Diff' });
  stage.append(toolPanel(), diffBar);
  renderDiffBar();
  for (const svg of stage.querySelectorAll<SVGSVGElement>('.pane svg')) ink.attach(svg);
  requestAnimationFrame(() => {
    view?.fit();
    applySelection(false);
  });
}

function mount(host: HTMLElement, r: Rendered, side: 'before' | 'after'): SVGSVGElement {
  const svg = toSvgElement(r);
  host.append(svg);
  drawHighlights(svg, highlightsFor(side));
  dimOthers(svg, state.dim ? keepSet(side) : null);
  svg.addEventListener('click', (e) => clickSelect(e, side));
  return svg;
}

function clickSelect(e: MouseEvent, side: 'before' | 'after' | 'merged'): void {
  if (state.tool === 'draw') return;
  const t = e.target as Element;
  const hl = t.closest<SVGGElement>('[data-key]');
  let key = hl?.dataset['key'] ?? null;
  if (!key) {
    const el = t.closest<SVGGElement>('g.el[data-kind][data-id]');
    if (el) {
      const k = `${el.dataset['kind']}:${el.dataset['id']}`;
      key = side === 'before' ? D.fromBefore.get(k) ?? k : k;
    }
  }
  select(key && D.changes.some((c) => keyOf(c) === key) ? key : null, false);
}

// ---- morph ------------------------------------------------------------------------------------------------------

let morph: Morph | null = null;

/** Canonical keys (`data-ck`) on the item groups of one state, so the three states can be paired. */
function tagItems(svg: SVGSVGElement, side: 'before' | 'after' | 'merged'): void {
  for (const e of svg.querySelectorAll<SVGGElement>('g.el[data-kind][data-id]')) {
    const k = `${e.dataset['kind']}:${e.dataset['id']}`;
    e.dataset['ck'] = side === 'before' ? D.fromBefore.get(k) ?? k : k;
  }
}

/** A version drawn with its own changes highlighted (removed / changed on before, added / changed on after). */
function highlighted(r: Rendered, side: 'before' | 'after'): SVGSVGElement {
  const svg = toSvgElement(r);
  drawHighlights(svg, highlightsFor(side));
  dimOthers(svg, state.dim ? keepSet(side) : null);
  return svg;
}

function morphStage(p: HTMLElement, v: SharedView): void {
  const before = highlighted(D.rb, 'before'), after = highlighted(D.ra, 'after');
  const merged = D.rm ? mergedSvg() : highlighted(D.ra, 'after');
  tagItems(before, 'before');
  tagItems(after, 'after');
  tagItems(merged, D.rm ? 'merged' : 'after');
  withLayout(merged, () => highlightRuns(merged));
  morph = new Morph(p, [before, merged, after], v, STATE_OF[state.mode] ?? 1);
  morph.svg.addEventListener('click', (e) => clickSelect(e, state.mode === 'before' ? 'before' : state.mode === 'after' ? 'after' : 'merged'));
  svgs.after = morph.svg;
}

/** Switches the view: between the single-canvas states it animates, otherwise the stage is rebuilt. */
function setMode(m: Mode): void {
  if (m === state.mode) return;
  const to = STATE_OF[m];
  state.mode = m;
  if (morph && to !== undefined) {
    morph.go(to);
    ink.paint(morph.svg);
    $('#stage').className = `stage mode-${m} tool-${state.tool}`;
    renderDiffBar();
    applySelection(false);
  } else renderStage();
}

function stepState(d: 1 | -1): void {
  const i = STATE_OF[state.mode];
  if (i === undefined) return;
  const next = MODES.find((m) => STATE_OF[m.id] === i + d);
  if (next) setMode(next.id);
}

// ---- bottom panel: views, change filters, dim ---------------------------------------------------------------------

let diffBar: HTMLElement | null = null;

/** Icons of the change filters (the colour of each is its highlight colour). */
const FILTER_ICONS: Record<Mark | 'dim', string> = {
  added: 'M5 5h14v14H5zM12 8.5v7M8.5 12h7',
  removed: 'M5 5h14v14H5zM8.5 12h7',
  content: 'M5 6h14M12 6v13M9 19h6',
  layout: 'M12 4v16M4 12h16M9.5 6.5L12 4l2.5 2.5M9.5 17.5L12 20l2.5-2.5M6.5 9.5L4 12l2.5 2.5M17.5 9.5L20 12l-2.5 2.5',
  style: I_palette,
  dim: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M12 7h6M12 11h8.5M12 15h7.5',
};

function renderDiffBar(): void {
  if (!diffBar) return;
  const raw = D.raw.counts;
  const filter = (m: Mark, label: string, n: number, on: boolean, toggle: () => void) =>
    h('button', { type: 'button', class: `flt flt-${m}${on ? ' on' : ' off'}`, 'data-tip': `${label} · ${n} — click to ${on ? 'hide' : 'show'}`, 'aria-label': `${label} (${n})`, 'aria-pressed': String(on), onclick: toggle },
      icon(FILTER_ICONS[m]), n ? h('span', { class: 'cnt' }, String(n)) : null);
  const facet = (f: ChangeFacet) => filter(f, FACET_INFO[f].label, raw[f], !state.ignore[f], () => setIgnore({ ...state.ignore, [f]: !state.ignore[f] }));
  diffBar.replaceChildren(
    ...MODES.map((m) => h('button', { type: 'button', class: `view${state.mode === m.id ? ' on' : ''}`, 'data-tip': `${m.help} (${m.key})`, 'aria-pressed': String(state.mode === m.id), onclick: () => setMode(m.id) }, m.label)),
    h('span', { class: 'sep' }),
    filter('added', 'Added', raw.added, !state.hide.added, () => setHide('added')),
    filter('removed', 'Removed', raw.removed, !state.hide.removed, () => setHide('removed')),
    facet('content'),
    facet('layout'),
    facet('style'),
    h('span', { class: 'sep' }),
    h('button', { type: 'button', class: state.dim ? 'on' : '', 'data-tip': 'Dim unchanged items', 'aria-label': 'Dim unchanged items', 'aria-pressed': String(state.dim), onclick: () => ((state.dim = !state.dim), renderStage()) }, icon(FILTER_ICONS.dim)),
  );
}

function zoomBar(): HTMLElement {
  const b = (label: string, title: string, fn: () => void) => h('button', { title, onclick: fn }, label);
  return h(
    'div',
    { class: 'zoombar no-pan' },
    b('−', 'Zoom out', () => view?.zoom(1 / 1.25)),
    b('+', 'Zoom in', () => view?.zoom(1.25)),
    b('Fit', 'Fit (F)', () => view?.fit()),
    h('button', { class: 'help-btn', title: 'Help (?)', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: () => toggleHelp() }, '?'),
  );
}

// ---- help (the editor's help popup: every hint and shortcut in one place) ----------------------------------------

let helpEl: HTMLElement | null = null;

function toggleHelp(force?: boolean): void {
  const open = force ?? !helpEl;
  helpEl?.remove();
  helpEl = null;
  $('.zoombar .help-btn').setAttribute('aria-expanded', String(open));
  if (!open) return;
  const row = (keys: string[], label: string) =>
    h('div', { class: 'help-row' }, h('span', { class: 'help-keys' }, ...keys.flatMap((k, i) => [i ? ' · ' : '', /\s/.test(k) && k.length > 3 ? h('span', { class: 'help-gesture' }, k) : h('kbd', {}, k)])), h('span', {}, label));
  const section = (title: string, rows: HTMLElement[]) => [h('div', { class: 'help-title', role: 'heading', 'aria-level': '3' }, title), ...rows];
  const close = h('button', { title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => toggleHelp(false) }, '×');
  helpEl = h('div', { class: 'help-pop ds-pop', role: 'dialog', 'aria-label': 'Help' },
    h('div', { class: 'help-head' }, h('b', {}, 'Diagram diff — help'), close),
    h('div', { class: 'help-body' },
      ...section('Views (bottom panel)', [
        ...MODES.map((m) => row([m.key], `${m.label}: ${m.help}`)),
        row(['←', '→'], 'Step between Before, Merged and After: moved items glide, colours blend and changed text flips'),
      ]),
      ...section('Change filters (bottom panel)', [
        row(['Added'], 'Items only in the new version (green, +)'),
        row(['Removed'], 'Items only in the old version (red, dashed, −)'),
        row(['Content'], `${FACET_INFO.content.help} (amber, C)`),
        row(['Layout'], `${FACET_INFO.layout.help} (blue, L). Off: the old version is drawn on the new layout`),
        row(['Style'], `${FACET_INFO.style.help} (purple, S). Off: both versions are drawn unstyled`),
        row(['Dim'], 'Fade everything that did not change'),
      ]),
      ...section('Panels', [
        row(['V'], 'History (left): every version, newest first. Click one to view it compared with the version before it; Compare picks an older version as the base'),
        row(['C'], 'Code diff (left): Mermaid code and %%@ metadata, without the facets you switched off'),
        row(['L'], 'Change list (right): every change with its before → after values; click one to zoom to it'),
        row(['J', 'K'], 'Next / previous change'),
        row(['Esc'], 'Clear the selection, stop drawing, close this help'),
      ]),
      ...section('Canvas', [
        row(['H'], 'Pan: drag to move, wheel or ⌘ wheel to zoom, click a change to select it'),
        row(['P'], 'Magic pen: mark up the diagram; strokes show in every view'),
        row(['⌘Z'], 'Undo the last stroke'),
        row(['F'], 'Fit the diagram'),
        row(['?'], 'This help'),
      ]),
    ),
  );
  $('#main').append(helpEl);
}

function setHide(k: 'added' | 'removed'): void {
  state.hide = { ...state.hide, [k]: !state.hide[k] };
  refresh();
}

// ---- code panel (left, like the editor's code panel) --------------------------------------------------------------

function renderCodePane(): void {
  const body = $('#code-body');
  for (const t of document.querySelectorAll<HTMLElement>('#code-pane [role=tab]')) t.setAttribute('aria-selected', String(t.dataset['tab'] === state.codeTab));
  if (state.panels.left !== 'code') return;
  const part = (src: string) => {
    const { doc } = splitSource(src);
    return state.codeTab === 'code' ? doc.code : joinSource({ code: '', meta: doc.meta }).replace(/^\s+/, '');
  };
  const shown = viewOnly() ? state.versions[state.viewing]!.source : null;
  const a = part(shown ?? D.srcBefore).replace(/\n$/, '').split('\n');
  const b = part(shown ?? D.srcAfter).replace(/\n$/, '').split('\n');
  const ops = lineDiff(a, b);
  const adds = ops.filter((o) => o.op === 'add').length, dels = ops.filter((o) => o.op === 'del').length;
  const table = h('table', { class: 'code' });
  const row = (o: { op: string; text: string; a?: number; b?: number }) =>
    h('tr', { class: `ln-${o.op}` }, h('td', { class: 'num' }, o.a ? String(o.a) : ''), h('td', { class: 'num' }, o.b ? String(o.b) : ''), h('td', { class: 'sign' }, o.op === 'add' ? '+' : o.op === 'del' ? '−' : ''), h('td', { class: 'txt' }, o.text || ' '));
  for (const hk of hunks(ops)) {
    if ('skip' in hk) {
      const tr = h('tr', { class: 'skip' }, h('td', { colSpan: 4 }, h('button', {}, `⋯ ${hk.skip} unchanged lines`)));
      tr.querySelector('button')!.addEventListener('click', () => tr.replaceWith(...hk.ops.map(row)));
      table.append(tr);
    } else for (const o of hk.ops) table.append(row(o));
  }
  const notes: string[] = [];
  if (state.ignore.style) notes.push('style removed');
  if (D.layoutAligned) notes.push('old layout replaced by the new one');
  body.replaceChildren(
    h('div', { class: 'code-head' }, h('span', { class: 'stat add' }, `+${adds}`), h('span', { class: 'stat del' }, `−${dels}`), h('span', { class: 'muted' }, 'lines'),
      notes.length ? h('span', { class: 'code-note', title: 'Switched-off facets are left out of the diff' }, notes.join(' · ')) : null),
    adds + dels === 0 ? h('div', { class: 'empty' }, 'No differences with the current filters.') : h('div', { class: 'code-scroll' }, table),
  );
}

// ---- side panel -------------------------------------------------------------------------------------------------

const fmtVal = (v: unknown): string => {
  if (v === undefined) return '—';
  if (typeof v === 'string') return v === '' ? '""' : v;
  return JSON.stringify(v).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ');
};

function valueCell(v: unknown, r: Rendered, f: FieldChange): HTMLElement {
  const text = fmtVal(v);
  const colourish = /^(fill|stroke|text|color|colour|background)$|palette/.test(f.field);
  const css = colourish && typeof v === 'string' ? r.rctx.color(v) : undefined;
  return h('span', { class: `val${v === undefined ? ' none' : ''}` }, css ? h('i', { class: 'swatch', style: `background:${css}` }) : null, text);
}

function fieldRow(f: FieldChange): HTMLElement {
  return h(
    'div',
    { class: `field f-${f.facet}` },
    h('span', { class: 'fname' }, f.field),
    h('span', { class: 'fvals' }, valueCell(f.before, D.rb, f), h('span', { class: 'arrow' }, '→'), valueCell(f.after, D.ra, f)),
  );
}

const KIND_LABEL: Record<string, string> = {
  node: 'node', group: 'group', edge: 'edge', participant: 'participant', message: 'message', note: 'note', block: 'block', box: 'box', entity: 'table', rel: 'relation',
};

function renderPanel(): void {
  const panel = $('#panel');
  const c = D.diff.counts;
  const hidden = D.raw.items.filter((i) => i.status === 'changed').length - D.diff.items.filter((i) => i.status === 'changed').length;
  const chip = (id: typeof state.filter, label: string, n: number) =>
    h('button', { class: `chip st-${id}${state.filter === id ? ' on' : ''}`, onclick: () => ((state.filter = id), renderPanel()) }, label, h('b', {}, String(n)));
  const list = h('div', { class: 'changes', role: 'list' });
  const shown = D.changes.filter((x) => state.filter === 'all' || x.status === state.filter);
  for (const ch of shown) {
    const key = keyOf(ch);
    const open = state.open.has(key) || state.selected === key;
    const item = h(
      'div',
      { class: `change st-${ch.status}${state.selected === key ? ' selected' : ''}`, role: 'listitem', dataset: { key } },
      h(
        'button',
        { class: 'change-head', onclick: () => select(state.selected === key ? null : key, true) },
        h('span', { class: `sbadge m-${markOf(ch)}` }, ch.status === 'added' ? '+' : ch.status === 'removed' ? '−' : '~'),
        h('span', { class: 'kind' }, KIND_LABEL[ch.kind] ?? ch.kind),
        h('span', { class: 'label' }, ch.label),
        h('span', { class: 'facets' }, ...ch.facets.map((f) => h('span', { class: `facet f-${f}` }, FACET_INFO[f].label))),
      ),
      open && ch.fields.length ? h('div', { class: 'fields' }, ...ch.fields.map(fieldRow)) : null,
      open && ch.beforeId && ch.status === 'changed' && !ch.fields.some((f) => f.field === 'id') ? h('div', { class: 'hint' }, `was ${ch.beforeId} (matched by content)`) : null,
    );
    list.append(item);
  }
  const docChanges = D.diff.doc;
  panel.replaceChildren(
    h(
      'div',
      { class: 'summary' },
      h('div', { class: 'chips' }, chip('all', 'All', D.changes.length), chip('added', 'Added', c.added), chip('removed', 'Removed', c.removed), chip('changed', 'Changed', c.changed)),
      h(
        'div',
        { class: 'facet-counts' },
        ...(['content', 'layout', 'style'] as const).map((f) =>
          state.ignore[f] ? h('span', { class: 'facet ignored', title: 'Ignored' }, FACET_INFO[f].label, ' ignored') : h('span', { class: `facet f-${f}` }, `${FACET_INFO[f].label} ${c[f]}`),
        ),
      ),
      hidden > 0 ? h('div', { class: 'hint' }, `${hidden} item${hidden > 1 ? 's' : ''} changed only in ignored facets — hidden.`) : null,
    ),
    ...(docChanges.length ? [h('details', { class: 'doc-changes', open: true }, h('summary', {}, `Diagram-wide (${docChanges.length})`), ...docChanges.map(fieldRow))] : []),
    shown.length ? list : h('div', { class: 'empty' }, D.changes.length ? 'Nothing in this filter.' : 'No changes with the current filters.'),
  );
}

// ---- selection --------------------------------------------------------------------------------------------------

function select(key: string | null, focus: boolean): void {
  state.selected = key;
  renderPanel();
  applySelection(focus);
  if (key) $('#panel').querySelector(`[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
}

function applySelection(focus: boolean): void {
  for (const svg of Object.values(svgs)) {
    for (const e of svg.querySelectorAll('.dx-selected')) e.classList.remove('dx-selected');
    if (state.selected) for (const e of svg.querySelectorAll(`[data-key="${CSS.escape(state.selected)}"]`)) e.classList.add('dx-selected');
  }
  if (!focus || !state.selected || !view) return;
  const c = D.changes.find((x) => keyOf(x) === state.selected);
  if (!c) return;
  const s = c.status === 'removed' ? shapeOf(D.rb.result.geom, c.kind, c.beforeId ?? c.id) : shapeOf(D.ra.result.geom, c.kind, c.id);
  if (!s) return;
  const r = s.t === 'rect' ? s.r : s.label ?? { x: s.mid.x - 40, y: s.mid.y - 40, w: 80, h: 80 };
  view.focus(r);
}

function step(d: 1 | -1): void {
  const list = D.changes.filter((x) => state.filter === 'all' || x.status === state.filter);
  if (!list.length) return;
  const i = list.findIndex((x) => keyOf(x) === state.selected);
  const next = list[(i + d + list.length) % list.length]!;
  select(keyOf(next), true);
}

// ---- left panel: tools, panels, diff mode and change filters, in the viewer's bar style ---------------------------

let tools: HTMLElement | null = null;

function setTool(t: 'pan' | 'draw'): void {
  state.tool = t;
  const stage = $('#stage');
  stage.classList.toggle('tool-draw', t === 'draw');
  stage.classList.toggle('tool-pan', t === 'pan');
  renderTools();
}

function toolPanel(): HTMLElement {
  tools = h('div', { class: 'vbar ds-float no-pan', role: 'toolbar', 'aria-label': 'Tools', 'aria-orientation': 'vertical' });
  renderTools();
  return h('div', { class: 'vbar-wrap no-pan' }, tools);
}

function renderTools(): void {
  if (!tools) return;
  /** Icon button with a hover tooltip (`data-tip`). */
  const btn = (tip: string, ic: string, onclick: () => void, on: boolean) =>
    h('button', { type: 'button', 'data-tip': tip, 'aria-label': tip, onclick, class: on ? 'on' : '', 'aria-pressed': String(on) }, icon(ic));
  const sep = () => h('span', { class: 'sep' });
  tools.replaceChildren(
    btn('Pan (H)', I_hand, () => setTool('pan'), state.tool === 'pan'),
    btn('Magic pen (P)', I_pen, () => setTool(state.tool === 'draw' ? 'pan' : 'draw'), state.tool === 'draw'),
    sep(),
    btn('History (V)', I_history, () => togglePanel('history'), state.panels.left === 'history'),
    btn('Code diff (C)', I_code, () => togglePanel('code'), state.panels.left === 'code'),
    btn('Change list (L)', I_list, () => togglePanel('changes'), state.panels.changes),
  );
  tools.parentElement?.querySelector('.pen-opts')?.remove();
  if (state.tool === 'draw') tools.after(penOptions());
}

/** The viewer's pen options: colours, sizes, auto erase and Erase all. */
function penOptions(): HTMLElement {
  return h('div', { class: 'pop pen-opts ds-float', role: 'dialog', 'aria-label': 'Magic pen' },
    h('div', { class: 'line' }, ...INK_COLORS.map((c) => h('button', { type: 'button', class: 'swatch', style: `background:${c}`, 'aria-label': c, 'aria-pressed': String(state.inkColor === c), onclick: () => ((state.inkColor = c), renderTools()) }))),
    h('div', { class: 'line' }, ...INK_SIZES.map((sz) => h('button', { type: 'button', class: 'size', 'aria-label': `${sz}px`, 'aria-pressed': String(state.inkSize === sz), onclick: () => ((state.inkSize = sz), renderTools()) }, h('i', { style: `width:${sz + 2}px;height:${sz + 2}px` })))),
    h('div', { class: 'line' }, h('span', { class: 'ds-sect' }, 'Auto erase'),
      ...INK_FADES.map((f) => h('button', { type: 'button', class: 'fade', 'aria-pressed': String(state.inkFade === f), onclick: () => ((state.inkFade = f), renderTools()) }, f ? `${f / 1000}s` : '∞'))),
    h('button', { type: 'button', class: 'erase', disabled: !ink.strokes.length, onclick: () => ink.clear() }, 'Erase all strokes'),
  );
}

// ---- side panels (the editor's floating panes: slide in / out, resize by the inner edge) --------------------------

function applyPanels(): void {
  const main = $('#main');
  main.dataset['left'] = state.panels.left ?? '';
  main.classList.toggle('view-only', viewOnly());
  main.classList.toggle('no-changes', !state.panels.changes);
}

function togglePanel(name: 'code' | 'history' | 'changes', open?: boolean): void {
  if (name === 'changes') state.panels = { ...state.panels, changes: open ?? !state.panels.changes };
  else {
    const on = open ?? state.panels.left !== name;
    state.panels = { ...state.panels, left: on ? name : state.panels.left === name ? null : state.panels.left };
  }
  const wasViewing = $('#main').classList.contains('view-only');
  applyPanels();
  renderCodePane();
  renderHistoryPane();
  renderTools();
  if (wasViewing !== viewOnly()) renderStage();
}

// ---- history (left panel): every version, newest first; pick one to view, any older one as the base ---------------

const ago = (iso: string): string => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
};



/** True while the history panel shows one version as it is (no diff). */
const viewOnly = (): boolean => state.panels.left === 'history' && state.historyMode === 'view';

function renderHistoryPane(): void {
  const body = $('#history-body');
  if (state.panels.left !== 'history') return;
  const last = state.versions.length - 1;
  const compare = state.historyMode === 'compare';
  const rows = [...state.versions].map((v, i) => ({ v, i })).reverse().map(({ v, i }) => {
    const c = v.counts;
    const n = c ? c.added + c.removed + c.changed : 0;
    const isAfter = compare && i === state.at, isBefore = compare && i === state.base && i !== state.at;
    const viewing = !compare && i === state.viewing;
    const pick = (role: 'before' | 'after') => {
      const on = role === 'after' ? i === state.at : i === state.base;
      return h('button', { class: `pick pick-${role}${on ? ' on' : ''}`, 'aria-pressed': String(on), title: `Use v${v.n} as ${role}`, onclick: () => pickVersion(role, i) }, role === 'after' ? 'After' : 'Before');
    };
    return h('div', { class: `version${viewing ? ' viewing' : ''}${isAfter ? ' after' : ''}${isBefore ? ' before' : ''}`, role: 'listitem' },
      h('button', { class: 'version-main', title: compare ? `Compare v${v.n} with the version before it` : `View v${v.n}`, onclick: () => (compare ? compareWithPrevious(i) : viewVersion(i)) },
        h('span', { class: 'vmsg' }, v.message),
        h('span', { class: 'vmeta' },
          h('code', { class: 'vid' }, v.id ?? `v${v.n}`),
          i === last ? h('span', { class: 'vtag current' }, 'current') : null,
          h('span', {}, ` ${v.author} ${ago(v.date)}`),
          h('span', { class: 'vcount' }, ' — '),
          c
            ? h('span', { class: 'vstats' },
                c.added ? h('span', { class: 'add' }, `+${c.added}`) : null,
                c.removed ? h('span', { class: 'del' }, `−${c.removed}`) : null,
                c.changed ? h('span', { class: 'chg' }, `~${c.changed}`) : null,
                n ? null : h('span', {}, 'no changes'))
            : h('span', { class: 'vcount' }, 'initial'))),
      compare ? h('span', { class: 'vpick' }, pick('before'), pick('after')) : null,
    );
  });
  const mode = (m: 'view' | 'compare', label: string) =>
    h('button', { class: state.historyMode === m ? 'on' : '', 'aria-pressed': String(state.historyMode === m), onclick: () => setHistoryMode(m) }, label);
  body.replaceChildren(
    h('div', { class: 'history-top' },
      h('div', { class: 'seg history-mode', role: 'group', 'aria-label': 'History mode' }, mode('view', 'View'), mode('compare', 'Compare')),
      compare
        ? h('div', { class: 'history-cmp' }, h('span', { class: 'vtag before' }, 'Before'), ` ${versionLabel(state.base)}  `, h('span', { class: 'vtag after' }, 'After'), ` ${versionLabel(state.at)}`)
        : h('div', { class: 'history-cmp' }, 'Viewing ', h('b', {}, versionLabel(state.viewing)))),
    h('div', { class: 'versions', role: 'list' }, ...rows),
  );
}

const versionLabel = (i: number): string => {
  const v = state.versions[i];
  return v ? `${v.id ?? `v${v.n}`}${i === state.versions.length - 1 ? ' (current)' : ''}` : '';
};

function setHistoryMode(m: 'view' | 'compare'): void {
  state.historyMode = m;
  if (m === 'view') state.viewing = state.at;
  applyPanels();
  renderHistoryPane();
  renderCodePane();
  renderStage();
}

/** View mode: shows version `i` as it is. */
function viewVersion(i: number): void {
  state.viewing = i;
  renderHistoryPane();
  renderCodePane();
  renderStage();
}

/** Compare mode: version `i` as after, the one before it as before. */
function compareWithPrevious(i: number): void {
  state.at = i;
  state.base = Math.max(0, i - 1);
  applyVersions();
}

/** Compare mode: picks the before or the after version. */
function pickVersion(role: 'before' | 'after', i: number): void {
  if (role === 'after') state.at = i;
  else state.base = i;
  applyVersions();
}

function applyVersions(): void {
  state.before = state.versions[state.base]!.source;
  state.after = state.versions[state.at]!.source;
  state.selected = null;
  state.open.clear();
  refresh();
  renderHistoryPane();
}

function attachResizer(pane: HTMLElement, side: 'left' | 'right', v: '--left-w' | '--right-w', [lo, hi]: [number, number]): void {
  const grip = h('div', { class: 'pane-resizer', title: 'Drag to resize · double-click to reset', role: 'separator', 'aria-orientation': 'vertical' });
  pane.append(grip);
  const main = $('#main');
  grip.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    grip.setPointerCapture(ev.pointerId);
    const x0 = ev.clientX, w0 = pane.getBoundingClientRect().width;
    grip.classList.add('dragging');
    main.classList.add('resizing-panes');
    const move = (e: PointerEvent) => {
      const w = side === 'left' ? w0 + (e.clientX - x0) : w0 - (e.clientX - x0);
      main.style.setProperty(v, `${Math.round(Math.max(lo, Math.min(hi, w)))}px`);
    };
    const up = () => {
      grip.classList.remove('dragging');
      main.classList.remove('resizing-panes');
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  });
  grip.addEventListener('dblclick', () => main.style.removeProperty(v));
}

function setIgnore(ignore: DiffIgnore): void {
  state.ignore = Object.fromEntries(Object.entries(ignore).filter(([, v]) => v));
  refresh();
}

function refresh(): void {
  D = derive();
  if (state.selected && !D.changes.some((c) => keyOf(c) === state.selected)) state.selected = null;
  renderPanel();
  renderCodePane();
  renderStage();
}

// ---- sources ----------------------------------------------------------------------------------------------------

function loadSample(id: string): void {
  state.sample = id;
  ($('#sample') as HTMLSelectElement).value = id;
  state.versions = historyOf(id);
  state.at = state.versions.length - 1;
  state.base = Math.max(0, state.at - 1);
  ink.strokes.length = 0;
  $('#sample-note').textContent = SAMPLES.find((s) => s.id === id)?.note ?? '';
  applyVersions();
}

function pasteDialog(): void {
  const before = h('textarea', { spellcheck: false, value: state.before });
  const after = h('textarea', { spellcheck: false, value: state.after });
  const dlg = h(
    'dialog',
    { class: 'paste' },
    h('form', { method: 'dialog' },
      h('h2', {}, 'Compare your own diagrams'),
      h('p', { class: 'muted' }, 'Paste the file from the target branch and from the merge request (.mmd or .mmdx).'),
      h('div', { class: 'two' }, h('label', {}, 'Before', before), h('label', {}, 'After', after)),
      h('div', { class: 'actions' },
        h('button', { type: 'button', onclick: () => ([before.value, after.value] = [after.value, before.value]) }, 'Swap'),
        h('span', { class: 'grow' }),
        h('button', { value: 'cancel' }, 'Cancel'),
        h('button', { value: 'ok', class: 'primary' }, 'Compare'),
      ),
    ),
  );
  document.body.append(dlg);
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'ok') {
      const now = Date.now();
      state.versions = withCounts([
        { n: 1, message: 'Pasted: before', author: 'You', date: new Date(now - 60000).toISOString(), source: before.value },
        { n: 2, message: 'Pasted: after', author: 'You', date: new Date(now).toISOString(), source: after.value },
      ]);
      state.at = 1;
      state.base = 0;
      state.before = before.value;
      state.after = after.value;
      state.sample = '';
      renderHistoryPane();
      ink.strokes.length = 0;
      ($('#sample') as HTMLSelectElement).value = '';
      $('#sample-note').textContent = 'Your diagrams.';
      state.selected = null;
      refresh();
    }
    dlg.remove();
  });
  dlg.showModal();
}

// ---- boot -------------------------------------------------------------------------------------------------------

// the editor's floating panels and the zoom bar live outside the stage, which is re-rendered
{
  const main = $('#main');
  const tab = (id: 'code' | 'meta', label: string) =>
    h('button', { role: 'tab', 'data-tab': id, 'aria-selected': String(state.codeTab === id), onclick: () => ((state.codeTab = id), renderCodePane()) }, label);
  const codePane = h('section', { id: 'code-pane', class: 'pane-side left', 'aria-label': 'Code diff' },
    h('div', { class: 'tabs', role: 'tablist' }, tab('code', 'Code'), tab('meta', 'Metadata'), h('span', { class: 'tabs-spacer' }),
      h('button', { class: 'collapse-btn', title: 'Hide the code diff (C)', 'aria-label': 'Hide the code diff', onclick: () => togglePanel('code', false) }, '‹')),
    h('div', { id: 'code-body', class: 'tab-body' }));
  const historyPane = h('section', { id: 'history-pane', class: 'pane-side left', 'aria-label': 'History' },
    h('div', { class: 'rp-head' }, h('b', { role: 'heading', 'aria-level': '2' }, 'History'),
      h('button', { class: 'collapse-btn', title: 'Hide the history (V)', 'aria-label': 'Hide the history', onclick: () => togglePanel('history', false) }, '‹')),
    h('div', { id: 'history-body', class: 'rp-body' }));
  const changesPane = h('aside', { id: 'changes-pane', class: 'pane-side right', 'aria-label': 'Changes' },
    h('div', { class: 'rp-head' }, h('b', { role: 'heading', 'aria-level': '2' }, 'Changes'),
      h('button', { class: 'collapse-btn', title: 'Hide the change list (L)', 'aria-label': 'Hide the change list', onclick: () => togglePanel('changes', false) }, '×')),
    h('div', { id: 'panel', class: 'rp-body' }));
  main.append(codePane, historyPane, changesPane, zoomBar());
  attachResizer(codePane, 'left', '--left-w', [280, 900]);
  attachResizer(historyPane, 'left', '--left-w', [280, 900]);
  attachResizer(changesPane, 'right', '--right-w', [260, 640]);
  applyPanels();
  document.addEventListener('pointerdown', (e) => {
    if (helpEl && !(e.target as Element).closest('.help-pop, .help-btn')) toggleHelp(false);
  });
}

const sel = $('#sample') as HTMLSelectElement;
for (const group of new Set(SAMPLES.map((x) => x.group))) {
  const og = document.createElement('optgroup');
  og.label = group;
  og.append(...SAMPLES.filter((x) => x.group === group).map((x) => new Option(`${group} · ${x.title}`, x.id)));
  sel.append(og);
}
sel.append(new Option('Your own…', ''));
sel.addEventListener('change', () => (sel.value ? loadSample(sel.value) : pasteDialog()));
$('#paste').addEventListener('click', pasteDialog);

document.addEventListener('keydown', (e) => {
  if ((e.target as Element).closest('input, textarea, select, dialog')) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && ink.strokes.length) {
    e.preventDefault();
    ink.undo();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const m = MODES.find((x) => x.key === e.key);
  if (m) setMode(m.id);
  else if (e.key === 'c') togglePanel('code');
  else if (e.key === 'l') togglePanel('changes');
  else if (e.key === 'v') togglePanel('history');
  else if (e.key === '?') toggleHelp();
  else if (e.key === 'ArrowLeft') stepState(-1);
  else if (e.key === 'ArrowRight') stepState(1);
  else if (e.key === 'j') step(1);
  else if (e.key === 'k') step(-1);
  else if (e.key === 'h') setTool('pan');
  else if (e.key === 'p') setTool(state.tool === 'draw' ? 'pan' : 'draw');
  else if (e.key === 'f') view?.fit();
  else if (e.key === 'Escape') (helpEl ? toggleHelp(false) : state.tool === 'draw' ? setTool('pan') : select(null, false));
  else return;
  e.preventDefault();
});

loadSample('architecture');
