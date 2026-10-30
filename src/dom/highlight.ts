// Hover highlight (A.7 row 68): hovering a box lights it, its connectors (and their labels), the boxes at their
// other ends and the frames (groups, sequence boxes) around the lit items; everything else dims.
import type { DiagramModel } from '../core/model.js';

const BOXES = '.el.node, .el.entity, .el.participant';

const byData = (root: Element, attr: string, v: string): Element[] =>
  Array.from(root.querySelectorAll(`[${attr}]`)).filter((e) => e.getAttribute(attr) === v);

export function clearHighlight(root: Element): void {
  root.classList.remove('dim');
  for (const x of Array.from(root.querySelectorAll('.hl'))) x.classList.remove('hl');
}

/** Lights the given items (and connector labels); everything else dims. An empty list clears. */
export function highlightItems(root: Element, items: readonly { kind: string; id: string }[]): void {
  clearHighlight(root);
  if (!items.length) return;
  root.classList.add('dim');
  for (const it of items)
    for (const n of byData(root, 'data-id', it.id))
      if (n.classList.contains('el') && (n.getAttribute('data-kind') === it.kind || (it.kind === 'edge' && n.classList.contains('elabel'))))
        n.classList.add('hl');
}

/** Highlights around the box under `target`; returns the key of what is lit ('' when nothing). */
export function hoverHighlight(root: Element, target: Element | null, model: DiagramModel | null): string {
  const el = target?.closest(BOXES) ?? null;
  clearHighlight(root);
  if (!el || !root.contains(el)) return '';
  const id = el.getAttribute('data-id') ?? '';
  root.classList.add('dim');
  el.classList.add('hl');
  const lit = new Set<string>([id]);
  for (const attr of ['data-from', 'data-to'])
    for (const e of byData(root, attr, id)) {
      e.classList.add('hl');
      const eid = e.getAttribute('data-id');
      for (const other of [e.getAttribute('data-from'), e.getAttribute('data-to')]) {
        if (!other) continue;
        lit.add(other);
        for (const n of byData(root, 'data-id', other)) if (n.classList.contains('el') && !n.hasAttribute('data-from')) n.classList.add('hl');
      }
      if (eid) for (const n of byData(root, 'data-id', eid)) if (n.classList.contains('elabel')) n.classList.add('hl');
    }
  // frames stay visible only around highlighted items
  if (model?.type === 'flowchart') {
    for (const nid of lit)
      for (let g = model.nodes.get(nid)?.parent ?? null, guard = 0; g && guard < 64; g = model.groups.get(g)?.parent ?? null, guard++)
        for (const n of byData(root, 'data-id', g)) if (n.getAttribute('data-kind') === 'group') n.classList.add('hl');
  } else if (model?.type === 'sequence') {
    for (const b of model.boxes)
      if (b.members.some((m) => lit.has(m)))
        for (const n of byData(root, 'data-id', b.id)) if (n.getAttribute('data-kind') === 'box') n.classList.add('hl');
  }
  return `${el.getAttribute('data-kind')}:${id}`;
}

/** Scene CSS for highlight / dim, shared by viewer and editor. */
export const HIGHLIGHT_CSS = /* css */ `
.dim .el:not(.hl) { opacity: .14; transition: opacity .12s; }
.el.hl { opacity: 1; }
`;
