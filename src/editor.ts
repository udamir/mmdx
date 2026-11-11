// @mmdx/studio/editor — defines <mmdx-editor> on import (guarded) and exports the imperative class.
import { defineEditor } from './elements/editor.js';

export { DiagramEditor, type EditorOptions, type SaveOutcome, type SetSourceOptions } from './editor/editor.js';
export { MmdxEditorElement, defineEditor, type EditorEventMap } from './elements/editor.js';
export { EditorCore, DEFAULT_FEATURES, type EditorFeatures, type Gesture, type GestureSource, type OverlayPainter } from './editor/core.js';
export type { EditorModule } from './editor/module.js';
export { DEFAULT_MODULES } from './editor/modules/index.js';
// the kernel types the component exposes (`.core`, modules, scenes, History; component architecture §11)
export type { ViewCore } from './view/core.js';
export type { ViewModule, ModuleScope } from './view/module.js';
export type { SceneSource } from './view/scene.js';
export type { Stage } from './view/types.js';
export type { DiagramCanvas } from './dom/canvas.js';
export type { HistorySession } from './view/history.js';
export { configure, type Config } from './platform/config.js';
export { registerThemes, registerBuiltinThemes } from './platform/themes.js';
export type { IconPack, IconifyJSON } from './core/icons/types.js';
export * from './adapters/documents.js';
export type { DocumentAdapter, DocumentSaveResult, LoadResult } from './ports.js';

defineEditor();
