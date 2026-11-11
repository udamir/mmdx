// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEmoji } from '../../../src/emoji/data.js';
import { createEmojiPicker } from '../../../src/ui/blocks/emoji-picker.js';
import { createI18n } from '../../../src/i18n.js';

afterEach(() => document.body.replaceChildren());
const t = createI18n().t;
const DATA = parseEmoji({
  smileys: '😀|grinning face|happy smile;😂|face with tears of joy|funny',
  people: '~👋|waving hand|hello bye;🧑‍🤝‍🧑|people holding hands|couple',
  flags: '🏁|chequered flag|race',
});

describe('EmojiPicker', () => {
  it('groups as tabs; recents first when there are some; a click picks', () => {
    const onPick = vi.fn();
    const p = createEmojiPicker({ t, data: DATA, recent: ['😂'], onPick });
    document.body.append(p.el);
    expect(p.tab).toBe('recent');
    expect([...p.el.querySelectorAll('.ep-tabs [role=tab]')].map((b) => b.getAttribute('aria-label'))).toEqual(['Recent', 'Smileys & emotion', 'People & body', 'Flags']);
    expect([...p.el.querySelectorAll('.ep-e')].map((b) => b.textContent)).toEqual(['😂']);
    p.el.querySelectorAll<HTMLButtonElement>('.ep-tabs [role=tab]')[2]!.click();
    expect([...p.el.querySelectorAll('.ep-e')].map((b) => b.getAttribute('aria-label'))).toEqual(['waving hand', 'people holding hands']);
    p.el.querySelector<HTMLButtonElement>('.ep-e')!.click();
    expect(onPick).toHaveBeenCalledWith('👋');
  });

  it('search by name and keywords; skin tones apply where the emoji takes them', () => {
    const onPick = vi.fn();
    const onTone = vi.fn();
    const p = createEmojiPicker({ t, data: DATA, onPick, onTone });
    p.setQuery('hello');
    expect([...p.el.querySelectorAll('.ep-e')].map((b) => b.textContent)).toEqual(['👋']);
    const tone = p.el.querySelector<HTMLSelectElement>('.ep-tone')!;
    tone.value = '3';
    tone.dispatchEvent(new Event('change'));
    expect(onTone).toHaveBeenCalledWith(3);
    expect(p.el.querySelector('.ep-e')!.textContent).toBe('👋🏽');
    p.setQuery('hands');
    expect(p.el.querySelector('.ep-e')!.textContent).toBe('🧑‍🤝‍🧑');
    p.setQuery('xyz');
    expect(p.el.querySelector('.ep-none')!.textContent).toBe('No emoji match “xyz”');
  });

  it('arrow keys move through the grid; the search field leads into it', () => {
    const p = createEmojiPicker({ t, data: DATA, onPick: () => undefined });
    document.body.append(p.el);
    p.focus();
    p.el.querySelector('.ep-search')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    const tiles = [...p.el.querySelectorAll<HTMLElement>('.ep-e')];
    expect(document.activeElement).toBe(tiles[0]);
    tiles[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(tiles[1]);
  });
});

describe('emoji picker tabs follow the ARIA tab pattern (B28)', () => {
  it('one tab stop, arrows move and select', () => {
    const p = createEmojiPicker({ t, data: DATA, onPick: () => {} });
    document.body.append(p.el);
    const tabs = [...p.el.querySelectorAll<HTMLButtonElement>('.ep-tabs [role=tab]')];
    expect(tabs.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    tabs[0]!.focus();
    tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(p.tab).toBe(tabs[1]!.dataset['tab']);
    p.destroy();
  });
});
