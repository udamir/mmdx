// Rich text runs (T03): a label as runs of plain, bold and italic text and inline icons, measured and wrapped run by
// run. `parseInline` reads Mermaid's markdown strings (`**bold**`, `*italic*`, `_italic_`, as Mermaid's markdown
// labels) and icon tokens (`fa:fa-car`, `pack:name`), which a resolver the caller passes turns into images (the icon
// registry, T04); a token the resolver does not know stays text. A plain label is one run, and wraps exactly as
// `wrap()` wraps it, so nothing changes for plain labels. `render/rich-text.ts` draws the lines.
//
// The runs are data: their text becomes `<tspan>` text, their styling fixed attribute values, and an icon is an
// `<image>` whose URL mmdx built (never content); see scene/types.ts `TextRun`.
import type { TextRun } from '../scene/types.js';
import type { SafeImageUrl } from '../validate.js';
import type { FontSpec, TextMeasurer } from './measure.js';
import { wrap } from './wrap.js';

/** An icon a token names, as an image (T04 builds the URL with `svgImageUrl`). */
export interface IconRef {
  href: SafeImageUrl;
  /** Read out in the item's accessible name (`car`). */
  name: string;
}

/** Resolves an icon token (`fa:fa-car`, `azure:computer-vision`); null keeps the token as text. */
export type IconResolver = (token: string) => IconRef | null;

export interface InlineOptions {
  /** The label is a Mermaid markdown string: read `**bold**`, `__bold__`, `*italic*` and `_italic_`. */
  markdown?: boolean;
  /** Turns icon tokens into icon runs (T04's registry). Without it, tokens are text. */
  icons?: IconResolver;
  /** Icon size in px (default 16; usually the font size). */
  iconSize?: number;
}

// ---- markdown emphasis ------------------------------------------------------------------------------------------

interface Delim {
  ch: '*' | '_';
  /** Characters left (matched ones are used up). */
  n: number;
  readonly len: number;
  readonly open: boolean;
  readonly close: boolean;
  /** Styles this delimiter opens and closes once matched. */
  opens: ('b' | 'i')[];
  closes: ('b' | 'i')[];
}

type Token = string | Delim;

const SPACE = /\s/u;
const PUNCT = /[\p{P}\p{S}]/u;

/** Text and delimiter runs, with CommonMark's flanking rules deciding which can open or close emphasis. */
function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let buf = '';
  for (let i = 0; i < s.length; ) {
    const c = s[i]!;
    if (c === '\\' && i + 1 < s.length && /[*_\\]/.test(s[i + 1]!)) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (c !== '*' && c !== '_') {
      buf += c;
      i++;
      continue;
    }
    let j = i;
    while (s[j] === c) j++;
    const prev = i > 0 ? s[i - 1]! : ' ', next = j < s.length ? s[j]! : ' ';
    const ps = SPACE.test(prev), ns = SPACE.test(next), pp = PUNCT.test(prev), np = PUNCT.test(next);
    const left = !ns && (!np || ps || pp), right = !ps && (!pp || ns || np);
    // `_` inside a word (snake_case) is text
    const open = c === '*' ? left : left && (!right || pp), close = c === '*' ? right : right && (!left || np);
    if (buf) out.push(buf);
    buf = '';
    out.push({ ch: c, n: j - i, len: j - i, open, close, opens: [], closes: [] });
    i = j;
  }
  if (buf) out.push(buf);
  return out;
}

/** Pairs closers with the nearest opener of the same character (CommonMark's process-emphasis, without links). */
function pairEmphasis(tokens: Token[]): void {
  const dead = new Set<Delim>();
  tokens.forEach((closer, ci) => {
    if (typeof closer === 'string' || !closer.close) return;
    while (closer.n > 0) {
      let oi = -1;
      for (let k = ci - 1; k >= 0; k--) {
        const o = tokens[k]!;
        if (typeof o === 'string' || dead.has(o) || o.ch !== closer.ch || !o.open || o.n === 0) continue;
        // the rule of three: `*a**b*` does not pair the single with the double
        if ((o.close || closer.open) && (o.len + closer.len) % 3 === 0 && (o.len % 3 !== 0 || closer.len % 3 !== 0)) continue;
        oi = k;
        break;
      }
      if (oi < 0) break;
      const opener = tokens[oi] as Delim;
      const use = opener.n >= 2 && closer.n >= 2 ? 2 : 1;
      opener.n -= use;
      closer.n -= use;
      opener.opens.push(use === 2 ? 'b' : 'i');
      closer.closes.push(use === 2 ? 'b' : 'i');
      // delimiters between them can no longer pair (they stay text)
      for (let k = oi + 1; k < ci; k++) {
        const d = tokens[k]!;
        if (typeof d !== 'string') dead.add(d);
      }
    }
  });
}

