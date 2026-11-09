// Focus kept across re-renders and arrow-key movement (§5.1). Blocks that rebuild their children mark focusable
// controls with `data-f`; after the rebuild, the control with the same key gets the focus back, so keyboard users
// are never dropped out of the component. `rovingKeys` is the one arrow-key handler of every composite widget
// (toolbars, tab lists, lists, menus, radio groups), with the roving tab stop of the ARIA patterns.
import { cancelIdle, idle } from '../../dom/idle.js';

/** The element focused inside `box` (through shadow roots), or null. */
export function focusedIn(box: Element): HTMLElement | null {
  const root = box.getRootNode() as Document | ShadowRoot;
  const active = (root as Document | ShadowRoot).activeElement as HTMLElement | null;
  return active && box.contains(active) ? active : null;
}

/** Runs `render` (which replaces `box`'s content) and moves the focus back to the control with the same `data-f`. */
export function keepFocus(box: HTMLElement, render: () => void): void {
  const active = focusedIn(box);
  const id = active?.getAttribute('data-f') ?? null;
  render();
  if (!id) return;
  const next = [...box.querySelectorAll<HTMLElement>('[data-f]')].find((e) => e.getAttribute('data-f') === id);
  next?.focus({ preventScroll: true });
}

export type Orientation = 'horizontal' | 'vertical' | 'both';

export interface RovingOptions {
  /** Which arrows move: ←/→ (`horizontal`), ↑/↓ (`vertical`) or all four (`both`); a function is read on every key. */
  orientation: Orientation | (() => Orientation);
  /** The items, in order: a selector inside `el`, or a function (called on every key). Disabled and hidden items are skipped. */
  selector: string | ((el: HTMLElement) => HTMLElement[]);
  /** Past the last item back to the first (default true); false stops at the ends. */
  wrap?: boolean;
  /**
   * Roving tab stop: one item has `tabindex=0` (the focused one, else `current()`, else the last stop, else the first),
   * the others -1.
   * Items inside a nested group with its own keys (`[data-roving]`, set by this function) keep their own tab stops.
   */
  roving?: boolean;
  /** The tab stop when none of the items has the focus (e.g. the selected row). */
  current?: (items: HTMLElement[]) => HTMLElement | null | undefined;
  /** Clicks the item moved to (tabs, radios: moving selects). */
  select?: boolean;
  /** Ignore keys from these targets (default: text fields and selects). */
  skip?: (target: HTMLElement) => boolean;
  /** Moves to another item than the next one (e.g. the same column in the next row); null: the default. */
  pick?: (target: HTMLElement, next: HTMLElement, items: HTMLElement[]) => HTMLElement | null;
}

export interface RovingHandle {
  /** Re-applies the roving tab stop (after the items changed). */
  sync(): void;
  /** The items as the keys see them. */
  items(): HTMLElement[];
  destroy(): void;
}

const defaultSkip = (t: HTMLElement): boolean => t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable;

/** Not disabled, not under `[hidden]`, and rendered (where the engine can tell). */
export const usable = (e: HTMLElement): boolean =>
  !(e as HTMLButtonElement).disabled && !e.closest('[hidden]') && (!e.checkVisibility || !e.isConnected || e.checkVisibility());

/**
 * Arrow keys (and Home / End) move the focus through the items of `el`; with `roving`, only one item is in the Tab
 * order. The keys stop at `el` (a surrounding toolbar does not move as well). Returns a handle whose `destroy()`
 * removes the listeners.
 */
export function rovingKeys(el: HTMLElement, o: RovingOptions): RovingHandle {
  const ac = new AbortController();
  const signal = ac.signal;
  const all = (): HTMLElement[] => (typeof o.selector === 'string' ? [...el.querySelectorAll<HTMLElement>(o.selector)] : o.selector(el));
  const items = (): HTMLElement[] => all().filter(usable);
  // items of a nested group with its own keys keep their own tab stops
  const own = (e: HTMLElement): boolean => {
    const g = e.parentElement?.closest('[data-roving]');
    return !g || g === el || !el.contains(g);
  };
  const setStop = (stop: HTMLElement | null | undefined): void => {
    if (o.roving) for (const e of all()) if (own(e)) e.tabIndex = e === stop ? 0 : -1;
  };
  const sync = (): void => {
    const list = items().filter(own);
    const active = focusedIn(el);
    const cur = o.current?.(list);
    setStop((active && list.includes(active) ? active : null) ?? (cur && list.includes(cur) ? cur : null)
      ?? list.find((e) => e.getAttribute('tabindex') === '0') ?? list[0]);
  };

  // a surrounding roving group leaves this group's tab stops alone
  el.setAttribute('data-roving', '');
  if (o.roving) {
    el.addEventListener('focusin', (ev) => {
      const t = ev.target as HTMLElement;
      if (own(t) && all().includes(t)) setStop(t);
    }, { signal });
    // hidden / disabled items change from outside (signals): keep a valid tab stop
    if (typeof MutationObserver !== 'undefined') {
      // checkVisibility forces a layout: one sync when the page is idle (the layout is clean and cheap to read after a
      // paint), however many mutations come meanwhile (a drag updates the panels on every move)
      let queued = 0;
      const mo = new MutationObserver(() => {
        queued ||= idle(() => {
          queued = 0;
          if (!signal.aborted) sync();
        }, 300);
      });
      mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'class'] });
      signal.addEventListener('abort', () => {
        mo.disconnect();
        if (queued) cancelIdle(queued);
      });
    }
  }

  el.addEventListener('keydown', (ev) => {
    const k = ev.key;
    if (ev.altKey || ev.metaKey || ev.ctrlKey || ev.defaultPrevented) return;
    const or = typeof o.orientation === 'function' ? o.orientation() : o.orientation;
    const h = or !== 'vertical', v = or !== 'horizontal';
    const d = (h && k === 'ArrowRight') || (v && k === 'ArrowDown') ? 1 : (h && k === 'ArrowLeft') || (v && k === 'ArrowUp') ? -1 : 0;
    if (!d && k !== 'Home' && k !== 'End') return;
    const target = (ev.composedPath()[0] ?? ev.target) as HTMLElement;
    if ((o.skip ?? defaultSkip)(target)) return;
    const list = items();
    // the item that holds the focus (a key from a control inside an item counts for that item)
    const i = list.findIndex((e) => e.contains(target));
    if (i < 0) return;
    const n = list.length;
    const next = list[k === 'Home' ? 0 : k === 'End' ? n - 1 : o.wrap === false ? Math.max(0, Math.min(n - 1, i + d)) : (i + d + n) % n]!;
    const to = o.pick?.(target, next, list) ?? next;
    ev.preventDefault();
    ev.stopPropagation();
    if (own(to)) setStop(to);
    to.focus();
    if (o.select && to !== target) to.click();
  }, { signal });

  if (o.roving) sync();
  return {
    sync: () => void (o.roving && sync()),
    items,
    destroy() {
      ac.abort();
      el.removeAttribute('data-roving');
    },
  };
}
