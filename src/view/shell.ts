// The shell of a component (component architecture §7.1): the shadow root's root element, the canvas area, the named
// slots modules fill, the styles adopted into the shadow root, the insets of the canvas area (what fit() keeps clear
// of, and the `--inset-l` / `--inset-r` of the open panel stacks), and the `compact` preset (§7.6).
import type { Insets } from '../dom/canvas.js';
import { h } from '../ui/h.js';
import { effect, signal, type Signal } from '../ui/signal.js';
import { adoptStyles } from '../ui/styles/base.js';
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

export class Shell {
  /** The root element inside the shadow root. */
  readonly root: HTMLElement;
  /** The canvas area: the canvases and the chrome that floats over them. */
  readonly area: HTMLElement;
  readonly slots: Readonly<Record<SlotName, HTMLElement>>;
  /** Polite live region. */
  readonly live: HTMLElement;
  readonly compact: Signal<boolean> = signal(false);
  /**
   * What the open panel stacks take from the canvas area, left and right (px), applied as `--inset-l` / `--inset-r`;
   * null leaves them to the product's CSS.
   */
  readonly stackInsets: Signal<{ left: number; right: number } | null> = signal<{ left: number; right: number } | null>(null, (a, b) => a === b || (!!a && !!b && a.left === b.left && a.right === b.right));
  private readonly css: string[];
  /** `<style>` elements of engines without adopted stylesheets (each sheet once; removed on destroy). */
  private readonly styleEls = new Map<string, HTMLStyleElement>();
  private compactOption: boolean | 'auto';
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly host: HTMLElement, private readonly shadow: ShadowRoot, o: ShellOptions) {
    this.css = [...o.css];
    this.adopt();
    this.area = h('div', { class: `${o.areaClass} mmdx-area` });
    const mk = (name: SlotName): HTMLElement => h('div', { class: `slot slot-${name}`, dataset: { slot: name } });
    const slots = {} as Record<SlotName, HTMLElement>;
    for (const n of [...AREA_SLOTS, ...ROOT_SLOTS]) slots[n] = mk(n);
    this.slots = slots;
    this.live = h('div', { class: 'mmdx-sr', 'aria-live': 'polite' });
    this.root = h('div', { class: o.root.class, role: o.root.role, tabindex: '0' }, this.area, slots['left-stack'], slots['right-stack'], slots.overlay, this.live);
    if (o.root.label) this.root.setAttribute('aria-label', o.root.label);
    if (o.root.roleDescription) this.root.setAttribute('aria-roledescription', o.root.roleDescription);
    shadow.append(this.root);
    this.compactOption = o.compact;
    this.cleanups.push(effect(() => void this.root.classList.toggle('compact', this.compact())));
    this.cleanups.push(effect(() => {
      const s = this.stackInsets(), st = this.root.style;
      if (s) {
        st.setProperty('--inset-l', `${s.left}px`);
        st.setProperty('--inset-r', `${s.right}px`);
      } else {
        st.removeProperty('--inset-l');
        st.removeProperty('--inset-r');
      }
    }));
    this.watchCompact();
  }

  /** Puts the slots that float over the canvas into the area (after the main canvas, so they paint above it). */
  placeAreaSlots(): void {
    for (const n of AREA_SLOTS) this.area.append(this.slots[n]);
  }

  // ---- styles

  /** Adds CSS to the shadow root (deduplicated by identity). */
  addCss(css: readonly string[]): void {
    let changed = false;
    for (const c of css)
      if (c && !this.css.includes(c)) {
        this.css.push(c);
        changed = true;
      }
    if (changed) this.adopt();
  }

  private adopt(): void {
    const root = this.shadow;
    if (typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in root && 'replaceSync' in CSSStyleSheet.prototype) {
      adoptStyles(root, this.css);
      return;
    }
    for (const c of this.css) {
      if (this.styleEls.has(c)) continue;
      const el = document.createElement('style');
      el.textContent = c;
      root.append(el);
      this.styleEls.set(c, el);
    }
  }

  // ---- layout

  /**
   * Insets of the canvas area that fit() keeps clear: the open panel stacks and the tool dock. Measured from the
   * layout boxes (offsets), not the painted ones, so a panel still sliding in counts where it will be.
   */
  insets(): Insets {
    const w = this.root.clientWidth;
    const shown = (slot: HTMLElement): HTMLElement[] =>
      [...slot.children].filter((e): e is HTMLElement => e instanceof HTMLElement && !e.hidden && !!e.offsetParent && !e.classList.contains('drawer') && (!e.classList.contains('mmdx-stack') || e.classList.contains('open')));
    let l = 0, r = 0;
    for (const e of [...shown(this.slots['left-stack']), ...shown(this.slots['left-dock'])]) l = Math.max(l, e.offsetLeft + e.offsetWidth);
    for (const e of shown(this.slots['right-stack'])) if (w) r = Math.max(r, w - e.offsetLeft);
    return { left: l + 8, right: r + 8, top: 56, bottom: 56 };
  }

  // ---- compact

  setCompact(c: boolean | 'auto'): void {
    this.compactOption = c;
    this.syncCompact();
  }

  private syncCompact(): void {
    if (this.compactOption !== 'auto') {
      this.compact.set(this.compactOption);
      return;
    }
    const r = this.host.getBoundingClientRect();
    this.compact.set(!!r.width && (r.width < COMPACT_W || r.height < COMPACT_H));
  }

  private watchCompact(): void {
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.syncCompact());
      ro.observe(this.host);
      this.cleanups.push(() => ro.disconnect());
    }
    this.syncCompact();
  }

  destroy(): void {
    for (const c of this.cleanups.splice(0).reverse()) c();
    this.root.remove();
    for (const el of this.styleEls.values()) el.remove();
    this.styleEls.clear();
  }
}
