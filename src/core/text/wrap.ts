// Text wrapping and block widths (prototype `util.js`), measured through the instance's TextMeasurer (§7.3).
import type { FontSpec, TextMeasurer } from './measure.js';

/** Wraps text into lines that fit maxWidth. Explicit "\n" always breaks; maxWidth 0 only splits on "\n". */
export function wrap(text: string, maxWidth: number, font: FontSpec, measure: TextMeasurer, sep = ' '): string[] {
  const out: string[] = [];
  for (const para of String(text).split('\n')) {
    if (!maxWidth) {
      out.push(para);
      continue;
    }
    const words = para.split(sep);
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const word = words[i]! + (sep !== ' ' && i < words.length - 1 ? sep.trimEnd() : '');
      const cand = line ? line + ' ' + word : word;
      if (line && measure.width(cand, font) > maxWidth) {
        out.push(line);
        line = word;
      } else line = cand;
    }
    out.push(line);
  }
  return out;
}

/** Width of the widest line (0 for none). */
export function textBlockWidth(lines: readonly string[], font: FontSpec, measure: TextMeasurer): number {
  let w = 0;
  for (const l of lines) w = Math.max(w, measure.width(l, font));
  return w;
}
