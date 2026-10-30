// Side panels: the code / metadata panel (left) and Properties + Layers (right).
import type { EditorModule } from '../../module.js';
import { codePanelModule } from './code-panel.js';
import { rightPanelsModule } from './right-panels.js';

export { codePanelModule } from './code-panel.js';
export { rightPanelsModule } from './right-panels.js';

export const PANEL_MODULES: readonly EditorModule[] = [codePanelModule, rightPanelsModule];
