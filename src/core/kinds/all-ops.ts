// Every ops kind, registered for the editing ops (the editor bundles them until it loads kinds on demand; tests).
import { OPS as er } from './er-ops.js';
import { OPS as flowchart } from './flowchart-ops.js';
import { OPS as mindmap } from './mindmap-ops.js';
import { registerOps } from './registry.js';
import { OPS as sequence } from './sequence-ops.js';
import type { OpsKinds } from './ops-types.js';

export const ALL_OPS_KINDS: OpsKinds = registerOps({ flowchart, sequence, er, mindmap });
