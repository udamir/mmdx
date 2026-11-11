// The jison lexers' shared parts (X2, task 4.3): the source as Mermaid's preprocessing hands it to the lexer, and the
// first-match step over a start condition's rules (sticky RegExps and predicate rules, charged against the step
// budget, B1). The ER and state parsers lex with them; the line-based parsers do not load this module.
import { frontmatterSpan } from './frontmatter.js';
import type { LexBudget } from './limits.js';
import type { LineScan } from './line-scan.js';

// ---- the source as Mermaid's lexer sees it ---------------------------------------------------------------------------

/**
 * The code as Mermaid's preprocessing hands it to the lexer, with every offset kept: the frontmatter, `%%{…}%%`
 * directives and `%%` comment lines blanked; `#\w+;` entities as one run of non-ASCII placeholders around the name
 * (Mermaid encodes them before lexing; the text is read back from the code); the last `;` of a `style` / `classDef`
 * line with a colour dropped, as Mermaid does; a line break added at the end. Returns the frontmatter lines too.
 */
export function prepareSource(code: string): { src: string; front: string[] } {
  const chars = code.replace(/\r/g, ' ').split('');
  const blank = (s: number, e: number): void => {
    for (let i = s; i < e; i++) if (chars[i] !== '\n') chars[i] = ' ';
  };
  const text = (): string => chars.join('');
  const fm = frontmatterSpan(code.replace(/\r/g, ' '));
  if (fm) blank(0, fm.end);
  // directives, then whole comment lines
  for (const m of text().matchAll(/%%\{[\s\S]*?\}%%/g)) blank(m.index, m.index + m[0].length);
  for (const m of text().matchAll(/^[^\S\n]*%%(?!\{)[^\n]*$/gm)) blank(m.index, m.index + m[0].length);
  // `style …:#…;` / `classDef …:#…;`: Mermaid drops the last `;` before it encodes entities
  for (const m of text().matchAll(/(?:style|classDef).*:\S*#.*;/g)) chars[m.index + m[0].length - 1] = ' ';
  // entities: `#9829;` → one run (the text is read back from the code, where it is decoded)
  for (const m of text().matchAll(/#\w+;/g)) {
    chars[m.index] = 'ﬂ';
    chars[m.index + m[0].length - 1] = '¶';
  }
  return { src: text() + '\n', front: fm?.lines ?? [] };
}

// ---- the jison lexer's first-match step ---------------------------------------------------------------------------

/**
 * A lexer rule: a sticky RegExp, or a `test` giving the match length at a position (-1: none) where the RegExp would
 * re-read the line at every token (B1). `scan`: how far a failed attempt of the RegExp may read (`line`: to the end of
 * the line, `all`: of the source); it is charged that much against the step budget.
 */
export interface LexRule<A> {
  re: RegExp;
  act: A;
  test?: (L: LineScan, pos: number) => number;
  scan?: 'line' | 'all';
}

/** A rule over a case-insensitive sticky RegExp (jison's `case-insensitive` lexers). */
export const lexRule = <A>(re: string, act: A, more: Partial<LexRule<A>> = {}): LexRule<A> => ({ re: new RegExp(re, 'iy'), act, ...more });

/**
 * The first rule of a start condition (`order`: the rule indexes, in jison's first-match order) that matches at `pos`:
 * its text and action, or null. Every attempt costs one step of the budget; a scanning RegExp costs what it read.
 */
export function firstMatch<A>(rules: readonly LexRule<A>[], order: readonly number[], src: string, pos: number, L: LineScan, budget: LexBudget): { m: string; act: A } | null {
  for (const i of order) {
    const r = rules[i]!;
    budget.step();
    if (r.test) {
      const n = r.test(L, pos);
      if (n >= 0) return { m: src.slice(pos, pos + n), act: r.act };
      continue;
    }
    r.re.lastIndex = pos;
    const m = r.re.exec(src)?.[0] ?? null;
    if (r.scan) budget.step(m !== null ? m.length : r.scan === 'line' ? L.lineEnd(pos) - pos : src.length - pos);
    if (m !== null) return { m, act: r.act };
  }
  return null;
}
