// The viewer's module set: the standard view modules, every piece behind a control of `controls`.
import type { ViewCore } from '../core.js';
import { lazyModule, type ViewModule } from '../module.js';
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
  lazyModule({ id: 'pen', enabled: (c) => c.feature('pen') }, () => import('./pen.js').then((m) => m.penModule)),
  lazyModule({ id: 'view-settings', after: ['panel-stacks'], when: { stage: ['document'] }, enabled: (c) => c.feature('layers') }, () => import('./side-panels.js').then((m) => m.viewSettingsModule)),
  lazyModule({ id: 'code-view', after: ['panel-stacks'], when: { stage: ['document'] }, enabled: (c) => c.feature('code') }, () => import('./side-panels.js').then((m) => m.codeViewModule)),
  lazyModule({ id: 'view-params', enabled: (c) => c.feature('theme') || c.feature('export') }, () => import('./view-params.js').then((m) => m.viewParamsModule)),
  lazyModule({ id: 'history', enabled: (c) => c.feature('history') }, () => import('./history.js').then((m) => m.historyModule)),
  linksModule,
  hoverHighlightModule,
];
