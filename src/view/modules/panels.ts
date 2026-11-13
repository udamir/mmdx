// panelStacks (component architecture §7.1): the left and right panel stacks of the shell. Modules contribute side
// panels (`core.panelItems`); a panel shows while `core.panels()[id]` is true (`setPanel`, remembered per product).
// The stacks are created on first use, keep their widths and splitter heights, collapse when empty, and become
// drawers (one panel at a time over the canvas) on narrow hosts. The open stacks inset the canvas and the chrome
// (`core.stackInsets`, applied by the kernel as `--inset-l` / `--inset-r`).
import { createPanelStack, PANEL_STACK_CSS, type PanelStackHandle } from '../../ui/blocks/panel-stack.js';
import { SIDE_PANEL_CSS } from '../../ui/blocks/side-panel.js';
import { TABS_CSS } from '../../ui/blocks/tabs.js';
import { computed, untracked } from '../../reactive/signal.js';
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
    if (saved && typeof saved === 'object') core.setPanels({ ...saved, ...core.panels.peek() });
    scope.provide('setPanel', (name, open) => {
      if (!!core.panels.peek()[name] === open) return;
      core.setPanels({ [name]: open });
      core.storage.set(key, core.panels.peek());
      core.fire('panels');
    });

    const stacks: Partial<Record<'left' | 'right', PanelStackHandle>> = {};
    let gone = false;
    const syncInsets = (): void => {
      if (gone) return;
      const inset = (side: 'left' | 'right'): number => {
        const w = stacks[side]?.width() ?? 0;
        return w ? w + 12 : 0;
      };
      core.setStackInsets({ left: inset('left'), right: inset('right') });
      core.fire('view');
      if (core.canvas.viewport?.auto) core.run('fitView');
    };
    for (const side of ['left', 'right'] as const) {
      const items = scope.computed(() => core.panelItems().filter((p) => p.side === side).sort((a, b) => a.order - b.order));
      scope.effect(() => {
        const list = items();
        // one open state per panel and run: the next run (or uninstall) disposes this run's
        const opens = list.map((p) => computed(() => !!core.panels()[p.id] && (p.visible?.() ?? true)));
        const panels = list.map((p, i) => ({ id: p.id, panel: p.el, open: opens[i]! }));
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
        return () => opens.forEach((o) => o.dispose());
      });
    }
    scope.effect(() => {
      core.panels();
      core.panelItems();
      queueMicrotask(syncInsets);
    });
    return () => {
      gone = true;
      for (const s of Object.values(stacks)) s?.destroy();
      core.setStackInsets(null);
    };
  },
};
