// What the theme editor's view modules share: the draft and the library, the editor's services (dialogs, popovers),
// its UI state (the selected tile, the tile zoom) and the scope of the current main column.
import type { CoreContext } from '../core/context.js';
import type { DiagramType } from '../core/types.js';
import type { Scope, Translate } from '../ui/blocks/block.js';
import type { Dialogs } from '../ui/dialog.js';
import type { PopoverManager } from '../ui/popover.js';
import type { ReadSignal, Signal } from '../reactive/signal.js';
import type { Draft } from './draft.js';
import type { ThemeLibrary } from './library.js';
import type { TileSel } from './types.js';

/** A tile gallery of the main column, redrawn as the draft changes. */
export interface GalleryRef {
  readonly el: HTMLElement;
  /** Redraws the tiles the touched paths (dotted) change; null: every tile. A hidden gallery waits for `wake`. */
  refresh(paths: ReadonlySet<string> | null): void;
  /** Shown again: catches up with what changed while it was hidden. */
  wake(): void;
}

export interface Env {
  readonly t: Translate;
  /** A translated key, or `fallback` when the catalog has none. */
  tf(key: string, fallback: string): string;
  readonly ctx: CoreContext;
  readonly shadow: ShadowRoot;
  readonly dlg: HTMLElement;
  readonly main: HTMLElement;
  readonly body: HTMLElement;
  readonly draft: Draft;
  readonly lib: ThemeLibrary;
  readonly dialogs: Dialogs;
  readonly pops: PopoverManager;
  readonly sel: ReadSignal<TileSel | null>;
  /** Tile zoom (the preview size of the item styles). */
  readonly zoom: Signal<number>;
  /** Shape tab per item kind (node, participant). */
  readonly tabShape: Record<string, string>;
  /** Cards that are open (kept across re-renders). */
  readonly openCards: Set<string>;
  /** The galleries of the current main column. */
  readonly galleries: Set<GalleryRef>;
  /** Released when the main column is rebuilt (observers, timers, blocks). */
  scope(): Scope;
  canEdit(): boolean;
  presentation(): 'inline' | 'dialog';
  selectTile(s: TileSel | null): void;
  showPreview(type: DiagramType): void;
  /** Unsaved-change marks, field errors and the read-only state of the elements under `root` (just built). */
  decorate(root: Element): void;
  /** Ends the undo step and brings tiles and the preview up to date now. */
  flush(): void;
  /** Redraws the properties of the selected tile. */
  renderProps(): void;
}
