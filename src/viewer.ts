// mmdx/viewer — defines <mmdx-viewer> on import (guarded) and exports the imperative class.
import { defineViewer } from './elements/viewer.js';

export { DiagramViewer, MmdxViewerElement, defineViewer, type ViewerOptions, type ViewerControl, type ViewerEventMap } from './elements/viewer.js';
export { configure, type Config } from './config.js';
export { upgradeMermaidBlocks } from './markdown/upgrade.js';
export { setWorkerUrl } from './dom/worker-client.js';

defineViewer();
