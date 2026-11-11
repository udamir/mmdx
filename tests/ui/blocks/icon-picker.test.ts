// @vitest-environment jsdom
// The icon picker with three mocked packs, one of them loaded on demand.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIconPicker, type IconPickerPack } from '../../../src/ui/blocks/icon-picker.js';
import { createI18n } from '../../../src/ui/i18n.js';

afterEach(() => document.body.replaceChildren());
const t = createI18n().t;

function packs(): { list: IconPickerPack[]; icons: Record<string, string[]>; load: (p: string) => Promise<void> } {
  const icons: Record<string, string[]> = {
    tabler: ['user', 'users', 'car', ...Array.from({ length: 300 }, (_, i) => `i${i}`)],
    logos: ['aws', 'azure'],
    azure: [],
  };
  const list: IconPickerPack[] = [
    { name: 'tabler', title: 'Tabler Icons', loaded: true, license: 'MIT', builtin: true },
    { name: 'logos', title: 'SVG Logos', loaded: true, license: 'CC0' },
    { name: 'azure', title: 'azure', loaded: false },
  ];
  const load = async (p: string): Promise<void> => {
    await Promise.resolve();
    icons[p] = ['computer-vision', 'storage'];
    list.find((x) => x.name === p)!.loaded = true;
  };
  return { list, icons, load };
}

const make = (o: Partial<Parameters<typeof createIconPicker>[0]> = {}) => {
  const P = packs();
  const find = (q: string, pack: string | null): string[] =>
    (pack ? [pack] : Object.keys(P.icons)).flatMap((p) => (P.icons[p] ?? []).map((n) => `${p}:${n}`)).filter((n) => !q || n.split(':')[1]!.includes(q));
  const onPick = vi.fn();
  const picker = createIconPicker({ t, packs: () => P.list, find, preview: () => 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E', onPick, ...o });
  document.body.append(picker.el);
  return { picker, onPick, P };
};
const tiles = (el: HTMLElement): string[] => [...el.querySelectorAll('.ip-rows .ip-tile')].map((b) => b.getAttribute('aria-label')!);

describe('IconPicker', () => {
  it('a dialog with a labelled search over the icons', () => {
    const { picker } = make();
    expect(picker.el.getAttribute('role')).toBe('dialog');
    expect(picker.el.getAttribute('aria-label')).toBe('Choose an icon…');
    expect(picker.el.querySelector<HTMLInputElement>('.ip-search')!.getAttribute('aria-label')).toBeTruthy();
  });

  it('virtualised: only the rows in view are tiles; search narrows; Enter picks the first', () => {
    const { picker, onPick } = make();
    expect(tiles(picker.el).length).toBeLessThanOrEqual(7 * 8);
    expect(tiles(picker.el)[0]).toBe('tabler:user');
    picker.setQuery('car');
    expect(tiles(picker.el)).toEqual(['tabler:car']);
    picker.el.querySelector<HTMLInputElement>('.ip-search')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onPick).toHaveBeenCalledWith('tabler:car');
    picker.setQuery('nothing');
    expect(picker.el.querySelector('.ip-none')!.textContent).toBe('No icons match “nothing”');
  });

  it('a tile names its icon and licence; arrows move through the grid', () => {
    const { picker } = make();
    const first = picker.el.querySelector<HTMLElement>('.ip-rows .ip-tile')!;
    expect(first.title).toBe('tabler:user · Licence: MIT');
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect((document.activeElement as HTMLElement).dataset['i']).toBe('7');
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }));
    expect((document.activeElement as HTMLElement).dataset['i']).toBe(String(7 + 7 * 6));
  });

  it('the current icon is marked', () => {
    const { picker } = make({ current: 'tabler:car' });
    expect(picker.el.querySelector('.ip-tile.on')!.getAttribute('aria-label')).toBe('tabler:car');
  });
});
