// TileGallery (§5.2): a wrapping gallery of picture tiles (styles, presets) — a list (`role=list`) whose items are a
// tile button, with an optional delete button beside it (never inside it) and a last "add" tile. The selected tile has
// `aria-current`; arrow keys, Home and End move through the tiles with one tab stop (the selected tile), Delete on a
// tile deletes it. One tile can be redrawn in place (`setTile`), keeping the focus on it.
import { h } from '../kit/h.js';
import { defineBlock, read, type BlockHandle, type Scope, type Value } from './block.js';
import { keepFocus, rovingKeys } from '../kit/focus.js';

export interface Tile {
  key: string;
  /** Accessible name of the tile. */
  label: string;
  /** What the tile shows (phrasing content: the tile is a button). */
  content: readonly (Node | string)[];
  class?: string;
  /** Extra attributes of the tile button (`data-*` keys the host finds it by). */
  attrs?: Record<string, string>;
  /** Shows a delete button beside the tile; the Delete key on the tile does the same. */
  onDelete?: () => void;
  /** Accessible name of the delete button (default: the gallery's `deleteLabel` and the tile's label). */
  deleteLabel?: string;
}

export interface TileGalleryProps {
  label: string;
  tiles: readonly Tile[];
  /** Key of the selected tile. */
  selected?: Value<string | null>;
  onSelect: (key: string) => void;
  /** The last tile, which adds one. */
  add?: { label: string; title?: string; onClick(): void } | null;
  /** Read only: tiles can be selected, nothing can be added or deleted. */
  readOnly?: boolean;
  /** Tooltip of the delete buttons, and the start of their accessible name. */
  deleteLabel?: string;
  class?: string;
  tileClass?: string;
  deleteClass?: string;
  addClass?: string;
  /** Extra attributes of the list (e.g. `data-kind`). */
  attrs?: Record<string, string>;
}

export interface TileGalleryHandle extends BlockHandle<TileGalleryProps> {
  /** Replaces one tile (matched by key) in place: the button stays, so does the focus. False when there is no such tile. */
  setTile(tile: Tile): boolean;
  /** The tile button of `key`. */
  tile(key: string): HTMLButtonElement | null;
}

export const TILE_GALLERY_CSS = /* css */ `
.mmdx-tiles { list-style: none; margin: 0; padding: 0; }
.mmdx-tile-item { position: relative; display: flex; min-width: 0; }
.mmdx-tile-item > .mmdx-tile { flex: 1; min-width: 0; }
.mmdx-tile-del { position: absolute; top: -7px; right: -7px; display: none; }
.mmdx-tile-item:hover > .mmdx-tile-del, .mmdx-tile-item:focus-within > .mmdx-tile-del { display: grid; }
`;

export function createTileGallery(props: TileGalleryProps): TileGalleryHandle {
  return defineBlock(props, (p, scope) => {
    const el = h('div', { role: 'list' });
    const items = new Map<string, { item: HTMLElement; button: HTMLButtonElement; tile: Tile }>();
    /** The current render's listeners (a re-filled tile's delete button joins them). */
    let fx: Scope;
    const selectedKey = (): string | null => (p.selected === undefined ? null : typeof p.selected === 'function' ? p.selected.peek() : p.selected);
    const keys = rovingKeys(el, {
      orientation: 'both', selector: '.mmdx-tile', roving: true,
      current: (list) => list.find((b) => b.dataset['tile'] === selectedKey()),
    });
    scope.add(() => keys.destroy());
    scope.on(el, 'keydown', (ev: KeyboardEvent) => {
      if ((ev.key !== 'Delete' && ev.key !== 'Backspace') || ev.altKey || ev.metaKey || ev.ctrlKey || p.readOnly) return;
      const b = (ev.composedPath()[0] ?? ev.target) as HTMLElement;
      const entry = items.get(b.dataset['tile'] ?? '');
      if (!entry || entry.button !== b || !entry.tile.onDelete) return;
      ev.preventDefault();
      entry.tile.onDelete();
    });

    const fill = (entry: { item: HTMLElement; button: HTMLButtonElement; tile: Tile }): void => {
      const { tile, button, item } = entry;
      for (const a of [...button.attributes]) if (!['type', 'tabindex', 'data-f', 'data-tile', 'aria-current'].includes(a.name)) button.removeAttribute(a.name);
      button.className = ['mmdx-tile', p.tileClass, tile.class].filter(Boolean).join(' ');
      button.setAttribute('aria-label', tile.label);
      for (const [k, v] of Object.entries(tile.attrs ?? {})) button.setAttribute(k, v);
      button.replaceChildren(...tile.content);
      item.querySelector(':scope > .mmdx-tile-del')?.remove();
      if (tile.onDelete) {
        const label = tile.deleteLabel ?? `${p.deleteLabel ?? 'Delete'} (${tile.label})`;
        const del = h('button', { type: 'button', class: ['mmdx-tile-del', p.deleteClass].filter(Boolean).join(' '), tabindex: '-1', title: p.deleteLabel ?? label, 'aria-label': label }, '×');
        del.disabled = !!p.readOnly;
        const run = tile.onDelete;
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          run();
        }, { signal: fx.signal });
        button.setAttribute('aria-keyshortcuts', 'Delete');
        item.append(del);
      }
    };

    const render = (): void => keepFocus(el, () => {
      fx = scope.renew();
      items.clear();
      el.className = ['mmdx-tiles', p.class].filter(Boolean).join(' ');
      el.setAttribute('aria-label', p.label);
      for (const [k, v] of Object.entries(p.attrs ?? {})) el.setAttribute(k, v);
      const children = p.tiles.map((tile) => {
        const button = h('button', { type: 'button', 'data-f': `tile-${tile.key}`, 'data-tile': tile.key });
        button.addEventListener('click', () => p.onSelect(tile.key), { signal: fx.signal });
        const item = h('div', { class: 'mmdx-tile-item', role: 'listitem' }, button);
        const entry = { item, button, tile };
        items.set(tile.key, entry);
        fill(entry);
        return item;
      });
      if (p.add) {
        const add = p.add;
        const b = h('button', { type: 'button', class: ['mmdx-tile', 'mmdx-tile-add', p.tileClass, p.addClass].filter(Boolean).join(' '), title: add.title ?? '', 'data-f': 'tile-add' }, add.label);
        b.disabled = !!p.readOnly;
        b.addEventListener('click', () => add.onClick(), { signal: fx.signal });
        children.push(h('div', { class: 'mmdx-tile-item', role: 'listitem' }, b));
      }
      el.replaceChildren(...children);
      const selected = p.selected;
      fx.effect(() => {
        const key = selected === undefined ? null : read(selected);
        for (const [k, { button }] of items) {
          const on = k === key;
          button.classList.toggle('on', on);
          if (on) button.setAttribute('aria-current', 'true');
          else button.removeAttribute('aria-current');
        }
      });
    });
    return {
      el,
      setTile(tile) {
        const entry = items.get(tile.key);
        if (!entry) return false;
        entry.tile = tile;
        fill(entry);
        entry.button.classList.toggle('on', entry.button.hasAttribute('aria-current'));
        return true;
      },
      tile: (key) => items.get(key)?.button ?? null,
      render: () => {
        render();
        keys.sync();
      },
    };
  });
}
