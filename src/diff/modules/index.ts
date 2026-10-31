// The diff's module set (component architecture §8.1, §8.4): the diff modules — the diff bar, the version list, the
// code diff, the change list, the canvas behaviour, the export formats and the host's buttons — and the standard view
// modules (panel stacks, zoom bar with help and full screen, tool dock, Hand, pen, view params with the theme menu and
// the light / dark toggle, view settings). The diff modules install first, so their keys (L, arrows) win over the
// standard ones (§13). As in the viewer, the pen, the view params and view settings load on demand (§10).
// The side panels (versions, code diff, change list) load on demand too, as the viewer's do (§10.1).
import type { ReadSignal } from '../../ui/signal.js';
import type { ViewCore } from '../../view/core.js';
import { lazyModule, type ViewModule } from '../../view/module.js';
import { panelStacksModule } from '../../view/modules/panels.js';
import { panModule, toolDockModule } from '../../view/modules/tool-dock.js';
import { zoomBarModule } from '../../view/modules/zoom-bar.js';
import type { DiffScene } from '../scene.js';
import { diffBarModule } from './bar.js';
import { diffExportModule, hostActionsModule, type DiffAction } from './export.js';
import { diffStageModule } from './stage.js';

export type { DiffAction };
export { diffBarModule, diffExportModule, diffStageModule, hostActionsModule };

/** The modules of `<mmdx-diff>` around a pinned DiffScene; `actions` are the host's buttons. */
export function diffModules(scene: DiffScene, o: { actions: ReadSignal<readonly DiffAction[]> }): ViewModule<ViewCore>[] {
  const session = scene.session;
  return [
    panelStacksModule,
    diffBarModule(session),
    lazyModule({ id: 'versions', after: ['panel-stacks'], enabled: (c) => c.feature('history') }, () => import('./panels.js').then((m) => m.versionsModule(session))),
    lazyModule({ id: 'code-diff', after: ['panel-stacks'], enabled: (c) => c.feature('code') }, () => import('./panels.js').then((m) => m.codeDiffModule(session))),
    lazyModule({ id: 'changes', after: ['panel-stacks'], enabled: (c) => c.feature('changes') }, () => import('./panels.js').then((m) => m.changeListModule(session))),
    zoomBarModule,
    toolDockModule,
    panModule,
    lazyModule({ id: 'pen', enabled: (c) => c.feature('pen') }, () => import('../../view/modules/pen.js').then((m) => m.penModule)),
    lazyModule({ id: 'view-params', enabled: (c) => c.feature('theme') || c.feature('scheme') || c.feature('export') }, () => import('../../view/modules/view-params.js').then((m) => m.viewParamsModule)),
    lazyModule({ id: 'view-settings', after: ['panel-stacks'], enabled: (c) => c.feature('layers') }, () => import('../../view/modules/side-panels.js').then((m) => m.viewSettingsModule)),
    diffStageModule(scene),
    diffExportModule(session),
    hostActionsModule(session, o.actions),
  ];
}
