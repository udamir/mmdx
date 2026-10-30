// mmdx/theme-editor — defines <mmdx-theme-editor> on import (guarded) and exports the imperative class.
import { defineThemeEditor } from './elements/theme-editor.js';

export {
  ThemeEditor, MmdxThemeEditorElement, defineThemeEditor, contrastRatio,
  type ThemeEditorOptions, type ThemeEditorEventMap, type ThemeSamples,
} from './elements/theme-editor.js';
export { configure, type Config } from './config.js';
export * from './adapters/themes.js';
export * from './adapters/storage.js';
export { BUILTIN_THEMES } from './core/theme/builtin.js';
export type { ThemeFile, ThemeInfo } from './core/theme/types.js';

defineThemeEditor();
