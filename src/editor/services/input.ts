// The editor's input (A10c): one pointer loop for every gesture — a press hit-tests once and asks the gesture
// sources for a gesture, else pans; moves preview once per animation frame (P1); the release, a cancel, Esc and lost
// capture end it — and Space held to pan. What it tracks is read-only for the rest of the editor (`core.dragging`,
// `core.spaceDown`, `core.pointer`).
import type { Owner } from '../../reactive/owner.js';
import { isTextTarget } from '../../ui/kit/keys.js';

// a text field, a select or editable text takes the key (B31: Space in a <select> armed space-pan)
const isTyping = (ev: KeyboardEvent): boolean => isTextTarget(ev.composedPath()[0] ?? ev.target);

type Point = { x: number; y: number };

/** A gesture as the loop drives it (the editor's `Gesture`). */
interface InputGesture {
  move(dx: number, dy: number, ev: PointerEvent): void;
  end?(ev: PointerEvent): void;
  cancel?(): void;
  click?(ev: PointerEvent): void;
  threshold?: number;
}

/** What the loop needs from the editor core (structural: the service does not import the core). */
export interface InputHost<H extends { p: Point }> {
  readonly dom: { readonly root: HTMLElement; readonly svg: SVGSVGElement };
  readonly mode: { peek(): string };
  readonly tool: { peek(): string };
  readonly viewport: { startPan(ev: PointerEvent): void };
  hitTest(ev: PointerEvent): H;
  startGesture(ev: PointerEvent, hit: H): InputGesture | null;
  toDiagram(ev: { clientX: number; clientY: number }): Point;
  drawOverlay(): void;
}

export class InputService<H extends { p: Point } = { p: Point }> {
  /** A gesture moved past its threshold and runs. */
  dragging = false;
  /** Space is held: drag pans. */
  spaceDown = false;
  /** Last pointer position (client coordinates), for paste-at-pointer and menus. */
  pointer: { clientX: number; clientY: number } | null = null;
  private gesture: { g: InputGesture; x: number; y: number; p0: Point; moved: boolean; id: number; last: Point } | null = null;
  /** Applies a drag's move still waiting for its animation frame. */
  flushMove: () => void = () => {};
  /** Cancels the running gesture; true when there was one. */
  cancelGesture: () => boolean = () => false;

  constructor(private readonly core: InputHost<H>) {}

  /** A gesture is running (pressed, moved or not). */
  get active(): boolean {
    return !!this.gesture;
  }

