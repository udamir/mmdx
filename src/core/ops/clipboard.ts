// Copy / paste / duplicate / Alt-drag copies (rows 36, prototype app `cloneItems`, `copySelection`, `pasteAt`,
// `duplicateSelection`). Copies of flowchart nodes / subgraphs (with what is inside them and the edges between them)
// or ER tables are written into the Mermaid code with the originals' looks.
// The clipboard carries content (component architecture §9): the copied items as a document of their own — their
// code lines, the connectors between them, their metadata (looks, positions) — so items copied from an old version in
// History can be pasted into the current document after it lost them. Items still in the target are copied from the
// target as it is now. Sequence diagrams and another diagram type are refused.
import { pruneMeta } from '../meta/index.js';
import type { DiagramMeta } from '../meta/types.js';
import type { DiagramModel } from '../model.js';
import { parse } from '../parse/index.js';
import type { GeometryIndex } from '../render/types.js';
import type { DiagramType, ItemKind, ItemRef, Point } from '../types.js';
import { cloneER, deleteER } from './er.js';
import { cloneFlow, deleteFlow } from './flowchart.js';
import { takenIds, usedIds } from './ids.js';
import { boxOfItem, cloneJson, cloneMeta, ensure, getM, uniqueRefs } from './meta-util.js';
import { groupDescendants, pinAutoNodes } from './meta-ops.js';
import type { CloneResult, DocResult } from './types.js';

/** The copied items as a document of their own (what a paste uses when the target no longer has them). */
export interface ClipboardContent {
  /** Mermaid code with only the copied items and the connectors between them. */
  code: string;
  /** Their metadata, with the positions of auto-laid-out items pinned. */
  meta: DiagramMeta;
  /** Looks of the connectors between the copied items, by `from:to` (connector ids are positional). */
  links: Record<string, unknown>;
  /** The copied items' box in the source (centring a paste at the pointer). */
  box: { x0: number; y0: number; x1: number; y1: number } | null;
}

/** The editor's item clipboard (UI state, never saved into the document). */
export interface ClipboardData {
  type: DiagramType;
  items: ItemRef[];
  /** The content, when the copy was made with its source (`copyItems(…, { code, geom })`). */
  content?: ClipboardContent;
}

/** Flowchart nodes / groups and ER tables can be copied. */
export const copyable = (model: DiagramModel, it: ItemRef): boolean =>
  (model.type === 'flowchart' && (it.kind === 'node' || it.kind === 'group')) || (model.type === 'er' && it.kind === 'entity');

/**
 * ⌘C: the copyable part of a selection, or null (the editor toasts "Copy works for flowchart shapes / groups and
 * ER tables" in sequence diagrams, else "Nothing to copy").
 */
export function copyItems(model: DiagramModel, meta: DiagramMeta, refs: readonly ItemRef[], src?: { code: string; geom?: GeometryIndex | null }): ClipboardData | null {
  if (model.type === null) return null;
  const items = uniqueRefs(refs).filter((it) => copyable(model, it));
  if (!items.length) return null;
  const content = src ? contentOf(src.code, meta, model, src.geom ?? null, items) : null;
  return { type: model.type, items, ...(content ? { content } : {}) };
}

/** The copied items as a document: everything else deleted (frames of uncopied groups only: their content moves up). */
function contentOf(code: string, meta: DiagramMeta, model: DiagramModel, geom: GeometryIndex | null, items: readonly ItemRef[]): ClipboardContent | null {
  const pinned = pinAutoNodes(model, meta, geom).meta;
  let rest: ItemRef[] = [];
  const links: Record<string, unknown> = {};
  if (model.type === 'flowchart') {
    const nodes = new Set<string>(), groups = new Set<string>();
    for (const it of items) {
      if (it.kind === 'node') nodes.add(it.id);
      if (it.kind === 'group') {
        groups.add(it.id);
        const d = groupDescendants(model, it.id);
        d.nodes.forEach((n) => nodes.add(n));
        d.groups.forEach((g) => groups.add(g));
      }
    }
    rest = [...[...model.nodes.keys()].filter((id) => !nodes.has(id)).map((id) => ({ kind: 'node' as const, id })), ...[...model.groups.keys()].filter((id) => !groups.has(id)).map((id) => ({ kind: 'group' as const, id }))];
    for (const e of model.edges) if (nodes.has(e.from) && nodes.has(e.to) && pinned.edges?.[e.id]) links[`${e.from}:${e.to}`] = cloneJson(pinned.edges[e.id]);
  } else if (model.type === 'er') {
    const keep = new Set(items.map((it) => it.id));
    rest = [...model.entities.keys()].filter((id) => !keep.has(id)).map((id) => ({ kind: 'entity' as const, id }));
    for (const r of model.rels) if (keep.has(r.from) && keep.has(r.to) && pinned.rels?.[r.id]) links[`${r.from}:${r.to}`] = cloneJson(pinned.rels[r.id]);
  } else return null;
  const res = model.type === 'flowchart' ? deleteFlow(code, model, rest) : deleteER(code, model, rest);
  const sub = parse(res.code);
  const { edges: _e, rels: _r, ...own } = pruneMeta(pinned, usedIds(sub));
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const it of items) {
    const b = boxOfItem(geom, it);
    if (!b) continue;
    x0 = Math.min(x0, b.x - b.w / 2);
    x1 = Math.max(x1, b.x + b.w / 2);
    y0 = Math.min(y0, b.y - b.h / 2);
    y1 = Math.max(y1, b.y + b.h / 2);
  }
  return { code: res.code, meta: own, links, box: x0 === Infinity ? null : { x0, y0, x1, y1 } };
}

