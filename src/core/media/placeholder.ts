// The image placeholder's drawing (T03): a dashed frame with a mountain glyph, as plain shapes. The renderer draws it
// for a refused image (core/media/image.ts) and PNG export for an image it could not fetch (dom/export-images.ts);
// it imports nothing, so the export's lazy chunk shares no module with the viewer's first chunk.
import type { SceneShape } from '../scene/types.js';
import type { Rect } from '../types.js';

const r1 = (v: number): number => Math.round(v * 10) / 10 || 0;

/** The placeholder's shapes in box `b`; the glyph is smaller and higher when a caption goes under it. */
export function placeholderShapes(b: Rect, color: string, caption: boolean): SceneShape[] {
  const s = Math.max(8, Math.min(b.w, b.h) * (caption ? 0.34 : 0.45));
  const x0 = b.x + b.w / 2 - s / 2, y0 = b.y + b.h / 2 - (caption ? 8 : 0) - s / 2;
  const P = (fx: number, fy: number): string => `${r1(x0 + fx * s)},${r1(y0 + fy * s)}`;
  return [
    {
      t: 'rect',
      attrs: { x: b.x, y: b.y, width: b.w, height: b.h, rx: 4, fill: color, 'fill-opacity': 0.08, stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '6 4' },
    },
    {
      t: 'path',
      attrs: {
        d: `M${P(0, 0.1)} L${P(1, 0.1)} L${P(1, 0.9)} L${P(0, 0.9)} Z M${P(0, 0.9)} L${P(0.35, 0.45)} L${P(0.6, 0.72)} L${P(0.74, 0.58)} L${P(1, 0.86)}`,
        fill: 'none', stroke: color, 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      },
    },
    { t: 'circle', attrs: { cx: x0 + 0.74 * s, cy: y0 + 0.32 * s, r: s * 0.08, fill: color } },
  ];
}
