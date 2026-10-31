// Toolbar (§5.2): a floating bar of buttons, vertical or horizontal, with separators, arrow-key focus movement
// (Home / End too) with a roving tab stop (the bar is one stop in the Tab order; a nested radio group keeps its own)
// and the CSS tooltips of `data-tip` placed beside (vertical) or above (horizontal) the bar.
import { h } from '../h.js';
import { read, Scope, type BlockHandle, type Value } from './block.js';
import { keepFocus, rovingKeys } from './focus.js';

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

/** The controls of this bar (not of a toolbar nested in it). */
const FOCUSABLE = 'button, select, input, [role=radio], [role=tab]';
const controls = (bar: HTMLElement): HTMLElement[] =>
  [...bar.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.closest('.mmdx-toolbar') === bar);

export function createToolbar(props: ToolbarProps): ToolbarHandle {
  let p = { ...props };
  const scope = new Scope();
  const el = h(p.tag ?? 'div', { role: 'toolbar' });
  let compactScope = new Scope();

  // arrow keys move along the bar; only the last focused control (else the first) is in the Tab order
  const keys = rovingKeys(el, { orientation: () => p.orientation, selector: controls, roving: true, skip: (x) => x.tagName === 'INPUT' || x.tagName === 'SELECT' });
  scope.add(() => keys.destroy());

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
    keepFocus(el, () => el.replaceChildren(...p.items.filter((x): x is HTMLElement | 'sep' => !!x).map((x) => (x === 'sep' ? h('span', { class: 'mmdx-sep', role: 'separator', 'aria-orientation': p.orientation === 'vertical' ? 'horizontal' : 'vertical' }) : x))));
    keys.sync();
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
