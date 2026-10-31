// Disclosure (§5.2): a collapsible section — a head button (`aria-expanded`, `aria-controls`) with a caret, a title
// and an optional badge, over a body region that is filled the first time it opens (lazy content). The open state can
// be a signal; the host keeps it (e.g. which cards of the theme editor stay open across re-renders).
import { h } from '../h.js';
import { untracked } from '../signal.js';
import { read, Scope, type BlockHandle, type Value } from './block.js';

export interface DisclosureProps {
  title: string;
  open: Value<boolean>;
  /** The head was clicked: the host flips `open` (a plain `open` is flipped by the block itself). */
  onToggle?: (open: boolean) => void;
  /** Builds the body the first time it is shown (again after `update()` replaced it). */
  fill?: (body: HTMLElement) => void;
  /** A short text after the title (e.g. "3 changed"); empty or absent: none. */
  badge?: string | null;
  /** Id of the body (for `aria-controls`); default: generated. */
  id?: string;
  class?: string;
  headClass?: string;
  bodyClass?: string;
  /** Extra attributes of the head button (e.g. a `data-` key the host finds it by). */
  headAttrs?: Record<string, string>;
}

export interface DisclosureHandle extends BlockHandle<DisclosureProps> {
  readonly head: HTMLButtonElement;
  readonly body: HTMLElement;
  /** True while the body shows. */
  isOpen(): boolean;
}

export const DISCLOSURE_CSS = /* css */ `
.mmdx-disclosure-head { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; }
.mmdx-disclosure-caret { flex: none; width: 12px; color: var(--mmdx-muted); }
.mmdx-disclosure-badge { margin-left: auto; font-size: 11px; font-weight: 500; color: var(--mmdx-accent); background: var(--mmdx-accent-2); border-radius: 10px; padding: 1px 8px; }
`;

let seq = 0;

export function createDisclosure(props: DisclosureProps): DisclosureHandle {
  let p = { ...props };
  const scope = new Scope();
  let fx = new Scope();
  const caret = h('span', { class: 'mmdx-disclosure-caret', 'aria-hidden': 'true' });
  const label = h('span', { class: 'mmdx-disclosure-title' });
  const badge = h('span', { class: 'mmdx-disclosure-badge' });
  const head = h('button', { type: 'button' }, caret, label, badge);
  const body = h('div');
  const el = h('div', null, head, body);
  // a plain `open` is the block's own state
  let own = false;
  let filled = false;
  const isOpen = (): boolean => (typeof p.open === 'function' ? p.open.peek() : own);
  const show = (open: boolean): void => {
    body.hidden = !open;
    caret.textContent = open ? '▾' : '▸';
    head.setAttribute('aria-expanded', String(open));
    if (open && !filled) {
      filled = true;
      // the body's own reads are not this block's dependencies
      untracked(() => p.fill?.(body));
    }
  };
  scope.on(head, 'click', () => {
    const next = !isOpen();
    if (typeof p.open !== 'function') {
      own = next;
      show(next);
    }
    p.onToggle?.(next);
  });

  const render = (): void => {
    fx.dispose();
    fx = new Scope();
    el.className = ['mmdx-disclosure', p.class].filter(Boolean).join(' ');
    head.className = ['mmdx-disclosure-head', p.headClass].filter(Boolean).join(' ');
    body.className = ['mmdx-disclosure-body', p.bodyClass].filter(Boolean).join(' ');
    for (const [k, v] of Object.entries(p.headAttrs ?? {})) head.setAttribute(k, v);
    label.textContent = p.title;
    badge.textContent = p.badge ?? '';
    badge.hidden = !p.badge;
    body.id = p.id ?? (body.id || `mmdx-disclosure-${++seq}`);
    head.setAttribute('aria-controls', body.id);
    body.replaceChildren();
    filled = false;
    if (typeof p.open !== 'function') own = p.open;
    const open = p.open;
    fx.effect(() => show(read(open)));
  };
  render();

  return {
    el,
    head,
    body,
    isOpen,
    update(next) {
      p = { ...p, ...next };
      render();
    },
    destroy() {
      fx.dispose();
      scope.dispose();
      el.remove();
    },
  };
}
