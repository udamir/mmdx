// Tabs (§5.2): a tab list (`role=tablist`, `role=tab`, `aria-selected`) with arrow-key movement; the selected tab
// is the only one in the Tab order. Extra elements (a close button) can follow the tabs.
import { h } from '../h.js';
import { read, Scope, type BlockHandle, type Value } from './block.js';

export interface TabsProps<V extends string = string> {
  label: string;
  tabs: readonly { value: V; label: string; title?: string }[];
  value: Value<V>;
  onChange: (value: V) => void;
  /** Elements after the tabs (pushed to the end, e.g. a close button). */
  end?: readonly (HTMLElement | null)[];
  class?: string;
}

export const TABS_CSS = /* css */ `
.mmdx-tabs { display: flex; align-items: center; gap: 2px; min-width: 0; }
.mmdx-tabs > .mmdx-tabs-spacer { flex: 1; }
`;

export function createTabs<V extends string>(props: TabsProps<V>): BlockHandle<TabsProps<V>> {
  let p = { ...props };
  const scope = new Scope();
  let fx = new Scope();
  const el = h('div', { role: 'tablist' });
  scope.on(el, 'keydown', (ev: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    const tabs = [...el.querySelectorAll<HTMLElement>('[role=tab]')];
    const i = tabs.indexOf(ev.target as HTMLElement);
    if (i < 0) return;
    const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    ev.preventDefault();
    const next = tabs[n];
    next?.focus();
    next?.click();
  });
  const render = (): void => {
    fx.dispose();
    fx = new Scope();
    el.className = ['mmdx-tabs', 'tabs', p.class].filter(Boolean).join(' ');
    el.setAttribute('aria-label', p.label);
    const buttons = p.tabs.map((t) => {
      const b = h('button', { type: 'button', role: 'tab', 'data-tab': t.value, 'data-f': `tab-${t.value}`, title: t.title ?? '' }, t.label);
      b.addEventListener('click', () => {
        if (read(p.value) !== t.value) p.onChange(t.value);
      }, { signal: fx.signal });
      return b;
    });
    el.replaceChildren(...buttons, h('span', { class: 'mmdx-tabs-spacer tabs-spacer' }), ...(p.end ?? []).filter((x): x is HTMLElement => !!x));
    const value = p.value;
    fx.effect(() => {
      const v = read(value);
      for (const b of buttons) {
        const on = b.dataset['tab'] === v;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
      }
    });
  };
  render();
  return {
    el,
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
