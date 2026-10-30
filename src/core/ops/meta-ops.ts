// Metadata-only (and small whole-document) operations of the editor, ported from prototype app.js as pure
// functions: (code, meta, model, …) → { code, meta }. Each one clones the metadata first; the input is never
// mutated. Prompts, confirmations, toasts and redraws stay in the editor (see the notes on each function).
import { maxOf, minOf } from '../geom.js';
import { activationsOf } from '../ids.js';
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import { COLLECTIONS, KIND_TO_COLL } from '../meta/types.js';
import type { Direction, DiagramModel, FlowchartModel, SequenceModel } from '../model.js';
import { renameClashingSubgraph } from '../parse/flowchart.js';
import { DEFAULT_LAYER } from '../layers.js';
import { parse } from '../parse/index.js';
import { pagePresets } from '../render/page.js';
import type { BoxGeom, GeometryIndex } from '../render/types.js';
import type { ResolvedTheme } from '../theme/types.js';
import { ITEM_KINDS, type DiagramType, type ItemKind, type ItemRef } from '../types.js';
import { boxOfItem, cloneJson, cloneMeta, ensure, getM, tidy } from './meta-util.js';
import {
  baseStyleOf, currentPreset, edgeEndsOf, effectiveValue, isLocalPreset, nodeShapeOf, participantShapeOf, presetOfItem,
  presetsFor, themePresetsOf, type StyleEnv,
} from './style-env.js';
import type { CodeResult, DocResult, MetaResult } from './types.js';

// ---- diagram palette (row 88) -------------------------------------------------------------------------------------

/**
 * "+" in a colour picker: keeps the colour in this diagram's palette, named by its value (adding it twice is one
 * entry). Returns the palette name; items then refer to it as `@<name>`.
 */
export function addLocalColor(meta: DiagramMeta, hex: string): MetaResult & { name: string } {
  const out = cloneMeta(meta);
  const name = `c-${hex.replace('#', '').toLowerCase()}`;
  (out.styles['palette'] ??= {})[name] = { color: hex.toLowerCase() };
  return { meta: out, name };
}

/**
 * Removes a diagram colour; items that used it keep the look: every `@<name>` value becomes the colour itself.
 * The editor shows "Colour removed from this diagram's palette — items using it keep the colour".
 */
export function removeLocalColor(meta: DiagramMeta, name: string): MetaResult {
  const out = cloneMeta(meta);
  const pal = out.styles['palette'];
  const hex = pal?.[name]?.['color'];
  if (pal) {
    delete pal[name];
    if (!Object.keys(pal).length) delete out.styles['palette'];
  }
  const ref = `@${name}`;
  if (typeof hex === 'string') {
    // iterative walk (metadata nesting is shallow, but it is user input)
    const stack: unknown[] = [out];
    while (stack.length) {
      const o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      const rec = o as Record<string, unknown>;
      for (const [k, v] of Object.entries(rec)) {
        if (v === ref) rec[k] = hex;
        else if (v && typeof v === 'object') stack.push(v);
      }
    }
  }
  return { meta: out };
}

// ---- layers (row 67) ----------------------------------------------------------------------------------------------

export { DEFAULT_LAYER };

/** Puts items on a layer (`default` removes their `layer` key). */
export function setLayer(meta: DiagramMeta, items: readonly ItemRef[], layerId: string): MetaResult {
  const out = cloneMeta(meta);
  for (const it of items) {
    const m = ensure(out, it.kind, it.id);
    if (layerId === DEFAULT_LAYER) delete m.layer;
    else m.layer = layerId;
    tidy(out, it.kind, it.id);
  }
  return { meta: out };
}

/** "+ New layer": `L<n>` named "Layer <n>", taking the given items along. */
export function newLayer(meta: DiagramMeta, items: readonly ItemRef[] = []): MetaResult & { id: string } {
  let n = 1;
  while (meta.layers?.[`L${n}`]) n++;
  const id = `L${n}`;
  const out = cloneMeta(meta);
  (out.layers ??= {})[id] = { name: `Layer ${n}` };
  return { meta: items.length ? setLayer(out, items, id).meta : out, id };
}

// ---- lock ---------------------------------------------------------------------------------------------------------

/** Items with `locked` metadata. */
export function lockedItems(meta: DiagramMeta): ItemRef[] {
  const out: ItemRef[] = [];
  for (const kind of ITEM_KINDS) for (const [id, m] of Object.entries(meta[KIND_TO_COLL[kind]] ?? {})) if (m.locked) out.push({ kind, id });
  return out;
}

/** Everything locked becomes movable again ("Unlocked <count> items"). */
export function unlockAll(meta: DiagramMeta): MetaResult & { count: number } {
  const out = cloneMeta(meta);
  const list = lockedItems(out);
  for (const { kind, id } of list) {
    delete ensure(out, kind, id).locked;
    tidy(out, kind, id);
  }
  return { meta: out, count: list.length };
}

// ---- auto layout (row 12) -----------------------------------------------------------------------------------------

