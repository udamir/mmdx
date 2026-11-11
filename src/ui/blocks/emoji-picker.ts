// EmojiPicker (T05 §4.5): the emoji of the nine groups as tabs, a search over CLDR short names and keywords, the
// recently used emoji and a skin tone choice. The host loads the data (src/emoji/data.ts, a lazy chunk) and inserts
// the chosen emoji as plain text at the caret; the OS emoji font draws them.
import type { Emoji, EmojiSet } from '../../emoji/data.js';
import { searchEmoji, withTone } from '../../emoji/data.js';
import { h } from '../h.js';
import { registerMessages } from '../i18n.js';
import { BLOCK_MESSAGES_MEDIA } from '../messages/blocks-media.js';
import { Scope, type BlockHandle, type Translate } from './block.js';
import { gridKeys } from './grid-keys.js';
import { createTabs } from './tabs.js';
import { signal } from '../signal.js';

export interface EmojiPickerProps {
  t: Translate;
  data: EmojiSet;
  /** Recently used emoji (as inserted), newest first. */
  recent?: readonly string[];
  /** Skin tone 0 (default) – 5. */
  tone?: number;
  onTone?(tone: number): void;
  onPick(emoji: string): void;
}

export interface EmojiPickerHandle extends BlockHandle<EmojiPickerProps> {
  focus(): void;
  setQuery(q: string): void;
  /** The tab shown (`recent` or a group key). */
  readonly tab: string;
}

const COLS = 9;

export const EMOJI_PICKER_CSS = /* css */ `
.ep { width: 340px; max-width: calc(100vw - 24px); display: flex; flex-direction: column; gap: 6px; }
.ep-top { display: flex; gap: 6px; align-items: center; }
.ep-search { flex: 1; min-width: 0; }
.ep-tone { width: auto; }
.ep-tabs { display: flex; gap: 0; justify-content: space-between; border-bottom: 1px solid var(--mmdx-border); }
.ep-tabs .mmdx-tabs-spacer { display: none; }
.ep-tabs [role=tab] { border: 0; background: none; padding: 3px 4px; font-size: 17px; line-height: 1; border-radius: 6px 6px 0 0; filter: grayscale(.6); }
.ep-tabs [role=tab][aria-selected=true] { filter: none; box-shadow: inset 0 -2px 0 var(--mmdx-accent); }
.ep-head { font-size: 11px; font-weight: 600; color: var(--mmdx-muted); }
.ep-grid { display: grid; grid-template-columns: repeat(${COLS}, 34px); grid-auto-rows: 34px; height: 238px; overflow-y: auto; align-content: start; }
.ep-e { border: 0; background: none; padding: 0; font-size: 22px; line-height: 1; border-radius: 6px;
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif; }
.ep-e:hover { background: var(--mmdx-surface-2); }
.ep-info { min-height: 16px; font-size: 11px; color: var(--mmdx-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ep-none { color: var(--mmdx-muted); font-size: 12px; grid-column: 1 / -1; }
`;

