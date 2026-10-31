// Toolbar (§5.2): a floating bar of buttons, vertical or horizontal, with separators, arrow-key focus movement
// (Home / End too) and the CSS tooltips of `data-tip` placed beside (vertical) or above (horizontal) the bar.
import { h } from '../h.js';
import { read, Scope, type BlockHandle, type Value } from './block.js';

export type ToolbarItem = HTMLElement | 'sep' | null | undefined | false;

export interface ToolbarProps {
  label: string;
  orientation: 'vertical' | 'horizontal';
  items: readonly ToolbarItem[];
  /** Where `data-tip` tooltips open: beside a vertical bar, above a horizontal one (default by orientation). */
  tooltip?: 'side' | 'above';
  /** Smaller, icon-only form (the `compact` preset). */
  compact?: Value<boolean>;
  class?: string;
  part?: string;
  /** Element tag (default div). */
  tag?: 'div' | 'nav';
}

export const TOOLBAR_CSS = /* css */ `
.mmdx-toolbar { position: relative; display: flex; align-items: center; }
.mmdx-toolbar[aria-orientation=vertical] { flex-direction: column; }
.mmdx-toolbar .mmdx-sep { flex: none; background: var(--mmdx-border); }
.mmdx-toolbar[aria-orientation=vertical] .mmdx-sep { width: 30px; height: 1px; margin: 4px 0; }
.mmdx-toolbar[aria-orientation=horizontal] .mmdx-sep { width: 1px; height: 20px; margin: 0 4px; }
.mmdx-toolbar [data-tip] { position: relative; }
.mmdx-toolbar [data-tip]:hover::after {
  content: attr(data-tip); position: absolute; z-index: 60; pointer-events: none; width: max-content; max-width: 280px; white-space: normal; text-align: left;
  background: var(--mmdx-text); color: var(--mmdx-surface); font-size: 12px; font-weight: 500; line-height: 1.4; padding: 4px 8px; border-radius: 6px; box-shadow: var(--mmdx-shadow);
}
.mmdx-toolbar.tip-side [data-tip]:hover::after { left: calc(100% + 10px); top: 50%; transform: translateY(-50%); white-space: nowrap; }
.mmdx-toolbar.tip-above [data-tip]:hover::after { left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%); }
@media (hover: none) { .mmdx-toolbar [data-tip]:hover::after { display: none; } }
`;

export interface ToolbarHandle extends BlockHandle<ToolbarProps> {
  /** Re-renders with new items, keeping the focus on the same control (`data-f`). */
  setItems(items: readonly ToolbarItem[]): void;
}

const focusable = (bar: HTMLElement): HTMLElement[] =>
  [...bar.querySelectorAll<HTMLElement>('button, select, [role=radio], [tabindex="0"]')].filter((e) => !(e as HTMLButtonElement).disabled && !e.closest('[hidden]') && e.closest('.mmdx-toolbar') === bar);

export function createToolbar(props: ToolbarProps): ToolbarHandle {
  let p = { ...props };
  const scope = new Scope();
  const el = h(p.tag ?? 'div', { role: 'toolbar' });
  let compactScope = new Scope();

  // arrow keys move along the bar (the buttons stay in the Tab order: the editor's tool dock never used roving tabindex)
  scope.on(el, 'keydown', (ev: KeyboardEvent) => {
    const vertical = p.orientation === 'vertical';
    const fwd = vertical ? 'ArrowDown' : 'ArrowRight', back = vertical ? 'ArrowUp' : 'ArrowLeft';
    if (![fwd, back, 'Home', 'End'].includes(ev.key) || ev.altKey || ev.metaKey || ev.ctrlKey) return;
    const target = ev.target as HTMLElement;
    if (target.tagName === 'SELECT' || target.tagName === 'INPUT') return;
    const list = focusable(el);
    const i = list.indexOf(target);
    if (i < 0) return;
    const next = ev.key === 'Home' ? list[0] : ev.key === 'End' ? list[list.length - 1] : list[(i + (ev.key === fwd ? 1 : -1) + list.length) % list.length];
    if (!next) return;
    ev.preventDefault();
    ev.stopPropagation();
    next.focus();
  });

  const renderFrame = (): void => {
    el.className = ['mmdx-toolbar', p.class, `tip-${p.tooltip ?? (p.orientation === 'vertical' ? 'side' : 'above')}`].filter(Boolean).join(' ');
    el.setAttribute('aria-label', p.label);
    el.setAttribute('aria-orientation', p.orientation);
    if (p.part) el.setAttribute('part', p.part);
    else el.removeAttribute('part');
    compactScope.dispose();
    compactScope = new Scope();
    const compact = p.compact;
    if (compact !== undefined) compactScope.effect(() => el.classList.toggle('compact', read(compact)));
  };
  const renderItems = (): void => {
    const active = (el.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement | null;
    const f = active && el.contains(active) ? active.getAttribute('data-f') : null;
    el.replaceChildren(...p.items.filter((x): x is HTMLElement | 'sep' => !!x).map((x) => (x === 'sep' ? h('span', { class: 'mmdx-sep', role: 'separator', 'aria-orientation': p.orientation === 'vertical' ? 'horizontal' : 'vertical' }) : x)));
    if (f) [...el.querySelectorAll<HTMLElement>('[data-f]')].find((e) => e.getAttribute('data-f') === f)?.focus({ preventScroll: true });
  };
  renderFrame();
  renderItems();

  return {
    el,
    setItems(items) {
      p = { ...p, items };
      renderItems();
    },
    update(next) {
      p = { ...p, ...next };
      renderFrame();
      if (next?.items) renderItems();
    },
    destroy() {
      compactScope.dispose();
      scope.dispose();
      el.remove();
    },
  };
}