/**
 * "Auto layout": forgets manual positions and sizes (x / y / w / h, sequence `dy`, bend `points`, a custom page
 * size and position) and keeps every style. The editor then fits the view ("Manual positions removed (styles kept)").
 */
export function resetLayout(meta: DiagramMeta): MetaResult {
  const out = cloneMeta(meta);
  for (const coll of ['nodes', 'entities', 'participants', 'groups'] as const)
    for (const m of Object.values(out[coll] ?? {})) {
      delete m.x;
      delete m.y;
      delete m.w;
      delete m.h;
    }
  for (const coll of ['messages', 'notes', 'blocks'] as const) for (const m of Object.values(out[coll] ?? {})) delete m.dy;
  for (const coll of ['edges', 'rels'] as const) for (const m of Object.values(out[coll] ?? {})) delete m.points;
  delete out.canvas.w;
  delete out.canvas.h;
  delete out.canvas.x;
  delete out.canvas.y;
  for (const coll of ['nodes', 'entities', 'participants', 'groups', 'messages', 'notes', 'blocks'] as const) {
    const c = out[coll];
    if (c) for (const [id, m] of Object.entries(c)) if (!Object.keys(m).length) delete c[id];
  }
  return { meta: out };
}

// ---- positions ----------------------------------------------------------------------------------------------------

/**
 * Auto-placed flowchart nodes are laid out below hand-placed ones: before the first manual placement, pin them where
 * they are (from the last render's geometry) so nothing else jumps. Mutates and returns `meta` (callers pass a clone).
 */
function pinAutoInPlace(meta: DiagramMeta, model: DiagramModel, geom: GeometryIndex | null | undefined): DiagramMeta {
  if (model.type !== 'flowchart' || geom?.type !== 'flowchart') return meta;
  for (const [id, b] of geom.nodes)
    if (b.auto) {
      const m = ensure(meta, 'node', id);
      if (m.x == null || m.y == null) {
        m.x = Math.round(b.x);
        m.y = Math.round(b.y);
      }
    }
  return meta;
}

/** Pins every auto-placed flowchart node at its rendered position. */
export function pinAutoNodes(model: DiagramModel, meta: DiagramMeta, geom: GeometryIndex | null | undefined): MetaResult {
  return { meta: pinAutoInPlace(cloneMeta(meta), model, geom) };
}

/** Node and subgraph ids inside a subgraph (any depth). */
export function groupDescendants(model: FlowchartModel, gid: string): { nodes: string[]; groups: string[] } {
  const nodes: string[] = [], groups: string[] = [];
  const seen = new Set<string>([gid]);
  // depth-first in child order, as the prototype's recursive walk (iterative: nesting depth is user input)
  const stack: { children: readonly string[]; i: number }[] = [{ children: model.groups.get(gid)?.children ?? [], i: 0 }];
  while (stack.length) {
    const top = stack[stack.length - 1]!;
    if (top.i >= top.children.length) {
      stack.pop();
      continue;
    }
    const c = top.children[top.i++]!;
    const g = model.groups.get(c);
    if (g) {
      if (seen.has(c)) continue;
      seen.add(c);
      groups.push(c);
      stack.push({ children: g.children, i: 0 });
    } else if (model.nodes.has(c)) nodes.push(c);
  }
  return { nodes, groups };
}

/** Snapping of moved positions: 0 = exact (rounded); n = to the n-unit grid. */
const snapV = (v: number, snap: number): number => (!snap ? Math.round(v) : Math.round(v / snap) * snap);

interface MoveTarget {
  kind: ItemKind;
  id: string;
  x: number;
  y: number;
}

function shiftAll(meta: DiagramMeta, items: readonly MoveTarget[], ddx: number, ddy: number): void {
  for (const it of items) {
    const m = ensure(meta, it.kind, it.id);
    m.x = Math.round(it.x + ddx);
    m.y = Math.round(it.y + ddy);
  }
}

