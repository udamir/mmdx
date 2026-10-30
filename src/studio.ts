// mmdx/studio — defines <mmdx-studio> on import (guarded): the standalone app (UC4).
import { defineStudio } from './elements/studio.js';

export { DiagramStudio, MmdxStudioElement, defineStudio, type StudioOptions, type ExampleInfo } from './elements/studio.js';
export { encodeHash, decodeHash } from './adapters/share.js';
export { configure, type Config } from './config.js';

defineStudio();