const sameStyle = (a: TextRun, b: TextRun): boolean => !a.icon && !b.icon && a.mark === b.mark && !a.bold === !b.bold && !a.italic === !b.italic && b.x === undefined;

/** Appends text in a style, merging with the last run when it has the same style. */
function push(out: TextRun[], r: TextRun): void {
  if (!r.text && !r.icon) return;
  const last = out[out.length - 1];
  if (last && sameStyle(last, r)) out[out.length - 1] = { ...last, text: last.text + r.text };
  else out.push(r);
}

const styled = (text: string, bold: boolean, italic: boolean): TextRun => {
  const r: TextRun = { text, mark: null };
  if (bold) r.bold = true;
  if (italic) r.italic = true;
  return r;
};

/** Markdown emphasis → runs (unpaired delimiters stay text). */
function emphasis(s: string): TextRun[] {
  const tokens = tokenize(s);
  pairEmphasis(tokens);
  const out: TextRun[] = [];
  let b = 0, i = 0;
  const step = (styles: readonly ('b' | 'i')[], d: number): void => {
    for (const c of styles) {
      if (c === 'b') b += d;
      else i += d;
    }
  };
  for (const t of tokens) {
    if (typeof t === 'string') {
      push(out, styled(t, b > 0, i > 0));
      continue;
    }
    // the styles it closes first, then its unmatched characters as text, then the styles it opens
    step(t.closes, -1);
    if (t.n) push(out, styled(t.ch.repeat(t.n), b > 0, i > 0));
    step(t.opens, 1);
  }
  return out;
}

// ---- icon tokens ------------------------------------------------------------------------------------------------

/**
 * An icon token candidate: `pack:name` standing on its own (`fa:fa-car Car`, `azure:computer-vision`), not part of a
 * URL, a time or a longer word. The resolver decides whether it is an icon.
 */
const ICON_TOKEN = /(^|[^\w:/.-])([a-z][\w-]*:[a-z0-9][\w-]*)(?![\w:])/gi;

function iconRuns(r: TextRun, resolve: IconResolver, size: number, out: TextRun[]): void {
  let at = 0;
  for (const m of r.text.matchAll(ICON_TOKEN)) {
    const icon = resolve(m[2]!);
    if (!icon) continue;
    const from = m.index! + m[1]!.length;
    push(out, { ...r, text: r.text.slice(at, from) });
    out.push({ text: '', mark: r.mark, icon: { href: icon.href, size, name: icon.name } });
    at = from + m[2]!.length;
  }
  push(out, { ...r, text: r.text.slice(at) });
}

/**
 * A label as runs: markdown emphasis when `markdown` is set, icon tokens when a resolver is given, else one plain run.
 * Line breaks (`\n`) stay inside the text; `wrapRuns` breaks there.
 */
export function parseInline(label: string, o: InlineOptions = {}): TextRun[] {
  const runs = o.markdown ? emphasis(label) : label ? [{ text: label, mark: null }] : [];
  if (!o.icons) return runs;
  const out: TextRun[] = [];
  for (const r of runs) iconRuns(r, o.icons, o.iconSize ?? 16, out);
  return out;
}

// ---- measuring and wrapping -------------------------------------------------------------------------------------

/** The font a run is drawn with: the text's font, bold or italic as the run says. */
export function runFont(font: FontSpec, r: TextRun): FontSpec {
  if (!r.bold && !r.italic) return font;
  const f: FontSpec = { ...font };
  if (r.bold) f.weight = 700;
  if (r.italic) f.style = 'italic';
  return f;
}

/** A run's advance: its text in its font, or the icon's size. */
export const runWidth = (r: TextRun, font: FontSpec, m: TextMeasurer): number => (r.icon ? r.icon.size : r.text ? m.width(r.text, runFont(font, r)) : 0);

