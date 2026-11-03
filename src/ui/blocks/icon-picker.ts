// IconPicker (T05 §4.3): "Choose an icon…" — a search over the registered icon packs, a chip per pack (a pack that is
// registered but not loaded yet loads when its chip is chosen), the recently used icons, and a virtualised grid of
// 48 px tiles (a pack can hold thousands of icons: only the rows in view are in the DOM), with the icon's name and its
// pack's licence shown on hover and focus. The host supplies the packs, the search and the previews (the editor: the
// icon registry, `searchIcons`, `iconImage`), so the block knows nothing about registries.
import { h } from '../h.js';
import { registerMessages } from '../i18n.js';
import { BLOCK_MESSAGES_MEDIA } from '../messages/blocks-media.js';
import { Scope, type BlockHandle, type Translate } from './block.js';
import { gridKeys } from './grid-keys.js';

export interface IconPickerPack {
  name: string;
  /** The chip's text (the pack's own name, else its prefix). */
  title: string;
  loaded: boolean;
  /** The last load failed. */
  failed?: boolean;
  license?: string;
  /** The built-in set (the empty-state hint shows while it is the only pack). */
  builtin?: boolean;
}

export interface IconPickerProps {
  t: Translate;
  /** The heading (default "Choose an icon…"). */
  title?: string;
  packs(): readonly IconPickerPack[];
  /** Icons (`pack:name`) matching `query` in `pack` (null: every loaded pack); an empty query lists the icons. */
  find(query: string, pack: string | null): readonly string[];
  /** The URL of an icon's preview image. */
  preview(name: string): string;
  /** Loads a pack (its chip was chosen); the host calls `refresh()` when it is in. */
  load(pack: string): Promise<void>;
  /** Recently used icons, newest first. */
  recent?: readonly string[];
  /** The icon the selection has (marked). */
  current?: string | null;
  onPick(name: string): void;
  /** A pointer press on a tile (insert mode: the host starts a drag, or adds it on release). */
  onPointerDown?(name: string, ev: PointerEvent, el: HTMLElement): void;
  /** Shows "Remove icon" (selection mode with an icon). */
  onRemove?: (() => void) | null;
  /** The "Icons" docs page, linked from the hint shown while only the built-in set is registered. */
  docsUrl?: string | null;
}

export interface IconPickerHandle extends BlockHandle<IconPickerProps> {
  /** Re-reads the packs and the results (a pack finished loading). */
  refresh(): void;
  focus(): void;
  setQuery(q: string): void;
}

/** Tile pitch of the grid (48 px tiles). */
export const ICON_TILE = 48;
const ROWS = 6;

export const ICON_PICKER_CSS = /* css */ `
.ip { width: 368px; max-width: calc(100vw - 24px); display: flex; flex-direction: column; gap: 6px; }
.ip-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ip-title { font-weight: 600; font-size: 13px; }
.ip-search { width: 100%; }
.ip-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.ip-chip { border-radius: 999px; padding: 2px 10px; font-size: 12px; }
.ip-chip[aria-pressed=true] { background: var(--mmdx-accent-2); color: var(--mmdx-accent); border-color: transparent; }
.ip-chip.unloaded { border-style: dashed; }
.ip-chip.failed { color: var(--mmdx-danger); }
.ip-sub { font-size: 11px; font-weight: 600; color: var(--mmdx-muted); margin-top: 2px; }
.ip-row { display: flex; gap: 0; overflow: hidden; }
.ip-scroll { position: relative; height: ${ICON_TILE * ROWS}px; overflow-y: auto; overflow-x: hidden; }
.ip-space { position: relative; }
.ip-rows { position: absolute; left: 0; right: 0; top: 0; display: grid; grid-template-columns: repeat(var(--ip-cols, 7), ${ICON_TILE}px); grid-auto-rows: ${ICON_TILE}px; }
.ip-tile { width: ${ICON_TILE}px; height: ${ICON_TILE}px; padding: 0; border: 1px solid transparent; background: none; border-radius: 8px; display: grid; place-items: center; }
.ip-tile img { width: 28px; height: 28px; pointer-events: none; }
.ip-tile:hover { background: var(--mmdx-surface-2); }
.ip-tile.on { background: var(--mmdx-accent-2); }
.ip-info { min-height: 16px; font-size: 11px; color: var(--mmdx-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ip-none, .ip-hint { color: var(--mmdx-muted); font-size: 12px; padding: 6px 2px; }
.ip-hint a { color: var(--mmdx-accent); }
.ip-foot { display: flex; justify-content: flex-end; }
`;

