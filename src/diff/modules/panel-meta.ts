// What the diff's side panels are (A13a, X18): their ids, their order after the panel stacks and the feature that
// turns each on — written once, for the panel modules themselves (panels.ts), the diff's lazy stubs (index.ts) and
// History (history.ts), which used to restate them.
import type { ViewCore } from '../../view/core.js';
import type { ViewModule } from '../../view/module.js';

export interface DiffPanelMeta {
  id: string;
  /** The feature (`features`) that shows the panel. */
  feature: string;
}

export const PANEL_META = {
  versions: { id: 'versions', feature: 'history' },
  codeDiff: { id: 'code-diff', feature: 'code' },
  changes: { id: 'changes', feature: 'changes' },
} as const satisfies Record<string, DiffPanelMeta>;

/** A panel module's identity: its id, after the panel stacks, on while its feature is. */
export const panelStub = (m: DiffPanelMeta): Pick<ViewModule<ViewCore>, 'id' | 'after' | 'enabled'> => ({
  id: m.id,
  after: ['panel-stacks'],
  enabled: (core) => core.feature(m.feature),
});