const existsNow = (model: DiagramModel, it: ItemRef): boolean =>
  model.type === 'flowchart' ? (it.kind === 'group' ? model.groups.has(it.id) : model.nodes.has(it.id))
    : model.type === 'er' ? model.entities.has(it.id) : false;

/**
 * What can be pasted: the copied items when this diagram still has them all, else every copied item when the
 * clipboard carries their content (null: nothing — "Nothing to paste"; another diagram type is refused).
 */
export function pasteable(model: DiagramModel, data: ClipboardData | null | undefined): ItemRef[] | null {
  if (!data || data.type !== model.type) return null;
  if (data.content && !data.items.every((it) => existsNow(model, it))) return data.items.slice();
  const items = data.items.filter((it) => existsNow(model, it));
  return items.length ? items : null;
}

/**
 * Copies items next to the originals, shifted by (dx, dy), with their metadata (minus `locked`) and the looks of
 * the connectors between them. Returns the new document with the copies selected, or null when nothing was copied.
 */
export function cloneItems(code: string, meta: DiagramMeta, model: DiagramModel, geom: GeometryIndex | null | undefined, items: readonly ItemRef[], dx = 0, dy = 0): DocResult | null {
  const res: CloneResult | null = model.type === 'flowchart' ? cloneFlow(code, model, items) : model.type === 'er' ? cloneER(code, model, items) : null;
  const map = res?.map;
  if (!res || !map) return null;
  const out = cloneMeta(pinAutoNodes(model, meta, geom).meta);
  for (const [from, to] of Object.entries(map)) {
    const kind: ItemKind = model.type === 'flowchart' && model.groups.has(from) ? 'group' : model.type === 'er' ? 'entity' : 'node';
    const m = ensure(out, kind, to);
    Object.assign(m, cloneJson(getM(out, kind, from)));
    delete m.locked;
    const b = boxOfItem(geom, { kind, id: from });
    if (kind !== 'group' && b) {
      m.x = Math.round(b.x + dx);
      m.y = Math.round(b.y + dy);
    } else if (kind === 'group' && m.w) {
      m.x = Math.round(Number(m.x) + dx);
      m.y = Math.round(Number(m.y) + dy);
    }
  }
  // connector looks follow too: matched by their (new) endpoints
  const conn = new Map<string, unknown>();
  const has = (id: string): boolean => Object.hasOwn(map, id);
  if (model.type === 'flowchart')
    for (const e of model.edges) if (has(e.from) && has(e.to) && out.edges?.[e.id]) conn.set(`edges:${map[e.from]}:${map[e.to]}`, out.edges[e.id]);
  if (model.type === 'er')
    for (const r of model.rels) if (has(r.from) && has(r.to) && out.rels?.[r.id]) conn.set(`rels:${map[r.from]}:${map[r.to]}`, out.rels[r.id]);
  const next = parse(res.code);
  if (next.type === 'flowchart')
    for (const e of next.edges) {
      const look = conn.get(`edges:${e.from}:${e.to}`);
      if (look && !out.edges?.[e.id]) (out.edges ??= {})[e.id] = cloneJson(look) as Record<string, unknown>;
    }
  if (next.type === 'er')
    for (const r of next.rels) {
      const look = conn.get(`rels:${r.from}:${r.to}`);
      if (look && !out.rels?.[r.id]) (out.rels ??= {})[r.id] = cloneJson(look) as Record<string, unknown>;
    }
  const selection = items.filter((it) => has(it.id)).map((it) => ({ kind: it.kind, id: map[it.id]! }));
  return { code: res.code, meta: out, selection };
}

