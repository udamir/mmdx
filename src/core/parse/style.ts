// Mermaid style lists (`fill:#f00,stroke:#333,stroke-width:2px`) shared by flowchart `style`, `classDef` and
// `linkStyle`. Values are validated here (§12): a value that is not a well-formed colour, number or dash pattern is
// dropped and reported, so nothing raw from the code can reach an SVG attribute.
import type { MermaidStyle } from '../model.js';
import { cleanDash, isColorLiteral, toNumber } from '../validate.js';

/** Splits on commas outside parentheses, so `rgb(1,2,3)` stays one value. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out;
}

/** `"fill:#f00,stroke:#333"` -> style. Malformed or unsafe parts are dropped and reported through `bad(message)`. */
export function parseStyleList(s: string, bad: (message: string) => void = () => {}): MermaidStyle {
  const st: MermaidStyle = {};
  for (const part of splitTopLevel(s)) {
    const p = part.trim();
    if (!p) continue;
    const colon = p.indexOf(':');
    const key = colon < 0 ? '' : p.slice(0, colon).trim();
    // `!important` is common in copied Mermaid styles and means nothing here
    const val = colon < 0 ? '' : p.slice(colon + 1).trim().replace(/;$/, '').replace(/\s*!important$/i, '').trim();
    if (!key || !val) { bad(`invalid style "${p}" — expected property:value`); continue; }
    switch (key) {
      case 'fill':
      case 'stroke':
      case 'color': {
        if (!isColorLiteral(val)) { bad(`invalid color "${val}" for ${key}`); break; }
        if (key === 'color') st.text = val;
        else st[key] = val;
        break;
      }
      case 'stroke-width':
      case 'font-size': {
        const n = toNumber(val);
        if (n === undefined || n < 0 || n > 1000) { bad(`invalid ${key} "${val}"`); break; }
        if (key === 'stroke-width') st.strokeWidth = n;
        else st.fontSize = n;
        break;
      }
      case 'stroke-dasharray': {
        const d = cleanDash(val);
        if (d === undefined) { bad(`invalid ${key} "${val}"`); break; }
        st.dash = d;
        break;
      }
      default: // other CSS properties are not modelled; Mermaid accepts them, so they are not an error
    }
  }
  return st;
}
