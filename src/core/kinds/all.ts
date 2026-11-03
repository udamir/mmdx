// Every view kind (core's ALL_KINDS: SSR, the markdown plugins, the worker, the theme editor, previews), with the
// geometry of every shape (the viewer and the diff load the shapes beyond the 17 on demand, T02.9).
import { registerExtendedShapes } from '../shapes/extended.js';
import { VIEW as er } from './er.js';
import { VIEW as flowchart } from './flowchart.js';
import { registerKinds } from './registry.js';
import { VIEW as sequence } from './sequence.js';
import type { Kinds } from './types.js';

registerExtendedShapes();

export const ALL_VIEW_KINDS: Kinds = registerKinds({ flowchart, sequence, er });
