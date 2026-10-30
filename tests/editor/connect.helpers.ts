// Test helpers for the connect / sequence / shapes modules: mount an editor and drive gestures through
// core.startGesture + the returned Gesture (jsdom has no layout: the viewport maps client px 1:1 to diagram units).
import { DiagramEditor } from '../../src/editor/editor.js';
import type { EditorCore, Gesture } from '../../src/editor/core.js';
import type { EditorModule } from '../../src/editor/module.js';

export interface Pt {
  x: number;
  y: number;
}

export function mount(value: string, modules: readonly EditorModule[]): { ed: DiagramEditor; core: EditorCore; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, modules });
  ed.core.viewport.set({ k: 1, tx: 0, ty: 0 });
  ed.core.drawOverlay();
  return { ed, core: ed.core, host };
}

let clock = 1000;

/** A pointer event at a diagram point (client = diagram at k = 1). */
export function pev(type: string, p: Pt, opts: { altKey?: boolean; time?: number } = {}): PointerEvent {
  const ev = new MouseEvent(type, { clientX: p.x, clientY: p.y, button: 0, buttons: type === 'pointerup' ? 0 : 1, altKey: !!opts.altKey, bubbles: true }) as PointerEvent;
  clock += opts.time ?? 1000;
  Object.defineProperty(ev, 'timeStamp', { value: clock });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  return ev;
}

/** Presses on `target` at p (a handle or item element): the gesture the sources start, or null. */
export function press(core: EditorCore, target: Element, p: Pt, opts: { altKey?: boolean; time?: number } = {}): Gesture | null {
  const ev = pev('pointerdown', p, opts);
  return core.startGesture(ev, core.hitTest({ target, clientX: p.x, clientY: p.y }));
}

/** Full drag from `from` to `to` on `target` (moves in a few steps), then release. */
export function drag(core: EditorCore, target: Element, from: Pt, to: Pt, opts: { altKey?: boolean } = {}): Gesture {
  const g = press(core, target, from, opts);
  if (!g) throw new Error('no gesture started');
  core.dragging = true;
  for (const t of [0.25, 0.5, 0.75, 1]) {
    const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    g.move(p.x - from.x, p.y - from.y, pev('pointermove', p, opts));
  }
  core.dragging = false;
  g.end?.(pev('pointerup', to, opts));
  core.drawOverlay();
  return g;
}

/** A click (press + release without moving) on a handle. */
export function click(core: EditorCore, target: Element, p: Pt, opts: { time?: number } = {}): void {
  const g = press(core, target, p, opts);
  g?.cancel?.();
  g?.click?.(pev('pointerup', p));
  core.drawOverlay();
}

export const handle = (core: EditorCore, sel: string): Element => {
  const e = core.dom.overlay.querySelector(sel) ?? core.dom.body.querySelector(sel);
  if (!e) throw new Error(`no handle ${sel}`);
  return e;
};

export const lines = (core: EditorCore): string[] => core.code.split('\n').map((l) => l.trim()).filter(Boolean);
