// The top of the main column: the theme's name, the tile size (− % +), the unsaved-changes status and Undo / Redo /
// Save. The buttons follow the draft's signals.
import { createIconButton } from '../ui/blocks/button.js';
import { createToolbar } from '../ui/blocks/toolbar.js';
import { h } from '../ui/kit/h.js';
import { I_redo, I_undo } from '../ui/kit/icons.js';
import { formatKeys } from '../ui/kit/keys.js';
import type { Env } from './env.js';
import { derived } from './util.js';

export interface HeaderActions {
  save(): void;
  undo(): void;
  redo(): void;
  /** The tile zoom changed (stored, tiles redrawn). */
  zoomed(): void;
}

export function header(env: Env, roTag: HTMLElement, a: HeaderActions): HTMLElement {
  const { t, draft } = env;
  const scope = env.scope();
  const top = h('div', { class: 'te-top' });
  const name = h('input', { class: 'te-name', type: 'text', 'aria-label': t('te.themeName'), dataset: { dirty: 'name' } });
  name.value = draft.name();
  name.disabled = !env.canEdit();
  name.addEventListener('change', () => draft.set(['name'], name.value.trim() || draft.id.peek()));
  // embedded, the "Read only" tag sits by the name (the title bar with it is hidden)
  top.append(name);
  if (env.presentation() === 'inline') top.append(roTag);
  top.append(h('span', { class: 'te-spacer' }));

  // tile size: tiles show items at real size (100%); smaller fits more per row
  const pct = h('output', { 'aria-live': 'polite' });
  scope.effect(() => void (pct.textContent = `${Math.round(env.zoom() * 100)}%`));
  const step = (d: number): void => {
    env.zoom.set(Math.round(Math.min(1.5, Math.max(0.5, env.zoom.peek() + d)) * 10) / 10);
    a.zoomed();
  };
  pct.addEventListener('dblclick', () => step(1 - env.zoom.peek()));
  const smaller = createIconButton({ icon: null, text: '−', label: t('te.smaller'), onClick: () => step(-0.1) });
  const bigger = createIconButton({ icon: null, text: '+', label: t('te.bigger'), onClick: () => step(0.1) });
  const zoom = createToolbar({ label: t('te.previewSize'), orientation: 'horizontal', class: 'te-zoom', items: [smaller.el, pct, bigger.el] });
  zoom.el.title = t('te.previewSize');

  const undoT = t('te.undo', { keys: formatKeys('mod+z') }), redoT = t('te.redo', { keys: formatKeys('mod+shift+z') });
  const undo = createIconButton({ icon: I_undo, iconSize: 15, label: undoT, tip: undoT, keys: 'mod+z', class: 'te-undo', disabled: derived(() => !draft.canUndo()), onClick: () => a.undo() });
  const redo = createIconButton({ icon: I_redo, iconSize: 15, label: redoT, tip: redoT, keys: 'mod+shift+z', class: 'te-redo', disabled: derived(() => !draft.canRedo()), onClick: () => a.redo() });
  const save = createIconButton({
    icon: null, text: t('te.saveBtn'), label: t('te.saveBtn'), tip: t('te.saveTitle', { keys: formatKeys('mod+s') }), keys: 'mod+s', class: 'te-save primary small',
    disabled: derived(() => !draft.dirty() || !env.canEdit()), onClick: () => a.save(),
  });
  const unsaved = h('span', { class: 'te-unsaved', role: 'status' }, t('te.unsaved'));
  scope.effect(() => void (unsaved.hidden = !draft.dirty()));
  const actions = createToolbar({ label: t('te.changes'), orientation: 'horizontal', class: 'te-actions', items: [undo.el, redo.el, save.el] });
  for (const b of [smaller, bigger, undo, redo, save, zoom, actions]) scope.add(() => b.destroy());
  top.append(h('span', { class: 'te-zoom-label' }, t('te.preview')), zoom.el, unsaved, actions.el);
  return top;
}
