// The Diagram Studio mark (a sprout drawn by a pencil), the same drawing as brand/logo.svg. Its ink follows
// `--logo-ink` (navy by default), so a dark UI can lighten it; the pencil keeps its violet.
import { s } from './h.js';

const SPROUT = [
  'M218,186C300,262 400,262 480,290C560,318 612,390 617,494C624,390 676,318 756,290C836,262 936,262 1018,186',
  'M218,186C204,335 244,445 378,524C470,575 545,600 551,690C556,760 500,800 455,835C415,866 405,900 405,950C405,995 440,1025 490,1025H915',
  'M1018,186C1036,335 996,445 864,505C770,550 653,605 649,720V845',
];
const PENCIL = 'M-188,0L-37,-82H372Q422,-82 422,-32V32Q422,82 372,82H-37Z';

/** The mark at `height` px (strokes a little heavier than the master drawing, for small sizes; the pencil's outline thinner). */
export function logoMark(height = 22): SVGElement {
  const ink = { fill: 'none', stroke: 'var(--logo-ink, #061958)', 'stroke-width': '72', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  return s('svg', { viewBox: '175 146 1080 918', height: String(height), width: String(Math.round((height * 1080) / 918)), 'aria-hidden': 'true', class: 'ds-logo' },
    s('g', ink, ...SPROUT.map((d) => s('path', { d }))),
    s('g', { transform: 'translate(899,821) rotate(-48.1)' },
      s('path', { d: 'M-135.6,0L-50,-46.5V46.5Z', fill: '#E7DDFD' }),
      s('rect', { x: '0', y: '-57', width: '286', height: '114', fill: '#8E5EFB' }),
      s('g', { ...ink, 'stroke-width': '50' }, s('path', { d: PENCIL }), s('path', { d: 'M-25,-82V82M311,-82V82', 'stroke-linecap': 'butt' }))));
}
