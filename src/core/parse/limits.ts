// Input limits (§12): a document over these is not parsed in full, so a hostile or runaway source cannot stall the
// editor or the viewer.
import { diag } from '../types.js';
import type { Diagnostic } from '../types.js';

/** Source size cap in UTF-16 code units (about 1 MB of ASCII). */
export const MAX_SOURCE_LENGTH = 1024 * 1024;
/** Cap on parsed items (nodes + groups + edges, participants + sequence items, entities + relationships). */
export const MAX_ITEMS = 5000;

export function tooLargeDiagnostic(length: number): Diagnostic {
  return diag('error', 'doc.too-large', `the diagram source is too large (${length} characters, the limit is ${MAX_SOURCE_LENGTH})`, undefined, {
    params: { length, limit: MAX_SOURCE_LENGTH },
  });
}

/** Longest single statement (a multi-line one joined) a parser reads; a longer one is `doc.too-complex`. */
export const MAX_STATEMENT_LENGTH = 64 * 1024;

/**
 * The lexer work a source may take, in steps: one per rule tried, plus the characters a scanning rule reads. Linear in
 * the source, with room for every legitimate diagram (the densest real sources take well under 40 steps a character);
 * a source that needs more is read in super-linear time by some rule, and parsing stops (B1, G13).
 */
export const lexBudget = (length: number): number => 256 * length + 100_000;

/** Thrown inside a parser when the source is past a limit; `guardParse` turns it into `doc.too-complex`. */
export class TooComplex extends Error {
  constructor(readonly reason: 'steps' | 'statement') {
    super(reason === 'steps' ? 'lexer step budget exceeded' : 'statement too long');
  }
}

/** Counts lexer steps against `lexBudget`. */
export class LexBudget {
  private left: number;
  constructor(length: number) {
    this.left = lexBudget(length);
  }
  step(n = 1): void {
    if ((this.left -= n) < 0) throw new TooComplex('steps');
  }
}

/** Fails when a statement being joined grows past `MAX_STATEMENT_LENGTH`. */
export function checkStatement(length: number): void {
  if (length > MAX_STATEMENT_LENGTH) throw new TooComplex('statement');
}

export function tooComplexDiagnostic(): Diagnostic {
  return diag('error', 'doc.too-complex', 'the diagram source is too complex to read (a line or statement is too long) — it is not shown', undefined, {
    params: { limit: MAX_STATEMENT_LENGTH },
  });
}

/** Codes of the diagnostics that mean "nothing is drawn": the viewer shows "Diagram too large" for them. */
export const TOO_BIG_CODES: ReadonlySet<string> = new Set(['doc.too-large', 'doc.too-many-items', 'doc.too-complex']);

/** Runs a parser; past a limit it gives the type's empty model with a `doc.too-complex` error (parsers never throw). */
export function guardParse<M extends { diagnostics: Diagnostic[] }>(empty: () => M, run: () => M): M {
  try {
    return run();
  } catch (e) {
    if (!(e instanceof TooComplex)) throw e;
    const m = empty();
    m.diagnostics.push(tooComplexDiagnostic());
    return m;
  }
}

/** Counts items as a parser adds them; the first refusal reports `doc.too-many-items` once. */
export class ItemBudget {
  private used = 0;
  over = false;

  constructor(
    private readonly diagnostics: Diagnostic[],
    private readonly max: number = MAX_ITEMS,
  ) {}

  take(line: number): boolean {
    if (this.over) return false;
    if (this.used >= this.max) {
      this.over = true;
      this.diagnostics.push(
        diag('error', 'doc.too-many-items', `the diagram has more than ${this.max} items — the rest is not shown`, line, {
          params: { limit: this.max },
        }),
      );
      return false;
    }
    this.used++;
    return true;
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
export const stripControl = (s: string): string => s.replace(CONTROL, '');
