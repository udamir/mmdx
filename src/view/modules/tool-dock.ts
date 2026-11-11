// toolDock and pan (component architecture §7.4). The tool dock renders the buttons modules contribute
// (`core.dockItems`: tools, panel toggles, the editor's undo card) and the options flyout (`core.dockFlyout`, e.g. the
// pen options) in the left-dock slot; it is not shown while nothing is in it. The pan module adds the Hand tool
// (H) and Esc back to it.
import { createToolDock, dockButton, TOOL_DOCK_CSS, type ToolDockGroup } from '../../ui/blocks/tool-dock.js';
import { I_hand } from '../../ui/kit/icons.js';
import type { ViewCore } from '../core.js';
import type { ViewModule } from '../module.js';
import type { DockItem } from '../types.js';

const bySection = (items: readonly DockItem[], s: DockItem['section']): HTMLElement[] =>
  items.filter((i) => i.section === s).sort((a, b) => a.order - b.order).map((i) => i.el);

export const toolDockModule: ViewModule<ViewCore> = {
  id: 'tool-dock',
  css: [TOOL_DOCK_CSS],
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const groups = scope.computed((): ToolDockGroup[] => {
      const items = core.dockItems();
      const tools = bySection(items, 'tools'), panels = bySection(items, 'panels'), edit = bySection(items, 'edit');
      const main: (HTMLElement | 'sep')[] = [...tools];
      if (tools.length && panels.length) main.push('sep');
      main.push(...panels);
      const out: ToolDockGroup[] = [{ id: 'tools', items: main }];
      if (edit.length) out.push({ id: 'undo', label: t('tools.history'), items: edit, class: 'edit-only no-version' });
      return out;
    });
    const dock = createToolDock({ label: t('tools.title'), groups: groups.peek(), flyout: core.dockFlyout.peek(), compact: core.compact });
    scope.slot('left-dock').append(dock.el);
    scope.effect(() => {
      const g = groups();
      dock.update({ groups: g });
      dock.el.hidden = !g.some((x) => x.items.length);
    });
    scope.effect(() => dock.setFlyout(core.dockFlyout()));
    return () => dock.destroy();
  },
};

/** The Hand tool: drag pans. The viewer shows it only next to other tools (the pen). */
export const panModule: ViewModule<ViewCore> = {
  id: 'pan',
  enabled: (core) => core.product !== 'viewer' || core.feature('pen'),
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const hand = dockButton({
      icon: I_hand, label: t('tools.hand'), keys: 'h', class: 'vt-hand', f: 'tool-hand',
      pressed: scope.computed(() => core.tool() === 'hand'), onClick: () => core.run('setTool', 'hand'),
    });
    scope.contribute(core.dockItems, { id: 'hand', section: 'tools', order: 20, el: hand.el });
    if (!core.has('setTool')) scope.provide('setTool', (tool) => core.tool.set(tool));
    // H, unless a module installed earlier owns it (the editor's canvas)
    if (!core.shortcuts.list({ mode: 'edit' }).some((s) => s.keys.includes('h')))
      scope.shortcut({ id: 'tool-hand', keys: ['h'], label: t('help.hand'), group: t('help.tools'), run: () => void core.run('setTool', 'hand') });
    scope.shortcut(
      {
        id: 'tool-default', keys: ['escape'], label: t('help.escTool'), group: t('help.tools'), when: { mode: ['view'] },
        run: () => {
          if (core.tool.peek() === 'hand') return false;
          core.run('setTool', 'hand');
          return true;
        },
      },
    );
    return () => hand.destroy();
  },
};
