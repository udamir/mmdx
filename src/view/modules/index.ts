// The standard view modules (component architecture §7.4), loaded eagerly: the editor and the diff install them next
// to their own. The viewer loads most of them on demand (`./viewer.ts`).
import { hoverHighlightModule, linksModule } from './canvas.js';
import { panelStacksModule } from './panels.js';
import { penModule } from './pen.js';
import { codeViewModule, viewSettingsModule } from './side-panels.js';
import { panModule, toolDockModule } from './tool-dock.js';
import { viewParamsModule } from './view-params.js';
import { zoomBarModule } from './zoom-bar.js';

export { codeViewModule, hoverHighlightModule, linksModule, panelStacksModule, panModule, penModule, toolDockModule, viewParamsModule, viewSettingsModule, zoomBarModule };
