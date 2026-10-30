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
  addGhost, centreOf, dimOthers, drawHighlights, drawMoves, sceneOf, shapeOf, SharedView, svgEl, toSvgElement, union,
  type Highlight, type ItemShape, type Mark,
} from './canvas.js';
import { decorateText, highlightRuns, withLayout } from './decorate.js';
import { buildMerged, REMOVED, type Merged } from './merge.js';
import { Morph, STATE_NAMES } from './morph.js';
import { hunks, lineDiff } from './textdiff.js';
import type { ItemKind } from '../../../src/core/types.js';

// ---- setup ------------------------------------------------------------------------------------------------------

const measure = createCanvasMeasurer();
const ctx = createContext(measure ? { measure } : {});
// the default themes are bundled already; register the others so samples can name them
const themeFiles = import.meta.glob<unknown>(['../../../themes/*.theme.json', '!**/default-*.theme.json'], { eager: true, import: 'default' });
for (const f of Object.values(themeFiles)) ctx.themes.register(f);

const samples = import.meta.glob<string>('../diff-samples/*.mmd', { eager: true, query: '?raw', import: 'default' });
const sample = (name: string, side: 'before' | 'after') => samples[`../diff-samples/${name}.${side}.mmd`] ?? '';

const SAMPLES: { id: string; group: string; title: string; note: string }[] = [
  { id: 'flow-few', group: 'Flowchart', title: 'Few changes', note: 'A new service, one relabel, one move and an edge preset.' },
  { id: 'architecture', group: 'Flowchart', title: 'Medium: architecture change', note: 'Added and removed services, a renamed node, relabels, moves and restyles mixed together.' },
  { id: 'flow-many', group: 'Flowchart', title: 'Many changes (60+)', note: 'A large refactor of the microservice pattern map: relabels, new and deleted nodes and edges, moves and restyles.' },
  { id: 'restyle', group: 'Flowchart', title: 'Restyle with one hidden edit', note: 'Theme switch and class changes everywhere — switch Style off in the legend to find the one real edit.' },
  { id: 'small', group: 'Flowchart', title: 'Pure Mermaid, auto layout', note: 'No layout metadata: new nodes make the auto layout move things around.' },
  { id: 'sequence', group: 'Sequence', title: 'Few changes', note: 'One inserted and one removed message shift every message id; the text diff of the metadata is all noise.' },
  { id: 'seq-medium', group: 'Sequence', title: 'Medium', note: 'Edited, inserted and removed messages, new notes, a renamed and restyled participant.' },
  { id: 'seq-many', group: 'Sequence', title: 'Many changes', note: 'A reworked deployment flow: dozens of message edits, inserts, removals and notes.' },
  { id: 'schema', group: 'ER', title: 'Few changes', note: 'Renamed columns, a widened type, a moved table and a recoloured table.' },
  { id: 'er-medium', group: 'ER', title: 'Medium', note: 'Type changes, renamed, added and removed columns, a new and a dropped table.' },
  { id: 'er-many', group: 'ER', title: 'Many changes (50+)', note: 'A big schema migration across the 60-table archive database.' },
];

type Mode = 'side' | 'overlay' | 'swipe' | 'onion' | 'morph' | 'code';

const MODES: { id: Mode; label: string; key: string; help: string }[] = [
  { id: 'side', label: 'Side by side', key: '1', help: 'Before and after next to each other, panned and zoomed together. Removed items are marked on the left, added on the right, changed on both.' },
  { id: 'overlay', label: 'Overlay', key: '2', help: 'One merged picture: the new version with removed items kept in place, text changes marked word by word (removed struck out, added highlighted) and moved items shown with an arrow from their old place.' },
  { id: 'swipe', label: 'Swipe', key: '3', help: 'Both versions on top of each other; drag the divider to wipe between them. Best for spotting visual and style changes.' },
  { id: 'onion', label: 'Onion skin', key: '4', help: 'Both versions blended; the slider fades from before to after. Small shifts and resizes stand out.' },
  { id: 'morph', label: 'Morph', key: '5', help: 'Step through Before → Merged → After (← / →, Space plays): moved items glide to their new place, colours blend and changed text flips.' },
  { id: 'code', label: 'Code', key: '6', help: 'The Mermaid text diff, without the facets you ignore: style lines and %%@ metadata can be left out so only meaningful lines remain.' },
];

