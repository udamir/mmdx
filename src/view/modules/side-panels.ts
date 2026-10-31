// viewSettings and codeView (component architecture §7.4, §7.6): two side panels of the View mode, toggled from the
// tool dock. View settings is a card in the right stack: the layers shown (a view override, never written to the
// document) and the display toggles (connector labels, hover highlight). The code view is a panel in the left stack:
// the diagram's Mermaid code without the layout metadata and without styling, highlighted, with Copy.
import { layerDefs } from '../../core/layers.js';
import { stripMermaidStyles } from '../../core/strip-styles.js';
import { createCodeView, CODE_VIEW_CSS } from '../../ui/blocks/code-view.js';
import { createLayerList, LAYER_LIST_CSS } from '../../ui/blocks/layer-list.js';
import { createSidePanel } from '../../ui/blocks/side-panel.js';
import { dockButton } from '../../ui/blocks/tool-dock.js';
import { h } from '../../ui/h.js';
import { ICONS } from '../../ui/icons.js';
import { computed, signal } from '../../ui/signal.js';
import type { ViewCore } from '../core.js';
import type { ModuleScope, ViewModule } from '../module.js';

const VIEW_SETTINGS_ICON = 'M2.5 11.5C4.6 7.4 8 5.5 12 5.5s7.4 1.9 9.5 6M2.5 11.5c2.1 4.1 5.5 6 9.5 6M12 14.3a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM18.5 20.7a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z';

/** A dock toggle for a panel, and the panel's open state. */
function panelToggle(scope: ModuleScope<ViewCore>, id: string, o: { icon: string; label: string; keys: string; help: string; order: number }): () => void {
  const core = scope.core;
  const t = core.i18n.t;
  const open = computed(() => !!core.panels()[id]);
  const toggle = (): void => void core.run('setPanel', id, !core.panels.peek()[id]);
  const btn = dockButton({ icon: o.icon, label: o.label, keys: o.keys, class: `vt-panel vt-${id}`, f: `panel-${id}`, pressed: open, onClick: toggle });
  scope.contribute(core.dockItems, { id, section: 'panels', order: o.order, el: btn.el });
  scope.shortcut({ id: `panel-${id}`, keys: [o.keys], label: o.help, group: t('help.tools'), run: () => void toggle() });
  return () => btn.destroy();
}

export const viewSettingsModule: ViewModule<ViewCore> = {
  id: 'view-settings',
  after: ['panel-stacks'],
  css: [LAYER_LIST_CSS],
  enabled: (core) => core.feature('layers'),
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const offBtn = panelToggle(scope, 'view-settings', { icon: VIEW_SETTINGS_ICON, label: t('tools.viewSettings'), keys: 'l', help: t('help.viewSettings'), order: 30 });
    const display = core.display;
    const labels = computed(() => display().labels), hover = computed(() => display().hoverHighlight);
    const set = (patch: Partial<ReturnType<typeof display.peek>>): void => {
      display.set({ ...display.peek(), ...patch });
      core.invalidate();
    };
    const list = createLayerList({
      layers: [], editable: false,
      onToggle: (id, visible) => {
        const defs = layerDefs(core.run('documentMeta') ?? { canvas: {}, styles: {} });
        const cur = core.visibleLayers.peek();
        const shown = defs.filter((d) => (cur ? cur.includes(d.id) : !d.hidden)).map((d) => d.id);
        core.visibleLayers.set(visible ? [...shown, id] : shown.filter((x) => x !== id));
        core.invalidate();
      },
      display: [
        { id: 'labels', label: t('layers.labels'), value: labels, onChange: (v) => set({ labels: v }) },
        { id: 'hover', label: t('layers.hover'), value: hover, onChange: (v) => set({ hoverHighlight: v }) },
      ],
      t,
    });
    const rev = signal(0);
    scope.onDispose(core.on('draw', () => rev.update((n) => n + 1)));
    scope.effect(() => {
      rev();
      const visible = core.visibleLayers();
      const defs = layerDefs(core.run('documentMeta') ?? { canvas: {}, styles: {} });
      // only a diagram with layers of its own lists them
      const rows = defs.length > 1 || defs[0]?.hidden ? defs.map((d) => ({ id: d.id, name: d.id === 'default' && d.name === 'Default' ? t('layers.default') : d.name, visible: visible ? visible.includes(d.id) : !d.hidden })) : [];
      list.update({ layers: rows });
    });
    const panel = createSidePanel({
      side: 'right', title: t('layers.title'), label: t('layers.title'), class: 'view-settings', closeLabel: t('panel.close'), closeKeys: 'l',
      onClose: () => void core.run('setPanel', 'view-settings', false), body: list.el,
    });
    scope.contribute(core.panelItems, { id: 'view-settings', side: 'right', order: 10, el: panel.el });
    return () => {
      offBtn();
      list.destroy();
      panel.destroy();
    };
  },
};

export const codeViewModule: ViewModule<ViewCore> = {
  id: 'code-view',
  after: ['panel-stacks'],
  css: [CODE_VIEW_CSS],
  enabled: (core) => core.feature('code'),
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const offBtn = panelToggle(scope, 'code-view', { icon: ICONS.code, label: t('tools.codeView'), keys: 'c', help: t('help.codeView'), order: 10 });
    const lines = (): string[] => stripMermaidStyles(core.run('documentCode') ?? '').replace(/\n$/, '').split('\n');
    const view = createCodeView({ mode: 'plain', lines: lines(), language: 'mermaid', label: t('codeView.label'), copy: true, part: 'code', t });
    const body = h('div', { class: 'code-view' }, view.el);
    const rev = signal(0);
    scope.onDispose(core.on('draw', () => rev.update((n) => n + 1)));
    scope.effect(() => {
      rev();
      if (core.panels()['code-view']) view.update({ lines: lines() });
    });
    const panel = createSidePanel({
      side: 'left', title: t('codeView.label'), label: t('codeView.label'), class: 'code-panel', closeLabel: t('panel.close'), closeKeys: 'c',
      onClose: () => void core.run('setPanel', 'code-view', false), body,
    });
    scope.contribute(core.panelItems, { id: 'code-view', side: 'left', order: 20, el: panel.el });
    return () => {
      offBtn();
      view.destroy();
      panel.destroy();
    };
  },
};
