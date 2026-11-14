// Dash patterns drawn at a line's width: the editor's dotted (`1.5 4`) and dashed (`6 4`) patterns scale with the
// stroke, so a thick dotted border is a row of round dots rather than ticks across the line, and a thick dashed one
// keeps its proportions; any other dasharray (Mermaid's `stroke-dasharray`, a hand-written one) is drawn as written.

/** The style toolbar's patterns, as stored in the layout metadata. */
export const DOTTED = '1.5 4', DASHED = '6 4';

const r2 = (v: number): string => String(Math.round(v * 100) / 100);

/** The SVG attributes of a dash pattern on a line `width` wide (none: no attributes). */
export function dashAttrs(dash: string | null | undefined, width: number): { 'stroke-dasharray'?: string; 'stroke-linecap'?: 'round' } {
  const d = dash?.trim().replace(/[\s,]+/g, ' ');
  if (!d || d === 'none') return {};
  // a zero-length dash with round caps is a dot as wide as the line
  if (d === DOTTED) return { 'stroke-dasharray': `0 ${r2(Math.max(4, width * 2.5))}`, 'stroke-linecap': 'round' };
  if (d === DASHED && width > 2) return { 'stroke-dasharray': `${r2(width * 3)} ${r2(width * 2)}` };
  return { 'stroke-dasharray': d };
}
