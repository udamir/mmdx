// Helpers shared by the canvas modules (selection, structure, inline text, copy style, empty state): what can be
// selected by marquee / ⌘A, item labels for announcements, the selected-class marking and small DOM utilities.
import type { BoxGeom } from '../../../core/render/types.js';
import { el, text } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import type { ItemKind, ItemRef } from '../../../core/types.js';
import type { EditorCore, Sel } from '../../core.js';

/** Connector kinds: flowchart edges, ER relationships and sequence messages. */
export const LINE_KINDS: ReadonlySet<ItemKind> = new Set(['edge', 'rel', 'message']);

/** An item a marquee or ⌘A can select: its box, and for a connector the drawn line and its label. */
export interface Selectable {
  kind: ItemKind;
  id: string;
  b: BoxGeom;
  line?: readonly (readonly [number, number])[];
  label?: BoxGeom | null;
}

/**
 * Every item a marquee or ⌘A can select, with its box (a connector's: around its line and label): flowchart nodes,
 * groups and lanes, connectors; ER tables and relationships; sequence participants, boxes, messages, notes, blocks
 * and processes. Only the items drawn (not on a hidden layer).
 */
export function selectable(core: EditorCore): Selectable[] {
  const g = core.geom;
  const drawn = new Set(Array.from(core.dom.body.querySelectorAll('.el[data-kind][data-id]')).map((n) => `${n.getAttribute('data-kind')}:${n.getAttribute('data-id')}`));
  const out: Selectable[] = [];
  const box = (kind: ItemKind, id: string, b: BoxGeom & { hidden?: boolean }): void => {
    if (!b.hidden && drawn.has(`${kind}:${id}`)) out.push({ kind, id, b });
  };
  const boxes = (kind: ItemKind, map: ReadonlyMap<string, BoxGeom & { hidden?: boolean }>): void => map.forEach((b, id) => box(kind, id, b));
  const line = (kind: ItemKind, id: string, pts: readonly (readonly [number, number])[], label?: BoxGeom | null): void => {
    if (!drawn.has(`${kind}:${id}`)) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x: number, y: number): void => {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    };
    for (const [x, y] of pts) add(x, y);
    if (label) {
      add(label.x - label.w / 2, label.y - label.h / 2);
      add(label.x + label.w / 2, label.y + label.h / 2);
    }
    if (x0 !== Infinity) out.push({ kind, id, b: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 }, line: pts, label: label ?? null });
  };
  if (g.type === 'flowchart') {
    boxes('node', g.nodes);
    boxes('group', g.groups);
    g.edges.forEach((e, id) => line('edge', id, flattenPath(e.d), e.label));
  } else if (g.type === 'er') {
    boxes('entity', g.entities);
    g.rels.forEach((r, id) => line('rel', id, flattenPath(r.d), r.label));
  } else if (g.type === 'sequence') {
    boxes('participant', g.participants);
    boxes('box', g.boxes);
    boxes('note', g.notes);
    boxes('block', g.blocks);
    g.activations.forEach((a, id) => box('activation', id, { x: a.x, y: (a.y0 + a.y1) / 2, w: a.w, h: a.y1 - a.y0 }));
    g.messages.forEach((m, id) => line('message', id, m.self ? [[m.x0, m.y], [m.x0 + 30, m.y], [m.x0 + 30, m.y + 18], [m.x0, m.y + 18]] : [[m.x0, m.y], [m.x1, m.y]]));
  }
  return out;
}