/** In-place move of one item (prototype app `moveDrag(...).apply`). */
function moveInPlace(meta: DiagramMeta, model: DiagramModel, geom: GeometryIndex | null | undefined, { kind, id }: ItemRef, dx: number, dy: number, part: 'label' | undefined, snap: number): void {
  if (kind === 'activation') return; // resized by its top / bottom handles
  if (getM(meta, kind, id).locked && part !== 'label') return;
  if (part === 'label') {
    const m = ensure(meta, kind, id);
    m.labelDx = Math.round((typeof m.labelDx === 'number' ? m.labelDx : 0) + dx);
    m.labelDy = Math.round((typeof m.labelDy === 'number' ? m.labelDy : 0) + dy);
    return;
  }
  const moveSet = (items: MoveTarget[]): void => {
    const f = items[0];
    if (!f) return;
    shiftAll(meta, items, snapV(f.x + dx, snap) - f.x, snapV(f.y + dy, snap) - f.y);
  };
  if (kind === 'node' || kind === 'entity') {
    const b = boxOfItem(geom, { kind, id });
    if (b) moveSet([{ kind, id, x: b.x, y: b.y }]);
  } else if (kind === 'group' && model.type === 'flowchart') {
    const self = boxOfItem(geom, { kind, id });
    if (!self) return;
    const { nodes, groups } = groupDescendants(model, id);
    const items: MoveTarget[] = [];
    const gm = getM(meta, 'group', id);
    if (gm.w) items.push({ kind: 'group', id, x: Number(gm.x), y: Number(gm.y) });
    for (const n of nodes) {
      const b = boxOfItem(geom, { kind: 'node', id: n });
      if (b) items.push({ kind: 'node', id: n, x: b.x, y: b.y });
    }
    for (const sg of groups) {
      const m = getM(meta, 'group', sg);
      if (m.w) items.push({ kind: 'group', id: sg, x: Number(m.x), y: Number(m.y) });
    }
    if (!items.length) return;
    // snap relative to the group's top-left
    const tl = { x: self.x - self.w / 2, y: self.y - self.h / 2 };
    shiftAll(meta, items, snapV(tl.x + dx, snap) - tl.x, snapV(tl.y + dy, snap) - tl.y);
  } else if (kind === 'participant') {
    const b = boxOfItem(geom, { kind, id });
    if (b) ensure(meta, 'participant', id).x = snapV(b.x + dx, snap);
  } else if (kind === 'message' || kind === 'note' || kind === 'block') {
    const m = ensure(meta, kind, id);
    m.dy = Math.max(-40, Math.round((typeof m.dy === 'number' ? m.dy : 0) + dy));
    if (!m.dy) delete m.dy;
    tidy(meta, kind, id);
  }
}

export interface MoveOpts {
  /** Move a connector's label (edge / rel) instead of the item. */
  part?: 'label';
  /** Grid to snap to (0 = exact). */
  snap?: number;
}

/**
 * Moves one item by (dx, dy) as dragging does: groups carry their contents, participants move sideways only,
 * messages / notes / blocks vertically (`dy`, floor −40), locked items stay. Auto-placed nodes are pinned first.
 */
export function moveItem(model: DiagramModel, meta: DiagramMeta, geom: GeometryIndex | null | undefined, ref: ItemRef, dx: number, dy: number, { part, snap = 0 }: MoveOpts = {}): MetaResult {
  const out = cloneMeta(meta);
  if ((ref.kind === 'node' || ref.kind === 'group') && part !== 'label') pinAutoInPlace(out, model, geom);
  moveInPlace(out, model, geom, ref, dx, dy, part, snap);
  return { meta: out };
}

/** Moves a multi-selection by the same delta (prototype `multiMoveDrag`): nodes, tables, groups with contents, and the sequence items. */
export function moveItems(model: DiagramModel, meta: DiagramMeta, geom: GeometryIndex | null | undefined, refs: readonly ItemRef[], dx: number, dy: number, snap = 0): MetaResult {
  const out = pinAutoInPlace(cloneMeta(meta), model, geom);
  const items = new Map<string, MoveTarget>();
  const add = (kind: ItemKind, id: string, x: unknown, y: unknown): void => {
    if (x != null) items.set(`${kind}:${id}`, { kind, id, x: Number(x), y: Number(y) });
  };
  for (const it of refs) {
    if (getM(out, it.kind, it.id).locked) continue;
    if (it.kind === 'node' || it.kind === 'entity') {
      const b = boxOfItem(geom, it);
      if (b) add(it.kind, it.id, b.x, b.y);
    } else if (it.kind === 'group' && model.type === 'flowchart') {
      const { nodes, groups } = groupDescendants(model, it.id);
      const gm = getM(out, 'group', it.id);
      if (gm.w) add('group', it.id, gm.x, gm.y);
      for (const n of nodes) {
        const b = boxOfItem(geom, { kind: 'node', id: n });
        if (b) add('node', n, b.x, b.y);
      }
      for (const sg of groups) {
        const m = getM(out, 'group', sg);
        if (m.w) add('group', sg, m.x, m.y);
      }
    }
  }
  const list = [...items.values()];
  const f = list[0];
  if (f) shiftAll(out, list, snapV(f.x + dx, snap) - f.x, snapV(f.y + dy, snap) - f.y);
  // sequence items move as dragging one does: participants sideways, messages / notes / blocks up or down
  for (const it of refs)
    if ((it.kind === 'participant' || it.kind === 'message' || it.kind === 'note' || it.kind === 'block') && !getM(out, it.kind, it.id).locked)
      moveInPlace(out, model, geom, it, dx, dy, undefined, snap);
  return { meta: out };
}

export type AlignOp = 'left' | 'right' | 'hcenter' | 'top' | 'bottom' | 'vcenter' | 'hdist' | 'vdist';

function insideGroup(model: DiagramModel, it: ItemRef, gid: string): boolean {
  if (it.kind === 'group' && it.id === gid) return true;
  if (model.type !== 'flowchart') return false;
  let g = it.kind === 'node' ? model.nodes.get(it.id)?.parent : it.kind === 'group' ? model.groups.get(it.id)?.parent : null;
  for (let guard = 0; g && guard <= model.groups.size; g = model.groups.get(g)?.parent ?? null, guard++) if (g === gid) return true;
  return false;
}

