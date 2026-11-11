// Every edit kind (the editor bundles them until it loads kinds on demand; tests).
import { EDIT as er } from './er/index.js';
import { EDIT as flowchart } from './flowchart/index.js';
import { EDIT as mindmap } from './mindmap/index.js';
import { registerEditKinds } from './registry.js';
import { EDIT as sequence } from './sequence/index.js';
import { EDIT as state } from './state/index.js';
import type { EditKinds } from './types.js';

export const ALL_EDIT_KINDS: EditKinds = registerEditKinds({ flowchart, sequence, er, mindmap, state });
