// The parts the floating toolbars share (the style toolbar above a selection, the page toolbar above the page): one
// popover open at a time under its button (Esc and outside clicks close it, the focus returns to the button), the
// popover kept inside the host, arrow keys along the bar with one tab stop and up / down in menus, value sliders,
// rows of choices and colour swatch grids with the diagram's own colours. Listeners are scoped to the host's root node
// (a shadow root), never the document.
import { rovingKeys, type RovingHandle } from './blocks/focus.js';
import { h, s } from './h.js';
import type { I18n } from './i18n.js';

type Translate = I18n['t'];

/** A palette colour: its stored name and its CSS value. */
export interface PaletteColor {
  name: string;
  value: string;
}

export const isNone = (c: unknown): boolean => !c || c === 'none' || c === 'transparent';
export const isHex6 = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v);

/** An `<svg>` with trusted constant markup inside (icon bodies that are constants of the toolbars, never data). */
export function svgMarkup(attrs: Record<string, string>, markup: string): SVGSVGElement {
  const el = s('svg', { 'aria-hidden': 'true', focusable: 'false', ...attrs }) as SVGSVGElement;
  el.innerHTML = markup; // constant icon bodies only
  return el;
}

/** The accent colour of the chrome as `#rrggbb` (the start value of a colour input), from the `--mmdx-accent` token. */
export function accentHex(el: Element): string {
  const v = typeof getComputedStyle === 'function' ? getComputedStyle(el).getPropertyValue('--mmdx-accent').trim() : '';
  return isHex6(v) ? v : '#4f46e5';
}

// ---- the popover host

export interface PopHostOptions {
  /** The positioned element the bar lives in. */
  host: HTMLElement;
  /** The bar (`.mtb`): popovers are its children, its `.mtb-btn[data-c]` buttons open them. */
  bar: HTMLElement;
  /** Free horizontal strip of the host [left, right] (not over side panels). */
  hBounds?: () => [number, number] | undefined;
}

export interface PopHost {
  /** The name of the open popover, or null. */
  readonly open: string | null;
  /** The open popover's element. */
  pop(): HTMLElement | null;
  /**
   * Opens popover `name` under `btn` (filled by `fill`, then kept inside the host); the same name again closes it.
   * `focusIn` moves the focus to the first of `focus` inside it.
   */
  toggle(name: string, btn: HTMLElement, fill: (pop: HTMLElement) => void, o?: { focusIn?: boolean; focus?: string }): void;
  /** Closes the open popover (the focus back on its button when asked). */
  close(returnFocus?: boolean): void;
  /** Forgets the open popover after the bar was rebuilt (its element went with the old children). */
  reset(): void;
  /** Keeps a popover inside the host: below the bar, or above it, scrolling when needed. */
  fit(pop: HTMLElement): void;
  destroy(): void;
}