/**
 * Align / distribute a multi-selection (row 37, Miro-like). Groups carry their contents; locked items stay put.
 * Returns the unchanged metadata when fewer than 2 items (3 for distribute) can move.
 */
export function alignItems(model: DiagramModel, meta: DiagramMeta, geom: GeometryIndex | null | undefined, refs: readonly ItemRef[], op: AlignOp): MetaResult {
  const out = pinAutoInPlace(cloneMeta(meta), model, geom);
  const groups = refs.filter((it) => it.kind === 'group').map((it) => it.id);
  // an item inside a selected group moves with that group
  const items = refs
    .filter((it) => !groups.some((g) => g !== it.id && insideGroup(model, it, g)))
    .map((it) => ({ it, b: boxOfItem(geom, it) }))
    .filter((x): x is { it: ItemRef; b: BoxGeom } => !!x.b && !getM(out, x.it.kind, x.it.id).locked);
  if (items.length < 2) return { meta };
  const L = (b: BoxGeom): number => b.x - b.w / 2, R = (b: BoxGeom): number => b.x + b.w / 2;
  const T = (b: BoxGeom): number => b.y - b.h / 2, B = (b: BoxGeom): number => b.y + b.h / 2;
  const minL = minOf(items.map((x) => L(x.b))), maxR = maxOf(items.map((x) => R(x.b)));
  const minT = minOf(items.map((x) => T(x.b))), maxB = maxOf(items.map((x) => B(x.b)));
  const shift = new Map<(typeof items)[number], [number, number]>();
  const put = (x: (typeof items)[number], dx: number, dy: number): void => void shift.set(x, [dx, dy]);
  if (op === 'left') items.forEach((x) => put(x, minL - L(x.b), 0));
  if (op === 'right') items.forEach((x) => put(x, maxR - R(x.b), 0));
  if (op === 'hcenter') items.forEach((x) => put(x, (minL + maxR) / 2 - x.b.x, 0));
  if (op === 'top') items.forEach((x) => put(x, 0, minT - T(x.b)));
  if (op === 'bottom') items.forEach((x) => put(x, 0, maxB - B(x.b)));
  if (op === 'vcenter') items.forEach((x) => put(x, 0, (minT + maxB) / 2 - x.b.y));
  if (op === 'hdist' || op === 'vdist') {
    if (items.length < 3) return { meta };
    const h = op === 'hdist';
    const size = (b: BoxGeom): number => (h ? b.w : b.h), lo = (b: BoxGeom): number => (h ? L(b) : T(b));
    const sorted = items.slice().sort((a, b) => (h ? a.b.x - b.b.x : a.b.y - b.b.y));
    const span = (h ? maxR - minL : maxB - minT) - sorted.reduce((s, x) => s + size(x.b), 0);
    const gap = span / (sorted.length - 1);
    let at = h ? minL : minT;
    for (const x of sorted) {
      const d = at - lo(x.b);
      put(x, h ? d : 0, h ? 0 : d);
      at += size(x.b) + gap;
    }
  }
  for (const [x, [dx, dy]] of shift) {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    if (x.it.kind === 'participant' && !dx) continue;
    moveInPlace(out, model, geom, x.it, dx, dy, undefined, 0); // exact, no snapping
  }
  return { meta: out };
}

// ---- style overrides (rows 38, 58, 59) ----------------------------------------------------------------------------

/** The same control edits differently named keys per kind in a multi-selection. */
export const SIZE_KEY: Partial<Record<ItemKind, string>> = { group: 'titleSize', entity: 'attrSize', block: 'labelSize', edge: 'labelSize', rel: 'labelSize', message: 'labelSize' };
export const WEIGHT_KEY: Partial<Record<ItemKind, string>> = { group: 'titleWeight', entity: 'titleWeight' };
export const TEXT_KEY: Partial<Record<ItemKind, string>> = { node: 'text', group: 'titleColor', entity: 'text', participant: 'text', note: 'text', block: 'labelColor', edge: 'labelColor', rel: 'labelColor', message: 'labelColor' };

/**
 * Sets (or with undefined / null, removes) own style values of items (prototype `setOverride`). `multi`: the
 * toolbar's text colour / font size / weight map to each kind's own key (an entity's font size also sets its
 * title one larger).
 */
export function setStyle(meta: DiagramMeta, targets: readonly ItemRef[], patch: Readonly<Record<string, unknown>>, { multi = false }: { multi?: boolean } = {}): MetaResult {
  const out = cloneMeta(meta);
  for (const { kind, id } of targets) {
    const m = ensure(out, kind, id) as Record<string, unknown>;
    for (const [k, val] of Object.entries(patch)) {
      let key = k;
      let extra: [string, unknown] | null = null;
      if (multi) {
        if (key === 'text') key = TEXT_KEY[kind] ?? key;
        else if (key === 'fontSize') {
          key = SIZE_KEY[kind] ?? key;
          if (kind === 'entity' && typeof val === 'number') extra = ['titleSize', val + 1];
        } else if (key === 'fontWeight') key = WEIGHT_KEY[kind] ?? key;
      }
      if (val === undefined || val === null) delete m[key];
      else m[key] = val;
      if (extra) m[extra[0]] = extra[1];
    }
    tidy(out, kind, id);
  }
  return { meta: out };
}

