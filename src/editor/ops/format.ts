// Text formatting in a label's markdown string (the toolbar's text format menu; ⌘B, ⌘I, ⌘U and ⇧⌘X in the text
// editor): bold and italic as Mermaid's markdown writes them (`**`, `*`), underline and strike as the inline HTML
// Mermaid passes through (`<u>`, `<s>`; core/text/rich.ts reads them). A format is toggled on a range of the text, or
// on the whole text when the range is empty; spaces at the range's ends stay outside the marks (`** a**` is not bold).

import { loadedMediaKit } from '../../core/media/kit.js';

export type TextFormat = 'b' | 'i' | 'u' | 's';

export const TEXT_FORMATS: readonly TextFormat[] = ['b', 'i', 'u', 's'];

export type TextFormats = Readonly<Record<TextFormat, boolean>>;

/** The marks a format is written with. */
const MARKS: Readonly<Record<TextFormat, readonly [string, string]>> = { b: ['**', '**'], i: ['*', '*'], u: ['<u>', '</u>'], s: ['<s>', '</s>'] };
const OPEN = /<(u|s|del|strike)>$/i, CLOSE = /^<\/(u|s|del|strike)>/i;

/** Marks a label can carry: emphasis delimiters or the underline / strike tags. */
const MARKUP = /[*_]|<\/?(?:u|s|del|strike)>/i;

/** The text has formatting marks (written as a markdown string, they are drawn). */
export const hasMarkup = (v: string): boolean => MARKUP.test(v);

const tagFormat = (name: string): 'u' | 's' => (name.toLowerCase() === 'u' ? 'u' : 's');

/** The range without the spaces at its ends; the whole text when it is empty. */
function words(v: string, a: number, b: number): [number, number] {
  if (a === b) [a, b] = [0, v.length];
  while (a < b && /\s/.test(v[a]!)) a++;
  while (b > a && /\s/.test(v[b - 1]!)) b--;
  return [a, b];
}

// two private-use characters the parser reads as letters: they mark where the range is in the parsed runs
const SA = '', SB = '';

/**
 * The formats every letter of `a`..`b` is drawn with, read by the renderer's own parser (core/text/rich.ts, through
 * the media kit, which the editor code of the types with rich labels loads; without it, a text has no formats).
 */
function drawn(v: string, a: number, b: number): TextFormats {
  // the markers go right next to the letters, past the marks the range starts or ends with: there they read as the
  // letters beside them do, and leave every star's meaning as it was
  for (;;) {
    const m = v[a] === '*' ? 1 : /^<\/?(u|s|del|strike)>/i.exec(v.slice(a, b))?.[0].length ?? 0;
    if (!m || a + m > b) break;
    a += m;
  }
  for (;;) {
    const m = v[b - 1] === '*' ? 1 : /<\/?(u|s|del|strike)>$/i.exec(v.slice(a, b))?.[0].length ?? 0;
    if (!m || b - m < a) break;
    b -= m;
  }
  const runs = loadedMediaKit()?.labelRuns(v.slice(0, a) + SA + v.slice(a, b) + SB + v.slice(b), { markdown: true }) ?? [];
  const on = { b: true, i: true, u: true, s: true };
  let inside = false, any = false;
  for (const r of runs)
    for (const ch of r.text) {
      if (ch === SA) inside = true;
      else if (ch === SB) inside = false;
      else if (inside && /\S/u.test(ch)) {
        any = true;
        on.b &&= !!r.bold;
        on.i &&= !!r.italic;
        on.u &&= !!r.underline;
        on.s &&= !!r.strike;
      }
    }
  return any ? on : { b: false, i: false, u: false, s: false };
}

/** Which formats the range (or the whole text) has: on when every letter of it is drawn so. */
export function formatsAt(v: string, a: number, b: number): TextFormats {
  const [x, y] = words(v, a, b);
  return drawn(v, x, y);
}

/** Takes spans out of the text and maps a position of the old text into the new one. */
function cut(v: string, spans: readonly [number, number][]): { text: string; map: (p: number) => number } {
  const sorted = [...spans].sort((p, q) => p[0] - q[0]);
  let text = '', at = 0;
  for (const [s, e] of sorted) {
    text += v.slice(Math.max(at, 0), s);
    at = Math.max(at, e);
  }
  text += v.slice(at);
  const map = (p: number): number => p - sorted.reduce((d, [s, e]) => d + Math.min(Math.max(p - s, 0), e - s), 0);
  return { text, map };
}