export function createPopHost(o: PopHostOptions): PopHost {
  const { host, bar } = o;
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  const root = host.getRootNode() as Document | ShadowRoot;
  let open: string | null = null;
  let menuKeys: RovingHandle | null = null;

  const forget = (): void => {
    open = null;
    menuKeys?.destroy();
    menuKeys = null;
  };
  const close = (returnFocus = false): void => {
    const was = open;
    forget();
    bar.querySelectorAll('.mtb-pop').forEach((p) => p.remove());
    bar.querySelectorAll('.mtb-btn.on').forEach((b) => {
      b.classList.remove('on');
      b.setAttribute('aria-expanded', 'false');
    });
    if (returnFocus && was) bar.querySelector<HTMLElement>(`[data-c="${was}"]`)?.focus();
  };
  // outside clicks and Esc, scoped to the host's root node (its shadow root), never the document
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

  const fit = (pop: HTMLElement): void => {
    const barLeft = bar.getBoundingClientRect().left - host.getBoundingClientRect().left;
    const [lo, hi] = o.hBounds?.() ?? [8, host.clientWidth - 8];
    pop.style.left = `${Math.max(lo - barLeft, Math.min(parseFloat(pop.style.left) || 0, hi - barLeft - pop.offsetWidth))}px`;
    const barTop = bar.getBoundingClientRect().top - host.getBoundingClientRect().top;
    const below = host.clientHeight - (barTop + bar.offsetHeight + 8) - 8;
    const above = barTop - 16;
    if (pop.scrollHeight <= below || below >= above) {
      pop.style.top = `${bar.offsetHeight + 8}px`;
      pop.style.maxHeight = `${Math.max(160, below)}px`;
    } else {
      const hh = Math.min(pop.scrollHeight, above);
      pop.style.maxHeight = `${hh}px`;
      pop.style.top = `${-hh - 8}px`;
    }
  };

  return {
    get open() {
      return open;
    },
    pop: () => bar.querySelector<HTMLElement>('.mtb-pop'),
    toggle(name, btn, fill, opts = {}) {
      if (open === name) {
        close(true);
        return;
      }
      close();
      open = name;
      btn.classList.add('on');
      btn.setAttribute('aria-expanded', 'true');
      const pop = h('div', { class: 'mtb-pop', role: 'dialog', 'aria-label': btn.getAttribute('aria-label') ?? name });
      pop.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      bar.append(pop);
      fill(pop);
      // up / down move through the items of a menu popover
      menuKeys = rovingKeys(pop, { orientation: 'vertical', selector: '[role^=menuitem]' });
      const bl = btn.offsetLeft + (btn.parentElement?.offsetLeft ?? 0);
      pop.style.left = `${Math.max(0, Math.min(bl - 20, bar.clientWidth - pop.offsetWidth))}px`;
      fit(pop);
      if (opts.focusIn !== false) queueMicrotask(() => pop.querySelector<HTMLElement>(opts.focus ?? '[role^=menuitem]:not(:disabled), button:not(:disabled), input')?.focus());
    },
    close,
    reset: forget,
    fit,
    destroy() {
      ac.abort();
      close();
    },
  };
}

/**
 * Arrow keys along the bar's segments (`.mtb-seg` controls; not from text fields or popovers), with one tab stop.
 * Call `sync()` after rebuilding the segments.
 */
export function barKeys(bar: HTMLElement, selector = '.mtb-seg button, .mtb-seg input'): RovingHandle {
  return rovingKeys(bar, {
    orientation: 'horizontal', selector, roving: true,
    skip: (x) => x.tagName === 'INPUT' || !!x.closest('.mtb-pop'),
  });
}

// ---- popover contents

/** A popover heading. */
export const popLabel = (text: string): HTMLElement => h('div', { class: 'mtb-label' }, text);

export interface SliderOptions {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  /** While dragging (live redraw). */
  onInput: (v: number) => void;
  /** On release (one undo step). */
  onChange?: (v: number) => void;
}

/** A value slider with its label and the formatted value (also its `aria-valuetext`). */
export function slider(o: SliderOptions): HTMLElement {
  const out = h('span', { class: 'mtb-val' }, o.fmt(o.value));
  const r = h('input', { type: 'range', min: String(o.min), max: String(o.max), step: String(o.step), 'aria-label': o.label });
  r.value = String(o.value);
  r.setAttribute('aria-valuetext', o.fmt(o.value));
  r.addEventListener('input', () => {
    const v = Number(r.value);
    out.textContent = o.fmt(v);
    r.setAttribute('aria-valuetext', o.fmt(v));
    o.onInput(v);
  });
  r.addEventListener('change', () => o.onChange?.(Number(r.value)));
  return h('div', { class: 'mtb-slider' }, r, h('div', { class: 'mtb-slabel' }, h('span', null, o.label), out));
}

