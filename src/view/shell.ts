// The shell of a component (component architecture §7.1): the shadow root's root element, the canvas area, the named
// slots modules fill, the styles adopted into the shadow root, the insets of the canvas area (what fit() keeps clear
// of, and the `--inset-l` / `--inset-r` of the open panel stacks), and the `compact` preset (§7.6).
import type { Insets } from '../dom/canvas.js';
import { Owner } from '../reactive/owner.js';
import { observeSize } from '../dom/resize.js';
import { h } from '../ui/kit/h.js';
import { effect, signal, type Signal } from '../reactive/signal.js';
import { adoptStyles } from '../ui/kit/base.js';
import type { SlotName } from './types.js';

const COMPACT_W = 560;
const COMPACT_H = 360;

/** Slots placed in the canvas area (over the canvas); the others sit in the root, beside it. */
const AREA_SLOTS: readonly SlotName[] = ['top-left', 'top-center', 'top-right', 'left-dock', 'bottom-center', 'bottom-right', 'canvas'];
const ROOT_SLOTS: readonly SlotName[] = ['left-stack', 'right-stack', 'overlay'];

export const SHELL_CSS = /* css */ `
.slot { display: contents; }
.slot-top-center { display: flex; flex-direction: column; align-items: center; gap: 8px; position: absolute; top: 12px; left: calc(50% + (var(--inset-l, 0px) - var(--inset-r, 0px)) / 2); transform: translateX(-50%); z-index: 36; pointer-events: none; max-width: calc(100% - 24px); }
.slot-top-center > * { pointer-events: auto; }
.slot-top-center { width: max-content; }
.slot-top-center > .mmdx-pill { position: static; transform: none; max-width: 100%; }
.slot-top-center:empty { display: none; }
/* the right stack keeps clear of the view params (top right) and the zoom bar (bottom right) */
.slot-right-stack > .mmdx-stack:not(.drawer) { top: 60px; bottom: 60px; }
`;

export interface ShellOptions {
  /** The shell's root element: its class and role. */
  root: { class: string; role: 'img' | 'application' | 'group'; label?: string; roleDescription?: string };
  /** Class of the canvas area. */
  areaClass: string;
  css: readonly string[];
  compact: boolean | 'auto';
}

export interface Shell {
  /** The root element inside the shadow root. */
  readonly root: HTMLElement;
  /** The canvas area: the canvases and the chrome that floats over them. */
  readonly area: HTMLElement;
  readonly slots: Readonly<Record<SlotName, HTMLElement>>;
  /** Polite live region. */
  readonly live: HTMLElement;
  readonly compact: Signal<boolean>;
  /**
   * What the open panel stacks take from the canvas area, left and right (px), applied as `--inset-l` / `--inset-r`;
   * null leaves them to the product's CSS.
   */
  readonly stackInsets: Signal<{ left: number; right: number } | null>;
  /** Puts the slots that float over the canvas into the area (after the main canvas, so they paint above it). */
  placeAreaSlots(): void;
  /** Adds CSS to the shadow root (deduplicated by identity). */
  addCss(css: readonly string[]): void;
  /** Gives back sheets added with addCss: a sheet goes once every adder gave it back (a module's, on uninstall). */
  removeCss(css: readonly string[]): void;
  /**
   * Insets of the canvas area that fit() keeps clear: the open panel stacks and the tool dock. Measured from the
   * layout boxes (offsets), not the painted ones, so a panel still sliding in counts where it will be.
   */
  insets(): Insets;
  setCompact(c: boolean | 'auto'): void;
  destroy(): void;
}