/** Keys "Reset style" keeps: position, size, attachment and link (everything else is look). */
export const LAYOUT_KEYS: readonly string[] = ['x', 'y', 'w', 'h', 'dy', 'locked', 'fromSide', 'toSide', 'fromAt', 'toAt', 'labelDx', 'labelDy', 'labelAt', 'link'];

/** ⋮ → Reset style: drops every own style value of an item, keeping its layout. */
export function resetItemStyle(meta: DiagramMeta, { kind, id }: ItemRef): MetaResult {
  const out = cloneMeta(meta);
  const m = getM(out, kind, id);
  const keep = Object.fromEntries(Object.entries(m).filter(([k]) => LAYOUT_KEYS.includes(k)));
  (out[KIND_TO_COLL[kind]] ??= {})[id] = keep;
  tidy(out, kind, id);
  return { meta: out };
}

/** Reset curve: drops a connector's bend points and own curvature. */
export function resetCurve(meta: DiagramMeta, { kind, id }: ItemRef): MetaResult {
  const out = cloneMeta(meta);
  const m = ensure(out, kind, id);
  delete m.points;
  delete m.curve;
  tidy(out, kind, id);
  return { meta: out };
}

// ---- copy style (row 40) ------------------------------------------------------------------------------------------

const SHAPE_KINDS: ReadonlySet<ItemKind> = new Set(['node', 'group', 'entity', 'participant', 'note', 'block']);
const LINE_KINDS: ReadonlySet<ItemKind> = new Set(['edge', 'rel', 'message']);
/** Everything that is "look", never position / size / links. */
export const COPY_KEYS: readonly string[] = [
  'preset', 'fill', 'stroke', 'strokeWidth', 'text', 'fontSize', 'fontWeight', 'radius', 'stack', 'dash', 'shape', 'color', 'width', 'arrow',
  'labelColor', 'labelSize', 'curve', 'titleSize', 'titleColor', 'titleAlign', 'titleWeight', 'fillOpacity', 'strokeOpacity', 'fontFamily', 'align', 'valign', 'wrap',
  'attrSize', 'attrColor', 'mode', 'showTypes', 'showComments', 'pkUnderline', 'labelOnLine', 'showTag', 'routing', 'startArrow', 'endArrow',
];
const SHAPE_COMMON = ['fill', 'stroke', 'strokeWidth', 'dash', 'radius', 'stack', 'fillOpacity', 'strokeOpacity', 'fontFamily'];
const LINE_COMMON = ['color', 'width', 'dash', 'strokeOpacity', 'fontFamily', 'labelSize', 'labelColor', 'fontWeight'];
/** Every style property that makes up an element's look (positions, links and attachment points excluded). */
export const LOOK_KEYS: readonly string[] = COPY_KEYS.filter((k) => !['preset', 'startArrow', 'endArrow'].includes(k));
/** What makes up a look in a preset. */
export const PRESET_KEYS: readonly string[] = COPY_KEYS.filter((k) => k !== 'preset');

/** 'shape' (box-like kinds), 'line' (connectors) or '' (activation, box: no copy style). */
export const styleFamily = (k: ItemKind): 'shape' | 'line' | '' => (SHAPE_KINDS.has(k) ? 'shape' : LINE_KINDS.has(k) ? 'line' : '');

/** The format painter's clipboard (UI state, never saved into the document). */
export interface StyleClip {
  from: ItemRef;
  kind: ItemKind;
  own: Record<string, unknown>;
  preset?: string;
  eff: Record<string, unknown>;
  text: unknown;
  /** The look as rendered, for an exact same-kind paste (presets derived from Mermaid syntax included). */
  look: Record<string, unknown>;
  ends: { start: unknown; end: unknown } | null;
}

/** Copy style (paint roller): null for kinds without a style family. */
export function copyStyle(env: StyleEnv, sel: ItemRef): StyleClip | null {
  const fam = styleFamily(sel.kind);
  if (!fam) return null;
  const own = getM(env.meta, sel.kind, sel.id) as Record<string, unknown>;
  const common = fam === 'shape' ? SHAPE_COMMON : LINE_COMMON;
  const preset = typeof own['preset'] === 'string' ? own['preset']
    : sel.kind === 'node' || sel.kind === 'edge' || sel.kind === 'group' ? currentPreset(env, sel) || undefined : undefined;
  const textKey = TEXT_KEY[sel.kind];
  const clip: StyleClip = {
    from: { kind: sel.kind, id: sel.id },
    kind: sel.kind,
    own: Object.fromEntries(COPY_KEYS.filter((k) => own[k] !== undefined).map((k) => [k, cloneJson(own[k])])),
    eff: Object.fromEntries(common.map((k) => [k, effectiveValue(env, sel, k)]).filter(([, v]) => v !== undefined)),
    text: textKey ? effectiveValue(env, sel, textKey) : undefined,
    look: Object.fromEntries(LOOK_KEYS.map((k) => [k, effectiveValue(env, sel, k)])),
    ends: sel.kind === 'edge' ? edgeEndsOf(env, sel.id) : null,
  };
  if (preset !== undefined) clip.preset = preset;
  return clip;
}

