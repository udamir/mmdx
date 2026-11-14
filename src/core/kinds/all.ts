// Every view kind (core's ALL_KINDS: SSR, the markdown plugins, the worker, the theme editor, previews), with the
// geometry of every shape (the viewer and the diff load the shapes beyond the 17 on demand, T02.9).
import { registerExtendedShapes } from '../extras.js';
import { VIEW as er } from './er/view.js';
import { VIEW as flowchart } from './flowchart/view.js';
import { VIEW as mindmap } from './mindmap/view.js';
import { registerKinds } from './registry.js';
import { VIEW as sequence } from './sequence/view.js';
import { VIEW as state } from './state/view.js';
import type { Kinds } from '../kind/types.js';

registerExtendedShapes();

export const ALL_VIEW_KINDS: Kinds = registerKinds({ flowchart, sequence, er, mindmap, state });
