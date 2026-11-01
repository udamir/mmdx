// Word-level change marks (diff, §7.3): sentinels around removed and added words in a label of the merged diff
// picture. They survive wrapping (wrap splits on spaces) and measure as nothing (`withoutMarks`). The diff's
// annotation step (core/diff/annotate.ts) turns every marked line into the runs of a `TextLine`, which the serializer
// and the DOM patcher draw as `<tspan class="dx-del">` / `<tspan class="dx-ins">` — class tokens chosen there, never
// by content. Nothing else reads the marks, so a plain render never takes a character for one.
//
// The sentinels are Unicode noncharacters (U+FDD0…U+FDD3): reserved for internal use, they never occur in interchanged
// text. Zero-width characters would not do: ZWJ and ZWNJ are part of emoji sequences and of Persian and Indic words.
import type { TextMeasurer } from './measure.js';

export const MARK = { DEL_OPEN: '﷐', DEL_CLOSE: '﷑', INS_OPEN: '﷒', INS_CLOSE: '﷓' } as const;

const ANY = /[﷐-﷓]/;
const ALL = /[﷐-﷓]/g;

export type MarkKind = 'ins' | 'del';

export interface MarkedRun {
  text: string;
  mark: MarkKind | null;
}

export const hasMarks = (s: string): boolean => ANY.test(s);
export const stripMarks = (s: string): string => s.replace(ALL, '');
export const isMarkChar = (ch: string): boolean => ch === MARK.DEL_OPEN || ch === MARK.DEL_CLOSE || ch === MARK.INS_OPEN || ch === MARK.INS_CLOSE;

/** `s` marked as removed words (empty stays empty). */
export const deleted = (s: string): string => (s ? MARK.DEL_OPEN + s + MARK.DEL_CLOSE : s);
/** `s` marked as added words (empty stays empty). */
export const inserted = (s: string): string => (s ? MARK.INS_OPEN + s + MARK.INS_CLOSE : s);

/** A measurer that gives marked text the width of its words. */
export const withoutMarks = (m: TextMeasurer): TextMeasurer => ({
  kind: m.kind,
  width: (text, font) => m.width(hasMarks(text) ? stripMarks(text) : text, font),
});

/**
 * Splits the lines of one text element into runs. A mark can open on one line and close on a later one (a long
 * removed phrase that wrapped), so the state carries from line to line.
 */
export function markRuns(lines: readonly string[]): MarkedRun[][] {
  let state: MarkKind | null = null;
  return lines.map((line) => {
    const out: MarkedRun[] = [];
    let buf = '';
    const flush = (): void => {
      if (buf) out.push({ text: buf, mark: state });
      buf = '';
    };
    for (const ch of line) {
      if (ch === MARK.DEL_OPEN || ch === MARK.INS_OPEN) {
        flush();
        state = ch === MARK.DEL_OPEN ? 'del' : 'ins';
      } else if (ch === MARK.DEL_CLOSE || ch === MARK.INS_CLOSE) {
        flush();
        state = null;
      } else buf += ch;
    }
    flush();
    return out;
  });
}
