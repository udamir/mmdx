// Popovers and menus inside a shadow root (§10, §13): one open at a time per owner, close on Esc / outside
// pointerdown, focus moves in and returns to the opener, arrow keys move through menu items.
import { rovingKeys } from './blocks/focus.js';

export interface PopoverHandle {
  el: HTMLElement;
  close(): void;
}

export class PopoverManager {
  private current: { el: HTMLElement; opener: HTMLElement | null; onClose?: () => void; ac: AbortController } | null = null;

  constructor(private readonly root: ShadowRoot | HTMLElement) {}

  get isOpen(): boolean {
    return this.current !== null;
  }

  /** True while the popover opened from `opener` shows (opening again from it toggles it closed). */
  isOpenFor(opener: HTMLElement): boolean {
    return this.current?.opener === opener;
  }

  /**
   * Shows `el` (already positioned by the caller's CSS) and wires closing. Toggles if the same opener is used: the open
   * popover closes and `el` is not shown, so its `onClose` runs at once (the caller's cleanup of `el`).
   */
  open(el: HTMLElement, opener: HTMLElement | null, opts: { onClose?: () => void; focus?: boolean; trap?: boolean } = {}): PopoverHandle {
    if (this.current && opener && this.current.opener === opener) {
      this.close();
      opts.onClose?.();
      return { el, close: () => undefined };
    }
    this.close();
    const ac = new AbortController();
    const host = this.root instanceof ShadowRoot ? this.root.host : this.root;
    el.classList.add('mmdx-pop');
    if (!el.parentNode) (this.root instanceof ShadowRoot ? this.root : this.root).append(el);
    opener?.setAttribute('aria-expanded', 'true');
    const c: NonNullable<PopoverManager['current']> = { el, opener, ac };
    if (opts.onClose) c.onClose = opts.onClose;
    this.current = c;
    const doc = host.ownerDocument;
    doc.addEventListener('pointerdown', (ev) => {
      const path = ev.composedPath();
      if (path.includes(el) || (opener && path.includes(opener))) return;
      this.close();
    }, { capture: true, signal: ac.signal });
    el.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      this.close(true);
    }, { signal: ac.signal });
    // a dialog keeps Tab inside it (the pickers): past the last control back to the first, and the other way round
    if (opts.trap)
      el.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Tab') return;
        const all = [...el.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')].filter((x) => x.tabIndex >= 0 && !(x as HTMLButtonElement).disabled && !x.closest('[hidden]'));
        if (!all.length) return;
        const root = el.getRootNode() as Document | ShadowRoot;
        const at = all.indexOf(root.activeElement as HTMLElement);
        const next = ev.shiftKey ? (at <= 0 ? all.length - 1 : -1) : at === all.length - 1 || at < 0 ? 0 : -1;
        if (next < 0) return;
        ev.preventDefault();
        all[next]!.focus();
      }, { signal: ac.signal });
    // up / down (Home / End) move through the menu items
    const keys = rovingKeys(el, { orientation: 'vertical', selector: '[role^=menuitem], .mmdx-menu > button' });
    ac.signal.addEventListener('abort', () => keys.destroy());
    if (opts.focus !== false)
      queueMicrotask(() => el.querySelector<HTMLElement>('[role^=menuitem]:not(:disabled), button:not(:disabled), input, select')?.focus());
    return { el, close: () => this.close() };
  }

  close(returnFocus = false): void {
    const c = this.current;
    if (!c) return;
    this.current = null;
    c.ac.abort();
    c.el.remove();
    c.opener?.setAttribute('aria-expanded', 'false');
    if (returnFocus) c.opener?.focus();
    c.onClose?.();
  }
}

/** Short-lived messages (refused actions, confirmations). Polite live region for screen readers. */
export class Toaster {
  private readonly host: HTMLElement;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(parent: ShadowRoot | HTMLElement) {
    this.host = document.createElement('div');
    this.host.className = 'mmdx-toast-host';
    this.host.setAttribute('role', 'status');
    this.host.setAttribute('aria-live', 'polite');
    parent.append(this.host);
  }
  show(text: string, opts: { error?: boolean; ms?: number } = {}): void {
    const t = document.createElement('div');
    t.className = 'mmdx-toast' + (opts.error ? ' error' : '');
    t.textContent = text;
    this.host.append(t);
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      t.remove();
    }, opts.ms ?? 3200);
    this.timers.add(timer);
    while (this.host.childElementCount > 3) this.host.firstElementChild?.remove();
  }
  destroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.host.remove();
  }
}
