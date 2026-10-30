// Word-level text changes in a rendered merged diagram: the zero-width marks from merge.ts become <tspan>s
// (removed words struck out, added words in the add colour), with a highlighter rectangle behind each run.
import { DEL_CLOSE, DEL_OPEN, INS_CLOSE, INS_OPEN, hasMarks } from './merge.js';
import { svgEl } from './canvas.js';

/** Rewrites every marked text element of `svg` into styled runs. Works on a detached SVG. */
export function decorateText(svg: SVGSVGElement): void {
  for (const text of svg.querySelectorAll('text')) {
    if (!hasMarks(text.textContent ?? '')) continue;
    let state: 'del' | 'ins' | null = null;
    for (const line of [...text.children]) {
      const s = line.textContent ?? '';
      line.textContent = '';
      let buf = '';
      const flush = () => {
        if (!buf) return;
        if (state) {
          const t = svgEl('tspan', { class: `dx-${state}` });
          t.textContent = buf;
          line.append(t);
        } else line.append(buf);
        buf = '';
      };
      for (const ch of s) {
        if (ch === DEL_OPEN || ch === INS_OPEN) {
          flush();
          state = ch === DEL_OPEN ? 'del' : 'ins';
        } else if (ch === DEL_CLOSE || ch === INS_CLOSE) {
          flush();
          state = null;
        } else buf += ch;
      }
      flush();
    }
    text.classList.add('dx-difftext');
  }
}

/**
 * Highlighter rectangles behind the changed runs, in a layer on top that multiplies with the drawing. Needs the
 * SVG to be laid out (attached, not `display: none`).
 */
export function highlightRuns(svg: SVGSVGElement): void {
  svg.querySelector(':scope > g.dx-runs')?.remove();
  const layer = svgEl('g', { class: 'dx-runs' });
  const root = svg.getScreenCTM()?.inverse();
  for (const t of svg.querySelectorAll<SVGTSpanElement>('tspan.dx-ins, tspan.dx-del')) {
    let b: DOMRect;
    try {
      b = t.getBBox();
    } catch {
      continue;
    }
    if (!b.width) continue;
    const m = root && t.getScreenCTM() ? root.multiply(t.getScreenCTM()!) : null;
    const p = (x: number, y: number) => (m ? new DOMPoint(x, y).matrixTransform(m) : { x, y });
    const a = p(b.x, b.y), c = p(b.x + b.width, b.y + b.height);
    layer.append(svgEl('rect', { x: a.x - 1, y: a.y, width: c.x - a.x + 2, height: c.y - a.y, rx: 2, class: t.classList.contains('dx-ins') ? 'run-ins' : 'run-del' }));
  }
  const top = svg.querySelector(':scope > g.dx-layer');
  if (top) top.before(layer);
  else svg.append(layer);
}

/** Lays out a detached SVG off screen for a moment, so bounding boxes can be measured. */
export function withLayout(svg: SVGSVGElement, fn: () => void): void {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:800px;visibility:hidden;pointer-events:none';
  const parent = svg.parentNode, next = svg.nextSibling;
  box.append(svg);
  document.body.append(box);
  try {
    fn();
  } finally {
    if (parent) parent.insertBefore(svg, next);
    else svg.remove();
    box.remove();
  }
}
