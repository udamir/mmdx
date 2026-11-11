// Every ops kind, registered for the editing ops (the editor bundles them until it loads kinds on demand; tests).
import { OPS as er } from './er/ops-kind.js';
import { OPS as flowchart } from './flowchart/ops-kind.js';
import { OPS as mindmap } from './mindmap/ops-kind.js';
import { registerOps } from './registry.js';
import { OPS as sequence } from './sequence/ops-kind.js';
import { OPS as state } from './state/ops-kind.js';
import type { OpsKinds } from '../kind/ops-types.js';

export const ALL_OPS_KINDS: OpsKinds = registerOps({ flowchart, sequence, er, mindmap, state });
