// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTileGallery, type Tile } from '../../../src/ui/blocks/tile-gallery.js';
import { h } from '../../../src/ui/kit/h.js';
import { signal } from '../../../src/reactive/signal.js';

const key = (el: Element, k: string): void => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true }));
const tile = (k: string, extra: Partial<Tile> = {}): Tile => ({ key: k, label: k.toUpperCase(), content: [h('span', { class: 'pic' }), h('span', null, k)], ...extra });

afterEach(() => document.body.replaceChildren());

describe('TileGallery', () => {
  it('a list of tile buttons; the selected one has aria-current; no interactive content inside a tile', () => {
    const selected = signal<string | null>('b');
    const onSelect = vi.fn((k: string) => selected.set(k));
    const g = createTileGallery({ label: 'Node styles', tiles: [tile('a'), tile('b', { onDelete: () => undefined }), tile('c')], selected, onSelect, deleteLabel: 'Delete this preset', add: { label: '+ Preset', onClick: () => undefined }, class: 'te-tiles', tileClass: 'te-tile', attrs: { 'data-kind': 'node' } });
    document.body.append(g.el);
    expect(g.el.getAttribute('role')).toBe('list');
    expect(g.el.getAttribute('aria-label')).toBe('Node styles');
    expect(g.el.dataset['kind']).toBe('node');
    const items = [...g.el.children];
    expect(items.map((i) => i.getAttribute('role'))).toEqual(['listitem', 'listitem', 'listitem', 'listitem']);
    const tiles = [...g.el.querySelectorAll<HTMLButtonElement>('.mmdx-tile')];
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual(['A', 'B', 'C', null]);
    expect(tiles.every((t) => !t.querySelector('button, input, select, a'))).toBe(true);
    expect(tiles[1]!.getAttribute('aria-current')).toBe('true');
    expect(tiles[1]!.classList.contains('on')).toBe(true);
    // the delete button sits beside the tile, out of the Tab order
    const del = items[1]!.querySelector<HTMLButtonElement>(':scope > .mmdx-tile-del')!;
    expect(del.getAttribute('aria-label')).toBe('Delete this preset (B)');
    expect(del.tabIndex).toBe(-1);
    expect(tiles[1]!.getAttribute('aria-keyshortcuts')).toBe('Delete');
    tiles[2]!.click();
    expect(onSelect).toHaveBeenCalledWith('c');
    expect(tiles[2]!.getAttribute('aria-current')).toBe('true');
    expect(tiles[1]!.hasAttribute('aria-current')).toBe(false);
    expect(tiles[3]!.classList.contains('mmdx-tile-add')).toBe(true);
  });

  it('arrow keys, Home and End move through the tiles with one tab stop (the selected tile); Delete deletes', () => {
    const onDelete = vi.fn();
    const g = createTileGallery({ label: 'T', tiles: [tile('a'), tile('b', { onDelete }), tile('c')], selected: 'b', onSelect: () => undefined });
    document.body.append(g.el);
    const tiles = [...g.el.querySelectorAll<HTMLButtonElement>('.mmdx-tile')];
    expect(tiles.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    tiles[1]!.focus();
    key(tiles[1]!, 'ArrowRight');
    expect(document.activeElement).toBe(tiles[2]);
    key(tiles[2]!, 'ArrowDown');
    expect(document.activeElement).toBe(tiles[0]); // wraps
    key(tiles[0]!, 'End');
    expect(document.activeElement).toBe(tiles[2]);
    expect(tiles.map((t) => t.tabIndex)).toEqual([-1, -1, 0]);
    key(tiles[2]!, 'Delete');
    expect(onDelete).not.toHaveBeenCalled(); // c has no delete
    key(tiles[1]!, 'Delete');
    expect(onDelete).toHaveBeenCalledOnce();
    g.el.querySelector<HTMLButtonElement>('.mmdx-tile-del')!.click();
    expect(onDelete).toHaveBeenCalledTimes(2);
  });

  it('read only: tiles can be selected, the delete buttons, Delete and the add tile are off', () => {
    const onDelete = vi.fn(), onSelect = vi.fn();
    const g = createTileGallery({ label: 'T', tiles: [tile('a', { onDelete })], onSelect, readOnly: true, add: { label: '+', onClick: () => undefined } });
    document.body.append(g.el);
    expect(g.el.querySelector<HTMLButtonElement>('.mmdx-tile-del')!.disabled).toBe(true);
    expect(g.el.querySelector<HTMLButtonElement>('.mmdx-tile-add')!.disabled).toBe(true);
    key(g.tile('a')!, 'Delete');
    expect(onDelete).not.toHaveBeenCalled();
    g.tile('a')!.click();
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('setTile redraws one tile in place (the focus stays); update() rebuilds and keeps the focus by key', () => {
    const g = createTileGallery({ label: 'T', tiles: [tile('a'), tile('b')], selected: 'a', onSelect: () => undefined });
    document.body.append(g.el);
    const b = g.tile('b')!;
    b.focus();
    expect(g.setTile(tile('b', { label: 'Bee', content: ['new'], attrs: { 'data-preset': 'b' }, onDelete: () => undefined }))).toBe(true);
    expect(g.tile('b')).toBe(b);
    expect(document.activeElement).toBe(b);
    expect(b.textContent).toBe('new');
    expect(b.getAttribute('aria-label')).toBe('Bee');
    expect(b.dataset['preset']).toBe('b');
    expect(b.parentElement!.querySelector('.mmdx-tile-del')).not.toBeNull();
    expect(g.setTile(tile('z'))).toBe(false);
    g.update({ tiles: [tile('b'), tile('c')] });
    expect(g.tile('b')).not.toBe(b);
    expect(document.activeElement).toBe(g.tile('b'));
    expect(g.tile('a')).toBeNull();
    const onSelect = vi.fn();
    g.update({ onSelect });
    const c = g.tile('c')!;
    g.destroy();
    c.click();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
