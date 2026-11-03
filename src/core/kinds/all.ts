// Every view kind (core's ALL_KINDS: SSR, the markdown plugins, the worker, the theme editor, previews).
import { VIEW as er } from './er.js';
import { VIEW as flowchart } from './flowchart.js';
import { registerKinds } from './registry.js';
import { VIEW as sequence } from './sequence.js';
import type { Kinds } from './types.js';

export const ALL_VIEW_KINDS: Kinds = registerKinds({ flowchart, sequence, er });