const FACET_INFO: Record<ChangeFacet, { label: string; help: string }> = {
  content: { label: 'Content', help: 'Items, labels, shapes, connections, attributes, message text' },
  layout: { label: 'Layout', help: 'Position, size, bend points, ports, layers' },
  style: { label: 'Style', help: 'Colours, fonts, presets, classes, theme' },
};

const state = {
  sample: 'architecture',
  before: sample('architecture', 'before'),
  after: sample('architecture', 'after'),
  mode: 'side' as Mode,
  ignore: {} as DiffIgnore,
  /** Added / removed items switched off in the legend. */
  hide: {} as { added?: boolean; removed?: boolean },
  dim: true,
  showMeta: false,
  filter: 'all' as 'all' | 'added' | 'removed' | 'changed',
  selected: null as string | null,
  open: new Set<string>(),
  swipe: 50,
  onion: 50,
  morph: 1,
  playing: false,
};

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
  morph?.dispose();
  morph = null;
  morphSync = null;
  if (state.mode !== 'morph' && state.playing) {
    state.playing = false;
    clearInterval(playTimer);
  }
  view?.dispose();
  view = null;
  svgs = {};
  const stage = $('#stage');
  stage.replaceChildren();
  stage.className = `stage mode-${state.mode}`;
  if (state.mode === 'code') {
    renderCode(stage);
    stage.append(legend());
    return;
  }

  const bounds = union(D.rb.result.bounds, D.ra.result.bounds);
  view = new SharedView(bounds);
  const pane = (title: string, sub: string, cls: string) =>
    h('div', { class: `pane ${cls}` }, h('div', { class: 'pane-title no-pan' }, h('b', {}, title), h('span', {}, sub)));

  if (state.mode === 'side') {
    const pb = pane('Before', 'target branch', 'before'), pa = pane('After', 'merge request', 'after');
    stage.append(pb, pa);
    svgs.before = mount(pb, D.rb, 'before');
    svgs.after = mount(pa, D.ra, 'after');
  } else if (state.mode === 'overlay' && D.rm) {
    const p = pane('Merged', 'after + removed items, text changes word by word, old positions', 'single');
    stage.append(p);
    const svg = mergedSvg();
    p.append(svg);
    svg.addEventListener('click', (e) => clickSelect(e, 'merged'));
    svgs.after = svg;
    requestAnimationFrame(() => highlightRuns(svg));
  } else if (state.mode === 'overlay') {
    const p = pane('After', 'with removed items and old positions', 'single');
    stage.append(p);
    svgs.after = mount(p, D.ra, 'after');
    overlayExtras(svgs.after);
  } else if (state.mode === 'morph' && D.rm) {
    const p = h('div', { class: 'pane stack' });
    stage.append(p);
    morphStage(p, view);
  } else {
    const p = h('div', { class: 'pane stack' });
    stage.append(p);
    const lb = h('div', { class: 'layer layer-before' }), la = h('div', { class: 'layer layer-after' });
    p.append(lb, la, h('div', { class: 'pane-title no-pan' }, h('b', {}, 'Before'), h('span', { class: 'grow' }), h('b', {}, 'After')));
    svgs.before = mount(lb, D.rb, 'before');
    svgs.after = mount(la, D.ra, 'after');
    view.attach(svgs.before, p);
    view.attach(svgs.after, p);
    if (state.mode === 'swipe') swipeControl(p, la);
    else onionControl(p, la);
  }
  if (state.mode === 'side' || state.mode === 'overlay' || (state.mode === 'morph' && !D.rm))
    for (const s of Object.values(svgs)) view.attach(s, s.parentElement!);
  stage.append(zoomBar(), legend());
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
let playTimer = 0;

