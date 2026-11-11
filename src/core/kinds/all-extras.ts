// Every type's extras kind (core's outline and portable export): registered by core's entry; the editor loads a type's
// with its kind chunk, the diff before a portable export.
import { EXTRAS as er } from './er/extras.js';
import { EXTRAS as flowchart } from './flowchart/extras.js';
import { EXTRAS as mindmap } from './mindmap/extras.js';
import { registerExtras } from './registry.js';
import { EXTRAS as sequence } from './sequence/extras.js';
import { EXTRAS as state } from './state/extras.js';
import type { ExtrasKinds } from '../kind/extras-types.js';

export const ALL_EXTRAS: ExtrasKinds = registerExtras({ flowchart, sequence, er, mindmap, state });
