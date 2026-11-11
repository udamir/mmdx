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
import { I_code, I_layers } from '../../ui/icons.js';
import { signal } from '../../reactive/signal.js';
import type { ViewCore } from '../core.js';
import type { ModuleScope, ViewModule } from '../module.js';
import { registerMessages } from '../../i18n.js';
import { BLOCK_MESSAGES_PANELS } from '../../ui/messages/blocks-panels.js';

const VIEW_SETTINGS_ICON = 'M2.5 11.5C4.6 7.4 8 5.5 12 5.5s7.4 1.9 9.5 6M2.5 11.5c2.1 4.1 5.5 6 9.5 6M12 14.3a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM18.5 20.7a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z';

/** A dock toggle for a panel, and the panel's open state; no shortcut when `keys` is null. */
function panelToggle(scope: ModuleScope<ViewCore>, id: string, o: { icon: string; label: string; keys: string | null; help: string; order: number }): () => void {
  const core = scope.core;
  const t = core.i18n.t;
  const open = scope.computed(() => !!core.panels()[id]);
  const toggle = (): void => void core.run('setPanel', id, !core.panels.peek()[id]);
  const btn = dockButton({ icon: o.icon, label: o.label, ...(o.keys ? { keys: o.keys } : {}), class: `vt-panel vt-${id}`, f: `panel-${id}`, pressed: open, onClick: toggle });
  scope.contribute(core.dockItems, { id, section: 'panels', order: o.order, el: btn.el });
  if (o.keys) scope.shortcut({ id: `panel-${id}`, keys: [o.keys], label: o.help, group: t('help.tools'), run: () => void toggle() });
  return () => btn.destroy();
}

/** `key`, unless a module installed earlier owns it in the View mode (the diff's L is its change list, §13). */
const freeKey = (core: ViewCore, key: string): string | null => (core.shortcuts.list({ mode: 'view', stage: core.stage.peek() }).some((s) => s.keys.includes(key)) ? null : key);

/**
 * View settings: the layers shown and, with `display`, the display toggles. Without them (a diff: what is compared is
 * drawn as it is) the card is "Layers" and lists every layer of the diagram, Default included.
 */
const viewSettings = (o: { display: boolean }): ViewModule<ViewCore> => ({
  id: 'view-settings',
  after: ['panel-stacks'],
  // the card's title says "Layers" already: the list's heading is not repeated
  css: [LAYER_LIST_CSS, '.mmdx-panel.layers-only .mmdx-layers > .mmdx-sect:first-child { display: none; }'],
  enabled: (core) => core.feature('layers'),
  install(scope) {
    registerMessages(BLOCK_MESSAGES_PANELS); // `panel.close` is the side panel block's (one table)
    const core = scope.core;
    const t = core.i18n.t;
    const keys = freeKey(core, 'l');
    const title = o.display ? t('layers.title') : t('layers.layers');
    const offBtn = panelToggle(scope, 'view-settings', { icon: o.display ? VIEW_SETTINGS_ICON : I_layers, label: o.display ? t('tools.viewSettings') : title, keys, help: o.display ? t('help.viewSettings') : title, order: 30 });
    const display = core.display;
    const labels = scope.computed(() => display().labels), hover = scope.computed(() => display().hoverHighlight), animate = scope.computed(() => display().animate);
    const set = (patch: Partial<ReturnType<typeof display.peek>>): void => {
      display.set({ ...display.peek(), ...patch });
    };
    const list = createLayerList({
      layers: [], editable: false,
      onToggle: (id, visible) => {
        const defs = layerDefs(core.run('documentMeta') ?? { canvas: {}, styles: {} });
        const cur = core.visibleLayers.peek();
        const shown = defs.filter((d) => (cur ? cur.includes(d.id) : !d.hidden)).map((d) => d.id);
        core.visibleLayers.set(visible ? [...shown, id] : shown.filter((x) => x !== id));
      },
      display: o.display ? [
        { id: 'labels', label: t('layers.labels'), value: labels, onChange: (v) => set({ labels: v }) },
        { id: 'hover', label: t('layers.hover'), value: hover, onChange: (v) => set({ hoverHighlight: v }) },
        { id: 'animate', label: t('layers.animate'), value: animate, onChange: (v) => set({ animate: v }) },
      ] : [],
      t,
    });
    const rev = signal(0);
    scope.on('draw', () => rev.update((n) => n + 1));
    scope.effect(() => {
      rev();
      const visible = core.visibleLayers();
      const defs = layerDefs(core.run('documentMeta') ?? { canvas: {}, styles: {} });
      // next to the display toggles only a diagram with layers of its own lists them; alone, every layer is listed
      const rows = defs.length > 1 || defs[0]?.hidden || (!o.display && defs.length) ? defs.map((d) => ({ id: d.id, name: d.id === 'default' && d.name === 'Default' ? t('layers.default') : d.name, visible: visible ? visible.includes(d.id) : !d.hidden })) : [];
      list.update({ layers: rows });
    });
    const panel = createSidePanel({
      side: 'right', title, label: title, class: o.display ? 'view-settings' : 'view-settings layers-only', closeLabel: t('panel.close'), ...(keys ? { closeKeys: keys } : {}),
      onClose: () => void core.run('setPanel', 'view-settings', false), body: list.el,
    });
    scope.contribute(core.panelItems, { id: 'view-settings', side: 'right', order: 10, el: panel.el });
    return () => {
      offBtn();
      list.destroy();
      panel.destroy();
    };
  },
});

/** View settings of the viewer: layers and display. */
export const viewSettingsModule: ViewModule<ViewCore> = viewSettings({ display: true });
/** The diff's: layers only (what is compared is drawn as it is). */
export const diffLayersModule: ViewModule<ViewCore> = viewSettings({ display: false });

export const codeViewModule: ViewModule<ViewCore> = {
  id: 'code-view',
  after: ['panel-stacks'],
  css: [CODE_VIEW_CSS],
  enabled: (core) => core.feature('code'),
  install(scope) {
    registerMessages(BLOCK_MESSAGES_PANELS); // `panel.close` is the side panel block's (one table)
    const core = scope.core;
    const t = core.i18n.t;
    const offBtn = panelToggle(scope, 'code-view', { icon: I_code, label: t('tools.codeView'), keys: 'c', help: t('help.codeView'), order: 10 });
    const lines = (): string[] => stripMermaidStyles(core.run('documentCode') ?? '').replace(/\n$/, '').split('\n');
    const view = createCodeView({ mode: 'plain', lines: lines(), language: 'mermaid', label: t('codeView.label'), copy: true, part: 'code', t });
    const body = h('div', { class: 'code-view' }, view.el);
    const rev = signal(0);
    scope.on('draw', () => rev.update((n) => n + 1));
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