/** Canonical keys (`data-ck`) on the item groups of one state, so the three states can be paired. */
function tagItems(svg: SVGSVGElement, side: 'before' | 'after' | 'merged'): void {
  for (const e of svg.querySelectorAll<SVGGElement>('g.el[data-kind][data-id]')) {
    const k = `${e.dataset['kind']}:${e.dataset['id']}`;
    e.dataset['ck'] = side === 'before' ? D.fromBefore.get(k) ?? k : k;
  }
}

function morphStage(p: HTMLElement, v: SharedView): void {
  const before = toSvgElement(D.rb), after = toSvgElement(D.ra), merged = mergedSvg();
  if (state.dim) {
    dimOthers(before, keepSet('before'));
    dimOthers(after, keepSet('after'));
  }
  tagItems(before, 'before');
  tagItems(after, 'after');
  tagItems(merged, 'merged');
  withLayout(merged, () => highlightRuns(merged));
  morph = new Morph(p, [before, merged, after], v, state.morph);
  morph.svg.addEventListener('click', (e) => clickSelect(e, state.morph === 0 ? 'before' : state.morph === 1 ? 'merged' : 'after'));
  svgs.after = morph.svg;
  const steps = STATE_NAMES.map((name, i) => h('button', { class: i === state.morph ? 'on' : '', onclick: () => morphTo(i) }, name));
  const play = h('button', { class: 'play', title: 'Play (Space)', onclick: () => togglePlay() }, state.playing ? '❚❚' : '▶');
  p.append(
    h('div', { class: 'morph-bar no-pan' },
      h('button', { title: 'Previous (←)', onclick: () => morphTo(state.morph - 1) }, '◀'),
      h('div', { class: 'seg morph-steps' }, ...steps),
      h('button', { title: 'Next (→)', onclick: () => morphTo(state.morph + 1) }, '▶'),
      play,
    ),
  );
  const sync = () => {
    steps.forEach((b, i) => b.classList.toggle('on', i === state.morph));
    play.textContent = state.playing ? '❚❚' : '▶';
  };
  morphSync = sync;
}

let morphSync: (() => void) | null = null;

function morphTo(i: number): void {
  if (!morph || i < 0 || i > 2) return;
  state.morph = i;
  morph.go(i);
  morphSync?.();
  applySelection(false);
}

function togglePlay(): void {
  state.playing = !state.playing;
  clearInterval(playTimer);
  if (state.playing) {
    let dir = state.morph === 2 ? -1 : 1;
    const tick = () => {
      if (state.morph + dir < 0 || state.morph + dir > 2) dir = -dir as 1 | -1;
      morphTo(state.morph + dir);
    };
    tick();
    playTimer = window.setInterval(tick, 2200);
  }
  morphSync?.();
}

/** Overlay: ghosts of removed items from the old version, and old → new arrows for moved items. */
function overlayExtras(svg: SVGSVGElement): void {
  const layer = svg.querySelector<SVGGElement>('g.dx-layer')!;
  const ghosts = svgEl('g', { class: 'dx-ghosts' });
  layer.before(ghosts);
  const moves: { key: string; from: ItemShape; to: ItemShape }[] = [];
  const hs: Highlight[] = [];
  for (const c of D.changes) {
    if (c.status === 'removed') {
      addGhost(svg, D.rb, sceneOf(D.rb, c.kind, c.beforeId ?? c.id), ghosts);
      const s = shapeOf(D.rb.result.geom, c.kind, c.beforeId ?? c.id);
      if (s) hs.push({ key: keyOf(c), shape: s, mark: 'removed', badge: '−', dashed: true });
    } else if (c.status === 'changed' && c.fields.some((f) => f.field === 'position')) {
      const from = shapeOf(D.rb.result.geom, c.kind, c.beforeId ?? c.id), to = shapeOf(D.ra.result.geom, c.kind, c.id);
      if (from && to && from.t === 'rect' && to.t === 'rect') moves.push({ key: keyOf(c), from, to });
    }
  }
  const all = drawHighlights(svg, [...highlightsFor('after'), ...hs]);
  drawMoves(all, moves);
}

