// ShapePalette (T05 §4.2): the categorised shape palette of the editor's Shapes menu and, compact, the style
// toolbar's shape picker. Sections with headings, a grid of small previews (or a list of icons and names), a search
// field over each item's name and terms (the shape's semantic and Mermaid names, aliases), and arrow-key movement
// through the tiles. The host owns what an item is and does: a pointer press starts its drag (`onPointerDown`), a
// click or Enter chooses it (`onPick`).
import { h } from '../h.js';
import { registerMessages } from '../i18n.js';
import { BLOCK_MESSAGES_MEDIA } from '../messages/blocks-media.js';
import { Scope, type BlockHandle, type Translate } from './block.js';
import { gridKeys } from './grid-keys.js';

export interface ShapePaletteItem {
  key: string;
  /** The visible name (list layout) and the tile's accessible name. */
  label: string;
  /** Tooltip (default: the label). */
  tip?: string;
  /** More words search finds it by. */
  terms?: readonly string[];
  icon: () => SVGElement;
}

export interface ShapePaletteSection {
  title: string;
  items: readonly ShapePaletteItem[];
}

export interface ShapePaletteProps {
  t: Translate;
  /** Accessible name and the heading above the search (none: no heading). */
  title?: string;
  sections: readonly ShapePaletteSection[];
  /** `grid` (default): previews in rows of `cols`; `list`: each item's icon and name. */
  layout?: 'grid' | 'list';
  /** Tiles per row in the grid layout (default 6). */
  cols?: number;
  /** The item that is on (the toolbar: the node's shape). */
  current?: string | null;
  /** Show the search field (default true). */
  search?: boolean;
  /** Smaller tiles and headings (the toolbar's picker). */
  compact?: boolean;
  /** A pointer press on an item (the host starts a drag, or adds it on release). */
  onPointerDown?(item: ShapePaletteItem, ev: PointerEvent, el: HTMLElement): void;
  /** The item was chosen: a click (hosts without `onPointerDown`), or Enter / Space. */
  onPick?(item: ShapePaletteItem, ev: MouseEvent): void;
}

export interface ShapePaletteHandle extends BlockHandle<ShapePaletteProps> {
  /** Focuses the search field (or the first tile without one). */
  focus(): void;
  /** The search text. */
  readonly query: string;
  /** Filters by a query (as if typed). */
  setQuery(q: string): void;
}

export const SHAPE_PALETTE_CSS = /* css */ `
.sp { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sp-title { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--mmdx-muted); padding: 2px 4px 2px; }
.sp-search { width: 100%; margin: 0 0 4px; }
.sp-head { font-size: 11px; font-weight: 600; color: var(--mmdx-muted); padding: 6px 4px 2px; }
.sp-grid { display: grid; grid-template-columns: repeat(var(--sp-cols, 6), 40px); gap: 2px; }
.sp-tile { width: 40px; height: 40px; padding: 0; border: 1px solid transparent; background: none; border-radius: 8px; display: grid; place-items: center;
  color: var(--mmdx-text); cursor: grab; touch-action: none; }
.sp-tile svg { width: 32px; height: 32px; pointer-events: none; }
.sp-tile:hover { background: var(--mmdx-float-2); }
.sp-tile.on, .sp-row.on { background: var(--mmdx-accent-2); color: var(--mmdx-accent); }
.sp-tile:active, .sp-row:active { cursor: grabbing; }
.sp-list { display: flex; flex-direction: column; }
.sp-row { width: 100%; height: 40px; border: 0; background: none; border-radius: 10px; display: flex; align-items: center; gap: 12px; padding: 0 10px;
  justify-content: flex-start; font-size: 14px; color: var(--mmdx-text); cursor: grab; touch-action: none; text-align: left; }
.sp-row svg { width: 22px; height: 22px; flex: none; pointer-events: none; }
.sp-row:hover { background: var(--mmdx-float-2); }
.sp-none { color: var(--mmdx-muted); font-size: 12px; padding: 8px 4px; }
.sp.compact .sp-grid { grid-template-columns: repeat(var(--sp-cols, 8), 32px); }
.sp.compact .sp-tile { width: 32px; height: 32px; border-radius: 6px; }
.sp.compact .sp-tile svg { width: 24px; height: 24px; }
.sp.compact .sp-head { padding: 4px 2px 1px; font-size: 10.5px; }
`;

const words = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Does every word of the query start a word of the item's name or terms (or occur in a term)? */
export function matchesShape(item: ShapePaletteItem, q: string): boolean {
  const qs = words(q);
  if (!qs.length) return true;
  const hay = [item.label, ...(item.terms ?? [])].map((x) => x.toLowerCase());
  const ws = hay.flatMap(words);
  return qs.every((w) => ws.some((x) => x.startsWith(w)) || hay.some((x) => x.includes(w)));
}