/** The points along an SVG path of M / L / H / V / C / Q / Z commands (absolute, as the renderer writes them), curves sampled. */
export function flattenPath(d: string): [number, number][] {
  const out: [number, number][] = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  for (const [, cmd, args] of d.matchAll(/([MLHVCQZ])([^MLHVCQZ]*)/gi)) {
    const n = (args!.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    const C = cmd!.toUpperCase();
    if (C === 'M' || C === 'L') {
      for (let i = 0; i + 1 < n.length; i += 2) {
        x = n[i]!;
        y = n[i + 1]!;
        out.push([x, y]);
        if (C === 'M' && i === 0) [sx, sy] = [x, y];
      }
    } else if (C === 'H' || C === 'V') {
      for (const v of n) {
        if (C === 'H') x = v;
        else y = v;
        out.push([x, y]);
      }
    } else if (C === 'C') {
      for (let i = 0; i + 5 < n.length; i += 6) {
        const [x1, y1, x2, y2, x3, y3] = n.slice(i, i + 6) as [number, number, number, number, number, number];
        for (let s = 1; s <= 12; s++) {
          const t = s / 12, u = 1 - t;
          out.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
        }
        [x, y] = [x3, y3];
      }
    } else if (C === 'Q') {
      for (let i = 0; i + 3 < n.length; i += 4) {
        const [x1, y1, x2, y2] = n.slice(i, i + 4) as [number, number, number, number];
        for (let s = 1; s <= 6; s++) {
          const t = s / 6, u = 1 - t;
          out.push([u * u * x + 2 * u * t * x1 + t * t * x2, u * u * y + 2 * u * t * y1 + t * t * y2]);
        }
        [x, y] = [x2, y2];
      }
    } else if (C === 'Z') {
      [x, y] = [sx, sy];
      out.push([x, y]);
    }
  }
  return out;
}

/** A marquee area in diagram units (normalised: x0 ≤ x1, y0 ≤ y1). */
export interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Does the marquee take the item? Window (dragged left to right): the item lies fully inside. Crossing (right to
 * left): the area touches it, a box anywhere, a connector along its drawn line or at its label.
 */
export function inArea(it: Selectable, a: Area, crossing: boolean): boolean {
  const { b } = it;
  const L = b.x - b.w / 2, R = b.x + b.w / 2, T = b.y - b.h / 2, B = b.y + b.h / 2;
  if (!crossing) return L >= a.x0 && R <= a.x1 && T >= a.y0 && B <= a.y1;
  if (R < a.x0 || L > a.x1 || B < a.y0 || T > a.y1) return false;
  if (!it.line) return true;
  const lb = it.label;
  if (lb && lb.x + lb.w / 2 >= a.x0 && lb.x - lb.w / 2 <= a.x1 && lb.y + lb.h / 2 >= a.y0 && lb.y - lb.h / 2 <= a.y1) return true;
  const pts = it.line;
  if (pts.length === 1) return segmentInArea(pts[0]!, pts[0]!, a);
  for (let i = 1; i < pts.length; i++) if (segmentInArea(pts[i - 1]!, pts[i]!, a)) return true;
  return false;
}

/** Liang–Barsky: does the segment p–q pass through the area? */
function segmentInArea(p: readonly [number, number], q: readonly [number, number], a: Area): boolean {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  let t0 = 0, t1 = 1;
  const P = [-dx, dx, -dy, dy], Q = [p[0] - a.x0, a.x1 - p[0], p[1] - a.y0, a.y1 - p[1]];
  for (let i = 0; i < 4; i++) {
    const pi = P[i]!, qi = Q[i]!;
    if (pi === 0) {
      if (qi < 0) return false;
      continue;
    }
    const r = qi / pi;
    if (pi < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return true;
}

export const selKey = (it: ItemRef | null | undefined): string => (it ? `${it.kind}:${it.id}` : '');

/** Item elements of the scene (`.el[data-kind][data-id]`) drawing one item (main element and parts). */
export function itemEls(core: EditorCore, it: ItemRef): Element[] {
  return Array.from(core.dom.body.querySelectorAll('.el[data-id]')).filter(
    (n) => n.getAttribute('data-id') === it.id && n.getAttribute('data-kind') === it.kind,
  );
}

/** `.selected` on every item of a multi-selection (the core does it on draw; selection changes between draws). */
export function markSelection(core: EditorCore): void {
  const body = core.dom.body;
  for (const n of Array.from(body.querySelectorAll('.el.selected'))) n.classList.remove('selected');
  const sel = core.selection();
  if (sel.length > 1) for (const r of sel) for (const n of itemEls(core, r)) n.classList.add('selected');
}

/** The first line of an item's text (for announcements and the group-edit bar). */
export function itemLabel(core: EditorCore, it: ItemRef): string {
  const M = core.model;
  let s = '';
  if (M.type === 'flowchart') {
    if (it.kind === 'node') s = M.nodes.get(it.id)?.label ?? '';
    else if (it.kind === 'group') s = M.groups.get(it.id)?.label ?? '';
    else if (it.kind === 'edge') s = M.edges.find((e) => e.id === it.id)?.label ?? '';
  } else if (M.type === 'er') {
    if (it.kind === 'entity') s = M.entities.get(it.id)?.label ?? '';
    else if (it.kind === 'rel') s = M.rels.find((r) => r.id === it.id)?.label ?? '';
  } else if (M.type === 'sequence') {
    if (it.kind === 'participant') s = M.participants.find((p) => p.id === it.id)?.label ?? '';
    else if (it.kind === 'box') s = M.boxes.find((b) => b.id === it.id)?.label ?? '';
    else {
      const x = M.items.find((i) => 'id' in i && i.id === it.id && (i.kind === it.kind || (it.kind === 'block' && i.kind === 'blockStart')));
      if (x && 'text' in x) s = x.text;
      else if (x && 'label' in x) s = x.label;
    }
  }
  return (s.split('\n')[0] ?? '').trim() || it.id;
}

/** Number of connectors at a box item. */
export function connectionCount(core: EditorCore, it: ItemRef): number {
  const M = core.model;
  if (M.type === 'flowchart' && it.kind === 'node') return M.edges.filter((e) => e.from === it.id || e.to === it.id).length;
  if (M.type === 'er' && it.kind === 'entity') return M.rels.filter((r) => r.from === it.id || r.to === it.id).length;
  if (M.type === 'sequence' && it.kind === 'participant')
    return M.items.filter((i) => i.kind === 'message' && (i.from === it.id || i.to === it.id)).length;
  return -1;
}

/** Is the primary selection exactly this item (participant foot included)? */
export const samePrimary = (a: Sel | null, b: Sel): boolean => !!a && a.kind === b.kind && a.id === b.id && !!a.foot === !!b.foot;

/** Element under a client point inside the editor's shadow root (falls back to the document). */
export function elementAt(core: EditorCore, x: number, y: number): Element | null {
  const root = core.dom.shadow as ShadowRoot & { elementFromPoint?: (x: number, y: number) => Element | null };
  if (typeof root.elementFromPoint === 'function') return root.elementFromPoint(x, y);
  return typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
}

/** Plural helper for the prototype's messages ("Copied 2 items"). */
export const items = (n: number): string => `${n} item${n > 1 ? 's' : ''}`;

/**
 * The "W × H" pill shown while an item is resized: centred under its box (`gap` screen pixels below it), in diagram
 * units, at a constant size on screen.
 */
export function sizeBadge(b: { x: number; y: number; w: number; h: number }, k: number, gap = 12): SceneNode[] {
  const label = `${Math.round(b.w)} × ${Math.round(b.h)}`;
  const fs = 11 / k, bh = 18 / k, bw = (label.length * 6.6 + 14) / k;
  const y = b.y + b.h / 2 + gap / k;
  return [
    el('rect', { class: 'size-badge', x: b.x - bw / 2, y, width: bw, height: bh, rx: 5 / k }, 'size-badge'),
    text({ class: 'size-badge-text', x: b.x, y: y + bh / 2, 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, [{ text: label, x: b.x, y: y + bh / 2 }], 'size-badge-text'),
  ];
}
