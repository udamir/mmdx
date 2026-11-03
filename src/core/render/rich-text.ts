// Rich text in the scene (T03): lines of runs (core/text/rich.ts) drawn as one `<text>` — bold, italic and changed
// words as styled `<tspan>`s — plus an `<image>` per inline icon beside it, in the same item group. A line with icons
// is laid out run by run: its text starts at its left edge (`anchor: 'start'`) and every run after an icon is a text
// chunk of its own, placed after the icon's gap (and after its own leading space, which SVG would collapse). Lines
// without icons keep the text's anchor and need no placing, and a line of one plain run is drawn exactly as
// `textBlock` draws it.
import { image, text } from '../scene/build.js';
import type { SceneNode, TextLine, TextRun } from '../scene/types.js';
import type { FontSpec, TextMeasurer } from '../text/measure.js';
import { parseInline, runFont, runsText, runWidth, type IconResolver } from '../text/rich.js';
import { textAttrs, type TextOpts } from './common.js';

/** Whether a line needs its runs (styling, marks or icons); a single plain run is drawn as text. */
const styledLine = (runs: readonly TextRun[]): boolean => runs.some((r) => r.icon || r.bold || r.italic || r.mark);

/**
 * Lines of runs centred vertically on y, like `textBlock`: the `<text>` first, then the images of its icons
 * (`aria-hidden`: the item's label names them, `runsLabel`). `measure` and `font` must be the ones the lines were
 * wrapped with, so the icons' gaps match the drawn text.
 */
export function richText(lines: readonly (readonly TextRun[])[], x: number, y: number, o: TextOpts & { measure: TextMeasurer }): SceneNode[] {
  const lh = o.lh ?? 1.3;
  const y0 = y - ((lines.length - 1) * o.size * lh) / 2;
  const font: FontSpec = { size: o.size, weight: o.weight ?? 400, family: o.family };
  if (o.extra?.['font-style'] === 'italic') font.style = 'italic';
  const anchor = o.anchor ?? 'middle';
  const images: SceneNode[] = [];
  const out: TextLine[] = lines.map((runs, i) => {
    const ly = y0 + i * o.size * lh;
    const line: TextLine = { text: runsText(runs), x, y: ly };
    if (!styledLine(runs)) return line;
    if (!runs.some((r) => r.icon)) return { ...line, runs };
    const widths = runs.map((r) => runWidth(r, font, o.measure));
    const total = widths.reduce((a, b) => a + b, 0);
    let at = anchor === 'middle' ? x - total / 2 : anchor === 'end' ? x - total : x;
    const placed: TextRun[] = [];
    let afterIcon = false;
    runs.forEach((r, k) => {
      if (r.icon) {
        images.push(image(r.icon.href, { x: at, y: ly - r.icon.size / 2, width: r.icon.size, height: r.icon.size, 'aria-hidden': true }));
        // the icon run stays in the line (no text): the diff's marks and the accessible name read it
        placed.push(r);
        afterIcon = true;
      } else if (r.text && !afterIcon) placed.push(r);
      else if (r.text) {
        // a chunk's leading space would collapse: it is placed after the space instead
        const lead = /^ +/.exec(r.text)?.[0] ?? '';
        const rest = r.text.slice(lead.length);
        if (rest) placed.push({ ...r, text: rest, x: at + (lead ? o.measure.width(lead, runFont(font, r)) : 0) });
        afterIcon = false;
      }
      at += widths[k]!;
    });
    return { ...line, x: at - total, runs: placed, anchor: 'start' };
  });
  return [text(textAttrs(o), out), ...images];
}

/**
 * A label's runs when it needs them — a markdown string (its emphasis), or icon tokens the resolver knows — else null:
 * the label is plain text, drawn and wrapped as before.
 */
export function labelRuns(label: string, o: { markdown?: boolean; icons?: IconResolver; iconSize?: number }): TextRun[] | null {
  if (!o.markdown && (!o.icons || !label.includes(':'))) return null;
  const runs = parseInline(label, o);
  return o.markdown || runs.some((r) => r.icon) ? runs : null;
}

/** Whether lines of runs draw anything but plain text (they go through `richText`, else `textBlock`). */
export const richLines = (lines: readonly (readonly TextRun[])[]): boolean => lines.some(styledLine);
