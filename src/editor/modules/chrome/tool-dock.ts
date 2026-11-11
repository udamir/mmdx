// The editor's tools in the kernel's tool dock (A.2 rows 16, 26; prototype app `setTool`, `syncViewTools`,
// `toggleCodePanel`): Pointer and Shapes, the Code / Properties / Layers panel toggles (Layers is View settings in
// View mode), and the Undo / Redo card with disabled state and "Undo <label>" tooltips. Hand and the magic pen come
// from the standard `pan` and `pen` modules; the dock itself is the standard `toolDock`. Edit-only tools hide in
// View mode. Shortcuts V, C, I, L, Esc (back to the default tool). Provides `setTool` with the editor's rules.
import { editKind } from '../../kinds/registry.js';
import { dockBadge, dockButton } from '../../../ui/blocks/tool-dock.js';
import { icon } from '../../../ui/h.js';
import { I_code, I_layers, I_pointer, I_props, I_redo, I_shapes, I_undo } from '../../../ui/icons.js';
import { computed } from '../../../reactive/signal.js';
import type { Tool } from '../../core.js';
import type { EditorModule } from '../../module.js';

export const EDITOR_TOOLS_CSS = /* css */ `
.mode-edit .view-only { display: none !important; }
[data-stage=version] .no-version { display: none !important; }
`;

const VIEW_SETTINGS_ICON = 'M2.5 11.5C4.6 7.4 8 5.5 12 5.5s7.4 1.9 9.5 6M2.5 11.5c2.1 4.1 5.5 6 9.5 6M12 14.3a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM18.5 20.7a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z';

