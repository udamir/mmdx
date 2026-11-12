// Arrow-key movement in a grid of tiles (T05: the shape palette, the icon and emoji pickers): ←/→ move by one, ↑/↓
// by a row, Home / End to the first and last, Page Up / Down by a page of rows; Enter and Space choose (the tile's
// click). One tile is the tab stop (`tabindex=0`), the others -1, so the grid is one stop in the tab order. Works on
// indexes, so a virtualised grid (only the visible rows in the DOM) uses it as well: `focus(i)` brings a tile in.
import type { Owner } from '../../reactive/owner.js';

export interface GridKeysOptions {
  /** Number of tiles. */
  count(): number;
  /** Tiles per row. */
  cols(): number;
  /** Rows per page (Page Up / Down; default 4). */
  page?(): number;
  /** The index of a tile element (null: not a tile). */
  indexOf(el: Element): number | null;
  /** Moves the focus to tile `i` (scrolling it into view, rendering it first in a virtualised grid). */
  focus(i: number): void;
}

export interface GridKeysHandle {
  /** The tile that is the tab stop. */
  readonly active: number;
  /** Makes tile `i` the tab stop (without moving the focus). */
  setActive(i: number): void;
  destroy(): void;
}

/** Arrow keys over the tiles in `el`. */
export function gridKeys(el: HTMLElement, o: GridKeysOptions): GridKeysHandle {
  let active = 0;
  const onKey = (ev: KeyboardEvent): void => {
    const t = ev.target instanceof Element ? ev.target : null;
    const i = t ? o.indexOf(t) : null;
    if (i === null) return;
    const n = o.count(), cols = Math.max(1, o.cols()), rows = Math.max(1, o.page?.() ?? 4);
    let next = i;
    switch (ev.key) {
      case 'ArrowRight': next = i + 1; break;
      case 'ArrowLeft': next = i - 1; break;
      case 'ArrowDown': next = i + cols; break;
      case 'ArrowUp': next = i - cols; break;
      case 'Home': next = 0; break;
      case 'End': next = n - 1; break;
      case 'PageDown': next = i + cols * rows; break;
      case 'PageUp': next = i - cols * rows; break;
      default: return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    next = Math.max(0, Math.min(n - 1, next));
    if (next === i) return;
    active = next;
    o.focus(next);
  };
  const onFocus = (ev: FocusEvent): void => {
    const t = ev.target instanceof Element ? ev.target : null;
    const i = t ? o.indexOf(t) : null;
    if (i !== null) active = i;
  };
  el.addEventListener('keydown', onKey);
  el.addEventListener('focusin', onFocus);
  return {
    get active() {
      return active;
    },
    setActive(i) {
      active = Math.max(0, i);
    },
    destroy() {
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('focusin', onFocus);
    },
  };
}

export interface SearchIntoGridOptions {
  /** Number of results (tiles) shown. */
  count(): number;
  /** The search text (Enter takes the first result only while there is one). */
  query(): string;
  /** ↓: moves the focus to the first tile. */
  enter(): void;
  /** Enter: takes the first result. */
  pick(): void;
}

/** The search field over a grid of tiles (X16: the emoji, icon and shape pickers): ↓ goes into the grid at the first tile, Enter takes the first result of a search. The listener goes with `scope`. */
export function searchIntoGrid(scope: Owner, input: HTMLInputElement, o: SearchIntoGridOptions): void {
  scope.on(input, 'keydown', (ev: KeyboardEvent) => {
    if (ev.key === 'ArrowDown' && o.count()) {
      ev.preventDefault();
      o.enter();
    } else if (ev.key === 'Enter' && o.count() && o.query().trim()) {
      ev.preventDefault();
      o.pick();
    }
  });
}