/**
 * Paste style onto an item of the same family. Same kind: the target becomes an exact copy of the source's look
 * (its preset, then every property where the target would still look different). Different kind: only the common
 * visual keys and the text colour. Refused (with a reason) across families; a no-op on the source itself.
 */
export function pasteStyle(env: StyleEnv, clip: StyleClip, target: ItemRef): MetaResult {
  if (styleFamily(target.kind) !== styleFamily(clip.kind) || !styleFamily(target.kind))
    return { meta: env.meta, reason: 'Style can only be pasted onto a similar item (shape ↔ shape, line ↔ line)' };
  if (target.kind === clip.from.kind && target.id === clip.from.id) return { meta: env.meta };
  const out = cloneMeta(env.meta);
  const live: StyleEnv = { ...env, meta: out }; // effective values follow the edits below
  const m = ensure(out, target.kind, target.id) as Record<string, unknown>;
  if (target.kind === clip.kind) {
    for (const k of COPY_KEYS) delete m[k];
    if (clip.preset) m['preset'] = clip.preset;
    // An empty dash means "solid" but is ignored when styles merge, so solid is written as 'none'.
    const norm = (k: string, v: unknown): unknown => (k === 'dash' ? v || 'none' : v);
    for (const k of LOOK_KEYS) {
      const want = norm(k, clip.look[k]);
      if (want === undefined || want === null || want === '') continue;
      if (norm(k, effectiveValue(live, target, k)) !== want) m[k] = cloneJson(want);
    }
    if (clip.ends) {
      const now = edgeEndsOf(live, target.id);
      if (now && now.start !== clip.ends.start) m['startArrow'] = clip.ends.start;
      if (now && now.end !== clip.ends.end) m['endArrow'] = clip.ends.end;
    }
  } else {
    Object.assign(m, cloneJson(clip.eff));
    const tk = TEXT_KEY[target.kind];
    if (clip.text && tk) m[tk] = clip.text;
  }
  tidy(out, target.kind, target.id);
  return { meta: out };
}

// ---- presets (row 60) ---------------------------------------------------------------------------------------------

/** The item's own look on top of its preset. */
export const ownLook = (meta: DiagramMeta, { kind, id }: ItemRef): Record<string, unknown> =>
  Object.fromEntries(Object.entries(getM(meta, kind, id)).filter(([k]) => PRESET_KEYS.includes(k)));

function dropOwnLook(meta: DiagramMeta, { kind, id }: ItemRef): void {
  const m = ensure(meta, kind, id) as Record<string, unknown>;
  for (const k of PRESET_KEYS) delete m[k];
  tidy(meta, kind, id);
}

/** A typed preset name made safe: lower case, word characters and dashes. */
export const normalizePresetName = (raw: string | null | undefined): string =>
  (raw ?? '').trim().toLowerCase().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');

/** What the "Save as preset" dialog suggests: `<preset>-2`, else `my-style`. */
export function suggestPresetName(env: StyleEnv, ref: ItemRef): string {
  const base = presetOfItem(env, ref);
  return base ? `${base}-2` : 'my-style';
}

/** Can the item's look become a preset (it has presets and an own look)? */
export const canSavePreset = (env: StyleEnv, ref: ItemRef): boolean => !!presetsFor(env, ref.kind) && Object.keys(ownLook(env.meta, ref)).length > 0;

/**
 * Save as preset: the item's look (its preset + its own changes) becomes a local preset `%%@ style.<kind> <name>`,
 * which the item then uses. `rawName` is what the user typed (the editor asks for it in a dialog). Theme presets are
 * copied with their palette references (`env.rawTheme`). Refused when the name is empty or already taken.
 */
export function saveAsPreset(env: StyleEnv, ref: ItemRef, rawName: string): MetaResult & { name?: string } {
  const name = normalizePresetName(rawName);
  if (!name) return { meta: env.meta, reason: 'The preset needs a name' };
  if (Object.hasOwn(presetsFor(env, ref.kind) ?? {}, name)) return { meta: env.meta, reason: `There already is a preset "${name}"` };
  const { kind } = ref;
  const base = presetOfItem(env, ref);
  const baseLook = isLocalPreset(env, kind, base) ? env.meta.styles[kind]![base]! : themePresetsOf(env, kind, true)[base] ?? {};
  const out = cloneMeta(env.meta);
  const preset: Record<string, unknown> = { ...cloneJson(baseLook), ...cloneJson(ownLook(env.meta, ref)) };
  if (kind === 'node' && !preset['shape']) preset['for'] = nodeShapeOf(env, ref.id);
  if (kind === 'participant' && !preset['shape']) preset['for'] = participantShapeOf(env, ref.id);
  (out.styles[kind] ??= {})[name] = preset;
  dropOwnLook(out, ref);
  ensure(out, kind, ref.id).preset = name;
  return { meta: out, name };
}

