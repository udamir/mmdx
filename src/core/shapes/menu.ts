// The flowchart's shape list as Mermaid Chart lays it out (T05 §4.2), shared by the editor's Shapes menu and the style
// toolbar's shape picker: Basic, Process and Technical, each shape once; the shapes Mermaid Chart lacks (mmdx figures,
// the mindmap's cloud and bang, note and choice) end the Technical section.
import type { ShapeCategory } from './types.js';

export const SHAPE_MENU: readonly { cat: ShapeCategory; ids: readonly string[] }[] = [
  { cat: 'basic', ids: ['text', 'rect', 'rounded', 'stadium', 'tri', 'diamond', 'hexagon', 'cylinder', 'hcyl', 'circle', 'doublecircle', 'sm-circ',
    'fr-circ', 'f-circ', 'parallelogram', 'parallelogram-alt', 'trapezoid', 'trapezoid-alt', 'card', 'asymmetric'] },
  { cat: 'process', ids: ['subroutine', 'tag-rect', 'st-rect', 'div-rect', 'lin-rect', 'flip-tri', 'hourglass', 'notch-pent', 'sl-rect', 'fork', 'delay',
    'document', 'tag-doc', 'docs', 'brace', 'brace-r', 'braces', 'cross-circ', 'lin-doc'] },
  { cat: 'technical', ids: ['lin-cyl', 'win-pane', 'curv-trap', 'bow-rect', 'bolt', 'flag', 'datastore', 'folder', 'bucket', 'console', 'browser',
    'person', 'cloud', 'bang', 'note', 'choice'] },
];
