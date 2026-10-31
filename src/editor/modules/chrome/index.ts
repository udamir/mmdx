// Editor chrome: panel layout, the editor's tools in the tool dock, its view parameters (export formats, the ⋯
// menu), History, document commands (export, Plain Mermaid, Auto layout, open files) and the floating style / page
// toolbars. The dock, the zoom bar with help, the view-params bar with the light / dark toggle and the theme menu,
// Hand and the magic pen are the kernel's standard modules (component architecture §7.4).
import { historyModule } from '../../../view/modules/history.js';
import { penModule } from '../../../view/modules/pen.js';
import { panModule, toolDockModule } from '../../../view/modules/tool-dock.js';
import { viewParamsModule } from '../../../view/modules/view-params.js';
import { zoomBarModule } from '../../../view/modules/zoom-bar.js';
import type { EditorModule } from '../../module.js';
import { documentModule } from './document.js';
import { panesModule } from './panes.js';
import { editorToolsModule } from './tool-dock.js';
import { toolbarsModule } from './toolbars.js';
import { editorParamsModule } from './view-params.js';

export { documentModule, editorParamsModule, editorToolsModule, panesModule, toolbarsModule };

const std = <M>(m: M): EditorModule => m as unknown as EditorModule;

/** Installed before the panels: `setPanel` and the remembered panel widths. */
export const LAYOUT_MODULES: readonly EditorModule[] = [panesModule];
export const CHROME_MODULES: readonly EditorModule[] = [
  editorToolsModule, std(toolDockModule), std(panModule), std(penModule), std(historyModule),
  std(zoomBarModule), std(viewParamsModule), editorParamsModule, documentModule, toolbarsModule,
];