/** A row of exclusive choices drawn as previews (dashes, arrow heads, routings), named for screen readers. */
export function choiceRow(values: readonly string[], cur: string, pick: (v: string) => void, render: (v: string) => SVGElement, name: (v: string) => string): HTMLElement {
  const row = h('div', { class: 'mtb-choices', role: 'group' });
  for (const v of values) {
    const on = v === cur;
    row.append(h('button', { type: 'button', class: 'mtb-choice' + (on ? ' on' : ''), title: name(v), 'aria-label': name(v), 'aria-pressed': String(on), onclick: () => pick(v) }, render(v)));
  }
  return row;
}

/** True when a stored or resolved colour `cur` (lower-cased) is palette colour `c`. */
const isColor = (cur: string, c: PaletteColor): boolean => cur === `@${c.name}`.toLowerCase() || c.value.toLowerCase() === cur;

export interface SwatchesOptions {
  label: string;
  /** The current value, lower-cased (`@name` or a colour). */
  cur: string;
  colors: readonly PaletteColor[];
  /** Picks `@name` (a palette reference follows theme switches). */
  pick: (v: string) => void;
  /** A "no colour" swatch first. */
  none?: { label: string; on: boolean; pick: () => void };
}

/** A palette's swatch group (`.mtb-colors`), the current colour pressed. */
export function swatches(o: SwatchesOptions): HTMLElement {
  const g = h('div', { class: 'mtb-colors', role: 'group', 'aria-label': o.label });
  const none = o.none;
  if (none) g.append(h('button', { type: 'button', class: 'mtb-sw none' + (none.on ? ' on' : ''), title: none.label, 'aria-label': none.label, 'aria-pressed': String(none.on), onclick: () => none.pick() }));
  for (const c of o.colors) {
    const on = isColor(o.cur, c);
    const b = h('button', { type: 'button', class: 'mtb-sw' + (on ? ' on' : ''), title: c.name, 'aria-label': c.name, 'aria-pressed': String(on), onclick: () => o.pick(`@${c.name}`) });
    b.style.background = c.value;
    g.append(b);
  }
  return g;
}

export interface LocalColorsOptions {
  t: Translate;
  cur: string;
  /** The diagram's own palette. */
  colors: readonly PaletteColor[];
  pick: (v: string) => void;
  /** Adds a colour to the diagram's palette; returns its name. */
  add: (hex: string) => string | undefined;
  /** Removes one (Alt-click, Delete / Backspace on the swatch). */
  remove?: (name: string) => void;
  /** Re-fills the popover after a removal. */
  again: () => void;
  /** The "+" swatch's icon. */
  plus: SVGElement;
  /** Start value of the colour input (default: the chrome's accent). */
  start?: string;
}

/** "This diagram": the diagram's own colours and "+" to add one (saved in the diagram, then applied). */
export function localColors(o: LocalColorsOptions): HTMLElement[] {
  const { t } = o;
  const g = h('div', { class: 'mtb-colors', role: 'group', 'aria-label': t('tb.thisDiagram') });
  const remove = o.remove;
  for (const c of o.colors) {
    const on = isColor(o.cur, c);
    const title = t('tb.localColor', { value: c.value });
    const b = h('button', { type: 'button', class: 'mtb-sw' + (on ? ' on' : ''), title, 'aria-label': title, 'aria-pressed': String(on) });
    b.style.background = c.value;
    b.addEventListener('click', (ev) => {
      if (ev.altKey && remove) {
        remove(c.name);
        o.again();
        return;
      }
      o.pick(`@${c.name}`);
    });
    // keyboard: Delete removes the colour (the Alt-click of the pointer)
    if (remove)
      b.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
        ev.preventDefault();
        ev.stopPropagation();
        remove(c.name);
        o.again();
      });
    g.append(b);
  }
  const ci = h('input', { type: 'color', 'aria-label': t('tb.addColor') });
  ci.value = isHex6(o.cur) ? o.cur : o.start ?? '#4f46e5';
  ci.addEventListener('change', () => {
    const n = o.add(ci.value);
    if (n) o.pick(`@${n}`);
  });
  g.append(h('label', { class: 'mtb-sw mtb-add', title: t('tb.addColor') }, o.plus, ci));
  return [popLabel(t('tb.thisDiagram')), g];
}