export const editorToolsModule: EditorModule = {
  id: 'editor-tools',
  css: [EDITOR_TOOLS_CSS],
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const f = core.features;
    const defaultTool = (): Tool => (core.mode.peek() === 'edit' ? 'pointer' : 'hand');

    /** Switches tools; panning or drawing edits nothing, so the selection and group editing are dropped. */
    const setTool = (tool: Tool): void => {
      if (tool === 'pointer' && core.mode.peek() !== 'edit') tool = 'hand';
      if (tool === 'pen' && !f.pen) return;
      if (tool !== 'pointer' && (core.selection().length || core.enteredGroup.peek())) {
        core.enteredGroup.set(null);
        core.select([]);
        core.draw();
      }
      core.setTool(tool);
    };
    core.provide('setTool', setTool);

    const toolOn = (tool: Tool) => computed(() => core.tool() === tool);
    const pointer = dockButton({ icon: I_pointer, label: t('tools.pointer'), keys: 'v', class: 'edit-only', f: 'tool-pointer', pressed: toolOn('pointer'), attrs: { 'data-tool': 'pointer' }, onClick: () => setTool('pointer') });
    const shapes = dockButton({ icon: I_shapes, label: t('tools.shapes'), keys: 's', class: 'edit-only no-version vt-shapes', f: 'tool-shapes', attrs: { 'aria-haspopup': 'menu' }, onClick: () => core.run('toggleShapesMenu', shapes.el) });
    const panelOn = (name: 'code' | 'properties' | 'layers') => computed(() => core.panels()[name]);
    const codeBtn = f.codePanel ? dockButton({ icon: I_code, label: t('tools.code'), keys: 'c', class: 'edit-only vt-code', f: 'panel-code', pressed: panelOn('code'), onClick: () => void core.run('setPanel', 'code', !core.panels.peek().code) }) : null;
    const propsBtn = f.properties ? dockButton({ icon: I_props, label: t('tools.props'), keys: 'i', class: 'edit-only no-version vt-props', f: 'panel-props', pressed: panelOn('properties'), onClick: () => void core.run('setPanel', 'properties', !core.panels.peek().properties) }) : null;
    // Layers in Edit mode, View settings in View mode (the same right-hand card)
    const layersBtn = f.layers ? dockButton({ icon: I_layers, label: t('tools.layers'), keys: 'l', class: 'vt-layers', f: 'panel-layers', pressed: panelOn('layers'), onClick: () => void core.run('setPanel', 'layers', !core.panels.peek().layers) }) : null;
    if (layersBtn) {
      const v = icon(VIEW_SETTINGS_ICON, 19);
      v.classList.add('view-only');
      layersBtn.el.firstElementChild?.classList.add('edit-only');
      layersBtn.el.prepend(v);
    }
    scope.contribute(core.dockItems, { id: 'pointer', section: 'tools', order: 10, el: pointer.el });
    scope.contribute(core.dockItems, { id: 'shapes', section: 'tools', order: 30, el: shapes.el });
    if (codeBtn) scope.contribute(core.dockItems, { id: 'code', section: 'panels', order: 10, el: codeBtn.el });
    if (propsBtn) scope.contribute(core.dockItems, { id: 'properties', section: 'panels', order: 20, el: propsBtn.el });
    if (layersBtn) scope.contribute(core.dockItems, { id: 'layers', section: 'panels', order: 30, el: layersBtn.el });

    const undoBtn = dockButton({ icon: I_undo, label: t('tools.undo'), keys: 'mod+z', f: 'undo', onClick: () => core.undo() });
    const redoBtn = dockButton({ icon: I_redo, label: t('tools.redo'), keys: 'mod+shift+z', f: 'redo', onClick: () => core.redo() });
    scope.contribute(core.dockItems, { id: 'undo', section: 'edit', order: 10, el: undoBtn.el });
    scope.contribute(core.dockItems, { id: 'redo', section: 'edit', order: 20, el: redoBtn.el });

    // ---- state
    const syncShapes = (): void => {
      shapes.update({ label: t(editKind(core.model.type)?.shapesLabel ?? 'tools.shapes') });
      shapes.el.hidden = !core.model.type || !core.has('toggleShapesMenu');
    };
    core.on('model', syncShapes);
    core.on('draw', syncShapes);
    // the Shapes menu's module is suspended while History shows something: checked again once it is back
    scope.effect(() => {
      core.stage();
      queueMicrotask(syncShapes);
    });
    scope.effect(() => {
      const m = core.mode();
      if (!layersBtn) return;
      const label = m === 'edit' ? t('tools.layers') : t('tools.viewSettings');
      layersBtn.el.title = `${label} (L)`;
      layersBtn.el.setAttribute('aria-label', label);
    });
    // badge on the Code tool: problems in the code / metadata
    scope.effect(() => {
      const n = core.issueCount();
      if (!codeBtn) return;
      dockBadge(codeBtn.el, n);
      codeBtn.el.title = `${t('tools.code')} (C)` + (n ? ` · ${t(n === 1 ? 'problems.count1' : 'problems.countN', { n })}` : '');
    });
    // undo / redo: disabled when empty, "Undo <label>" tooltips
    scope.effect(() => {
      core.store.revision();
      undoBtn.el.disabled = !core.store.canUndo();
      redoBtn.el.disabled = !core.store.canRedo();
      const ul = core.store.undoLabel(), rl = core.store.redoLabel();
      undoBtn.el.title = ul ? t('tools.undoLabel', { label: ul }) : t('tools.undo');
      redoBtn.el.title = rl ? t('tools.redoLabel', { label: rl }) : t('tools.redo');
    });

    // ---- shortcuts (A.11): tools and panels; Esc goes back to the default tool
    core.shortcuts.add(
      { id: 'panel-code', keys: ['c'], label: t('help.code'), group: t('help.tools'), editOnly: true, readOnly: true, run: () => (f.codePanel ? void core.run('setPanel', 'code', !core.panels.peek().code) : false) },
      { id: 'panel-props', keys: ['i'], label: t('help.props'), group: t('help.tools'), editOnly: true, run: () => (f.properties ? void core.run('setPanel', 'properties', !core.panels.peek().properties) : false) },
      { id: 'panel-layers', keys: ['l'], label: t('help.layers'), group: t('help.tools'), run: () => (f.layers ? void core.run('setPanel', 'layers', !core.panels.peek().layers) : false) },
      {
        id: 'tool-default', keys: ['escape'], label: t('help.escTool'), group: t('help.tools'), editOnly: true, readOnly: true,
        run: () => {
          if (core.tool.peek() === defaultTool() || core.tool.peek() === 'paint' || core.tool.peek() === 'shapes') return false;
          setTool(defaultTool());
          return true;
        },
      },
    );
    // V: registered here unless a canvas module already owns it (checked once every module is installed)
    queueMicrotask(() => {
      if (!scope.active && core.isDestroyed) return;
      if (!core.shortcuts.list(true).some((s) => s.keys.includes('v')))
        core.inScope(scope, () => void core.shortcuts.add({ id: 'tool-pointer', keys: ['v'], label: t('help.pointer'), group: t('help.tools'), editOnly: true, readOnly: true, run: () => setTool('pointer') }));
    });

    return () => {
      for (const b of [pointer, shapes, codeBtn, propsBtn, layersBtn, undoBtn, redoBtn]) b?.destroy();
    };
  },
};
