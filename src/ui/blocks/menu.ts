// Menu and MenuButton (§5.2): an ARIA menu with sections, ticks (menuitemradio), separators and disabled items,
// opened through the host's PopoverManager (one popover at a time, Esc / outside click closes, arrow keys move,
// focus returns to the opener) and positioned against its opener inside the host element.
import { h } from '../h.js';
import type { PopoverManager } from '../popover.js';
import { Scope, type BlockHandle } from './block.js';

export interface MenuItem {
  label: string;
  title?: string;
  /** A radio item: ticked when true (`menuitemradio`, `aria-checked`). */
  checked?: boolean;
  disabled?: boolean;
  /** Extra class on the item. */
  class?: string;
  run: () => void;
}
export type MenuEntry = MenuItem | { section: string } | 'sep';

export interface MenuProps {
  label: string;
  entries: readonly MenuEntry[];
  class?: string;
  /** Called after an item ran (the opener closes the popover here). */
  onPick?: (item: MenuItem) => void;
  /** `part` of the menu (default none). */
  part?: string;
}

export const MENU_CSS = /* css */ `
.mmdx-menu.mmdx-bmenu { min-width: 210px; padding: 6px; background: var(--mmdx-float); border: 1px solid var(--mmdx-float-line); border-radius: 12px; box-shadow: var(--mmdx-shadow-card); }
.mmdx-bmenu .mmdx-sect { padding: 6px 8px 3px; }
.mmdx-bmenu [role^=menuitem] { color: var(--mmdx-text); border-radius: 7px; padding: 6px 8px; }
.mmdx-bmenu [role^=menuitem]:hover:not(:disabled), .mmdx-bmenu [role^=menuitem]:focus-visible { background: var(--mmdx-float-2); }
.mmdx-bmenu [aria-checked=true] { color: var(--mmdx-accent); font-weight: 600; }
.mmdx-bmenu .mmdx-check { width: 14px; display: inline-block; flex: none; }
.mmdx-bmenu hr { border: 0; border-top: 1px solid var(--mmdx-float-line); margin: 5px 2px; }
`;

export function createMenu(props: MenuProps): BlockHandle<MenuProps> {
  let p = { ...props };
  const scope = new Scope();
  const el = h('div', { role: 'menu' });
  const render = (): void => {
    el.className = ['mmdx-menu', 'mmdx-bmenu', p.class].filter(Boolean).join(' ');
    el.setAttribute('aria-label', p.label);
    if (p.part) el.setAttribute('part', p.part);
    else el.removeAttribute('part');
    const radio = p.entries.some((e) => typeof e === 'object' && 'checked' in e && e.checked !== undefined);
    el.replaceChildren(...p.entries.map((e) => {
      if (e === 'sep') return h('hr', { role: 'separator' });
      if ('section' in e) return h('div', { class: 'mmdx-sect', role: 'presentation' }, e.section);
      const item = h('button', { type: 'button', role: e.checked !== undefined ? 'menuitemradio' : 'menuitem', title: e.title ?? '', tabindex: '-1', disabled: !!e.disabled, class: e.class ?? '' },
        radio ? h('span', { class: 'mmdx-check', 'aria-hidden': 'true' }, e.checked ? '✓' : '') : null, h('span', null, e.label));
      if (e.checked !== undefined) item.setAttribute('aria-checked', String(e.checked));
      item.addEventListener('click', () => {
        p.onPick?.(e);
        e.run();
      }, { signal: scope.signal });
      return item;
    }));
  };
  render();
  return {
    el,
    update(next) {
      p = { ...p, ...next };
      render();
    },
    destroy() {
      scope.dispose();
      el.remove();
    },
  };
}

export interface OpenMenuOptions {
  popovers: PopoverManager;
  opener: HTMLElement;
  label: string;
  entries: readonly MenuEntry[];
  /** The positioned element the menu is placed in (the component's host); default: the opener's offset parent. */
  within?: Element;
  /** Aligns the menu's right edge (default) or left edge with the opener's. */
  align?: 'right' | 'left';
  /** Opens below (default) or above the opener. */
  placement?: 'below' | 'above';
  class?: string;
}

/**
 * Opens a menu under (or above) `opener`; picking an item closes it and returns the focus to the opener. Opening it
 * again from the same opener closes it (nothing is built then).
 */
export function openMenu(o: OpenMenuOptions): void {
  if (o.popovers.isOpenFor(o.opener)) {
    o.popovers.close();
    return;
  }
  const menu = createMenu({ label: o.label, entries: o.entries, ...(o.class ? { class: o.class } : {}), onPick: () => o.popovers.close(true) });
  const box = (o.within ?? o.opener.offsetParent ?? o.opener.parentElement)?.getBoundingClientRect();
  const r = o.opener.getBoundingClientRect();
  if (box) {
    if ((o.placement ?? 'below') === 'below') menu.el.style.top = `${Math.round(r.bottom - box.top + 6)}px`;
    else menu.el.style.bottom = `${Math.round(box.bottom - r.top + 6)}px`;
    if ((o.align ?? 'right') === 'right') menu.el.style.right = `${Math.max(8, Math.round(box.right - r.right))}px`;
    else menu.el.style.left = `${Math.max(8, Math.round(r.left - box.left))}px`;
  }
  o.popovers.open(menu.el, o.opener, { onClose: () => menu.destroy() });
}

export interface MenuButtonProps {
  /** The button (an IconButton's element, or any button). */
  button: HTMLButtonElement;
  popovers: PopoverManager;
  label: string;
  /** Built when the menu opens (so it reflects the current state). */
  entries: () => readonly MenuEntry[];
  within?: () => Element | undefined;
  align?: 'right' | 'left';
  placement?: 'below' | 'above';
  class?: string;
}

/** Wires a button to open a menu (`aria-haspopup`, `aria-expanded`). Returns a cleanup. */
export function attachMenu(p: MenuButtonProps): () => void {
  const scope = new Scope();
  p.button.setAttribute('aria-haspopup', 'menu');
  p.button.setAttribute('aria-expanded', 'false');
  scope.on(p.button, 'click', () => {
    // a second click closes it (the entries are not built for nothing)
    if (p.popovers.isOpenFor(p.button)) {
      p.popovers.close();
      return;
    }
    const within = p.within?.();
    openMenu({
      popovers: p.popovers, opener: p.button, label: p.label, entries: p.entries(),
      ...(within ? { within } : {}), ...(p.align ? { align: p.align } : {}), ...(p.placement ? { placement: p.placement } : {}), ...(p.class ? { class: p.class } : {}),
    });
  });
  return () => scope.dispose();
}