const snapV = (v: number, snap: number): number => (!snap ? Math.round(v) : Math.round(v / snap) * snap);

/**
 * ⌘V / right-click Paste: copies of the clipboard items centred at `at` (diagram units, snapped to `snap`), or
 * without it a small offset (+30, +30) from the originals. null when nothing can be pasted.
 */
export function pasteItems(code: string, meta: DiagramMeta, model: DiagramModel, geom: GeometryIndex | null | undefined, data: ClipboardData | null | undefined, at?: Point | null, snap = 5): DocResult | null {
  const items = pasteable(model, data);
  if (!items || !data) return null;
  if (data.content && !data.items.every((it) => existsNow(model, it))) return pasteContent(code, meta, model, data.content, items, at ?? null, snap);
  let dx = 30, dy = 30;
  if (at) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const it of items) {
      const b = boxOfItem(geom, it);
      if (!b) continue;
      x0 = Math.min(x0, b.x - b.w / 2);
      x1 = Math.max(x1, b.x + b.w / 2);
      y0 = Math.min(y0, b.y - b.h / 2);
      y1 = Math.max(y1, b.y + b.h / 2);
    }
    if (x0 !== Infinity) {
      dx = snapV(at.x - (x0 + x1) / 2, snap);
      dy = snapV(at.y - (y0 + y1) / 2, snap);
    }
  }
  return cloneItems(code, meta, model, geom, items, dx, dy);
}

/** ⌘D: copies of the copyable selection at +30, +30 (null: "Duplicate works for flowchart shapes / groups and ER tables"). */
export function duplicateItems(code: string, meta: DiagramMeta, model: DiagramModel, geom: GeometryIndex | null | undefined, refs: readonly ItemRef[]): DocResult | null {
  const items = uniqueRefs(refs).filter((it) => copyable(model, it));
  if (!items.length) return null;
  return cloneItems(code, meta, model, geom, items, 30, 30);
}

/** Pastes the clipboard's content into a document that does not have the items: fresh ids, the source's looks. */
function pasteContent(code: string, meta: DiagramMeta, model: DiagramModel, c: ClipboardContent, items: readonly ItemRef[], at: Point | null, snap: number): DocResult | null {
  const src = parse(c.code);
  const taken = takenIds(model, true);
  const res: CloneResult | null = src.type === 'flowchart' && model.type === 'flowchart' ? cloneFlow(c.code, src, items, { into: code, taken })
    : src.type === 'er' && model.type === 'er' ? cloneER(c.code, src, items, { into: code, taken }) : null;
  const map = res?.map;
  if (!res || !map) return null;
  let dx = 30, dy = 30;
  if (at && c.box) {
    dx = snapV(at.x - (c.box.x0 + c.box.x1) / 2, snap);
    dy = snapV(at.y - (c.box.y0 + c.box.y1) / 2, snap);
  }
  const out = cloneMeta(meta);
  for (const [from, to] of Object.entries(map)) {
    const kind: ItemKind = src.type === 'flowchart' && src.groups.has(from) ? 'group' : src.type === 'er' ? 'entity' : 'node';
    const m = ensure(out, kind, to);
    Object.assign(m, cloneJson(getM(c.meta, kind, from)));
    delete m.locked;
    if (typeof m.x === 'number' && typeof m.y === 'number' && (kind !== 'group' || m.w)) {
      m.x = Math.round(m.x + dx);
      m.y = Math.round(m.y + dy);
    }
  }
  // connector looks, by their (new) endpoints
  const back = new Map(Object.entries(map).map(([a, b]) => [b, a]));
  const next = parse(res.code);
  const look = (from: string, to: string): unknown => c.links[`${back.get(from)}:${back.get(to)}`];
  if (next.type === 'flowchart')
    for (const e of next.edges) {
      const l = back.has(e.from) && back.has(e.to) ? look(e.from, e.to) : undefined;
      if (l && !out.edges?.[e.id]) (out.edges ??= {})[e.id] = cloneJson(l) as Record<string, unknown>;
    }
  if (next.type === 'er')
    for (const r of next.rels) {
      const l = back.has(r.from) && back.has(r.to) ? look(r.from, r.to) : undefined;
      if (l && !out.rels?.[r.id]) (out.rels ??= {})[r.id] = cloneJson(l) as Record<string, unknown>;
    }
  const selection = items.filter((it) => Object.hasOwn(map, it.id)).map((it) => ({ kind: it.kind, id: map[it.id]! }));
  return { code: res.code, meta: out, selection };
}