export function createIconPicker(props: IconPickerProps): IconPickerHandle {
  registerMessages(BLOCK_MESSAGES_MEDIA);
  let p = { ...props };
  const scope = new Scope();
  let rowScope = new Scope();
  let query = '';
  let pack: string | null = null;
  let list: readonly string[] = [];
  let first = 0;
  let shown = new Map<number, HTMLElement>();
  const loading = new Set<string>();

  const el = h('div', { class: 'ip', role: 'dialog' });
  const title = h('div', { class: 'ip-title' });
  const input = h('input', { type: 'search', class: 'ip-search', autocomplete: 'off' });
  const chips = h('div', { class: 'ip-chips', role: 'group' });
  const recentHead = h('div', { class: 'ip-sub' });
  const recentRow = h('div', { class: 'ip-row', role: 'group' });
  const rows = h('div', { class: 'ip-rows', role: 'group' });
  const space = h('div', { class: 'ip-space' }, rows);
  const scroller = h('div', { class: 'ip-scroll' }, space);
  const none = h('div', { class: 'ip-none', role: 'status' });
  const hint = h('div', { class: 'ip-hint' });
  const info = h('div', { class: 'ip-info', 'aria-live': 'polite' });
  const foot = h('div', { class: 'ip-foot' });
  el.append(h('div', { class: 'ip-head' }, title), input, chips, hint, recentHead, recentRow, scroller, none, info, foot);

  const cols = (): number => Math.max(1, Math.floor((scroller.clientWidth || ICON_TILE * 7) / ICON_TILE));
  const visibleRows = (): number => Math.ceil((scroller.clientHeight || ICON_TILE * ROWS) / ICON_TILE) + 2;
  const packOf = (name: string): IconPickerPack | undefined => p.packs().find((x) => x.name === name.slice(0, name.indexOf(':')));
  const describe = (name: string): string => {
    const lic = packOf(name)?.license;
    return lic ? `${name} · ${p.t('icons.license', { license: lic })}` : name;
  };

  const tile = (name: string, i: number | null): HTMLElement => {
    const on = p.current === name;
    const b = h('button', { type: 'button', class: 'ip-tile' + (on ? ' on' : ''), 'aria-label': name, title: describe(name), 'aria-pressed': String(on), tabindex: '-1', ...(i !== null ? { 'data-i': String(i) } : {}) },
      h('img', { src: p.preview(name), alt: '', width: 28, height: 28, draggable: false }));
    b.addEventListener('focus', () => (info.textContent = describe(name)));
    b.addEventListener('pointerenter', () => (info.textContent = describe(name)));
    if (p.onPointerDown) b.addEventListener('pointerdown', (ev) => p.onPointerDown?.(name, ev, b));
    b.addEventListener('click', (ev) => {
      if (!p.onPointerDown || ev.detail === 0) p.onPick(name);
    });
    return b;
  };

  // ---- the virtualised grid: only the rows in view (plus one above and below) are in the DOM
  const keys = gridKeys(rows, {
    count: () => list.length,
    cols,
    page: () => ROWS,
    indexOf: (e) => {
      const i = Number((e as HTMLElement).dataset?.['i']);
      return Number.isInteger(i) && e.parentElement === rows ? i : null;
    },
    focus: (i) => {
      const c = cols(), row = Math.floor(i / c);
      const top = row * ICON_TILE, bottom = top + ICON_TILE;
      if (top < scroller.scrollTop) scroller.scrollTop = top;
      else if (bottom > scroller.scrollTop + (scroller.clientHeight || ICON_TILE * ROWS)) scroller.scrollTop = bottom - (scroller.clientHeight || ICON_TILE * ROWS);
      drawRows(true);
      shown.get(i)?.focus();
    },
  });
  const drawRows = (force = false): void => {
    const c = cols();
    rows.style.setProperty('--ip-cols', String(c));
    const total = Math.ceil(list.length / c);
    space.style.height = `${total * ICON_TILE}px`;
    const from = Math.max(0, Math.floor(scroller.scrollTop / ICON_TILE) - 1);
    if (!force && from === first && shown.size) return;
    first = from;
    const to = Math.min(total, from + visibleRows());
    rowScope.dispose();
    rowScope = new Scope();
    const next = new Map<number, HTMLElement>();
    const els: HTMLElement[] = [];
    for (let i = from * c; i < Math.min(list.length, to * c); i++) {
      const b = tile(list[i]!, i);
      next.set(i, b);
      els.push(b);
    }
    shown = next;
    rows.style.transform = `translateY(${from * ICON_TILE}px)`;
    // keep the focus on the same icon across a redraw
    const focused = rows.contains(document.activeElement) || (rows.getRootNode() as ShadowRoot | Document).activeElement?.parentElement === rows;
    rows.replaceChildren(...els);
    const stop = shown.get(keys.active) ?? els[0];
    stop?.setAttribute('tabindex', '0');
    if (focused) stop?.focus({ preventScroll: true });
  };
  scope.on(scroller, 'scroll', () => drawRows());

  const renderChips = (): void => {
    const t = p.t;
    const packs = p.packs();
    const chip = (name: string | null, text: string, x?: IconPickerPack): HTMLElement => {
      const b = h('button', {
        type: 'button', class: 'ip-chip' + (x && !x.loaded ? ' unloaded' : '') + (x?.failed ? ' failed' : ''), 'aria-pressed': String(pack === name),
        title: x?.failed ? t('icons.failed', { pack: text }) : x && !x.loaded ? t('icons.load', { pack: text }) : x?.license ? t('icons.license', { license: x.license }) : text,
      }, loading.has(name ?? '') ? t('icons.loading', { pack: text }) : text);
      b.addEventListener('click', () => {
        pack = name;
        if (x && !x.loaded && name && !loading.has(name)) {
          loading.add(name);
          void p.load(name).finally(() => {
            loading.delete(name);
            refresh();
          });
        }
        refresh();
      });
      return b;
    };
    chips.setAttribute('aria-label', t('icons.packs'));
    chips.replaceChildren(chip(null, t('icons.all')), ...packs.map((x) => chip(x.name, x.title, x)));
    const others = packs.filter((x) => !x.builtin).map((x) => x.title);
    input.placeholder = others.length ? t('icons.searchPacks', { packs: others.slice(0, 3).join(', ') }) : t('icons.searchPlaceholder');
    hint.hidden = !!others.length;
    hint.replaceChildren(t('icons.hint'), ...(p.docsUrl ? [' ', h('a', { href: p.docsUrl, target: '_blank', rel: 'noopener noreferrer' }, t('icons.docs'))] : []));
  };

  const renderRecent = (): void => {
    const recent = !query.trim() && !pack ? (p.recent ?? []).slice(0, 7) : [];
    recentHead.hidden = recentRow.hidden = !recent.length;
    recentHead.textContent = p.t('icons.recent');
    recentRow.setAttribute('aria-label', p.t('icons.recent'));
    recentRow.replaceChildren(...recent.map((n) => tile(n, null)));
    const firstTile = recentRow.firstElementChild;
    firstTile?.setAttribute('tabindex', '0');
  };

  function refresh(): void {
    const t = p.t;
    title.textContent = p.title ?? t('icons.title');
    el.setAttribute('aria-label', p.title ?? t('icons.title'));
    input.setAttribute('aria-label', t('icons.search'));
    rows.setAttribute('aria-label', t('icons.grid'));
    if (pack && !p.packs().some((x) => x.name === pack)) pack = null;
    renderChips();
    renderRecent();
    list = p.find(query.trim(), pack);
    const cur = p.current ? list.indexOf(p.current) : -1;
    keys.setActive(cur >= 0 ? cur : 0);
    const loadingPack = pack && loading.has(pack);
    none.hidden = list.length > 0;
    none.textContent = loadingPack ? t('icons.loading', { pack: packOf(`${pack}:`)?.title ?? pack ?? '' }) : query.trim() ? t('icons.none', { q: query.trim() }) : t('icons.empty');
    drawRows(true);
    foot.replaceChildren();
    if (p.onRemove) {
      const rm = h('button', { type: 'button', class: 'danger' }, t('icons.remove'));
      rm.addEventListener('click', () => p.onRemove?.());
      foot.append(rm);
    }
    foot.hidden = !p.onRemove;
  }

  input.addEventListener('input', () => {
    query = input.value;
    scroller.scrollTop = 0;
    refresh();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' && list.length) {
      ev.preventDefault();
      keys.setActive(0);
      drawRows(true);
      shown.get(0)?.focus();
    } else if (ev.key === 'Enter' && list.length && query.trim()) {
      ev.preventDefault();
      p.onPick(list[0]!);
    }
  });
  // ←/→ along the recent row
  scope.on(recentRow, 'keydown', (ev: KeyboardEvent) => {
    const items = [...recentRow.children] as HTMLElement[];
    const i = items.indexOf(ev.target as HTMLElement);
    if (i < 0 || (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft')) return;
    ev.preventDefault();
    items[Math.max(0, Math.min(items.length - 1, i + (ev.key === 'ArrowRight' ? 1 : -1)))]?.focus();
  });
  refresh();

  return {
    el,
    refresh,
    focus: () => input.focus(),
    setQuery(q) {
      input.value = q;
      query = q;
      refresh();
    },
    update(next) {
      p = { ...p, ...next };
      refresh();
    },
    destroy() {
      keys.destroy();
      rowScope.dispose();
      scope.dispose();
      el.remove();
    },
  };
}
