// The names of the shapes beyond the 17 (T02.9): the flowchart parser reads every Mermaid shape name with these alone
// (it registers them), so a viewer ships the geometry of those shapes (core/shapes/extended.ts) only once a diagram
// draws one. The entries of more.ts and figures.ts take their names from here; the 17 carry theirs in base.ts.
import type { ShapeId, ShapeNames } from './types.js';

/** A shape whose Mermaid shortName is its id, with Mermaid's aliases. */
const m = (id: ShapeId, ...aliases: string[]): ShapeNames => ({ id, mermaid: id, aliases });
/** A shape Mermaid has no name for (mmdx keeps it in metadata), with the names mmdx reads. */
const own = (id: ShapeId, ...legacy: string[]): ShapeNames => (legacy.length ? { id, aliases: [], legacy } : { id, aliases: [] });

/** In catalogue order: Mermaid's other flowchart shapes, choice and note (more.ts), then the figures and media frames (figures.ts). */
export const EXTENDED_NAMES: readonly ShapeNames[] = [
  m('text'), m('tri', 'extract', 'triangle'), m('flip-tri', 'manual-file', 'flipped-triangle'), m('notch-pent', 'loop-limit', 'notched-pentagon'),
  m('bolt', 'com-link', 'lightning-bolt'),
  { ...m('sm-circ', 'start', 'small-circle'), legacy: ['stateStart', 'state-start'] },
  { ...m('fr-circ', 'stop', 'framed-circle'), legacy: ['stateEnd', 'state-end'] },
  m('f-circ', 'junction', 'filled-circle'),
  m('lin-rect', 'lined-rectangle', 'lined-process', 'lin-proc', 'shaded-process'), m('div-rect', 'div-proc', 'divided-rectangle', 'divided-process'),
  m('win-pane', 'internal-storage', 'window-pane'), m('delay', 'half-rounded-rectangle'), m('curv-trap', 'curved-trapezoid', 'display'),
  m('sl-rect', 'manual-input', 'sloped-rectangle'), m('bow-rect', 'stored-data', 'bow-tie-rectangle'), m('docs', 'documents', 'st-doc', 'stacked-document'),
  m('st-rect', 'procs', 'processes', 'stacked-rectangle'), m('tag-doc', 'tagged-document'), m('tag-rect', 'tagged-rectangle', 'tag-proc', 'tagged-process'),
  m('lin-doc', 'lined-document'), m('flag', 'paper-tape'), m('brace', 'comment', 'brace-l'), m('brace-r'), m('braces'), m('cross-circ', 'summary', 'crossed-circle'),
  { ...m('fork', 'join'), legacy: ['forkJoin', 'fork-bar'] },
  m('hourglass', 'collate'), m('lin-cyl', 'disk', 'lined-cylinder'), m('datastore', 'data-store'), m('folder', 'directory'), m('bucket'), m('console'),
  m('browser'), m('person'), m('cloud'), m('bang'), m('choice'), m('note'),
  own('actor'), own('boundary'), own('control'), own('entity'), own('collections'), own('mm-default', 'defaultMindmapNode'), m('icon'), own('image', 'imageSquare'),
];
