// Hit-testing and port geometry of connections (prototype app.js `CONNECTABLE`, `canConnect`, `geomBoxOf`,
// `targetAt`, `deepInside`, `projectToBox`, `MAGNETS`, `endpointBox`, `endpointId`).
import { currentPreset } from '../../../core/ops/style-env.js';
import { outerBox } from '../../../core/render/common.js';
import type { Side } from '../../../core/style.js';
import type { CenterBox, ItemKind, ItemRef, Point } from '../../../core/types.js';
import type { EditorCore } from '../../core.js';

/** Item kinds a connection can start / end on, per diagram type. */
export const CONNECTABLE: Readonly<Record<string, readonly ItemKind[]>> = {
  flowchart: ['node', 'group'],
  er: ['entity'],
  sequence: ['participant'],
};

/** Magnet points: 5 per side, evenly spaced. */
export const MAGNETS: readonly number[] = [1, 2, 3, 4, 5].map((i) => i / 6);

const kindsOf = (core: EditorCore): readonly ItemKind[] => CONNECTABLE[core.model.type ?? ''] ?? [];

/** Lanes are never connected. */
export function canConnect(core: EditorCore, kind: ItemKind, id: string): boolean {
  if (!kindsOf(core).includes(kind)) return false;
  if (kind !== 'group') return true;
  const r = core.result;
  return currentPreset({ model: core.model, meta: core.meta, theme: r.theme, color: r.rctx.color }, { kind, id }) !== 'lane';
}

/** The box connectors attach to (stacked shapes grow by their offset). */
export function geomBoxOf(core: EditorCore, kind: ItemKind, id: string): (CenterBox & { hidden?: boolean }) | null {
  const g = core.geom;
  let b: (CenterBox & { stack?: unknown; hidden?: boolean }) | undefined;
  if (g.type === 'flowchart') b = kind === 'node' ? g.nodes.get(id) : kind === 'group' ? g.groups.get(id) : undefined;
  else if (g.type === 'er') b = kind === 'entity' ? g.entities.get(id) : undefined;
  else if (g.type === 'sequence') b = kind === 'participant' ? g.participants.get(id) : undefined;
  if (!b) return null;
  const o = outerBox(b, b.stack);
  return b.hidden ? { ...o, hidden: true } : o;
}

/** True when the point is well inside the box (not near an edge): let the renderer pick the side. */
export function deepInside(b: CenterBox, q: Point, k: number): boolean {
  const m = Math.min(28 / k, b.w / 4, b.h / 4);
  return Math.abs(q.x - b.x) < b.w / 2 - m && Math.abs(q.y - b.y) < b.h / 2 - m;
}

/** Nearest point on the box border → { side, at } with at in 0..1 along that side (a magnet unless `free`). */
export function projectToBox(b: CenterBox, q: Point, free = false): { side: Side; at: number } {
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y0 = b.y - b.h / 2, y1 = b.y + b.h / 2;
  const cx = Math.min(x1, Math.max(x0, q.x)), cy = Math.min(y1, Math.max(y0, q.y));
  const d: Record<Side, number> = { t: cy - y0, b: y1 - cy, l: cx - x0, r: x1 - cx };
  const side = (Object.keys(d) as Side[]).reduce((a, c) => (d[c] < d[a] ? c : a));
  let at = side === 't' || side === 'b' ? (cx - x0) / b.w : (cy - y0) / b.h;
  if (free) at = Math.min(0.97, Math.max(0.03, Math.round(at * 100) / 100));
  else at = MAGNETS.reduce((best, m) => (Math.abs(m - at) < Math.abs(best - at) ? m : best));
  return { side, at: Math.round(at * 1000) / 1000 };
}

/** Elements under a client point, top first (shadow-root aware; empty where the engine has no layout). */
export function elementsAt(core: EditorCore, ev: { clientX: number; clientY: number }): Element[] {
  const root = core.dom.shadow as ShadowRoot & { elementsFromPoint?: (x: number, y: number) => Element[] };
  try {
    if (typeof root.elementsFromPoint === 'function') return root.elementsFromPoint(ev.clientX, ev.clientY);
  } catch {
    // no layout
  }
  return [];
}

/** The connectable item under the pointer (not the one being dragged from). */
export function targetAt(core: EditorCore, ev: { clientX: number; clientY: number }, exclude?: ItemRef | null): ItemRef | null {
  const kinds = kindsOf(core);
  const ok = (t: ItemRef): boolean =>
    kinds.includes(t.kind) && canConnect(core, t.kind, t.id) && !(exclude && exclude.kind === t.kind && exclude.id === t.id);
  const els = elementsAt(core, ev);
  if (els.length) {
    for (const n of els) {
      const el = n.closest('.el');
      if (!el || el.hasAttribute('data-part')) continue;
      const t: ItemRef = { kind: el.getAttribute('data-kind') as ItemKind, id: el.getAttribute('data-id') ?? '' };
      if (ok(t)) return t;
    }
    return null;
  }
  // no layout (tests, some embedded engines): the smallest connectable box under the point
  const p = core.toDiagram(ev);
  let best: { t: ItemRef; a: number } | null = null;
  for (const kind of kinds) {
    const g = core.geom;
    const map: ReadonlyMap<string, CenterBox & { hidden?: boolean }> | undefined =
      g.type === 'flowchart' ? (kind === 'node' ? g.nodes : kind === 'group' ? g.groups : undefined)
        : g.type === 'er' ? g.entities : g.type === 'sequence' ? g.participants : undefined;
    map?.forEach((b, id) => {
      if (b.hidden || Math.abs(p.x - b.x) > b.w / 2 || Math.abs(p.y - b.y) > b.h / 2) return;
      const t: ItemRef = { kind, id };
      if (ok(t) && (!best || b.w * b.h < best.a)) best = { t, a: b.w * b.h };
    });
  }
  return (best as { t: ItemRef; a: number } | null)?.t ?? null;
}

/** The item at end `a` (from) / `b` (to) of a connector. */
export function endpointId(core: EditorCore, kind: ItemKind, id: string, which: 'a' | 'b'): string | null {
  const M = core.model;
  const x = M.type === 'er' && kind === 'rel' ? M.rels.find((e) => e.id === id) : M.type === 'flowchart' && kind === 'edge' ? M.edges.find((e) => e.id === id) : undefined;
  return x ? (which === 'a' ? x.from : x.to) : null;
}

export function endpointBox(core: EditorCore, kind: ItemKind, id: string, which: 'a' | 'b'): CenterBox | null {
  const target = endpointId(core, kind, id, which);
  if (target == null) return null;
  if (kind === 'rel') return geomBoxOf(core, 'entity', target);
  return geomBoxOf(core, 'node', target) ?? geomBoxOf(core, 'group', target);
}
