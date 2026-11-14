// Every diff kind (core's all-kinds diff; registered on first use there, see core/diff/all.ts).
import { DIFF as er } from './er/diff-kind.js';
import { DIFF as flowchart } from './flowchart/diff-kind.js';
import type { DiffKinds } from '../kind/diff-types.js';
import { DIFF as mindmap } from './mindmap/diff-kind.js';
import { DIFF as sequence } from './sequence/diff-kind.js';
import { DIFF as state } from './state/diff-kind.js';

export const ALL_DIFF_KINDS: DiffKinds = { flowchart, sequence, er, mindmap, state };
