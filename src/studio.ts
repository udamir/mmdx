// mmdx — defines <mmdx-studio> on import (guarded): the standalone app (UC4).
import { defineStudio } from './elements/studio.js';

export { DiagramStudio, MmdxStudioElement, defineStudio, type StudioOptions, type ExampleInfo } from './elements/studio.js';
export { configure, type Config } from './platform/config.js';
export { registerThemes, registerBuiltinThemes } from './platform/themes.js';
export type { IconPack, IconifyJSON } from './core/icons/types.js';

defineStudio();
