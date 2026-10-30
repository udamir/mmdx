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
import { Morph, STATE_NAMES } from './morph.js';
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

type Mode = 'side' | 'morph';

const MODES: { id: Mode; label: string; key: string; icon: string; help: string }[] = [
  { id: 'side', label: 'Side by side', key: '1', icon: 'M3 5h7v14H3zM14 5h7v14h-7z', help: 'Before and after next to each other, panned and zoomed together. Removed items are marked on the left, added on the right, changed on both.' },
  { id: 'morph', label: 'Morph', key: '2', icon: 'M4 7h8v10H4zM15 9l3 3-3 3M12 12h6', help: 'One canvas stepping Before → Merged → After. Merged keeps removed items in place and marks text changes word by word; moved items glide, colours blend and changed text flips between states.' },
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
  /** Editor-like side panels: code diff (left) and the change list (right). */
  panels: { code: false, changes: true },
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
  morph: 1,
  playing: false,
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
  morphSync = null;
  if (state.mode !== 'morph' && state.playing) {
    state.playing = false;
    clearInterval(playTimer);
  }
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

  if (state.mode === 'morph' && D.rm) {
    const p = h('div', { class: 'pane stack' });
    stage.append(p);
    morphStage(p, view);
  } else {
    const pb = pane('Before', 'target branch', 'before'), pa = pane('After', 'merge request', 'after');
    stage.append(pb, pa);
    svgs.before = mount(pb, D.rb, 'before');
    svgs.after = mount(pa, D.ra, 'after');
    for (const s of Object.values(svgs)) view.attach(s, s.parentElement!);
  }
  stage.append(toolPanel());
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
  ink.paint(morph.svg);
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
      ...section('Views', MODES.map((m) => row([m.key], `${m.label}: ${m.help}`))),
      ...section('Morph', [
        row(['←', '→'], 'Step between Before, Merged and After'),
        row(['Space'], 'Play / pause the transitions'),
      ]),
      ...section('Change filters (left panel)', [
        row(['Added'], 'Items only in the new version (green, +)'),
        row(['Removed'], 'Items only in the old version (red, dashed, −)'),
        row(['Content'], `${FACET_INFO.content.help} (amber, C)`),
        row(['Layout'], `${FACET_INFO.layout.help} (blue, L). Off: the old version is drawn on the new layout`),
        row(['Style'], `${FACET_INFO.style.help} (purple, S). Off: both versions are drawn unstyled`),
        row(['Dim'], 'Fade everything that did not change'),
      ]),
      ...section('Panels', [
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
  if (!state.panels.code) return;
  const part = (src: string) => {
    const { doc } = splitSource(src);
    return state.codeTab === 'code' ? doc.code : joinSource({ code: '', meta: doc.meta }).replace(/^\s+/, '');
  };
  const a = part(D.srcBefore).replace(/\n$/, '').split('\n');
  const b = part(D.srcAfter).replace(/\n$/, '').split('\n');
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

/** Icons of the change filters (the colour of each is its highlight colour). */
const FILTER_ICONS: Record<Mark | 'dim', string> = {
  added: 'M5 5h14v14H5zM12 8.5v7M8.5 12h7',
  removed: 'M5 5h14v14H5zM8.5 12h7',
  content: 'M5 6h14M12 6v13M9 19h6',
  layout: 'M12 4v16M4 12h16M9.5 6.5L12 4l2.5 2.5M9.5 17.5L12 20l2.5-2.5M6.5 9.5L4 12l2.5 2.5M17.5 9.5L20 12l-2.5 2.5',
  style: I_palette,
  dim: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M12 7h6M12 11h8.5M12 15h7.5',
};

function setTool(t: 'pan' | 'draw'): void {
  state.tool = t;
  const stage = $('#stage');
  stage.classList.toggle('tool-draw', t === 'draw');
  stage.classList.toggle('tool-pan', t === 'pan');
  renderTools();
}

function toolPanel(): HTMLElement {
  tools = h('div', { class: 'vbar ds-float no-pan', role: 'toolbar', 'aria-label': 'Diff tools', 'aria-orientation': 'vertical' });
  renderTools();
  return h('div', { class: 'vbar-wrap no-pan' }, tools);
}

function renderTools(): void {
  if (!tools) return;
  /** Icon button with a hover tooltip (`data-tip`). */
  const btn = (tip: string, ic: string, onclick: () => void, on: boolean | null, extra: Record<string, unknown> = {}, ...more: Child[]) =>
    h('button', { type: 'button', 'data-tip': tip, 'aria-label': tip, onclick, ...(on === null ? {} : { class: on ? 'on' : '', 'aria-pressed': String(on) }), ...extra }, icon(ic), ...more);
  const sep = () => h('span', { class: 'sep' });
  const raw = D.raw.counts;
  const filter = (m: Mark, label: string, n: number, on: boolean, toggle: () => void) =>
    btn(`${label} · ${n} — click to ${on ? 'hide' : 'show'}`, FILTER_ICONS[m], toggle, null, { class: `flt flt-${m}${on ? ' on' : ' off'}`, 'aria-pressed': String(on) }, n ? h('span', { class: 'cnt' }, String(n)) : null);
  const facet = (f: ChangeFacet) => filter(f, FACET_INFO[f].label, raw[f], !state.ignore[f], () => setIgnore({ ...state.ignore, [f]: !state.ignore[f] }));
  tools.replaceChildren(
    btn('Pan (H)', I_hand, () => setTool('pan'), state.tool === 'pan'),
    btn('Magic pen (P)', I_pen, () => setTool(state.tool === 'draw' ? 'pan' : 'draw'), state.tool === 'draw'),
    sep(),
    btn('Code diff (C)', I_code, () => togglePanel('code'), state.panels.code),
    btn('Change list (L)', I_list, () => togglePanel('changes'), state.panels.changes),
    sep(),
    ...MODES.map((m) => btn(`${m.label} (${m.key})`, m.icon, () => setMode(m.id), state.mode === m.id)),
    sep(),
    filter('added', 'Added', raw.added, !state.hide.added, () => setHide('added')),
    filter('removed', 'Removed', raw.removed, !state.hide.removed, () => setHide('removed')),
    facet('content'),
    facet('layout'),
    facet('style'),
    btn('Dim unchanged', FILTER_ICONS.dim, () => ((state.dim = !state.dim), renderStage()), state.dim),
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
  main.classList.toggle('no-code', !state.panels.code);
  main.classList.toggle('no-changes', !state.panels.changes);
}

function togglePanel(name: 'code' | 'changes', open = !state.panels[name]): void {
  state.panels = { ...state.panels, [name]: open };
  applyPanels();
  if (name === 'code') renderCodePane();
  renderTools();
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

function setMode(m: Mode): void {
  state.mode = m;
  renderStage();
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
  state.before = sample(id, 'before');
  state.after = sample(id, 'after');
  state.selected = null;
  state.open.clear();
  ink.strokes.length = 0;
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
  const changesPane = h('aside', { id: 'changes-pane', class: 'pane-side right', 'aria-label': 'Changes' },
    h('div', { class: 'rp-head' }, h('b', { role: 'heading', 'aria-level': '2' }, 'Changes'),
      h('button', { class: 'collapse-btn', title: 'Hide the change list (L)', 'aria-label': 'Hide the change list', onclick: () => togglePanel('changes', false) }, '×')),
    h('div', { id: 'panel', class: 'rp-body' }));
  main.append(codePane, changesPane, zoomBar());
  attachResizer(codePane, 'left', '--left-w', [280, 900]);
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
  else if (e.key === '?') toggleHelp();
  else if (state.mode === 'morph' && e.key === 'ArrowLeft') morphTo(state.morph - 1);
  else if (state.mode === 'morph' && e.key === 'ArrowRight') morphTo(state.morph + 1);
  else if (state.mode === 'morph' && e.key === ' ') togglePlay();
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
