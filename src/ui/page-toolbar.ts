// Floating action bar for the page itself (A.7 row 64; prototype page-toolbar.js): shown when the page is clicked
// with nothing else selected. One button per page property of its diagram type: type, direction, preset,
// background, border, size, proportions, lines, and the sequence layout. Same look as the style toolbar (.mtb); the
// host supplies a `PageToolbarApi` with the page state and actions. Listeners are scoped to the host's root node and
// removed by destroy().
import { TOOLBAR_MESSAGES } from './messages/toolbar.js';
import type { Rect } from '../core/types.js';
import { h, s } from './h.js';
import { createI18n, registerMessages, type I18n } from './i18n.js';
import type { PaletteColor } from './style-toolbar.js';

/** `[value, label]`. */
export type Choice = readonly [string, string];

export interface SequenceLayoutState {
  gap: number;
  rowH: number;
  blockSpan: 'full' | 'touched' | string;
  mirror?: boolean;
  autonumber?: boolean;
}

export type SeqKey = 'gap' | 'rowH' | 'blockSpan' | 'mirror' | 'autonumber';

export interface PageToolbarApi {
  /** Page selected (nothing else): the bar shows. */
  visible(): boolean;
  types(): readonly Choice[];
  diagramType(): string | null | undefined;
  /** Current direction, or null / undefined when the type has none (sequence). */
  direction(): string | null | undefined;
  directions(): readonly Choice[];
  /** Page presets of the theme for this diagram type. */
  presets(): readonly Choice[];
  preset(): string | undefined;
  sizeMode(): 'fit' | 'custom';
  ratio(): string | null | undefined;
  ratioLabel(): string;
  ratios(): readonly Choice[];
  /** Effective page value, colours resolved (background, border). */
  get(key: 'background' | 'border'): string | null | undefined;
  /** Stored page value (palette references kept). */
  getRaw(key: 'background' | 'border'): string | null | undefined;
  hasRouting(): boolean;
  routing(): string;
  /** Sequence layout, or null for other types. */
  seq(): SequenceLayoutState | null;
  setSeq(key: SeqKey, value: number | string | boolean, opts?: { live?: boolean }): void;
  set(patch: Readonly<Record<string, string | undefined>>): void;
  setType(type: string): void;
  setDirection(dir: string): void;
  setPreset(id: string): void;
  setSizeMode(mode: string): void;
  setRatio(ratio: string): void;
  setRouting(routing: string): void;
  palette(): PaletteColor[];
  localPalette?(): PaletteColor[];
  addLocalColor?(hex: string): string;
  removeLocalColor?(name: string): void;
  /** The page box in host coordinates; null hides the bar. */
  rect(): Rect | null;
  hBounds?(): [number, number];
  topInset?(): number;
}

export interface PageToolbarHandle {
  refresh(): void;
  place(): void;
  close(returnFocus?: boolean): void;
  isOpen(): boolean;
  destroy(): void;
  readonly el: HTMLElement;
}

type PopName = 'type' | 'direction' | 'preset' | 'background' | 'border' | 'size' | 'ratio' | 'routing' | 'gap' | 'rowH' | 'blockSpan';