  /** Listens to the canvas and the root (until `signal` aborts); `onIdle` runs when a gesture ends (a remote change waits for it). */
  wire(o: { signal: AbortSignal; owner: Owner; onIdle(): void }): void {
    const core = this.core;
    const svg = core.dom.svg;
    const sig = { signal: o.signal };
    svg.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 && ev.button !== 1) return;
      core.dom.root.focus({ preventScroll: true });
      const panning = core.mode.peek() !== 'edit' || core.tool.peek() === 'hand' || this.spaceDown || ev.button === 1;
      if (panning && !(ev.target as Element).closest('[data-handle]')) {
        ev.preventDefault();
        core.viewport.startPan(ev);
        return;
      }
      const hit = core.hitTest(ev);
      const g = core.startGesture(ev, hit);
      if (!g) {
        ev.preventDefault();
        core.viewport.startPan(ev);
        return;
      }
      ev.preventDefault();
      try {
        svg.setPointerCapture(ev.pointerId);
      } catch {
        // capture is best-effort
      }
      this.gesture = { g, x: ev.clientX, y: ev.clientY, p0: hit.p, moved: false, id: ev.pointerId, last: { x: ev.clientX, y: ev.clientY } };
    }, sig);
    // A drag previews once per animation frame (P1): each move renders the whole diagram, so the moves of one frame
    // are coalesced to the last one; the release applies it first, a cancel drops it. Gestures compute from the
    // pointer's offset since the press, never from the frame they are drawn in.
    let frame = 0;
    let pendingMove: { dx: number; dy: number; ev: PointerEvent } | null = null;
    const flushMove = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      const m = pendingMove;
      pendingMove = null;
      if (m && this.gesture) this.gesture.g.move(m.dx, m.dy, m.ev);
    };
    const dropMove = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pendingMove = null;
    };
    o.owner.add(dropMove);
    this.flushMove = flushMove;
    svg.addEventListener('pointermove', (ev) => {
      this.pointer = { clientX: ev.clientX, clientY: ev.clientY };
      const d = this.gesture;
      if (!d || d.id !== ev.pointerId) return;
      if (!d.moved && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < (d.g.threshold ?? 3)) return;
      if (!d.moved) {
        d.moved = true;
        this.dragging = true;
        core.dom.root.classList.add('dragging');
      }
      d.last = { x: ev.clientX, y: ev.clientY };
      const p = core.toDiagram(ev);
      pendingMove = { dx: p.x - d.p0.x, dy: p.y - d.p0.y, ev };
      if (!frame) frame = requestAnimationFrame(flushMove);
    }, sig);
    // Whether each of the last two presses dragged: the browser counts a drag towards a double-click too (a quick press
    // and a drag, or two quick drags), and that double-click must not edit the text or enter the group of what moved.
    let dragged: [boolean, boolean] = [false, false];
    const finish = (ev: PointerEvent, cancelled: boolean): void => {
      const d = this.gesture;
      if (!d || d.id !== ev.pointerId) return;
      if (cancelled) dropMove();
      else flushMove();
      this.gesture = null;
      this.dragging = false;
      core.dom.root.classList.remove('dragging');
      dragged = [dragged[1], d.moved];
      if (cancelled) d.g.cancel?.();
      else if (d.moved) {
        // a quick release can come before the pointer's last move was delivered: the item ends where it was let go
        if (ev.clientX !== d.last.x || ev.clientY !== d.last.y) {
          const p = core.toDiagram(ev);
          d.g.move(p.x - d.p0.x, p.y - d.p0.y, ev);
        }
        d.g.end?.(ev);
      } else {
        d.g.cancel?.();
        d.g.click?.(ev);
      }
      core.drawOverlay();
      o.onIdle();
    };
    /** Cancels the running gesture (Esc, undo, a load, a stage or mode switch); true when there was one. */
    const cancel = (): boolean => {
      const d = this.gesture;
      if (!d) return false;
      dropMove();
      this.gesture = null;
      this.dragging = false;
      core.dom.root.classList.remove('dragging');
      d.g.cancel?.();
      core.drawOverlay();
      return true;
    };
    this.cancelGesture = cancel;
    o.owner.add(() => (this.cancelGesture = () => false));
    svg.addEventListener('pointerup', (ev) => finish(ev, false), sig);
    svg.addEventListener('pointercancel', (ev) => finish(ev, true), sig);
    svg.addEventListener('lostpointercapture', (ev) => {
      if (this.gesture?.id === ev.pointerId && this.gesture.moved) finish(ev, true);
    }, sig);
    svg.addEventListener('dblclick', (ev) => {
      if (!dragged[0] && !dragged[1]) return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
    }, { capture: true, signal: o.signal });
    // Esc during a gesture cancels it (one level of the Esc chain, A.11)
    core.dom.root.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !cancel()) return;
      o.onIdle();
      ev.stopPropagation();
      ev.preventDefault();
    }, { capture: true, signal: o.signal });
    // Space held: a drag pans
    const root = core.dom.root;
    root.addEventListener('keydown', (ev) => {
      if (ev.key === ' ' && !ev.repeat && core.mode.peek() === 'edit' && !isTyping(ev)) {
        this.spaceDown = true;
        root.classList.add('space-pan');
      }
    }, sig);
    root.addEventListener('keyup', (ev) => {
      if (ev.key === ' ') {
        this.spaceDown = false;
        root.classList.remove('space-pan');
      }
    }, sig);
    root.addEventListener('focusout', () => {
      this.spaceDown = false;
      root.classList.remove('space-pan');
    }, sig);
  }
}
