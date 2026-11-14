// The Shapes menu's wiring (R6): its actions (`toggleShapesMenu`, `addShape`) and `S`, and what closes it — a press elsewhere in the editor, Esc, View mode — or rebuilds it when the diagram type changes.
import type { Point } from '../../../core/types.js';
import type { ModuleScope } from '../../../view/module.js';
import type { EditorCore } from '../../core.js';
import { addShape, paletteOf } from './lib.js';

/** What the wiring drives of the menu (its state stays in the module). */
export interface ShapesUi {
  menu: HTMLElement;
  sub: HTMLElement;
  anchor(): HTMLElement | null;
  /** The menu is open. */
  open(): boolean;
  /** The grid palette (ER table presets) is open. */
  gridOpen(): boolean;
  toggle(anchor?: HTMLElement): void;
  setMenu(open: boolean): void;
  hideSub(): void;
  hideTablePresets(): void;
  markAnchor(on: boolean): void;
  /** Builds the palette again (of the new diagram type). */
  rebuild(): void;
}

export function installShapesWiring(scope: ModuleScope<EditorCore>, ui: ShapesUi): void {
  const core = scope.core;
  const { menu, sub } = ui;
  scope.provide('toggleShapesMenu', (a?: HTMLElement) => ui.toggle(a));
  scope.provide('addShape', (kind: string, opts?: { preset?: string; at?: Point }) => {
    addShape(core, kind, opts ?? {});
  });
  core.shortcuts.add({
    id: 'shapes-menu', keys: ['s'], label: core.i18n.t('help.shapesMenu'), group: 'Tools', editOnly: true,
    run: () => {
      if (!core.has('toggleShapesMenu')) return false;
      core.run('toggleShapesMenu');
      return true;
    },
  });

  // close on a press anywhere else in the editor (the dock button toggles it itself)
  scope.listen(core.eventRoot, 'pointerdown', (ev) => {
    const path = ev.composedPath();
    const anchor = ui.anchor();
    const keep = path.includes(menu) || path.includes(sub) || (!!anchor && path.includes(anchor));
    if (keep) return;
    if (ui.open()) ui.setMenu(false);
    else if (ui.gridOpen()) ui.hideTablePresets();
  }, { capture: true });
  // Esc closes the menu first (before it clears the selection or changes the tool)
  scope.listen(core.eventRoot, 'keydown', (ev) => {
    if (ev.key !== 'Escape' || (menu.hidden && sub.hidden)) return;
    ui.setMenu(false);
    ui.hideTablePresets();
    ui.hideSub();
    ev.stopPropagation();
    ev.preventDefault();
  }, { capture: true });
  scope.on('mode', () => {
    if (core.mode.peek() !== 'edit') {
      ui.setMenu(false);
      ui.hideSub();
      ui.markAnchor(false);
    }
  });
  // the diagram type changed (code panel, new diagram): the menu follows it
  let typeSeen = core.model.type;
  scope.on('draw', () => {
    const type = core.model.type;
    if (type === typeSeen) return;
    typeSeen = type;
    if (!menu.hidden) {
      if (paletteOf(core)?.mode === 'menu') ui.rebuild();
      else ui.setMenu(false);
    }
    if (ui.gridOpen()) {
      ui.hideSub();
      ui.markAnchor(!menu.hidden);
    }
  });
}