// Icon bodies: fixed, trusted SVG markup.
const ICON: Readonly<Record<string, string>> = {
  flowchart: '<rect x="2.5" y="9" width="6.5" height="6" rx="1.4"/><path d="M15 4.5l3.5 3.5-3.5 3.5-3.5-3.5z"/><rect x="14" y="15" width="7.5" height="5" rx="2.5"/><path d="M9 12h2.5M15 11.5v3.5"/>',
  sequence: '<rect x="2.5" y="3" width="7" height="4" rx="1"/><rect x="14.5" y="3" width="7" height="4" rx="1"/><path d="M6 7v14M18 7v14" stroke-dasharray="2 2"/><path d="M6 11.5h11M15 9.5l2 2-2 2M18 16.5H7M9 14.5l-2 2 2 2"/>',
  er: '<rect x="2.5" y="3" width="8.5" height="10" rx="1.3"/><path d="M2.5 6.5h8.5"/><rect x="13" y="11" width="8.5" height="10" rx="1.3"/><path d="M13 14.5h8.5M11 8h3.5v3"/>',
  arrow: '<path d="M12 4v16M6 14l6 6 6-6"/>',
  presets: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" fill="currentColor" fill-opacity=".25"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" fill="currentColor" fill-opacity=".25"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  custom: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M7 9.5h4M9 9.5v5" /><path d="M13.5 9.5l3.5 5M17 9.5l-3.5 5"/>',
  ratio: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M3 18L21 6" stroke-dasharray="2 2"/>',
  curved: '<path d="M4 19c6 0 4-14 16-14"/><circle cx="4" cy="19" r="1.6" fill="currentColor"/><circle cx="20" cy="5" r="1.6" fill="currentColor"/>',
  orthogonal: '<path d="M4 19h8V5h8"/><circle cx="4" cy="19" r="1.6" fill="currentColor"/><circle cx="20" cy="5" r="1.6" fill="currentColor"/>',
  straight: '<path d="M4 19L20 5"/><circle cx="4" cy="19" r="1.6" fill="currentColor"/><circle cx="20" cy="5" r="1.6" fill="currentColor"/>',
  gap: '<rect x="2.5" y="4" width="5" height="5" rx="1"/><rect x="16.5" y="4" width="5" height="5" rx="1"/><path d="M5 9v11M19 9v11" stroke-dasharray="2 2"/><path d="M8.5 14.5h7M10.5 12.5l-2 2 2 2M13.5 12.5l2 2-2 2"/>',
  rowH: '<path d="M3 5h11M3 19h11"/><path d="M19 6v12M17 8l2-2 2 2M17 16l2 2 2-2"/><path d="M3 12h7" stroke-dasharray="2 2"/>',
  blockSpan: '<rect x="3" y="7" width="18" height="10" rx="1.5" stroke-dasharray="3 2"/><path d="M7 12h10M9 10l-2 2 2 2M15 10l2 2-2 2"/>',
  mirror: '<rect x="3" y="3" width="7" height="4" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="3" y="17" width="7" height="4" rx="1"/><rect x="14" y="17" width="7" height="4" rx="1"/><path d="M6.5 7v10M17.5 7v10" stroke-dasharray="2 2"/>',
  autonumber: '<path d="M4 5.5h1.5v5M4 10.5h3"/><path d="M4 14.5c0-1 .7-1.5 1.6-1.5s1.5.6 1.5 1.4c0 1.4-3.1 2.4-3.1 4.1h3.2"/><path d="M11 7.5h9.5M11 16.5h9.5"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke-width="2.2"/>',
};
const DIR_ROT: Readonly<Record<string, number>> = { TB: 0, LR: -90, BT: 180, RL: 90 };
const ROUTINGS = ['curved', 'orthogonal', 'straight'] as const;

function icon(body: string, size = 22): SVGSVGElement {
  const el = s('svg', { viewBox: '0 0 24 24', width: String(size), height: String(size), fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }) as SVGSVGElement;
  el.innerHTML = body; // trusted constants only (ICON)
  return el;
}

const clear = (col: string | null | undefined): boolean => !col || col === 'none' || col === 'transparent';
const isHex6 = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v);

