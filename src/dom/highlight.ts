// Hover highlight (A.7 row 68): hovering a box lights it, its connectors (and their labels), the boxes at their
// other ends and the frames (groups, sequence boxes) around the lit items; everything else dims.
import { withKind } from '../core/kinds/registry.js';
import type { DiagramModel } from '../core/model.js';

const BOXES = '.el.node, .el.entity, .el.participant';

/** The scene's elements by `data-id`, `data-from` and `data-to`, in document order: one scan per highlight (P8). */
function indexOf(root: Element): Record<'data-id' | 'data-from' | 'data-to', Map<string, Element[]>> {
  const out = { 'data-id': new Map<string, Element[]>(), 'data-from': new Map<string, Element[]>(), 'data-to': new Map<string, Element[]>() };
  for (const e of Array.from(root.querySelectorAll('[data-id], [data-from], [data-to]')))
    for (const attr of ['data-id', 'data-from', 'data-to'] as const) {
      const v = e.getAttribute(attr);
      if (v !== null) (out[attr].get(v) ?? out[attr].set(v, []).get(v)!).push(e);
    }
  return out;
}

/** What each root has lit by hover: the same box again (a pointer move within it) does no DOM work while it stays lit. */
const lastLit = new WeakMap<Element, { box: Element; key: string; lit: Element[] }>();

export function clearHighlight(root: Element): void {
  lastLit.delete(root);
  // lighting dims the root first: a root not dimmed has nothing lit (P8: a pointer move off the boxes clears often)
  if (!root.classList.contains('dim')) return;
  root.classList.remove('dim');
  for (const x of Array.from(root.querySelectorAll('.hl'))) x.classList.remove('hl');
}

/** Lights the given items (and connector labels); everything else dims. An empty list clears. */
export function highlightItems(root: Element, items: readonly { kind: string; id: string }[]): void {
  clearHighlight(root);
  if (!items.length) return;
  root.classList.add('dim');
  const by = indexOf(root)['data-id'];
  for (const it of items)
    for (const n of by.get(it.id) ?? [])
      if (n.classList.contains('el') && (n.getAttribute('data-kind') === it.kind || (it.kind === 'edge' && n.classList.contains('elabel'))))
        n.classList.add('hl');
}

/** Highlights around the box under `target`; returns the key of what is lit ('' when nothing). */
export function hoverHighlight(root: Element, target: Element | null, model: DiagramModel | null): string {
  const el = target?.closest(BOXES) ?? null;
  const last = lastLit.get(root);
  // still lit as it was (a re-render replaces or restyles the lit elements: lit again then)
  if (el && last?.box === el && root.classList.contains('dim') && last.lit.every((e) => e.isConnected && e.classList.contains('hl'))) return last.key;
  clearHighlight(root);
  if (!el || !root.contains(el)) return '';
  const id = el.getAttribute('data-id') ?? '';
  const idx = indexOf(root);
  const at = (attr: keyof typeof idx, v: string): readonly Element[] => idx[attr].get(v) ?? [];
  const on: Element[] = [];
  const light = (e: Element): void => {
    e.classList.add('hl');
    on.push(e);
  };
  root.classList.add('dim');
  light(el);
  const lit = new Set<string>([id]);
  for (const attr of ['data-from', 'data-to'] as const)
    for (const e of at(attr, id)) {
      light(e);
      const eid = e.getAttribute('data-id');
      for (const other of [e.getAttribute('data-from'), e.getAttribute('data-to')]) {
        if (!other) continue;
        lit.add(other);
        for (const n of at('data-id', other)) if (n.classList.contains('el') && !n.hasAttribute('data-from')) light(n);
      }
      if (eid) for (const n of at('data-id', eid)) if (n.classList.contains('elabel')) light(n);
    }
  // frames stay visible only around highlighted items
  const frames = model ? withKind(model, (k, m) => k.frames?.(m, lit)) ?? [] : [];
  for (const f of frames) for (const n of at('data-id', f.id)) if (n.getAttribute('data-kind') === f.kind) light(n);
  const key = `${el.getAttribute('data-kind')}:${id}`;
  lastLit.set(root, { box: el, key, lit: on });
  return key;
}

/** Scene CSS for highlight / dim, shared by viewer and editor. */
export const HIGHLIGHT_CSS = /* css */ `
.dim .el:not(.hl) { opacity: .14; transition: opacity .12s; }
.el.hl { opacity: 1; }
`;
