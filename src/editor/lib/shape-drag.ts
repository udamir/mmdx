// Dragging an item out of a menu onto the canvas (the Shapes palette, the icon picker; prototype `startPaletteDrag`):
// a ghost follows the pointer; released over the canvas it adds there, released without moving (a click) it adds at
// the canvas centre, released elsewhere (back over the menu) it does nothing.
import type { Point } from '../../core/types.js';
import { h } from '../../ui/kit/h.js';
import type { EditorCore } from '../core.js';
import { elementsAt } from './geometry.js';

/** Centre of the canvas in diagram coordinates (a click on a menu item). */
export function canvasCenter(core: EditorCore): Point {
  const r = core.dom.svg.getBoundingClientRect();
  return core.toDiagram({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
}

export interface MenuDrag {
  /** What the ghost shows. */
  ghost: () => Node;
  /** Elements a release over does nothing on (the menu itself). */
  inside: readonly (Element | null)[];
  /** Adds the item at a diagram point (`click`: released without moving); returns whether something was added. */
  drop(at: Point, ev: PointerEvent, click: boolean): void;
  /** After a click or a drop on the canvas (the menu closes). */
  done?(): void;
  /** Ends the drag early (the menu's module is uninstalled). */
  signal?: AbortSignal;
}

/** Starts a drag from `btn` on a primary-button press. */
export function startMenuDrag(core: EditorCore, ev: PointerEvent, btn: HTMLElement, o: MenuDrag): void {
  if (ev.button !== 0) return;
  ev.preventDefault();
  const root = core.dom.root;
  root.querySelector('.pal-ghost')?.remove();
  const gh = h('div', { class: 'pal-ghost' }, o.ghost());
  const rr = root.getBoundingClientRect();
  const place = (e: { clientX: number; clientY: number }): void => {
    gh.style.left = `${e.clientX - rr.left}px`;
    gh.style.top = `${e.clientY - rr.top}px`;
  };
  place(ev);
  root.append(gh);
  try {
    btn.setPointerCapture(ev.pointerId);
  } catch {
    // capture is best-effort
  }
  const start = { x: ev.clientX, y: ev.clientY };
  let moved = false;
  const drag = new AbortController();
  const finish = (e: PointerEvent, cancelled: boolean): void => {
    drag.abort();
    gh.remove();
    if (cancelled) return;
    const r = core.dom.svg.getBoundingClientRect();
    const at = elementsAt(core, e)[0] ?? null;
    const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      && !(at && (btn.contains(at) || o.inside.some((x) => !!x && x.contains(at))));
    if (moved && over) o.drop(core.toDiagram(e), e, false);
    else if (!moved) o.drop(canvasCenter(core), e, true);
    if (!moved || over) o.done?.();
  };
  btn.addEventListener('pointermove', (e) => {
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) moved = true;
    place(e);
  }, { signal: drag.signal });
  btn.addEventListener('pointerup', (e) => finish(e, false), { signal: drag.signal });
  btn.addEventListener('pointercancel', (e) => finish(e, true), { signal: drag.signal });
  o.signal?.addEventListener('abort', () => {
    drag.abort();
    gh.remove();
  });
}
