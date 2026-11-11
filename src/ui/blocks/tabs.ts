// Tabs (§5.2): a tab list (`role=tablist`, `role=tab`, `aria-selected`) with arrow-key movement; the selected tab
// is the only one in the Tab order. Extra elements (a close button) can follow the tabs.
import { h } from '../h.js';
import { read, Scope, type BlockHandle, type Value } from './block.js';
import { keepFocus, rovingKeys } from './focus.js';

export interface TabsProps<V extends string = string> {
  label: string;
  /** `id` and `controls` (the id of its `tabpanel`) link a tab with its panel (`aria-controls`, `aria-labelledby`). */
  /** `name`: the accessible name when the label is not one (an icon). */
  tabs: readonly { value: V; label: string; title?: string; name?: string; id?: string; controls?: string }[];
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
  // the selected tab is the tab stop (set below); arrows select as they move
  const keys = rovingKeys(el, { orientation: 'horizontal', selector: '[role=tab]', select: true });
  scope.add(() => keys.destroy());
  const render = (): void => keepFocus(el, () => {
    fx.dispose();
    fx = new Scope();
    el.className = ['mmdx-tabs', 'tabs', p.class].filter(Boolean).join(' ');
    el.setAttribute('aria-label', p.label);
    const buttons = p.tabs.map((t) => {
      const b = h('button', { type: 'button', role: 'tab', 'data-tab': t.value, 'data-f': `tab-${t.value}`, title: t.title ?? '' }, t.label);
      if (t.id) b.id = t.id;
      if (t.name) b.setAttribute('aria-label', t.name);
      if (t.controls) b.setAttribute('aria-controls', t.controls);
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
  });
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
