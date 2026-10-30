// mmdx/editor — defines <mmdx-editor> on import (guarded) and exports the imperative class.
import { defineEditor } from './editor/editor.js';

export { DiagramEditor, MmdxEditorElement, defineEditor, type EditorOptions, type SaveOutcome } from './editor/editor.js';
export { EditorCore, DEFAULT_FEATURES, type EditorFeatures, type Gesture, type GestureSource, type OverlayPainter } from './editor/core.js';
export type { EditorModule } from './editor/module.js';
export { DEFAULT_MODULES } from './editor/modules/index.js';
export { configure, type Config } from './config.js';
export * from './adapters/documents.js';

defineEditor();
