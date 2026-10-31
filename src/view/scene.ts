// Scene sources (component architecture §7.3): what the main canvas shows. The viewer's text scene, the editor's
// store scene and the diff scene each take the canvas area when attached and give it back when detached; only the
// attached scene paints. The kernel keeps them in a stack: History pushes a diff scene over the document's scene and
// pops it on Back.
import type { CanvasOptions, DiagramCanvas } from '../dom/canvas.js';
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
    this.dirty = false;
    area.main.clear();
    this.paint(true);
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

  /** Paints into `this.area` (`full`: the canvas was just taken over). */
  protected abstract paint(full: boolean): void;
}