/** Update preset: a local preset takes the item's own changes (every item using it changes). */
export function updatePreset(env: StyleEnv, ref: ItemRef): MetaResult & { name?: string } {
  const name = presetOfItem(env, ref);
  if (!name || !isLocalPreset(env, ref.kind, name)) return { meta: env.meta, reason: 'Only presets of this diagram can be updated' };
  const out = cloneMeta(env.meta);
  const presets = out.styles[ref.kind]!;
  presets[name] = { ...presets[name], ...cloneJson(ownLook(env.meta, ref)) };
  dropOwnLook(out, ref);
  return { meta: out, name };
}

/** Items using a local preset (the delete confirmation names how many go back to the default style). */
export function presetUsers(meta: DiagramMeta, kind: ItemKind, name: string): string[] {
  return Object.entries(meta[KIND_TO_COLL[kind]] ?? {}).filter(([, m]) => m.preset === name).map(([id]) => id);
}

/** Deletes a local preset (× in the picker); its users go back to the default style. Confirmation is the editor's. */
export function deleteLocalPreset(meta: DiagramMeta, kind: ItemKind, name: string): MetaResult & { users: number } {
  const out = cloneMeta(meta);
  const users = presetUsers(out, kind, name);
  for (const iid of users) {
    delete ensure(out, kind, iid).preset;
    tidy(out, kind, iid);
  }
  const presets = out.styles[kind];
  if (presets) {
    delete presets[name];
    if (!Object.keys(presets).length) delete out.styles[kind];
  }
  return { meta: out, users: users.length };
}

/** Base style of an item for placeholders (re-exported for the properties panel). */
export { baseStyleOf };

// ---- subgraph / node id clash fix ---------------------------------------------------------------------------------

/**
 * Gives a subgraph whose id clashes with a node a free id `<id>_group` (the parser's diagnostic fix), moving its
 * `%%@ group` metadata along. The editor toasts "Subgraph renamed to <id> — its title is unchanged".
 */
export function fixIdClash(code: string, meta: DiagramMeta, model: FlowchartModel, id: string): DocResult {
  const d = model.diagnostics.find((x) => x.code === 'flow.id-clash' && x.params?.['id'] === id);
  const nid = d?.params?.['newId'];
  if (typeof nid !== 'string') return { code, meta };
  const next = renameClashingSubgraph(code, id);
  if (next === code) return { code, meta };
  const out = cloneMeta(meta);
  const g = out.groups?.[id];
  if (out.groups && g) {
    out.groups[nid] = g;
    delete out.groups[id];
  }
  return { code: next, meta: out, selection: [{ kind: 'group', id: nid }] };
}

// ---- diagram type, direction, autonumber (rows 52, 85) ------------------------------------------------------------

/** First line of a new diagram of each type. */
export const DIAGRAM_START: Readonly<Record<DiagramType, string>> = { flowchart: 'flowchart TB\n', sequence: 'sequenceDiagram\n', er: 'erDiagram\n' };

/**
 * Type switch: Mermaid diagram types cannot be converted into each other, so another type starts a new diagram
 * (the editor confirms first, and resets the file name and view). Returns the new document.
 */
export function newDiagram(type: DiagramType): { code: string; meta: DiagramMeta } {
  return { code: DIAGRAM_START[type], meta: { canvas: {}, styles: {} } };
}

/** Empty Mermaid (no header): the chosen type is written as the first line; theme and layout settings stay. */
export function startDiagram(code: string, type: DiagramType): CodeResult {
  return { code: DIAGRAM_START[type] + code.replace(/^\s+/, '') };
}

/**
 * Direction: the flowchart header (`flowchart LR`), or an ER diagram's `direction LR` line (rewritten, or added
 * after the header). Sequence diagrams have none.
 */
export function setDirection(code: string, model: DiagramModel, dir: Direction): CodeResult {
  const L = code.split('\n');
  if (model.type === 'er') {
    const d = L.findIndex((l) => /^\s*direction\s+(TB|TD|BT|LR|RL)\b/.test(l));
    if (d >= 0) L[d] = L[d]!.replace(/direction\s+\w+/, `direction ${dir}`);
    else {
      const hd = L.findIndex((l) => /^\s*erDiagram\b/.test(l));
      if (hd < 0) return { code };
      L.splice(hd + 1, 0, `  direction ${dir}`);
    }
  } else if (model.type === 'flowchart') {
    const i = L.findIndex((l) => /^\s*(flowchart|graph)\b/i.test(l));
    if (i < 0) return { code };
    L[i] = L[i]!.replace(/^(\s*)(flowchart|graph)\b(\s+(TB|TD|BT|LR|RL)\b)?/i, (_m, sp: string, kw: string) => `${sp}${kw} ${dir}`);
  } else return { code };
  return { code: L.join('\n') };
}

/** Sequence: `autonumber` numbers the messages — a line after the header. */
export function setAutonumber(code: string, on: boolean): CodeResult {
  const L = code.split('\n');
  const i = L.findIndex((l) => /^\s*autonumber\b/.test(l));
  if (!on && i >= 0) L.splice(i, 1);
  else if (on && i < 0) {
    const hd = L.findIndex((l) => /^\s*sequenceDiagram\b/.test(l));
    if (hd < 0) return { code };
    L.splice(hd + 1, 0, '  autonumber');
  } else return { code };
  return { code: L.join('\n') };
}

