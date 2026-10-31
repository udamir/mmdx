// panelStacks (component architecture §7.1): the left and right panel stacks of the shell. Modules contribute side
// panels (`core.panelItems`); a panel shows while `core.panels()[id]` is true (`setPanel`, remembered per product).
// The stacks are created on first use, keep their widths and splitter heights, collapse when empty, and become
// drawers (one panel at a time over the canvas) on narrow hosts. The open stacks inset the canvas and the chrome
// (`--inset-l`, `--inset-r`).
import { createPanelStack, PANEL_STACK_CSS, type PanelStackHandle } from '../../ui/blocks/panel-stack.js';
import { SIDE_PANEL_CSS } from '../../ui/blocks/side-panel.js';
import { TABS_CSS } from '../../ui/blocks/tabs.js';
import { computed, untracked } from '../../ui/signal.js';
import type { ViewCore } from '../core.js';
import type { ViewModule } from '../module.js';

/** Below this host width a stack shows one panel at a time, as a drawer over the canvas (§8.2 small hosts). */
const DRAWER_BELOW = 640;
const MIN_CANVAS = 320;
const WIDTH = { left: { initial: 360, min: 220, max: 900 }, right: { initial: 300, min: 220, max: 640 } } as const;

export const panelStacksModule: ViewModule<ViewCore> = {
  id: 'panel-stacks',
  css: [PANEL_STACK_CSS, SIDE_PANEL_CSS, TABS_CSS],
  install(scope) {
    const core = scope.core;
    const key = `${core.product}.panels`;
    const saved = core.storage.get<Record<string, boolean>>(key);
    if (saved && typeof saved === 'object') core.panels.set({ ...saved, ...core.panels.peek() });
    core.provide('setPanel', (name, open) => {
      if (!!core.panels.peek()[name] === open) return;
      core.panels.set({ ...core.panels.peek(), [name]: open });
      core.storage.set(key, core.panels.peek());
      core.fire('panels');
    });

    const stacks: Partial<Record<'left' | 'right', PanelStackHandle>> = {};
    const syncInsets = (): void => {
      for (const side of ['left', 'right'] as const) {
        const w = stacks[side]?.width() ?? 0;
        core.root.style.setProperty(side === 'left' ? '--inset-l' : '--inset-r', `${w ? w + 12 : 0}px`);
      }
      core.fire('view');
      if (core.canvas.viewport?.auto) core.run('fitView');
    };
    for (const side of ['left', 'right'] as const) {
      const items = computed(() => core.panelItems().filter((p) => p.side === side).sort((a, b) => a.order - b.order));
      scope.effect(() => {
        const list = items();
        const panels = list.map((p) => ({ id: p.id, panel: p.el, open: computed(() => !!core.panels()[p.id]) }));
        untracked(() => {
          let stack = stacks[side];
          if (!stack && !list.length) return;
          if (!stack) {
            const w = WIDTH[side];
            stack = stacks[side] = createPanelStack({
              side, panels, storage: core.storage, storageKey: `${core.product}.stack.${side}`,
              width: { initial: w.initial, min: w.min, max: () => Math.min(w.max, (core.root.getBoundingClientRect().width || 1e4) - MIN_CANVAS) },
              drawerBelow: DRAWER_BELOW, container: core.host, onChange: syncInsets, part: 'panel', t: core.i18n.t,
            });
            scope.slot(`${side}-stack`).append(stack.el);
          } else stack.update({ panels });
        });
      });
    }
    scope.effect(() => {
      core.panels();
      core.panelItems();
      queueMicrotask(syncInsets);
    });
    return () => {
      for (const s of Object.values(stacks)) s?.destroy();
      core.root.style.removeProperty('--inset-l');
      core.root.style.removeProperty('--inset-r');
    };
  },
};
