// `<mmdx-diff>`'s side of the module set: what loads on demand — the side panels, the pen, the view params and view
// settings, as in the viewer (§10) — and the standard view modules around the diff's. A file of its own: History's graph
// includes the module set, and a dynamic import there would be a chunk boundary in every product that loads History.
import type { ReadSignal } from '../../reactive/signal.js';
import type { ViewCore } from '../../view/core.js';
import { lazyModule, type ViewModule } from '../../view/module.js';
import { PEN_STUB, VIEW_PARAMS_STUB, VIEW_SETTINGS_STUB } from '../../view/module-stubs.js';
import { panModule, toolDockModule } from '../../view/modules/tool-dock.js';
import { zoomBarModule } from '../../view/modules/zoom-bar.js';
import type { DiffScene } from '../scene.js';
import type { DiffMode } from '../session.js';
import { diffModuleSet, type DiffAction, type DiffModuleSet } from './index.js';

/** The standard view modules of `<mmdx-diff>`: the zoom bar with help and full screen, the tool dock with Hand and the pen, the view params, view settings (layers). */
const STANDARD: readonly ViewModule<ViewCore>[] = [
  zoomBarModule, toolDockModule, panModule,
  lazyModule(PEN_STUB, () => import('../../view/modules/pen.js').then((m) => m.penModule)),
  lazyModule(VIEW_PARAMS_STUB, () => import('../../view/modules/view-params.js').then((m) => m.viewParamsModule)),
  lazyModule(VIEW_SETTINGS_STUB, () => import('../../view/modules/side-panels.js').then((m) => m.diffLayersModule)),
];

/** `<mmdx-diff>`'s module set around a pinned DiffScene: `actions` are the host's buttons, `tab` the version panel's first tab. */
export function standaloneModuleSet(scene: DiffScene, o: { actions: ReadSignal<readonly DiffAction[]>; tab?: DiffMode }): DiffModuleSet {
  return diffModuleSet(scene, { ...o, standard: STANDARD, panels: () => import('./panels.js') });
}

/** The modules of `<mmdx-diff>` around a pinned DiffScene; `actions` are the host's buttons. */
export function diffModules(scene: DiffScene, o: { actions: ReadSignal<readonly DiffAction[]> }): ViewModule<ViewCore>[] {
  return standaloneModuleSet(scene, o).modules;
}
