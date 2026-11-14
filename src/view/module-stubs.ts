// What each lazily loaded view module is (X13, D9): its id, its order after the panel stacks and the features that turn
// it on — written once, beside the modules rather than in them, so a product's lazy stub (the viewer's, the diff's,
// the editor's View mode) names it without loading its code. The module spreads its own stub; a product adds only what
// is its own (the stage or the mode the module shows in), so the predicates cannot drift apart again.
import type { ViewCore } from './core.js';
import type { ViewModule } from './module.js';

/** A stub's identity; `enabled` reads only what every kernel has (the editor's core too). */
export type ModuleStub = Pick<ViewModule, 'id' | 'after' | 'when'> & { enabled: (core: Pick<ViewCore, 'feature' | 'loadHistory'>) => boolean };

/** The magic pen. */
export const PEN_STUB = { id: 'pen', enabled: (c) => c.feature('pen') } satisfies ModuleStub;

/** View settings (the viewer's layers and display toggles, the diff's layers). */
export const VIEW_SETTINGS_STUB = { id: 'view-settings', after: ['panel-stacks'], enabled: (c) => c.feature('layers') } satisfies ModuleStub;

/** The code view. */
export const CODE_VIEW_STUB = { id: 'code-view', after: ['panel-stacks'], enabled: (c) => c.feature('code') } satisfies ModuleStub;

/**
 * The view params bar, for a product that loads it on demand: something to show in it (the theme menu, the light /
 * dark toggle, the Export menu). The viewer's `scheme` implies its `theme`, so one predicate serves the viewer and
 * the diff, whose toggle can be on without the menu. The module itself has none: the editor always shows the bar.
 */
export const VIEW_PARAMS_STUB = { id: 'view-params', enabled: (c) => c.feature('theme') || c.feature('scheme') || c.feature('export') } satisfies ModuleStub;

/** The History button (the product passes the History loader). */
export const HISTORY_STUB = { id: 'history', enabled: (c) => !!c.loadHistory && c.feature('history') } satisfies ModuleStub;
