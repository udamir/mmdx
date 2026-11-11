// The icons of the diff's views (the diff bar): the same frame for every view — Before fills its left half with the
// removed colour, After its right half with the added colour, Merged crosses a Before and an After frame, Side by side
// sets them apart with a line between them. The fills follow the diff tokens (`.dx-fb`, `.dx-fa` in the diff bar's CSS).
import { s } from '../ui/kit/h.js';
import type { DiffViewName } from './session.js';

const svg = (...children: SVGElement[]): SVGElement =>
  s('svg', { viewBox: '0 0 24 24', width: '24', height: '24', 'aria-hidden': 'true', class: 'mmdx-icon dx-view-icon', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ...children);

const LEFT = 'M5.5 5h6.5v14H5.5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z';
const RIGHT = 'M12 5h6.5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H12z';
const frame = (): SVGElement[] => [s('rect', { x: '3.5', y: '5', width: '17', height: '14', rx: '2' }), s('path', { d: 'M12 5v14' })];

export const VIEW_ICONS: Readonly<Record<DiffViewName, () => SVGElement>> = {
  before: () => svg(s('path', { d: LEFT, class: 'dx-fb', stroke: 'none' }), ...frame()),
  after: () => svg(s('path', { d: RIGHT, class: 'dx-fa', stroke: 'none' }), ...frame()),
  merged: () => svg(s('rect', { x: '2.5', y: '4', width: '13', height: '10', rx: '2', class: 'dx-fb' }), s('rect', { x: '8.5', y: '10', width: '13', height: '10', rx: '2', class: 'dx-fa' })),
  // the panes are open towards the splitter: no border next to it
  side: () => svg(
    s('path', { d: 'M10 5H4a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 4 19h6z', class: 'dx-fb', stroke: 'none' }),
    s('path', { d: 'M14 5h6a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19h-6z', class: 'dx-fa', stroke: 'none' }),
    s('path', { d: 'M10 5H4a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 4 19h6M14 5h6a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19h-6M12 3v18' }),
  ),
};
