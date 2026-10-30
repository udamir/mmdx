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
