// pen (component architecture §7.4, §6): the magic pen. One stroke store per component, painted into every canvas
// (the main one, side-by-side panes, every morph state); the Pen tool in the dock, its options in the dock's flyout
// while drawing, P to toggle, Esc to stop. Strokes are cleared when the mode or the stage changes (§8.3).
import { reducedMotion } from '../../dom/motion.js';
import { StrokeStore } from '../../dom/pen.js';
import { dockButton } from '../../ui/blocks/tool-dock.js';
import { createPenOptions, PEN_OPTIONS_CSS } from '../../ui/blocks/pen-options.js';
import { I_pen } from '../../ui/kit/icons.js';
import type { ViewCore } from '../core.js';
import type { ViewModule } from '../module.js';

export const penModule: ViewModule<ViewCore> = {
  id: 'pen',
  css: [PEN_OPTIONS_CSS],
  enabled: (core) => core.feature('pen'),
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const store = new StrokeStore(core.storage, reducedMotion);
    core.strokes.set(store);
    const detach = core.canvas.attachInk(store);
    const defaultTool = (): 'hand' | 'pointer' => (core.mode.peek() === 'edit' ? 'pointer' : 'hand');
    const toggle = (): void => void core.run('setTool', core.tool.peek() === 'pen' ? defaultTool() : 'pen');

    const btn = dockButton({ icon: I_pen, label: t('tools.pen'), keys: 'p', class: 'vt-pen', f: 'tool-pen', pressed: scope.computed(() => core.tool() === 'pen'), onClick: toggle });
    scope.contribute(core.dockItems, { id: 'pen', section: 'tools', order: 40, el: btn.el });
    const opts = createPenOptions({ pen: store, t });
    scope.onDispose(store.subscribe(() => opts.refresh()));

    // the tool drives the pen; its options show in the dock's flyout while drawing
    scope.effect(() => {
      const on = core.tool() === 'pen';
      store.setActive(on);
      if (on) core.dockFlyout.set(opts.el);
      else if (core.dockFlyout.peek() === opts.el) core.dockFlyout.set(null);
    });
    // strokes are never part of a mode or a stage: switching clears them
    let last = `${core.mode.peek()}/${core.stage.peek()}`;
    scope.effect(() => {
      const now = `${core.mode()}/${core.stage()}`;
      if (now === last) return;
      last = now;
      store.clear();
    });

    scope.shortcut(
      { id: 'tool-pen', keys: ['p'], label: t('help.pen'), group: t('help.tools'), run: () => void toggle() },
      { id: 'pen-stop', keys: ['escape'], label: t('help.escTool'), group: t('help.tools'), run: () => (core.tool.peek() === 'pen' ? (toggle(), true) : false) },
    );

    return () => {
      if (core.tool.peek() === 'pen') core.tool.set(defaultTool());
      if (core.dockFlyout.peek() === opts.el) core.dockFlyout.set(null);
      if (core.strokes.peek() === store) core.strokes.set(null);
      detach();
      opts.destroy();
      btn.destroy();
      store.destroy();
    };
  },
};
