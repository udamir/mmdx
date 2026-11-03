// The editing ops of every diagram kind are available in tests, as in an editor that loaded them (the editor
// registers the kinds it loads). View kinds register where they are loaded (core's ALL_KINDS on import, the viewer's
// loader), so the viewer's on-demand loading is still tested.
import { ALL_OPS_KINDS } from '../src/core/kinds/all-ops.js';
import { registerOps } from '../src/core/kinds/registry.js';

registerOps(ALL_OPS_KINDS);