function swipeControl(p: HTMLElement, la: HTMLElement): void {
  const handle = h('div', { class: 'swipe-handle no-pan', title: 'Drag to compare' }, h('span', {}, '⟷'));
  p.append(handle);
  const set = (pct: number) => {
    state.swipe = Math.min(100, Math.max(0, pct));
    la.style.clipPath = `inset(0 0 0 ${state.swipe}%)`;
    handle.style.left = `${state.swipe}%`;
  };
  set(state.swipe);
  handle.addEventListener('pointerdown', (e) => {
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = p.getBoundingClientRect();
      set(((ev.clientX - r.left) / r.width) * 100);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', () => handle.removeEventListener('pointermove', move), { once: true });
  });
}

function onionControl(p: HTMLElement, la: HTMLElement): void {
  const input = h('input', { type: 'range', min: 0, max: 100, value: String(state.onion), 'aria-label': 'Blend before and after' });
  const set = () => {
    state.onion = Number(input.value);
    la.style.opacity = String(state.onion / 100);
  };
  input.addEventListener('input', set);
  set();
  p.append(h('div', { class: 'onion no-pan' }, h('span', {}, 'Before'), input, h('span', {}, 'After')));
}

function zoomBar(): HTMLElement {
  const b = (label: string, title: string, fn: () => void) => h('button', { title, onclick: fn }, label);
  return h(
    'div',
    { class: 'zoombar no-pan' },
    b('−', 'Zoom out', () => view?.zoom(1 / 1.25)),
    b('+', 'Zoom in', () => view?.zoom(1.25)),
    b('Fit', 'Fit (F)', () => view?.fit()),
  );
}

/** The legend doubles as the filter: each entry switches its kind of change on or off. */
function legend(): HTMLElement {
  const raw = D.raw.counts;
  const item = (m: Mark, text: string, n: number, on: boolean, help: string, toggle: () => void) =>
    h('button', { class: `lg lg-${m}${on ? '' : ' off'}`, 'aria-pressed': String(on), title: `${help} — click to ${on ? 'hide' : 'show'}`, onclick: toggle }, h('i', {}), text, h('b', {}, String(n)));
  const facet = (f: ChangeFacet, letter: string) =>
    item(f, `${FACET_INFO[f].label} (${letter})`, raw[f], !state.ignore[f], FACET_INFO[f].help + (f === 'style' ? '. Off: both versions are drawn unstyled' : f === 'layout' ? '. Off: the old version is drawn on the new layout' : ''), () => setIgnore({ ...state.ignore, [f]: !state.ignore[f] }));
  return h(
    'div',
    { class: 'legend no-pan', role: 'group', 'aria-label': 'Show changes' },
    item('added', 'Added', raw.added, !state.hide.added, 'Items only in the new version', () => setHide('added')),
    item('removed', 'Removed', raw.removed, !state.hide.removed, 'Items only in the old version', () => setHide('removed')),
    facet('content', 'C'),
    facet('layout', 'L'),
    facet('style', 'S'),
    h('span', { class: 'lg-sep' }),
    h('button', { class: `lg lg-dim${state.dim ? '' : ' off'}`, 'aria-pressed': String(state.dim), title: 'Fade everything that did not change', onclick: () => ((state.dim = !state.dim), renderStage()) }, 'Dim unchanged'),
  );
}

function setHide(k: 'added' | 'removed'): void {
  state.hide = { ...state.hide, [k]: !state.hide[k] };
  refresh();
}

// ---- code view --------------------------------------------------------------------------------------------------

