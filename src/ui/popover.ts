// Popovers and menus inside a shadow root (§10, §13): one open at a time per owner, close on Esc / outside
// pointerdown, focus moves in and returns to the opener, arrow keys move through menu items.

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

  /** Shows `el` (already positioned by the caller's CSS) and wires closing. Toggles if the same opener is used. */
  open(el: HTMLElement, opener: HTMLElement | null, opts: { onClose?: () => void; focus?: boolean } = {}): PopoverHandle {
    if (this.current && opener && this.current.opener === opener) {
      this.close();
      return { el, close: () => undefined };
    }
    this.close();
    const ac = new AbortController();
    const host = this.root instanceof ShadowRoot ? this.root.host : this.root;
    el.classList.add('ds-pop');
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
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        this.close(true);
      } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        const items = Array.from(el.querySelectorAll<HTMLElement>('[role^=menuitem]:not(:disabled), .ds-menu > button:not(:disabled)'));
        if (!items.length) return;
        ev.preventDefault();
        const i = items.indexOf(el.ownerDocument.activeElement === host ? (host.shadowRoot?.activeElement as HTMLElement) : (ev.target as HTMLElement));
        const next = items[(i + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
        next?.focus();
      }
    }, { signal: ac.signal });
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
  constructor(parent: ShadowRoot | HTMLElement) {
    this.host = document.createElement('div');
    this.host.className = 'ds-toast-host';
    this.host.setAttribute('role', 'status');
    this.host.setAttribute('aria-live', 'polite');
    parent.append(this.host);
  }
  show(text: string, opts: { error?: boolean; ms?: number } = {}): void {
    const t = document.createElement('div');
    t.className = 'ds-toast' + (opts.error ? ' error' : '');
    t.textContent = text;
    this.host.append(t);
    setTimeout(() => t.remove(), opts.ms ?? 3200);
    while (this.host.childElementCount > 3) this.host.firstElementChild?.remove();
  }
  destroy(): void {
    this.host.remove();
  }
}