// ---- page settings (rows 63, 64, 86) ------------------------------------------------------------------------------

/**
 * Sets a page value. The value the page would have anyway (the page preset's, else `dflt`) is not stored — but a
 * value different from the preset's is, even "free" / "curved" (otherwise the preset would win).
 */
export function setPage(meta: DiagramMeta, theme: ResolvedTheme, type: DiagramType | null, k: string, v: unknown, dflt?: unknown): MetaResult {
  const out = cloneMeta(meta);
  const name = out.canvas.preset;
  const presets = type ? pagePresets(theme, type) : {};
  const preset = typeof name === 'string' && Object.hasOwn(presets, name) ? (presets[name] as Record<string, unknown>) : undefined;
  const base = preset?.[k] ?? dflt;
  if (v === undefined || v === base) delete out.canvas[k];
  else out.canvas[k] = v;
  return { meta: out };
}

/** Chooses the page preset ('' / null: none). */
export function setPagePreset(meta: DiagramMeta, id: string | null): MetaResult {
  const out = cloneMeta(meta);
  if (id) out.canvas.preset = id;
  else delete out.canvas.preset;
  return { meta: out };
}

// ---- sequence ids follow code changes -----------------------------------------------------------------------------

type SeqColl = 'messages' | 'notes' | 'blocks';

/**
 * Sequence item ids are positional (m1, m2…): when items are inserted or removed, carry their metadata over by
 * matching the source text in order (then by the same id, e.g. when the text itself was edited). Processes match by
 * participant + the statements they start on, else keep the same id.
 */
export function remapSeqMeta(oldModel: SequenceModel, oldCode: string, newModel: SequenceModel, newCode: string, meta: DiagramMeta): DiagramMeta {
  const OL = oldCode.split('\n'), NL = newCode.split('\n');
  const out: DiagramMeta = { ...meta };
  const kinds: [SeqColl, 'message' | 'note' | 'blockStart'][] = [['messages', 'message'], ['notes', 'note'], ['blocks', 'blockStart']];
  for (const [coll, kind] of kinds) {
    const cur = meta[coll];
    if (!cur || !Object.keys(cur).length) continue;
    const pick = (m: SequenceModel, L: readonly string[]): { id: string; t: string | undefined }[] =>
      m.items.filter((x) => x.kind === kind).map((x) => ({ id: (x as { id: string }).id, t: L[x.src]?.trim() }));
    const o = pick(oldModel, OL), n = pick(newModel, NL);
    if (o.length === n.length && o.every((a, i) => n[i]!.id === a.id && n[i]!.t === a.t)) continue;
    out[coll] = matchByText(o, n, cur);
  }
  const acts = meta.activations;
  if (acts && Object.keys(acts).length) {
    const key = (a: ReturnType<typeof activationsOf>[number], L: readonly string[]): string => `${a.participant}|${L[a.start.src]?.trim()}|${L[a.start.src + 1]?.trim()}`;
    const o = activationsOf(oldModel).map((a) => ({ id: a.id, t: key(a, OL) }));
    const n = activationsOf(newModel).map((a) => ({ id: a.id, t: key(a, NL) }));
    out.activations = matchByText(o, n, acts);
  }
  return out;
}

// Old → new ids by equal text (first unused in order), then by the same id; metadata follows its item.
function matchByText(o: { id: string; t: string | undefined }[], n: { id: string; t: string | undefined }[], meta: Record<string, ItemMeta>): Record<string, ItemMeta> {
  const free = new Map<string | undefined, string[]>();
  for (const x of n) (free.get(x.t) ?? free.set(x.t, []).get(x.t)!).push(x.id);
  const newIds = new Set(n.map((x) => x.id));
  const used = new Set<string>(), out: Record<string, ItemMeta> = {}, pending: typeof o = [];
  for (const a of o) {
    const nid = free.get(a.t)?.find((id) => !used.has(id));
    if (nid) {
      used.add(nid);
      if (meta[a.id]) out[nid] = meta[a.id]!;
    } else pending.push(a);
  }
  for (const a of pending)
    if (meta[a.id] && newIds.has(a.id) && !used.has(a.id)) {
      used.add(a.id);
      out[a.id] = meta[a.id]!;
    }
  return out;
}

/**
 * After any rewrite of the Mermaid code (an op, or typing in the code panel): the new model, with sequence metadata
 * carried over to the new positional ids (prototype `applyCode`).
 */
export function afterCodeChange(oldModel: DiagramModel, oldCode: string, newCode: string, meta: DiagramMeta): { model: DiagramModel; meta: DiagramMeta } {
  const model = parse(newCode);
  if (model.type === 'sequence' && oldModel.type === 'sequence') return { model, meta: remapSeqMeta(oldModel, oldCode, model, newCode, meta) };
  return { model, meta };
}

/** Collections an item kind can have metadata in (for callers iterating every item collection). */
export const ITEM_COLLECTIONS = COLLECTIONS.filter((c) => c !== 'layers');