/** A line's width. */
export const runsWidth = (runs: readonly TextRun[], font: FontSpec, m: TextMeasurer): number => runs.reduce((w, r) => w + runWidth(r, font, m), 0);

/** The width of the widest line (0 for none). */
export const runsBlockWidth = (lines: readonly (readonly TextRun[])[], font: FontSpec, m: TextMeasurer): number =>
  lines.reduce((w, l) => Math.max(w, runsWidth(l, font, m)), 0);

/** The plain text of runs (icons are empty). */
export const runsText = (runs: readonly TextRun[]): string => runs.map((r) => r.text).join('');

/** What runs read as for assistive technology: the text with each icon's name in its place (`car Car`). */
export const runsLabel = (runs: readonly TextRun[]): string => runs.map((r) => (r.icon ? r.icon.name : r.text)).join('').trim();

/** Runs that are one plain text (no styling, no icons): they wrap as plain text does. */
const isPlain = (runs: readonly TextRun[]): boolean => runs.every((r) => !r.icon && !r.bold && !r.italic && !r.mark && r.x === undefined);

interface Word {
  /** The space before the word (in its run's style), null at a paragraph's start and around icons. */
  lead: TextRun | null;
  runs: TextRun[];
}

/**
 * One paragraph's words: text split at spaces (as `wrap()` splits it), every icon a word of its own (the gap around
 * it is a break); the space before a word or an icon leads it.
 */
function words(runs: readonly TextRun[]): Word[] {
  const out: Word[] = [];
  let cur: Word = { lead: null, runs: [] };
  let afterIcon = false;
  for (const r of runs) {
    if (r.icon) {
      // the space before an icon leads it (dropped at a break), as a space leads a word
      if (cur.runs.length) out.push(cur);
      out.push({ lead: cur.runs.length ? null : cur.lead, runs: [r] });
      cur = { lead: null, runs: [] };
      afterIcon = true;
      continue;
    }
    r.text.split(' ').forEach((p, k) => {
      if (k > 0) {
        const lead = { ...r, text: ' ' };
        // the space after an icon leads the next word (there is no empty word between them)
        if (afterIcon && !cur.runs.length && !cur.lead) cur.lead = lead;
        else {
          out.push(cur);
          cur = { lead, runs: [] };
        }
        afterIcon = false;
      }
      if (p) {
        push(cur.runs, { ...r, text: p });
        afterIcon = false;
      }
    });
  }
  if (cur.runs.length || cur.lead || !out.length) out.push(cur);
  return out;
}

/** Splits runs at line breaks (`\n` in a text run), keeping each piece's style. */
function paragraphs(runs: readonly TextRun[]): TextRun[][] {
  const out: TextRun[][] = [[]];
  for (const r of runs) {
    if (r.icon) {
      out[out.length - 1]!.push(r);
      continue;
    }
    r.text.split('\n').forEach((p, k) => {
      if (k > 0) out.push([]);
      if (p) push(out[out.length - 1]!, { ...r, text: p });
    });
  }
  return out;
}

/**
 * Wraps runs into lines that fit `maxWidth` (0: break at `\n` only). A break goes at a space in a text run or next to
 * an icon, never inside a run's styling; the space at a break is dropped, as `wrap()` drops it. Plain runs wrap
 * exactly as `wrap()` wraps their text.
 */
export function wrapRuns(runs: readonly TextRun[], maxWidth: number, font: FontSpec, measure: TextMeasurer): TextRun[][] {
  if (isPlain(runs)) return wrap(runsText(runs), maxWidth, font, measure).map((l) => (l ? [{ text: l, mark: null }] : []));
  const out: TextRun[][] = [];
  for (const para of paragraphs(runs)) {
    if (!maxWidth) {
      out.push(para);
      continue;
    }
    let line: TextRun[] = [];
    for (const w of words(para)) {
      const cand = line.slice();
      if (line.length && w.lead) push(cand, w.lead);
      for (const r of w.runs) push(cand, r);
      if (line.length && runsWidth(cand, font, measure) > maxWidth) {
        out.push(line);
        line = w.runs.slice();
      } else line = cand;
    }
    out.push(line);
  }
  return out;
}
