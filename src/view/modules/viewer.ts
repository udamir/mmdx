// The viewer's module set: the standard view modules, every piece behind a control of `controls`.
import type { ViewCore } from '../core.js';
import { lazyModule, type ViewModule } from '../module.js';
import { CODE_VIEW_STUB, HISTORY_STUB, PEN_STUB, VIEW_PARAMS_STUB, VIEW_SETTINGS_STUB } from '../module-stubs.js';
import { hoverHighlightModule, linksModule } from './canvas.js';
import { zoomBarModule } from './zoom-bar.js';

/**
 * `<mmdx-viewer>`: the editor's chrome, every piece behind a control (`controls`). Only the zoom bar and the canvas
 * behaviour load with the viewer; the rest loads when its control is on (§10: the viewer's budget is the first
 * diagram on a docs page).
 */
export const VIEWER_MODULES: readonly ViewModule<ViewCore>[] = [
  lazyModule({ id: 'panel-stacks', enabled: (c) => c.feature('code') || c.feature('layers') || c.historyOpen.peek() }, () => import('./panels.js').then((m) => m.panelStacksModule)),
  zoomBarModule,
  lazyModule({ id: 'tool-dock', enabled: (c) => c.feature('pen') || c.feature('code') || c.feature('layers') || c.feature('history') }, () => import('./tool-dock.js').then((m) => m.toolDockModule)),
  lazyModule({ id: 'pan', enabled: (c) => c.feature('pen') }, () => import('./tool-dock.js').then((m) => m.panModule)),
  lazyModule(PEN_STUB, () => import('./pen.js').then((m) => m.penModule)),
  // the viewer's panels are the document's: History brings its own
  lazyModule({ ...VIEW_SETTINGS_STUB, when: { stage: ['document'] } }, () => import('./side-panels.js').then((m) => m.viewSettingsModule)),
  lazyModule({ ...CODE_VIEW_STUB, when: { stage: ['document'] } }, () => import('./side-panels.js').then((m) => m.codeViewModule)),
  lazyModule(VIEW_PARAMS_STUB, () => import('./view-params.js').then((m) => m.viewParamsModule)),
  lazyModule(HISTORY_STUB, () => import('./history.js').then((m) => m.historyModule)),
  linksModule,
  hoverHighlightModule,
];
