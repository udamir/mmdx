// What a host's editor module works with (A10a): the editor core as modules see it — the document (model, code,
// metadata, the edits that change it), the selection, the view, the kernel's state, events and actions, and the
// overlay and gesture hooks. The core itself (EditorCore) is internal: its other members change as the editor does.
// A module typed with this API installs as any other (`modules: [...DEFAULT_MODULES, mine]`).
import type { EditorCore } from './core.js';
import type { ViewModule } from '../view/module.js';

export type EditorModuleApi = Pick<
  EditorCore,
  // typing of the scope's events and actions
  | '$actions' | '$events'
  // kernel: context, state, services, events and actions
  | 'product' | 'host' | 'ctx' | 'i18n' | 'storage' | 'mode' | 'stage' | 'tool' | 'panels' | 'display' | 'scheme' | 'compact'
  | 'features' | 'toast' | 'emit' | 'on' | 'fire' | 'run' | 'has' | 'setPanel' | 'setTool' | 'setMode'
  // the document
  | 'model' | 'code' | 'meta' | 'geom' | 'result' | 'applyCode' | 'setMeta' | 'undo' | 'redo' | 'begin' | 'commit' | 'rollback'
  // the selection
  | 'selection' | 'select' | 'primary' | 'isSelected' | 'toggleSelected'
  // the view, the overlay and gestures
  | 'draw' | 'drawOverlay' | 'addOverlay' | 'addGestureSource' | 'hitTest' | 'toDiagram' | 'toScreen' | 'rectOnScreen' | 'viewport'
>;

/** A host's editor module (`modules` option): installed with the editor's own, through the same module host. */
export type EditorModule = ViewModule<EditorModuleApi>;
