// Scene sources (component architecture §7.3): what the main canvas shows. The viewer's text scene, the editor's
// store scene and the diff scene each take the canvas area when attached and give it back when detached; only the
// attached scene paints. The kernel keeps them in a stack: History pushes a diff scene over the document's scene and
// pops it on Back.
import { DiagramCanvas, type CanvasOptions } from '../dom/canvas.js';
import type { Rect } from '../core/types.js';
import { signal, type Signal } from '../ui/signal.js';

/** The part of the shell scenes draw into: the main canvas, and room for more (side by side). */
export interface CanvasArea {
  /** The positioned element that holds the canvases. */
  readonly el: HTMLElement;
  readonly main: DiagramCanvas;
  /** Adds a canvas (e.g. the second pane of side by side) into `parent` (default: the area); removed by `release`. */
  createCanvas(parent: HTMLElement | null, opts?: Partial<CanvasOptions>): DiagramCanvas;
  /** Puts the main canvas back into the area (after a scene moved it into a pane). */
  restoreMain(): void;
}

export interface SceneSource {
  readonly id: string;
  /** Takes the canvas area; paints in full. */
  attach(area: CanvasArea): void;
  /** Gives the canvas area back; must stop painting. */
  detach(): void;
  /** Something it depends on changed (theme, display, kinds, document). Repaints only while attached. */
  invalidate(): void;
  /** The bounds of what it shows (zoom bar Fit, exports). */
  readonly bounds: Signal<Rect | null>;
  destroy?(): void;
}

/** A scene source base with the attach bookkeeping: subclasses implement `paint()`. */
export abstract class BaseScene implements SceneSource {
  abstract readonly id: string;
  readonly bounds: Signal<Rect | null> = signal<Rect | null>(null);
  protected area: CanvasArea | null = null;
  /** Something changed while detached: repaint in full on attach. */
  protected dirty = true;

  get attached(): boolean {
    return this.area !== null;
  }

  attach(area: CanvasArea): void {
    this.area = area;
    const stale = this.dirty;
    this.dirty = false;
    area.main.clear();
    this.paint(true, stale);
  }

  detach(): void {
    this.area = null;
  }

  invalidate(): void {
    if (!this.area) {
      this.dirty = true;
      return;
    }
    this.paint(false);
  }

  /**
   * Paints into `this.area` (`full`: the canvas was just taken over; `stale`: something it shows changed while it was
   * detached, so what it painted before must not be reused).
   */
  protected abstract paint(full: boolean, stale?: boolean): void;
}

/**
 * The scene stack and the canvas area it paints into: the main canvas, and the canvases a scene adds (side by side),
 * destroyed when that scene is popped. Only the top scene is attached.
 */
export class SceneStack {
  readonly area: CanvasArea;
  private readonly stack: SceneSource[] = [];
  private readonly extra = new Set<DiagramCanvas>();

  constructor(el: HTMLElement, readonly main: DiagramCanvas, canvasOptions: () => CanvasOptions, private readonly drew: () => void) {
    this.area = {
      el,
      main,
      createCanvas: (parent, opts = {}) => {
        const c = new DiagramCanvas(parent ?? el, { ...canvasOptions(), ...opts });
        this.extra.add(c);
        c.onDestroy(() => this.extra.delete(c));
        return c;
      },
      restoreMain: () => {
        if (main.svg.parentNode !== el) el.prepend(main.svg);
      },
    };
  }

  /** The attached scene (what the main canvas shows). */
  get top(): SceneSource | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  get scenes(): readonly SceneSource[] {
    return this.stack;
  }

  /** Makes `s` what the canvas shows; the scene underneath is detached (and repaints in full when it is back). */
  push(s: SceneSource): void {
    this.top?.detach();
    this.stack.push(s);
    s.attach(this.area);
    this.drew();
  }

  /** Gives the canvas back to the scene underneath (`reattach` false: the component is going away, nothing repaints). */
  pop(reattach = true): SceneSource | null {
    const s = this.stack.pop() ?? null;
    s?.detach();
    for (const c of [...this.extra]) c.destroy();
    if (!reattach) return s;
    this.area.restoreMain();
    this.top?.attach(this.area);
    this.drew();
    return s;
  }

  /** Something every scene depends on changed: the attached scene repaints, the others repaint when attached. */
  invalidate(): void {
    for (const s of this.stack) s.invalidate();
  }

  destroy(): void {
    for (const s of this.stack.splice(0).reverse()) {
      s.detach();
      s.destroy?.();
    }
    for (const c of [...this.extra]) c.destroy();
    this.main.destroy();
  }
}
