// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShapePalette, matchesShape, type ShapePaletteItem } from '../../../src/ui/blocks/shape-palette.js';
import { createI18n } from '../../../src/ui/i18n.js';

afterEach(() => document.body.replaceChildren());

const t = createI18n().t;
const icon = (): SVGElement => document.createElementNS('http://www.w3.org/2000/svg', 'svg');
const item = (key: string, label: string, terms: string[] = []): ShapePaletteItem => ({ key, label, terms, icon, tip: `${label} · ${key}` });
const SECTIONS = [
  { title: 'Basic', items: [item('rect', 'Process', ['rectangle']), item('diamond', 'Decision', ['diam', 'question']), item('text', 'Text block')] },
  { title: 'Technical', items: [item('cylinder', 'Database', ['cyl', 'db']), item('datastore', 'Data store', ['data-store'])] },
];

describe('ShapePalette', () => {
  it('sections with headings, a recent row first, tooltips and accessible names', () => {
    const p = createShapePalette({ t, sections: SECTIONS, recent: ['cylinder', 'gone'] });
    document.body.append(p.el);
    expect([...p.el.querySelectorAll('.sp-head')].map((x) => x.textContent)).toEqual(['Recently used', 'Basic', 'Technical']);
    const first = p.el.querySelector<HTMLElement>('.sp-tile')!;
    expect(first.dataset['key']).toBe('cylinder');
    expect(first.getAttribute('aria-label')).toBe('Database');
    expect(first.title).toBe('Database · cylinder');
    expect(p.el.querySelector<HTMLInputElement>('.sp-search')!.getAttribute('aria-label')).toBe('Search shapes');
  });

  it('search over names and terms; an empty result says so; Enter picks the first', () => {
    expect(matchesShape(SECTIONS[1]!.items[0]!, 'db')).toBe(true);
    expect(matchesShape(SECTIONS[0]!.items[1]!, 'quest')).toBe(true);
    expect(matchesShape(SECTIONS[0]!.items[0]!, 'data')).toBe(false);
    const onPick = vi.fn();
    const p = createShapePalette({ t, sections: SECTIONS, onPick });
    p.setQuery('data');
    expect([...p.el.querySelectorAll('.sp-tile')].map((b) => (b as HTMLElement).dataset['key'])).toEqual(['cylinder', 'datastore']);
    expect(p.el.querySelector('.sp-head')!.textContent).toBe('Results');
    const input = p.el.querySelector<HTMLInputElement>('.sp-search')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onPick.mock.calls[0]![0].key).toBe('cylinder');
    p.setQuery('zzz');
    expect(p.el.querySelector('.sp-none')!.textContent).toBe('No shapes match “zzz”');
  });

  it('a pointer press is the host\'s; a keyboard click picks; arrows move by row in the grid', () => {
    const onPointerDown = vi.fn();
    const onPick = vi.fn();
    const p = createShapePalette({ t, sections: SECTIONS, cols: 2, onPointerDown, onPick, current: 'diamond' });
    document.body.append(p.el);
    const tiles = [...p.el.querySelectorAll<HTMLElement>('.sp-tile')];
    expect(tiles.map((b) => b.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1', '-1']);
    expect(tiles[1]!.getAttribute('aria-pressed')).toBe('true');
    tiles[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    tiles[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(onPick).not.toHaveBeenCalled();
    tiles[0]!.click(); // detail 0: a keyboard click
    expect(onPick).toHaveBeenCalledTimes(1);
    tiles[0]!.focus();
    tiles[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(tiles[2]);
    tiles[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(tiles[4]);
  });

  it('the list layout shows names; compact and no search for the toolbar', () => {
    const p = createShapePalette({ t, sections: [{ title: '', items: [item('note', 'Note — drop next to a participant')] }], layout: 'list', search: false, compact: true });
    expect(p.el.querySelector('.sp-row span')!.textContent).toBe('Note');
    expect(p.el.querySelector('.sp-search')).toBeNull();
    expect(p.el.querySelector('.sp-head')).toBeNull();
    expect(p.el.classList.contains('compact')).toBe(true);
    p.destroy();
    expect(p.el.isConnected).toBe(false);
  });
});
