// Every edit kind (the editor bundles them until it loads kinds on demand; tests).
import { EDIT as er } from './er.js';
import { EDIT as flowchart } from './flowchart.js';
import { EDIT as mindmap } from './mindmap.js';
import { registerEditKinds } from './registry.js';
import { EDIT as sequence } from './sequence.js';
import { EDIT as state } from './state.js';
import type { EditKinds } from './types.js';

export const ALL_EDIT_KINDS: EditKinds = registerEditKinds({ flowchart, sequence, er, mindmap, state });
