// The editor's panel stacks (A.2 row 21; component architecture §7.1): the panel modules contribute SidePanels to
// `core.panelItems` — the Code panel on the left, Properties and Layers on the right — and this module shows them in
// two PanelStacks (splitter between Properties and Layers, inner-edge width grip, slide out when empty), provides
// `setPanel` (open panels remembered under `panels`) and insets the canvas and the chrome by the open stacks
// (`core.stackInsets`). The right stack is narrower in View mode, where only Layers (View settings) shows. Sizes keep
// the keys the editor always used: the widths in `panes`, the Layers height in `layersH`.
//
// The kernel's `panelStacks` module (view/modules/panels.ts) does the same for the viewer and the diff, under
// per-product keys. These stacks stay while History shows a comparison (its panels go into them, at the same widths).
import type { StorageAdapter } from '../../../ports.js';
import { createPanelStack, PANEL_STACK_CSS, type PanelStackHandle, type StackStorage } from '../../../ui/blocks/panel-stack.js';
import { SIDE_PANEL_CSS } from '../../../ui/blocks/side-panel.js';
import { TABS_CSS } from '../../../ui/blocks/tabs.js';
import { computed, untracked } from '../../../reactive/signal.js';
import type { EditorModule } from '../../module.js';

type StackKey = 'left' | 'right' | 'right-view';

/** Per stack: the remembered width's key in `panes`, then the initial, min and max width. */
const WIDTH: Record<StackKey, readonly [string, number, number, number]> = {
  left: ['--left-w', 360, 220, 760], right: ['--right-w', 340, 240, 640], 'right-view': ['--right-vw', 260, 200, 520],
};
/** Room always left for the canvas. */
const MIN_CANVAS = 360;

/** The stacks' remembered sizes (`<stack>.w`, `<stack>.h`) under the editor's keys: `panes` widths and `layersH`. */
function paneStorage(st: StorageAdapter): StackStorage {
  const parse = (key: string): [StackKey, string] => {
    const i = key.lastIndexOf('.');
    return [key.slice(0, i) as StackKey, key.slice(i + 1)];
  };
  const widths = (): Record<string, number> => {
    const v = st.get<Record<string, number>>('panes');
    return v && typeof v === 'object' ? { ...v } : {};
  };
  return {
    get<T>(key: string): T | null {
      const [k, f] = parse(key);
      const [name, , lo, hi] = WIDTH[k];
      if (f === 'w') {
        const w = widths()[name];
        return (typeof w === 'number' && Number.isFinite(w) ? Math.round(Math.max(lo, Math.min(hi, w))) : null) as T | null;
      }
      const lh = k === 'right' ? st.get<number>('layersH') : null;
      return (typeof lh === 'number' && lh > 0 ? { layers: lh } : null) as T | null;
    },
    set(key, value) {
      const [k, f] = parse(key);
      if (f === 'w') st.set('panes', { ...widths(), [WIDTH[k][0]]: value });
      else if (k === 'right') {
        const lh = (value as Record<string, number> | null)?.['layers'];
        if (typeof lh === 'number') st.set('layersH', lh);
        else st.remove('layersH');
      }
    },
    remove(key) {
      const [k, f] = parse(key);
      if (f === 'w') {
        const w = widths();
        delete w[WIDTH[k][0]];
        st.set('panes', w);
      } else if (k === 'right') st.remove('layersH');
    },
  };
}

export const panesModule: EditorModule = {
  id: 'panes',
  css: [PANEL_STACK_CSS, SIDE_PANEL_CSS, TABS_CSS],
  install(scope) {
    const core = scope.core;
    scope.provide('setPanel', (name, open) => {
      if (core.panels.peek()[name] === open) return;
      core.panels.set({ ...core.panels.peek(), [name]: open });
      core.storage.set('panels', core.panels.peek());
      core.fire('panels');
      core.fire('view');
    });

    const storage = paneStorage(core.storage);
    const stacks: Partial<Record<'left' | 'right', PanelStackHandle>> = {};
    let gone = false;
    const syncInsets = (): void => {
      if (gone || !scope.active) return;
      const inset = (side: 'left' | 'right'): number => {
        const w = stacks[side]?.width() ?? 0;
        return w ? w + 12 : 0;
      };
      core.stackInsets.set({ left: inset('left'), right: inset('right') });
      core.fire('view');
    };
    for (const side of ['left', 'right'] as const) {
      const items = scope.computed(() => core.panelItems().filter((p) => p.side === side).sort((a, b) => a.order - b.order));
      scope.effect(() => {
        const list = items();
        const key: StackKey = side === 'right' && core.mode() === 'view' ? 'right-view' : side;
        // one open state per panel and run: the next run (or uninstall) disposes this run's
        const opens = list.map((p) => computed(() => !!core.panels()[p.id] && (p.visible?.() ?? true)));
        const panels = list.map((p, i) => ({ id: p.id, panel: p.el, open: opens[i]! }));
        const [, initial, min, hi] = WIDTH[key];
        const width = { initial, min, max: () => Math.max(min, Math.min(hi, (core.root.getBoundingClientRect().width || 1e4) - MIN_CANVAS)) };
        untracked(() => {
          let stack = stacks[side];
          if (!stack && !list.length) return;
          if (!stack) {
            stack = stacks[side] = createPanelStack({ side, panels, storage, storageKey: key, width, onChange: syncInsets, part: 'panel', t: core.i18n.t });
            scope.slot(`${side}-stack`).append(stack.el);
          } else stack.update({ panels, storageKey: key, width });
        });
        return () => opens.forEach((o) => o.dispose());
      });
    }
    scope.effect(() => {
      core.panels();
      core.panelItems();
      core.mode();
      queueMicrotask(syncInsets);
    });
    return () => {
      gone = true;
      for (const s of Object.values(stacks)) s?.destroy();
      core.stackInsets.set(null);
    };
  },
};