/** `host` must already be in its final root (document or shadow root): outside clicks and Esc are listened for there. */
export function createPageToolbar(host: HTMLElement, api: PageToolbarApi, opts: { i18n?: I18n } = {}): PageToolbarHandle {
  registerMessages(TOOLBAR_MESSAGES);
  const t = (opts.i18n ?? createI18n()).t;
  const bar = h('div', { class: 'mtb page-mtb', role: 'toolbar', 'aria-label': t('ptb.label'), part: 'toolbar' });
  bar.hidden = true;
  host.append(bar);
  let open: PopName | null = null;
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  const root = host.getRootNode() as Document | ShadowRoot;

  const close = (returnFocus = false): void => {
    const was = open;
    open = null;
    bar.querySelectorAll('.mtb-pop').forEach((p) => p.remove());
    bar.querySelectorAll('.mtb-btn.on').forEach((b) => {
      b.classList.remove('on');
      b.setAttribute('aria-expanded', 'false');
    });
    if (returnFocus && was) bar.querySelector<HTMLElement>(`[data-c="${was}"]`)?.focus();
  };
  root.addEventListener('pointerdown', (ev) => {
    if (open && !ev.composedPath().includes(bar)) close();
  }, sig);
  root.addEventListener('keydown', (ev) => {
    const k = ev as KeyboardEvent;
    if (k.key === 'Escape' && open) {
      k.preventDefault();
      k.stopPropagation();
      close(k.composedPath().includes(bar));
    }
  }, sig);
  bar.addEventListener('pointerdown', (ev) => ev.stopPropagation(), sig); // clicks on the bar do not reach the canvas
  bar.addEventListener('keydown', (ev) => {
    const target = ev.composedPath()[0] as HTMLElement;
    const menu = target.closest<HTMLElement>('.mtb-pop [role=menu]');
    const items = menu
      ? Array.from(menu.querySelectorAll<HTMLElement>('[role^=menuitem]'))
      : target.closest('.mtb-pop') || target.tagName === 'INPUT' ? [] : Array.from(bar.querySelectorAll<HTMLElement>('.mtb-seg > button'));
    const keys = menu ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    if (!items.length || !keys.includes(ev.key)) return;
    const i = items.indexOf(target);
    items[(i + (ev.key === keys[1] ? 1 : -1) + items.length) % items.length]?.focus();
    ev.preventDefault();
  }, sig);

  function refresh(): void {
    if (!api.visible()) {
      bar.hidden = true;
      close();
      return;
    }
    const keep = open;
    bar.replaceChildren();
    open = null;
    const types = api.types(), type = api.diagramType() ?? '';
    const typeLabel = types.find(([v]) => v === type)?.[1] ?? t('ptb.diagram');
    const dir = api.direction();
    const dirLabel = api.directions().find(([v]) => v === dir)?.[1] ?? '';
    const presetLabel = api.presets().find(([v]) => v === api.preset())?.[1];
    const custom = api.sizeMode() === 'custom', ratio = api.ratio();
    seg(
      pop('type', icon(ICON[type] ?? ICON['flowchart']!), t('ptb.type', { label: typeLabel })),
      dir ? pop('direction', dirIcon(dir), t('ptb.direction', { label: dirLabel })) : null,
      api.presets().length ? pop('preset', icon(ICON['presets']!), t('ptb.preset', { label: presetLabel ?? t('ptb.presetNone') }), presetLabel ? 'active' : '') : null,
    );
    seg(
      pop('background', swatch(api.get('background')), t('ptb.background')),
      pop('border', borderIcon(api.get('border')), t('ptb.border')),
      pop('size', icon(custom ? ICON['custom']! : ICON['fit']!), custom ? t('ptb.sizeCustom') : t('ptb.sizeFit'), custom ? 'active' : ''),
      pop('ratio', icon(ICON['ratio']!), t('ptb.ratio', { label: ratio ? api.ratioLabel() : t('ptb.free') }), ratio ? 'active' : ''),
    );
    if (api.hasRouting()) {
      const r = api.routing();
      seg(pop('routing', icon(ICON[r] ?? ICON['curved']!), t('ptb.lines', { label: t(`ptb.routing.${(ROUTINGS as readonly string[]).includes(r) ? r : 'curved'}`) })));
    }
    const L = api.seq();
    if (L) {
      seg(
        pop('gap', icon(ICON['gap']!), t('ptb.gapN', { n: L.gap })),
        pop('rowH', icon(ICON['rowH']!), t('ptb.rowHN', { n: L.rowH })),
        pop('blockSpan', icon(ICON['blockSpan']!), L.blockSpan === 'touched' ? t('ptb.blockSpanTouched') : t('ptb.blockSpanFull'), L.blockSpan === 'touched' ? 'active' : ''),
        toggleBtn('mirror', icon(ICON['mirror']!), t('ptb.mirror'), !!L.mirror, (on) => api.setSeq('mirror', on)),
        toggleBtn('autonumber', icon(ICON['autonumber']!), t('ptb.autonumber'), !!L.autonumber, (on) => api.setSeq('autonumber', on)),
      );
    }
    bar.hidden = false;
    if (keep) {
      const b = bar.querySelector<HTMLElement>(`[data-c="${keep}"]`);
      if (b) toggle(keep, b, false);
    }
    place();
  }

  const seg = (...items: (HTMLElement | null)[]): void => {
    const sg = h('div', { class: 'mtb-seg', role: 'group' });
    for (const i of items) if (i) sg.append(i);
    bar.append(sg);
  };
  const dirIcon = (dir: string): SVGSVGElement => {
    const el = icon('');
    const g = s('g', { transform: `rotate(${DIR_ROT[dir] ?? 0} 12 12)` });
    g.append(s('path', { d: 'M12 4v16M6 14l6 6 6-6' }));
    el.append(g);
    return el;
  };
  const swatch = (col: string | null | undefined): HTMLElement =>
    clear(col) ? h('span', { class: 'mtb-dot checker' }) : h('span', { class: 'mtb-dot', style: { background: col ?? '' } });
  // page border: a square outline in the colour over a halo (readable on light and dark bars); transparent = dashed, crossed out
  const borderIcon = (col: string | null | undefined): SVGSVGElement => {
    const el = s('svg', { viewBox: '0 0 24 24', width: '24', height: '24', fill: 'none', 'aria-hidden': 'true' }) as SVGSVGElement;
    if (clear(col)) {
      el.append(
        s('rect', { x: '4', y: '4', width: '16', height: '16', rx: '2.5', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-dasharray': '3 2.4', opacity: '.7' }),
        s('path', { d: 'M5 19L19 5', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', opacity: '.7' }),
      );
    } else {
      const fg = s('rect', { x: '4.5', y: '4.5', width: '15', height: '15', rx: '2.5', 'stroke-width': '3' });
      fg.setAttribute('stroke', col ?? '');
      el.append(s('rect', { x: '4.5', y: '4.5', width: '15', height: '15', rx: '2.5', 'stroke-width': '5.5', style: 'stroke:var(--pmtb-halo)' }), fg);
    }
    return el;
  };
  // on / off property: one click, highlighted while on
  function toggleBtn(name: string, content: Node, title: string, on: boolean, set: (v: boolean) => void): HTMLButtonElement {
    const full = `${title} — ${on ? t('ptb.on') : t('ptb.off')}`;
    const b = h('button', { type: 'button', class: 'mtb-btn' + (on ? ' active' : ''), title: full, 'aria-label': title, 'aria-pressed': String(on), dataset: { c: name } }, content);
    b.addEventListener('click', () => {
      close();
      set(!on);
    });
    return b;
  }
  function pop(name: PopName, content: Node, title: string, cls = ''): HTMLButtonElement {
    const b = h('button', { type: 'button', class: `mtb-btn ${cls}`, title, 'aria-label': title, 'aria-haspopup': 'dialog', 'aria-expanded': 'false', dataset: { c: name } }, content);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggle(name, b, ev.detail === 0);
    });
    return b;
  }

  function toggle(name: PopName, btn: HTMLElement, focusIn = true): void {
    if (open === name) {
      close(true);
      return;
    }
    close();
    open = name;
    btn.classList.add('on');
    btn.setAttribute('aria-expanded', 'true');
    const p = h('div', { class: 'mtb-pop', role: 'dialog', 'aria-label': btn.getAttribute('aria-label') ?? name });
    bar.append(p);
    fill(p, name);
    const bl = btn.offsetLeft + (btn.parentElement?.offsetLeft ?? 0);
    p.style.left = `${Math.max(0, Math.min(bl - 20, bar.clientWidth - p.offsetWidth))}px`;
    fitPop(p);
    if (focusIn) queueMicrotask(() => p.querySelector<HTMLElement>('[role^=menuitem][aria-checked=true], [role^=menuitem], button, input')?.focus());
  }

  function fill(p: HTMLElement, name: PopName): void {
    const one = (text: string, items: readonly Choice[], cur: string | null | undefined, pick: (v: string) => void): void => {
      p.append(h('div', { class: 'mtb-label' }, text), list(items, cur, pick, text));
    };
    switch (name) {
      case 'background':
        return colors(p, 'background', (v) => api.set({ background: v }));
      case 'border':
        return colors(p, 'border', (v) => api.set({ border: v }));
      case 'type':
        return one(t('ptb.typeLabel'), api.types(), api.diagramType(), (v) => {
          close();
          api.setType(v);
        });
      case 'direction':
        return one(t('ptb.directionLabel'), api.directions(), api.direction(), (v) => api.setDirection(v));
      case 'preset':
        return one(t('ptb.presetLabel'), [['', t('ptb.presetNoneLong')], ...api.presets()], api.preset() ?? '', (v) => api.setPreset(v));
      case 'size':
        return one(t('ptb.sizeLabel'), [['fit', t('ptb.fitContent')], ['custom', t('ptb.customSize')]], api.sizeMode(), (v) => api.setSizeMode(v));
      case 'ratio':
        return one(t('ptb.ratioLabel'), [['', t('ptb.freeLabel')], ...api.ratios()], api.ratio() ?? '', (v) => api.setRatio(v));
      case 'routing':
        return one(t('ptb.linesLabel'), ROUTINGS.map((r) => [r, t(`ptb.routing.${r}`)] as const), api.routing(), (v) => api.setRouting(v));
      case 'gap':
      case 'rowH':
      case 'blockSpan': {
        const L = api.seq();
        if (!L) return;
        if (name === 'gap') return slider(p, t('ptb.gap'), L.gap, 30, 300, 5, (v, live) => api.setSeq('gap', v, { live }), (v) => `${v}px`);
        if (name === 'rowH') return slider(p, t('ptb.rowH'), L.rowH, 24, 120, 2, (v, live) => api.setSeq('rowH', v, { live }), (v) => `${v}px`);
        return one(t('ptb.blockSpan'), [['full', t('ptb.fullWidth')], ['touched', t('ptb.onlyParticipants')]], L.blockSpan, (v) => api.setSeq('blockSpan', v));
      }
    }
  }

  // value slider: live redraw while dragging, one undo step on release
  function slider(p: HTMLElement, text: string, value: number, min: number, max: number, step: number, set: (v: number, live: boolean) => void, fmt: (v: number) => string): void {
    const out = h('span', { class: 'mtb-val' }, fmt(value));
    const r = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), 'aria-label': text });
    r.value = String(value);
    r.addEventListener('input', () => {
      out.textContent = fmt(Number(r.value));
      set(Number(r.value), true);
    });
    r.addEventListener('change', () => set(Number(r.value), false));
    p.append(h('div', { class: 'mtb-slider' }, h('div', { class: 'mtb-slabel' }, h('span', null, text), out), r));
  }

  function list(items: readonly Choice[], cur: string | null | undefined, pick: (v: string) => void, name: string): HTMLElement {
    const l = h('div', { class: 'mtb-list', role: 'menu', 'aria-label': name });
    for (const [v, text] of items) {
      const on = cur !== null && cur !== undefined && v === cur;
      l.append(h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(on), class: 'mtb-item' + (on ? ' on' : ''), onclick: () => pick(v) }, text));
    }
    return l;
  }

  // Theme palette (stored as "@name", so it follows theme switches) + the diagram's own colours.
  function colors(p: HTMLElement, key: 'background' | 'border', pick: (v: string | undefined) => void): void {
    const cur = String(api.getRaw(key) ?? '').toLowerCase();
    const title = key === 'border' ? t('ptb.borderColour') : t('ptb.backgroundColour');
    p.append(h('div', { class: 'mtb-label' }, title));
    const g = h('div', { class: 'mtb-colors', role: 'group', 'aria-label': title });
    const noneOn = !cur || cur === 'none';
    g.append(h('button', { type: 'button', class: 'mtb-sw none' + (noneOn ? ' on' : ''), title: t('ptb.transparent'), 'aria-label': t('ptb.transparent'), 'aria-pressed': String(noneOn), onclick: () => pick('none') }));
    for (const { name, value } of api.palette()) {
      const on = cur === `@${name}`.toLowerCase() || value.toLowerCase() === cur;
      const b = h('button', { type: 'button', class: 'mtb-sw' + (on ? ' on' : ''), title: name, 'aria-label': name, 'aria-pressed': String(on), onclick: () => pick(`@${name}`) });
      b.style.background = value;
      g.append(b);
    }
    p.append(g);
    if (api.addLocalColor) localColors(p, cur, pick);
    p.append(h('button', { type: 'button', class: 'mtb-item', onclick: () => pick(undefined) }, t('ptb.themeDefault')));
  }

  // the diagram's own colours (not the theme's) + "+" to add one: saved in the diagram, then applied
  function localColors(p: HTMLElement, cur: string, pick: (v: string) => void): void {
    p.append(h('div', { class: 'mtb-label' }, t('tb.thisDiagram')));
    const g = h('div', { class: 'mtb-colors', role: 'group', 'aria-label': t('tb.thisDiagram') });
    for (const { name, value } of api.localPalette?.() ?? []) {
      const on = cur === `@${name}`.toLowerCase() || value.toLowerCase() === cur;
      const title = t('tb.localColor', { value });
      const b = h('button', { type: 'button', class: 'mtb-sw' + (on ? ' on' : ''), title, 'aria-label': title, 'aria-pressed': String(on) });
      b.style.background = value;
      b.addEventListener('click', (ev) => {
        if (ev.altKey) {
          api.removeLocalColor?.(name);
          return;
        }
        pick(`@${name}`);
      });
      b.addEventListener('keydown', (ev) => {
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && api.removeLocalColor) {
          ev.preventDefault();
          api.removeLocalColor(name);
        }
      });
      g.append(b);
    }
    const ci = h('input', { type: 'color', 'aria-label': t('tb.addColor') });
    ci.value = isHex6(cur) ? cur : '#4f46e5';
    ci.addEventListener('change', () => {
      const n = api.addLocalColor?.(ci.value);
      if (n) pick(`@${n}`);
    });
    g.append(h('label', { class: 'mtb-sw mtb-add', title: t('tb.addColor') }, icon(ICON['plus']!, 14), ci));
    p.append(g);
  }

  function fitPop(p: HTMLElement): void {
    const barLeft = bar.getBoundingClientRect().left - host.getBoundingClientRect().left;
    const [lo, hi] = api.hBounds?.() ?? [8, host.clientWidth - 8];
    p.style.left = `${Math.max(lo - barLeft, Math.min(parseFloat(p.style.left) || 0, hi - barLeft - p.offsetWidth))}px`;
    const barTop = bar.getBoundingClientRect().top - host.getBoundingClientRect().top;
    const below = host.clientHeight - (barTop + bar.offsetHeight + 8) - 8;
    if (p.scrollHeight <= below || below >= barTop - 16) {
      p.style.top = `${bar.offsetHeight + 8}px`;
      p.style.maxHeight = `${below}px`;
    } else {
      const hh = Math.min(p.scrollHeight, barTop - 16);
      p.style.top = `${-hh - 8}px`;
      p.style.maxHeight = `${hh}px`;
    }
  }

  // Above the page; pinned to the top of the host when the page starts above the view.
  function place(): void {
    if (bar.hidden) return;
    const r = api.rect();
    if (!r) {
      bar.style.visibility = 'hidden';
      return;
    }
    const W = host.clientWidth, H = host.clientHeight, bw = bar.offsetWidth, bh = bar.offsetHeight;
    if ((H && r.y > H) || r.y + r.h < 0) {
      bar.style.visibility = 'hidden';
      return;
    }
    bar.style.visibility = '';
    const [lo, hi] = api.hBounds?.() ?? [8, W - 8];
    const x = Math.max(lo, Math.min(hi - bw, r.x + r.w / 2 - bw / 2));
    const y = Math.max(api.topInset?.() ?? 8, r.y - bh - 14);
    bar.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  return {
    refresh,
    place,
    close,
    isOpen: () => open !== null,
    destroy: () => {
      ac.abort();
      close();
      bar.remove();
    },
    el: bar,
  };
}
