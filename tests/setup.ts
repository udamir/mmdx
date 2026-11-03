// Every diagram kind is available in tests — view, diff, ops and edit kinds — as in an editor that loaded them all, so the
// editor renders synchronously. Tests of on-demand loading forget them first (`forgetKinds`).
import { ALL_DIFF_KINDS } from '../src/core/kinds/all-diff.js';
import { ALL_OPS_KINDS } from '../src/core/kinds/all-ops.js';
import { ALL_VIEW_KINDS } from '../src/core/kinds/all.js';
import { registerDiffs, registerKinds, registerOps } from '../src/core/kinds/registry.js';
import { ALL_EDIT_KINDS } from '../src/editor/kinds/all.js';
import { registerEditKinds } from '../src/editor/kinds/registry.js';

registerKinds(ALL_VIEW_KINDS);
registerDiffs(ALL_DIFF_KINDS);
registerOps(ALL_OPS_KINDS);
registerEditKinds(ALL_EDIT_KINDS);
