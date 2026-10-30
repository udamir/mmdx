// Editor chrome: panel layout, tool dock, zoom bar and help, view parameters (UI scheme, theme, export), document
// commands (export, Plain Mermaid, Auto layout, open files) and the floating style / page toolbars.
import type { EditorModule } from '../../module.js';
import { documentModule } from './document.js';
import { panesModule } from './panes.js';
import { toolDockModule } from './tool-dock.js';
import { toolbarsModule } from './toolbars.js';
import { viewParamsModule } from './view-params.js';
import { zoomBarModule } from './zoom-bar.js';

export { documentModule, panesModule, toolDockModule, toolbarsModule, viewParamsModule, zoomBarModule };

/** Installed before the panels: `setPanel` and the remembered panel widths. */
export const LAYOUT_MODULES: readonly EditorModule[] = [panesModule];
export const CHROME_MODULES: readonly EditorModule[] = [toolDockModule, zoomBarModule, viewParamsModule, documentModule, toolbarsModule];
