// IconPicker (T05 §4.3; the image tool's Icon tab): a search over the registered icon packs above a virtualised grid
// of tiles (a pack can hold thousands of icons: only the rows in view are in the DOM), each tile naming its icon and
// its pack's licence. The host supplies the packs, the search and the previews (the editor: the icon registry,
// `searchIcons`, `iconImage`), so the block knows nothing about registries.
import { h } from '../kit/h.js';
import { registerMessages } from '../../i18n.js';
import { BLOCK_MESSAGES_MEDIA } from '../messages/blocks-media.js';
import { Scope, type BlockHandle, type Translate } from './block.js';
import { gridKeys } from '../kit/grid-keys.js';
import { createOverlayScroll, OVERLAY_SCROLL_CSS } from '../kit/overlay-scroll.js';

export interface IconPickerPack {
  name: string;
  /** The pack's own name, else its prefix. */
  title: string;
  loaded: boolean;
  /** The last load failed. */
  failed?: boolean;
  license?: string;
  /** The built-in set. */
  builtin?: boolean;
}

export interface IconPickerProps {
  t: Translate;
  packs(): readonly IconPickerPack[];
  /** Icons (`pack:name`) matching `query` in every loaded pack; an empty query lists the icons. */
  find(query: string, pack: string | null): readonly string[];
  /** The URL of an icon's preview image. */
  preview(name: string): string;
  /** The icon the selection has (marked). */
  current?: string | null;
  onPick(name: string): void;
  /** A pointer press on a tile (insert mode: the host starts a drag, or adds it on release). */
  onPointerDown?(name: string, ev: PointerEvent, el: HTMLElement): void;
}

export interface IconPickerHandle extends BlockHandle<IconPickerProps> {
  /** Re-reads the packs and the results (a pack finished loading). */
  refresh(): void;
  focus(): void;
  setQuery(q: string): void;
}

/** A tile's side. */
const ICON_TILE = 32;
const ROWS = 6;

export const ICON_PICKER_CSS = /* css */ `${OVERLAY_SCROLL_CSS}
.ip { position: relative; width: 368px; max-width: calc(100vw - 24px); display: flex; flex-direction: column; gap: 6px; }
.ip-search { width: 100%; }
.ip-scroll { position: relative; height: ${ICON_TILE * ROWS}px; overflow-y: auto; overflow-x: hidden; }
.ip-space { position: relative; }
.ip-rows { position: absolute; left: 0; right: 0; top: 0; display: grid; grid-template-columns: repeat(var(--ip-cols, 7), minmax(0, 1fr)); grid-auto-rows: ${ICON_TILE}px; }
.ip-tile { width: 100%; height: ${ICON_TILE}px; padding: 0; border: 1px solid transparent; background: none; border-radius: 6px; display: grid; place-items: center; }
.ip-tile img { width: 20px; height: 20px; pointer-events: none; }
.ip-tile:hover { background: var(--mmdx-surface-2); }
.ip-tile.on { background: var(--mmdx-accent-2); }
.ip-none { color: var(--mmdx-muted); font-size: 12px; padding: 6px 2px; }
`;

export function createIconPicker(props: IconPickerProps): IconPickerHandle {
  registerMessages(BLOCK_MESSAGES_MEDIA);
  let p = { ...props };
  const scope = new Scope();
  let query = '';
  let list: readonly string[] = [];
  let first = 0;
  let shown = new Map<number, HTMLElement>();

  const el = h('div', { class: 'ip', role: 'dialog' });
  const input = h('input', { type: 'search', class: 'ip-search', autocomplete: 'off' });
  const rows = h('div', { class: 'ip-rows', role: 'group' });
  const space = h('div', { class: 'ip-space' }, rows);
  const scroller = h('div', { class: 'ip-scroll' }, space);
  const none = h('div', { class: 'ip-none', role: 'status' });
  el.append(input, scroller, none);
  // the panels' thin scrollbar over the icons (the native one hidden)
  const thumbs = createOverlayScroll(el);
  el.append(...thumbs.thumbs);
  scope.add(() => thumbs.destroy());

  const cols = (): number => Math.max(1, Math.floor((scroller.clientWidth || ICON_TILE * 7) / ICON_TILE));
  const visibleRows = (): number => Math.ceil((scroller.clientHeight || ICON_TILE * ROWS) / ICON_TILE) + 2;
  const describe = (name: string): string => {
    const lic = p.packs().find((x) => x.name === name.slice(0, name.indexOf(':')))?.license;
    return lic ? `${name} · ${p.t('icons.license', { license: lic })}` : name;
  };

  const tile = (name: string, i: number): HTMLElement => {
    const on = p.current === name;
    const b = h('button', { type: 'button', class: 'ip-tile' + (on ? ' on' : ''), 'aria-label': name, title: describe(name), 'aria-pressed': String(on), tabindex: '-1', 'data-i': String(i) },
      h('img', { src: p.preview(name), alt: '', width: 20, height: 20, draggable: false }));
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
  // the columns follow the width (a tab shown after the picker was built, a resized popover)
  let width = 0;
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    if (scroller.clientWidth === width) return;
    width = scroller.clientWidth;
    drawRows(true);
  }) : null;
  ro?.observe(scroller);
  scope.add(() => ro?.disconnect());

  function refresh(): void {
    const t = p.t;
    el.setAttribute('aria-label', t('icons.title'));
    input.setAttribute('aria-label', t('icons.search'));
    input.placeholder = t('icons.searchPlaceholder');
    rows.setAttribute('aria-label', t('icons.grid'));
    list = p.find(query.trim(), null);
    const cur = p.current ? list.indexOf(p.current) : -1;
    keys.setActive(cur >= 0 ? cur : 0);
    none.hidden = list.length > 0;
    none.textContent = query.trim() ? t('icons.none', { q: query.trim() }) : t('icons.empty');
    drawRows(true);
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
      scope.dispose();
      el.remove();
    },
  };
}