export function createShell(host: HTMLElement, shadow: ShadowRoot, o: ShellOptions): Shell {
  const css = [...o.css];
  /** How many times each added sheet was added (the product's own sheets are never given back). */
  const uses = new Map<string, number>();
  /** `<style>` elements of engines without adopted stylesheets (each sheet once; removed on destroy). */
  const styleEls = new Map<string, HTMLStyleElement>();
  const adopt = (): void => {
    if (typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in shadow && 'replaceSync' in CSSStyleSheet.prototype) {
      adoptStyles(shadow, css);
      return;
    }
    for (const c of css) {
      if (styleEls.has(c)) continue;
      const el = document.createElement('style');
      el.textContent = c;
      shadow.append(el);
      styleEls.set(c, el);
    }
  };
  adopt();

  const area = h('div', { class: `${o.areaClass} mmdx-area` });
  const slots = {} as Record<SlotName, HTMLElement>;
  for (const n of [...AREA_SLOTS, ...ROOT_SLOTS]) slots[n] = h('div', { class: `slot slot-${n}`, dataset: { slot: n } });
  const live = h('div', { class: 'mmdx-sr', 'aria-live': 'polite' });
  const root = h('div', { class: o.root.class, role: o.root.role, tabindex: '0' }, area, slots['left-stack'], slots['right-stack'], slots.overlay, live);
  if (o.root.label) root.setAttribute('aria-label', o.root.label);
  if (o.root.roleDescription) root.setAttribute('aria-roledescription', o.root.roleDescription);
  shadow.append(root);

  const compact = signal(false);
  const stackInsets = signal<{ left: number; right: number } | null>(null, (a, b) => a === b || (!!a && !!b && a.left === b.left && a.right === b.right));
  const owner = new Owner('shell');
  for (const off of [
    effect(() => void root.classList.toggle('compact', compact())),
    effect(() => {
      const s = stackInsets(), st = root.style;
      if (s) {
        st.setProperty('--inset-l', `${s.left}px`);
        st.setProperty('--inset-r', `${s.right}px`);
      } else {
        st.removeProperty('--inset-l');
        st.removeProperty('--inset-r');
      }
    }),
  ]) owner.add(off);

  // the `compact` preset: on, off, or automatic below a host size
  let compactOption = o.compact;
  const syncCompact = (): void => {
    if (compactOption !== 'auto') return compact.set(compactOption);
    const r = host.getBoundingClientRect();
    compact.set(!!r.width && (r.width < COMPACT_W || r.height < COMPACT_H));
  };
  owner.add(observeSize(host, syncCompact));
  syncCompact();

  return {
    root, area, slots, live, compact, stackInsets,
    placeAreaSlots() {
      for (const n of AREA_SLOTS) area.append(slots[n]);
    },
    addCss(add) {
      let changed = false;
      for (const c of add) {
        if (!c) continue;
        uses.set(c, (uses.get(c) ?? 0) + 1);
        if (!css.includes(c)) {
          css.push(c);
          changed = true;
        }
      }
      if (changed) adopt();
    },
    removeCss(list) {
      let changed = false;
      for (const c of list) {
        const n = uses.get(c);
        if (!n) continue;
        if (n > 1) {
          uses.set(c, n - 1);
          continue;
        }
        uses.delete(c);
        if (o.css.includes(c)) continue;
        css.splice(css.indexOf(c), 1);
        styleEls.get(c)?.remove();
        styleEls.delete(c);
        changed = true;
      }
      if (changed) adopt();
    },
    insets() {
      const w = root.clientWidth;
      const shown = (slot: HTMLElement): HTMLElement[] =>
        [...slot.children].filter((e): e is HTMLElement => e instanceof HTMLElement && !e.hidden && !!e.offsetParent && !e.classList.contains('drawer') && (!e.classList.contains('mmdx-stack') || e.classList.contains('open')));
      let l = 0, r = 0;
      for (const e of [...shown(slots['left-stack']), ...shown(slots['left-dock'])]) l = Math.max(l, e.offsetLeft + e.offsetWidth);
      for (const e of shown(slots['right-stack'])) if (w) r = Math.max(r, w - e.offsetLeft);
      return { left: l + 8, right: r + 8, top: 56, bottom: 56 };
    },
    setCompact(c) {
      compactOption = c;
      syncCompact();
    },
    destroy() {
      owner.dispose();
      root.remove();
      for (const el of styleEls.values()) el.remove();
      styleEls.clear();
    },
  };
}
