// Copy / paste / duplicate / Alt-drag copies within one diagram (rows 36, prototype app `cloneItems`,
// `copySelection`, `pasteAt`, `duplicateSelection`). Copies of flowchart nodes / subgraphs (with what is inside them
// and the edges between them) or ER tables are written into the Mermaid code with the originals' looks.
// The clipboard holds references only: what is pasted must still be in the diagram (sequence diagrams: refused).
import type { DiagramMeta } from '../meta/types.js';
import type { DiagramModel } from '../model.js';
import { parse } from '../parse/index.js';
import type { GeometryIndex } from '../render/types.js';
import type { DiagramType, ItemKind, ItemRef, Point } from '../types.js';
import { cloneER } from './er.js';
import { cloneFlow } from './flowchart.js';
import { boxOfItem, cloneJson, cloneMeta, ensure, getM, uniqueRefs } from './meta-util.js';
import { pinAutoNodes } from './meta-ops.js';
import type { CloneResult, DocResult } from './types.js';

/** The editor's item clipboard (UI state, never saved into the document). */
export interface ClipboardData {
  type: DiagramType;
  items: ItemRef[];
}

/** Flowchart nodes / groups and ER tables can be copied. */
export const copyable = (model: DiagramModel, it: ItemRef): boolean =>
  (model.type === 'flowchart' && (it.kind === 'node' || it.kind === 'group')) || (model.type === 'er' && it.kind === 'entity');

/**
 * ⌘C: the copyable part of a selection, or null (the editor toasts "Copy works for flowchart shapes / groups and
 * ER tables" in sequence diagrams, else "Nothing to copy").
 */
export function copyItems(model: DiagramModel, _meta: DiagramMeta, refs: readonly ItemRef[]): ClipboardData | null {
  if (model.type === null) return null;
  const items = uniqueRefs(refs).filter((it) => copyable(model, it));
  return items.length ? { type: model.type, items } : null;
}

const existsNow = (model: DiagramModel, it: ItemRef): boolean =>
  model.type === 'flowchart' ? (it.kind === 'group' ? model.groups.has(it.id) : model.nodes.has(it.id))
    : model.type === 'er' ? model.entities.has(it.id) : false;

/** What can be pasted: the copied items that are still in this diagram (null: nothing — "Nothing to paste"). */
export function pasteable(model: DiagramModel, data: ClipboardData | null | undefined): ItemRef[] | null {
  if (!data || data.type !== model.type) return null;
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
  if (!items) return null;
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