/** The marks of format `f` inside `a`..`b`: its tags, or the stars of bold (two of a run) or italic (one of an odd run). */
function innerMarks(v: string, a: number, b: number, f: TextFormat): [number, number][] {
  const out: [number, number][] = [];
  if (f === 'u' || f === 's') {
    for (const m of v.slice(a, b).matchAll(/<\/?(u|s|del|strike)>/gi)) if (tagFormat(m[1]!) === f) out.push([a + m.index!, a + m.index! + m[0].length]);
    return out;
  }
  for (let i = a; i < b; ) {
    if (v[i] !== '*') {
      i++;
      continue;
    }
    let n = 0;
    while (i + n < b && v[i + n] === '*') n++;
    if (f === 'b' && n >= 2) out.push([i, i + 2]);
    if (f === 'i' && n % 2 === 1) out.push([i, i + 1]);
    i += n;
  }
  return out;
}

/** One mark next to the words: a run of stars, or a tag, at `from`..`to`. */
interface Mark {
  from: number;
  to: number;
  k: '*' | 'u' | 's';
}

/** The marks touching `a`..`b` from outside, inner first: stars and opening tags on the left, stars and closing tags on the right. */
function shells(v: string, a: number, b: number): { left: Mark[]; right: Mark[] } {
  const left: Mark[] = [], right: Mark[] = [];
  for (let p = a; ; ) {
    let q = p;
    while (v[q - 1] === '*') q--;
    if (q < p) {
      left.push({ from: q, to: p, k: '*' });
      p = q;
      continue;
    }
    const t = OPEN.exec(v.slice(Math.max(0, p - 8), p));
    if (!t) break;
    left.push({ from: p - t[0].length, to: p, k: tagFormat(t[1]!) });
    p -= t[0].length;
  }
  for (let p = b; ; ) {
    let q = p;
    while (v[q] === '*') q++;
    if (q > p) {
      right.push({ from: p, to: q, k: '*' });
      p = q;
      continue;
    }
    const t = CLOSE.exec(v.slice(p, p + 9));
    if (!t) break;
    right.push({ from: p, to: p + t[0].length, k: tagFormat(t[1]!) });
    p += t[0].length;
  }
  return { left, right };
}

/** The marks of `f` right around the words on both sides (a run of just the stars needed first: `***` is bold and italic), or none. */
function around(v: string, a: number, b: number, f: TextFormat): [number, number][] {
  const { left, right } = shells(v, a, b);
  if (f === 'u' || f === 's') {
    const l = left.find((m) => m.k === f), r = right.find((m) => m.k === f);
    return l && r ? [[l.from, l.to], [r.from, r.to]] : [];
  }
  const n = f === 'b' ? 2 : 1;
  const pick = (ms: Mark[]): Mark | undefined => {
    const st = ms.filter((m) => m.k === '*');
    return st.find((m) => m.to - m.from === n) ?? st.find((m) => m.to - m.from === 3) ?? st.find((m) => m.to - m.from > n);
  };
  const l = pick(left), r = pick(right);
  return l && r ? [[l.to - n, l.to], [r.from, r.from + n]] : [];
}

/**
 * Toggles format `f` on the range (or the whole text): the new text and the range of the formatted words in it. On:
 * the format's marks inside the words come off, then its marks go right around them. Off: its marks inside and right
 * around the words come off; words inside a longer span (`Gateway` of `**API Gateway**`) split it (`**API** Gateway`).
 */
export function toggleFormat(v: string, a0: number, b0: number, f: TextFormat): { text: string; a: number; b: number } {
  const [a, b] = words(v, a0, b0);
  const [o, c] = MARKS[f];
  const on = drawn(v, a, b)[f];
  // the format's own marks inside the words
  const inner = cut(v, innerMarks(v, a, b, f));
  let w = inner.text, x = inner.map(a), y = inner.map(b);
  if (!on) return { text: w.slice(0, x) + o + w.slice(x, y) + c + w.slice(y), a: x + o.length, b: y + o.length };
  if (drawn(w, x, y)[f]) {
    const near = cut(w, around(w, x, y, f));
    [w, x, y] = [near.text, near.map(x), near.map(y)];
  }
  if (drawn(w, x, y)[f]) {
    // inside a longer span: it is closed after the word before them and opened again before the word after them; a
    // span that would be empty there (it opened right before the words, or closed right after them) loses that mark
    let p = x, q = y;
    while (p > 0 && /\s/.test(w[p - 1]!)) p--;
    while (q < w.length && /\s/.test(w[q]!)) q++;
    // stars: enough of a run there (its inner ones go: `***` closing bold and italic keeps `*`); a tag: just it
    const star = o[0] === '*';
    let k = 0;
    while (star && w[p - 1 - k] === '*') k++;
    let m = 0;
    while (star && w[q + m] === '*') m++;
    const dropOpen = star ? k >= o.length : p >= o.length && w.slice(p - o.length, p) === o;
    const dropClose = star ? m >= c.length : w.slice(q, q + c.length) === c;
    const before = dropOpen ? w.slice(0, p - o.length) : w.slice(0, p) + c;
    const after = dropClose ? w.slice(q + c.length) : o + w.slice(q);
    const d = before.length - p;
    return { text: before + w.slice(p, q) + after, a: x + d, b: y + d };
  }
  return { text: w, a: x, b: y };
}