function renderCode(stage: HTMLElement): void {
  const normalize = (s: string) => {
    const { doc } = splitSource(s);
    return state.showMeta ? joinSource(doc) : doc.code + '\n';
  };
  const transformed = state.ignore.style || D.layoutAligned;
  const a = (state.showMeta && !transformed ? state.before : normalize(D.srcBefore)).replace(/\n$/, '').split('\n');
  const b = (state.showMeta && !transformed ? state.after : normalize(D.srcAfter)).replace(/\n$/, '').split('\n');
  const ops = lineDiff(a, b);
  const adds = ops.filter((o) => o.op === 'add').length, dels = ops.filter((o) => o.op === 'del').length;
  const rawOps = lineDiff(state.before.split('\n'), state.after.split('\n'));
  const rawCount = rawOps.filter((o) => o.op !== 'same').length;

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
  if (state.ignore.style) notes.push('style lines, classes and style metadata removed');
  if (D.layoutAligned) notes.push('layout metadata of the old version replaced by the new layout');
  if (!state.showMeta) notes.push('%%@ metadata lines hidden');
  stage.append(
    h(
      'div',
      { class: 'code-wrap' },
      h(
        'div',
        { class: 'code-head' },
        h('span', { class: 'stat add' }, `+${adds}`),
        h('span', { class: 'stat del' }, `−${dels}`),
        h('span', { class: 'muted' }, `lines · plain git diff: ${rawCount} changed lines`),
        h('span', { class: 'grow' }),
        h('label', {}, h('input', { type: 'checkbox', checked: state.showMeta, onchange: (e: Event) => ((state.showMeta = (e.target as HTMLInputElement).checked), renderStage()) }), ' Show %%@ metadata'),
      ),
      notes.length ? h('div', { class: 'code-note' }, `Normalized: ${notes.join('; ')}.`) : null,
      ops.length && adds + dels === 0 ? h('div', { class: 'empty' }, 'No differences left with the current filters.') : table,
    ),
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
    h('div', { class: 'kbd-hint' }, h('kbd', {}, 'J'), ' / ', h('kbd', {}, 'K'), ' next / previous change · ', h('kbd', {}, '1'), '–', h('kbd', {}, '6'), ' views · ', h('kbd', {}, 'F'), ' fit'),
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

// ---- toolbar ----------------------------------------------------------------------------------------------------

function renderToolbar(): void {
  const modes = h(
    'div',
    { class: 'seg', role: 'tablist', 'aria-label': 'View' },
    ...MODES.map((m) => h('button', { role: 'tab', 'aria-selected': String(state.mode === m.id), class: state.mode === m.id ? 'on' : '', title: `${m.help} (${m.key})`, onclick: () => setMode(m.id) }, m.label)),
  );
  $('#toolbar').replaceChildren(modes);
  $('#mode-help').textContent = MODES.find((m) => m.id === state.mode)!.help + (state.ignore.style ? ' Both versions are drawn without styling.' : '') + (D.layoutAligned ? ' The old version is drawn on the new layout.' : '');
}

function setMode(m: Mode): void {
  state.mode = m;
  renderToolbar();
  renderStage();
}

function setIgnore(ignore: DiffIgnore): void {
  state.ignore = Object.fromEntries(Object.entries(ignore).filter(([, v]) => v));
  refresh();
}

function refresh(): void {
  D = derive();
  if (state.selected && !D.changes.some((c) => keyOf(c) === state.selected)) state.selected = null;
  renderToolbar();
  renderPanel();
  renderStage();
}

// ---- sources ----------------------------------------------------------------------------------------------------

function loadSample(id: string): void {
  state.sample = id;
  state.before = sample(id, 'before');
  state.after = sample(id, 'after');
  state.selected = null;
  state.open.clear();
  $('#sample-note').textContent = SAMPLES.find((s) => s.id === id)?.note ?? '';
  refresh();
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
      state.before = before.value;
      state.after = after.value;
      state.sample = '';
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
  if (e.metaKey || e.ctrlKey || e.altKey || (e.target as Element).closest('input, textarea, select, dialog')) return;
  const m = MODES.find((x) => x.key === e.key);
  if (m) setMode(m.id);
  else if (state.mode === 'morph' && e.key === 'ArrowLeft') morphTo(state.morph - 1);
  else if (state.mode === 'morph' && e.key === 'ArrowRight') morphTo(state.morph + 1);
  else if (state.mode === 'morph' && e.key === ' ') togglePlay();
  else if (e.key === 'j' || e.key === 'n') step(1);
  else if (e.key === 'k' || e.key === 'p') step(-1);
  else if (e.key === 'f') view?.fit();
  else if (e.key === 'Escape') select(null, false);
  else return;
  e.preventDefault();
});

loadSample('architecture');
