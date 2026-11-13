// The diff's module set (component architecture §8.1, §8.4; A13 diffModuleSet): one list for `<mmdx-diff>` and for
// History in place, which assembled theirs each. The diff modules — the diff bar, the version list, the code diff, the
// change list, the canvas behaviour, the export formats — and, in `<mmdx-diff>`, the host's buttons and the standard
// view modules (panel stacks, zoom bar with help and full screen, tool dock, Hand, pen, view params with the theme menu
// and the light / dark toggle, view settings). The diff modules install first, so their keys (L, arrows) win over the
// standard ones (§13). As in the viewer, the pen, the view params and view settings load on demand (§10), and so do
// the side panels (versions, code diff, change list) unless their code is at hand (History, which loads with it).
// The version panel's tab is the set's state (not the session's): the panel shows and turns it, the host reads it.
import { signal, type ReadSignal, type Signal } from '../../reactive/signal.js';
import type { MenuEntry } from '../../ui/blocks/menu.js';
import type { ViewCore } from '../../view/core.js';
import { lazyModule, type ViewModule } from '../../view/module.js';
import { PEN_STUB, VIEW_PARAMS_STUB, VIEW_SETTINGS_STUB } from '../../view/module-stubs.js';
import { panelStacksModule } from '../../view/modules/panels.js';
import { panModule, toolDockModule } from '../../view/modules/tool-dock.js';
import { zoomBarModule } from '../../view/modules/zoom-bar.js';
import type { DiffScene } from '../scene.js';
import type { DiffMode } from '../session.js';
import { diffBarModule } from './bar.js';
import { diffExportModule, hostActionsModule, type DiffAction } from './export.js';
import { diffStageModule } from './stage.js';
import { PANEL_META, panelStub } from './panel-meta.js';
import type { VersionControls } from './panels.js';

export type { DiffAction };
export { diffBarModule, diffExportModule, diffStageModule, hostActionsModule };

type PanelCode = typeof import('./panels.js');
type SidePanelCode = typeof import('../../view/modules/side-panels.js');

export interface DiffModuleSetOptions {
  /** The version panel's first tab (default `compare`). */
  tab?: DiffMode;
  /** The host's buttons (`<mmdx-diff>`). */
  actions?: ReadSignal<readonly DiffAction[]>;
  /** The side panels' code when it is at hand (History loads with it); without it, it loads on demand. */
  code?: { panels: PanelCode; sidePanels: SidePanelCode };
  /**
   * History in place: the modules show in its comparison's stage only (the version panel and History's `withPanel`
   * whatever is shown), the version panel's rows and picks go to History, and History's own modules join the set.
   */
  history?: {
    rowActions(id: string): readonly MenuEntry[];
    controls: VersionControls;
    /** The host's own panel stacks hold the comparison's panels too (HistoryHost.ownStacks): no panel stacks of the set's. */
    ownStacks: boolean;
    /** History's modules shown whatever it shows (the Back pill), after the version panel. */
    withPanel: readonly ViewModule<ViewCore>[];
    /** History's modules of the comparison's stage (what view settings read). */
    inStage: readonly ViewModule<ViewCore>[];
  };
}

export interface DiffModuleSet {
  readonly modules: ViewModule<ViewCore>[];
  /** The version panel's tab: compare two versions, or History (one as it is). */
  readonly tab: Signal<DiffMode>;
}

/** The modules of a DiffScene's product: `<mmdx-diff>` (no `history`), or History in a host's own chrome. */
export function diffModuleSet(scene: DiffScene, o: DiffModuleSetOptions = {}): DiffModuleSet {
  const session = scene.session, h = o.history, code = o.code;
  const tab = signal<DiffMode>(o.tab ?? 'compare');
  const panel = (meta: (typeof PANEL_META)[keyof typeof PANEL_META], make: (m: PanelCode) => ViewModule<ViewCore>): ViewModule<ViewCore> =>
    code ? make(code.panels) : lazyModule(panelStub(meta), () => import('./panels.js').then(make));
  const versions = panel(PANEL_META.versions, (m) => m.versionsModule(session, tab, h ? { dockButton: false, rowActions: h.rowActions, controls: h.controls } : {}));
  const codeDiff = panel(PANEL_META.codeDiff, (m) => m.codeDiffModule(session));
  const changes = panel(PANEL_META.changes, (m) => m.changeListModule(session));
  if (!h) {
    const layers = code ? code.sidePanels.diffLayersModule : lazyModule(VIEW_SETTINGS_STUB, () => import('../../view/modules/side-panels.js').then((m) => m.diffLayersModule));
    return {
      tab,
      modules: [
        panelStacksModule, diffBarModule(session), versions, codeDiff, changes, zoomBarModule, toolDockModule, panModule,
        lazyModule(PEN_STUB, () => import('../../view/modules/pen.js').then((m) => m.penModule)),
        lazyModule(VIEW_PARAMS_STUB, () => import('../../view/modules/view-params.js').then((m) => m.viewParamsModule)),
        layers, diffStageModule(scene), diffExportModule(session), hostActionsModule(session, o.actions ?? signal([])),
      ],
    };
  }
  // the comparison's layers card has its own id, so a host whose `view-settings` is a document-stage module (the
  // viewer) does not shadow it — the host's set drops an added module whose id it has (B43)
  const layersModule = code ? code.sidePanels.diffLayersModule : null;
  const layers: ViewModule<ViewCore> = layersModule
    ? { ...layersModule, id: 'history-view-settings' }
    : lazyModule({ ...VIEW_SETTINGS_STUB, id: 'history-view-settings' }, () => import('../../view/modules/side-panels.js').then((m) => m.diffLayersModule));
  const inHistory = (m: ViewModule<ViewCore>): ViewModule<ViewCore> => ({ ...m, when: { ...m.when, stage: ['history'] } });
  // a host whose own panel stacks hold the panels has no `panel-stacks` module of the set's to install after
  const inHostStacks = (m: ViewModule<ViewCore>): ViewModule<ViewCore> => (h.ownStacks && m.after ? { ...m, after: m.after.filter((a) => a !== 'panel-stacks') } : m);
  return {
    tab,
    modules: [
      // the version panel, whatever History shows (in the host's own panel stacks)
      versions, ...h.withPanel,
      ...[...(h.ownStacks ? [] : [panelStacksModule]), diffBarModule(session), codeDiff, changes, diffStageModule(scene), diffExportModule(session), ...h.inStage, layers].map(inHistory),
    ].map(inHostStacks),
  };
}

/** The modules of `<mmdx-diff>` around a pinned DiffScene; `actions` are the host's buttons. */
export function diffModules(scene: DiffScene, o: { actions: ReadSignal<readonly DiffAction[]> }): ViewModule<ViewCore>[] {
  return diffModuleSet(scene, { actions: o.actions }).modules;
}