export function createShapePalette(props: ShapePaletteProps): ShapePaletteHandle {
  registerMessages(BLOCK_MESSAGES_MEDIA);
  let p = { ...props };
  let scope = new Scope();
  let query = '';
  let tiles: HTMLElement[] = [];
  let tileItems: ShapePaletteItem[] = [];
  const el = h('div', { class: 'sp', role: 'group' });
  const input = h('input', { type: 'search', class: 'sp-search' });
  const body = h('div', { class: 'sp-body' });
  const keys = gridKeys(body, {
    count: () => tiles.length,
    cols: () => (p.layout === 'list' ? 1 : p.cols ?? (p.compact ? 8 : 6)),
    indexOf: (e) => {
      const i = tiles.indexOf(e as HTMLElement);
      return i < 0 ? null : i;
    },
    focus: (i) => {
      tiles[i]?.focus();
      syncStop();
    },
  });
  const syncStop = (): void => tiles.forEach((b, i) => b.setAttribute('tabindex', i === keys.active ? '0' : '-1'));

  const tile = (it: ShapePaletteItem): HTMLElement => {
    const list = p.layout === 'list';
    const on = p.current === it.key;
    const b = h('button', {
      type: 'button', class: (list ? 'sp-row' : 'sp-tile') + (on ? ' on' : ''), title: it.tip ?? it.label, 'aria-label': it.label, 'data-key': it.key,
      ...(p.current !== undefined ? { 'aria-pressed': String(on) } : {}),
    }, it.icon(), list ? h('span', null, it.label.split(' — ')[0]!) : null);
    if (p.onPointerDown) b.addEventListener('pointerdown', (ev) => p.onPointerDown?.(it, ev, b), { signal: scope.signal });
    // a pointer press is the host's (drag or add on release); a keyboard click (detail 0) chooses
    b.addEventListener('click', (ev) => {
      if (!p.onPointerDown || ev.detail === 0) p.onPick?.(it, ev);
    }, { signal: scope.signal });
    tiles.push(b);
    tileItems.push(it);
    return b;
  };

  const section = (title: string, items: readonly ShapePaletteItem[]): HTMLElement[] => {
    if (!items.length) return [];
    const list = p.layout === 'list';
    const box = h('div', { class: list ? 'sp-list' : 'sp-grid', role: 'group', ...(title ? { 'aria-label': title } : {}) }, ...items.map(tile));
    if (!list && p.cols) box.style.setProperty('--sp-cols', String(p.cols));
    return title ? [h('div', { class: 'sp-head', 'aria-hidden': 'true' }, title), box] : [box];
  };

  const renderBody = (): void => {
    scope.dispose();
    scope = new Scope();
    tiles = [];
    tileItems = [];
    const t = p.t;
    const out: HTMLElement[] = [];
    if (query.trim()) {
      const seen = new Set<string>();
      const hits = p.sections.flatMap((s) => s.items).filter((it) => !seen.has(it.key) && (seen.add(it.key), matchesShape(it, query)));
      if (hits.length) out.push(...section(t('palette.results'), hits));
      else out.push(h('div', { class: 'sp-none', role: 'status' }, t('palette.none', { q: query.trim() })));
    } else {
      for (const s of p.sections) out.push(...section(s.title, s.items));
    }
    body.replaceChildren(...out);
    const cur = p.current ? tileItems.findIndex((x) => x.key === p.current) : -1;
    keys.setActive(cur >= 0 ? cur : 0);
    syncStop();
  };

  const render = (): void => {
    const t = p.t;
    el.classList.toggle('compact', !!p.compact);
    el.setAttribute('aria-label', p.title ?? t('palette.shapes'));
    input.placeholder = t('palette.searchPlaceholder');
    input.setAttribute('aria-label', t('palette.search'));
    el.replaceChildren(...(p.title ? [h('div', { class: 'sp-title' }, p.title)] : []), ...(p.search === false ? [] : [input]), body);
    renderBody();
  };

  input.addEventListener('input', () => {
    query = input.value;
    renderBody();
  });
  // ↓ from the search field goes into the tiles; Enter takes the first result
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' && tiles.length) {
      ev.preventDefault();
      keys.setActive(0);
      syncStop();
      tiles[0]!.focus();
    } else if (ev.key === 'Enter' && tiles.length && query.trim()) {
      ev.preventDefault();
      tiles[0]!.click();
    }
  });
  render();

  return {
    el,
    get query() {
      return query;
    },
    setQuery(q) {
      input.value = q;
      query = q;
      renderBody();
    },
    focus() {
      if (p.search === false) (tiles[keys.active] ?? tiles[0])?.focus();
      else input.focus();
    },
    update(next) {
      p = { ...p, ...next };
      render();
    },
    destroy() {
      keys.destroy();
      scope.dispose();
      el.remove();
    },
  };
}
