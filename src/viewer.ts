// mmdx/viewer — defines <mmdx-viewer> on import (guarded) and exports the imperative class.
import { defineViewer } from './elements/viewer.js';

export { DiagramViewer, MmdxViewerElement, defineViewer, type ViewerOptions, type ViewerControl, type ViewerEventMap } from './elements/viewer.js';
export { VIEWER_MODULES } from './view/modules/viewer.js';
// the kernel types the component exposes (`.core`, modules, scenes, History; component architecture §11)
export type { ViewCore } from './view/core.js';
export type { ViewModule, ModuleScope } from './view/module.js';
export type { SceneSource } from './view/scene.js';
export type { Stage } from './view/types.js';
export type { DiagramCanvas } from './dom/canvas.js';
export type { HistorySession } from './view/history.js';
export { configure, type Config } from './config.js';
export { upgradeMermaidBlocks } from './markdown/upgrade.js';
export { setWorkerUrl } from './dom/worker-client.js';

defineViewer();