export function createEmojiPicker(props: EmojiPickerProps): EmojiPickerHandle {
  registerMessages(BLOCK_MESSAGES_MEDIA);
  let p = { ...props };
  const scope = new Scope();
  let query = '';
  let tab = p.recent?.length ? 'recent' : p.data.groups[0]?.key ?? '';
  let tiles: HTMLElement[] = [];
  const el = h('div', { class: 'ep', role: 'dialog' });
  const input = h('input', { type: 'search', class: 'ep-search', autocomplete: 'off' });
  const tone = h('select', { class: 'ep-tone' });
  // the group tabs: the shared tab list (roving focus, arrow keys, B28); none is selected while a search shows
  const current = signal('');
  const tabs = createTabs<string>({ label: '', tabs: [], value: current, class: 'ep-tabs', onChange: (key) => {
    tab = key;
    query = input.value = '';
    render();
  } });
  const head = h('div', { class: 'ep-head' });
  const grid = h('div', { class: 'ep-grid', role: 'group' });
  const info = h('div', { class: 'ep-info', 'aria-live': 'polite' });
  el.append(h('div', { class: 'ep-top' }, input, tone), tabs.el, head, grid, info);
  const keys = gridKeys(grid, {
    count: () => tiles.length,
    cols: () => COLS,
    indexOf: (e) => {
      const i = tiles.indexOf(e as HTMLElement);
      return i < 0 ? null : i;
    },
    focus: (i) => {
      tiles.forEach((b, j) => b.setAttribute('tabindex', j === i ? '0' : '-1'));
      tiles[i]?.focus();
    },
  });

  const shown = (it: Emoji): string => withTone(it.e, p.tone ?? 0, it.tones);
  const byEmoji = (): Map<string, Emoji> => {
    const m = new Map<string, Emoji>();
    for (const g of p.data.groups) for (const it of g.items) m.set(it.e, it);
    return m;
  };

  const renderTabs = (): void => {
    const t = p.t;
    const list: [string, string, string][] = [];
    if (p.recent?.length) list.push(['recent', '🕘', t('emoji.recent')]);
    for (const g of p.data.groups) list.push([g.key, g.items[0]?.e ?? '?', t(`emoji.group.${g.key}`)]);
    tabs.update({ label: t('emoji.title'), tabs: list.map(([value, label, name]) => ({ value, label, title: name, name })) });
    current.set(query ? '' : tab);
  };

  const renderGrid = (): void => {
    const t = p.t;
    let items: { text: string; name: string }[];
    if (query.trim()) {
      head.textContent = '';
      items = searchEmoji(p.data, query).map((it) => ({ text: shown(it), name: it.name }));
    } else if (tab === 'recent') {
      head.textContent = t('emoji.recent');
      const all = byEmoji();
      items = (p.recent ?? []).map((e) => ({ text: e, name: all.get(e)?.name ?? e }));
    } else {
      const g = p.data.groups.find((x) => x.key === tab);
      head.textContent = g ? t(`emoji.group.${g.key}`) : '';
      items = (g?.items ?? []).map((it) => ({ text: shown(it), name: it.name }));
    }
    grid.setAttribute('aria-label', head.textContent || t('emoji.title'));
    tiles = items.map(({ text, name }, i) => {
      const b = h('button', { type: 'button', class: 'ep-e', title: name, 'aria-label': name, tabindex: i ? '-1' : '0' }, text);
      b.addEventListener('focus', () => (info.textContent = name));
      b.addEventListener('pointerenter', () => (info.textContent = name));
      b.addEventListener('click', () => p.onPick(text));
      return b;
    });
    grid.replaceChildren(...(tiles.length ? tiles : [h('div', { class: 'ep-none', role: 'status' }, query.trim() ? t('emoji.none', { q: query.trim() }) : '')]));
    grid.scrollTop = 0;
    keys.setActive(0);
  };

  const render = (): void => {
    const t = p.t;
    el.setAttribute('aria-label', t('emoji.title'));
    input.placeholder = t('emoji.searchPlaceholder');
    input.setAttribute('aria-label', t('emoji.search'));
    tone.setAttribute('aria-label', t('emoji.tone'));
    tone.replaceChildren(...[0, 1, 2, 3, 4, 5].map((n) => h('option', { value: String(n), title: t(`emoji.tone.${n}`) }, `${withTone('✋', n)} ${t(`emoji.tone.${n}`)}`)));
    tone.value = String(p.tone ?? 0);
    renderTabs();
    renderGrid();
  };

  scope.on(input, 'input', () => {
    query = input.value;
    renderTabs();
    renderGrid();
  });
  scope.on(input, 'keydown', (ev: KeyboardEvent) => {
    if (ev.key === 'ArrowDown' && tiles.length) {
      ev.preventDefault();
      tiles[0]!.focus();
    } else if (ev.key === 'Enter' && tiles.length && query.trim()) {
      ev.preventDefault();
      tiles[0]!.click();
    }
  });
  scope.on(tone, 'change', () => {
    p = { ...p, tone: Number(tone.value) || 0 };
    p.onTone?.(p.tone ?? 0);
    renderGrid();
  });
  render();

  return {
    el,
    get tab() {
      return tab;
    },
    focus: () => input.focus(),
    setQuery(q) {
      input.value = q;
      query = q;
      renderTabs();
      renderGrid();
    },
    update(next) {
      p = { ...p, ...next };
      render();
    },
    destroy() {
      tabs.destroy();
      keys.destroy();
      scope.dispose();
      el.remove();
    },
  };
}
