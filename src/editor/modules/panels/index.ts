// Side panels: the code / metadata panel (left) and Properties + Layers (right) in Edit mode; in View mode the
// viewer's code view and view settings (A16).
import type { EditorModule } from '../../module.js';
import { lazyModule } from '../../../view/module.js';
import { CODE_VIEW_STUB, VIEW_SETTINGS_STUB } from '../../../view/module-stubs.js';
import type { EditorCore } from '../../core.js';
import { codePanelModule } from './code-panel.js';
import { rightPanelsModule } from './right-panels.js';

export { codePanelModule } from './code-panel.js';
export { rightPanelsModule } from './right-panels.js';

/** The viewer's View mode panels, in the editor's View mode only; their code loads the first time the editor views. */
const sidePanels = (): Promise<typeof import('../../../view/modules/side-panels.js')> => import('../../../view/modules/side-panels.js');
const codeView = lazyModule<EditorCore>({ ...CODE_VIEW_STUB, when: { mode: ['view'] } }, () => sidePanels().then((m) => m.codeViewModule as never));
const viewSettings = lazyModule<EditorCore>({ ...VIEW_SETTINGS_STUB, when: { mode: ['view'] } }, () => sidePanels().then((m) => m.viewSettingsModule as never));

export const PANEL_MODULES: readonly EditorModule[] = [codePanelModule, rightPanelsModule, codeView as unknown as EditorModule, viewSettings as unknown as EditorModule];
