// Word-level change marks (diff, §7.3): sentinels around removed and added words in a label of the merged diff
// picture. They survive wrapping (wrap splits on spaces) and measure as nothing (`withoutMarks`). The diff's
// annotation step (core/diff/annotate.ts) turns every marked line into the runs of a `TextLine`, which the serializer
// and the DOM patcher draw as `<tspan class="dx-del">` / `<tspan class="dx-ins">` — class tokens chosen there, never
// by content. Nothing else reads the marks, so a plain render never takes a character for one. A label drawn as
// rich runs (bold, italic, icons: core/text/rich.ts) keeps the marks inside its runs' text; `markStyledRuns` splits
// those runs at the marks, so a changed word keeps its styling (`class="dx-ins"` plus `font-weight`).
//
// The sentinels are Unicode noncharacters (U+FDD0…U+FDD3): reserved for internal use, they never occur in interchanged
// text. Zero-width characters would not do: ZWJ and ZWNJ are part of emoji sequences and of Persian and Indic words.
import type { TextRun } from '../scene/types.js';
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

/**
 * `markRuns` for lines already drawn as runs (rich text): every text run is split at the marks and keeps its styling;
 * an icon run takes the mark it stands in; a run's place (`x`) stays with its first piece.
 */
export function markStyledRuns(lines: readonly (readonly TextRun[])[]): TextRun[][] {
  let state: MarkKind | null = null;
  return lines.map((line) => {
    const out: TextRun[] = [];
    for (const r of line) {
      if (r.icon) {
        out.push({ ...r, mark: state ?? r.mark });
        continue;
      }
      let buf = '';
      let x = r.x;
      const flush = (): void => {
        if (!buf) return;
        const piece: TextRun = { ...r, text: buf, mark: state ?? r.mark };
        delete piece.x;
        if (x !== undefined) piece.x = x;
        x = undefined;
        out.push(piece);
        buf = '';
      };
      for (const ch of r.text) {
        if (!isMarkChar(ch)) buf += ch;
        else {
          flush();
          state = ch === MARK.DEL_OPEN ? 'del' : ch === MARK.INS_OPEN ? 'ins' : null;
        }
      }
      flush();
    }
    return out;
  });
}
