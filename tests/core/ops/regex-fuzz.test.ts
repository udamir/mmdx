// Regex fuzz (X11, task 4.7): every RegExp literal of the parsers and the ops, run on adversarial lines (long runs of
// spaces, of word characters, of brackets and quotes, a near-miss at the end) — catastrophic backtracking shows as
// a match that takes far longer than the line is long. Part of the adversarial corpus (tests/core/parse/adversarial).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../src/core');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : []));

/** Every RegExp literal in a file, with its line. */
function literals(file: string): { re: RegExp; at: string }[] {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: { re: RegExp; at: string }[] = [];
  const walk = (n: ts.Node): void => {
    if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const t = n.getText(src), end = t.lastIndexOf('/');
      // sticky patterns stay sticky: they are tried at one position (a lexer's), never scanned along the line
      const flags = t.slice(end + 1).replace(/g/g, '');
      out.push({ re: new RegExp(t.slice(1, end), flags), at: `${relative(ROOT, file)}:${src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1}` });
    }
    n.forEachChild(walk);
  };
  walk(src);
  return out;
}

const L = 8000;
const INPUTS = [
  ' '.repeat(L) + 'x', '\t'.repeat(L) + '!', 'a'.repeat(L) + '!', 'a '.repeat(L / 2) + '"', '-'.repeat(L) + '>x', '='.repeat(L) + '\n',
  '('.repeat(L / 2), '['.repeat(L / 2) + ']', '{'.repeat(L / 2), '"'.repeat(L) + "'", '%%'.repeat(L / 2), ':'.repeat(L) + 'x',
  'a,'.repeat(L / 2) + ';', '#'.repeat(L) + ';', 'A-->'.repeat(L / 4) + '|', '@{'.repeat(L / 2) + '}', '``'.repeat(L / 2), 'x|'.repeat(L / 2) + '\n',
];

describe('regex fuzz: the parsers\' and the ops\' RegExps on adversarial lines', () => {
  // the shared parsers and ops, and each type's own (core/kinds/<type>/parse*.ts, ops*.ts, A12)
  const kindFiles = files(join(ROOT, 'kinds')).filter((f) => /[\\/]kinds[\\/][^\\/]+[\\/](parse|ops)[^\\/]*\.ts$/.test(f) && !/ops-kind\.ts$/.test(f));
  const all = [...files(join(ROOT, 'parse')), ...files(join(ROOT, 'ops')), ...kindFiles].flatMap(literals);

  it('finds the RegExps', () => {
    expect(all.length).toBeGreaterThan(150);
  });

  it('every RegExp answers each line in linear time (no catastrophic backtracking)', () => {
    const slow: string[] = [];
    for (const { re, at } of all) {
      for (const s of INPUTS) {
        re.lastIndex = 0;
        const t = performance.now();
        re.test(s);
        const ms = performance.now() - t;
        if (ms > 40) slow.push(`${at} ${re} on ${JSON.stringify(s.slice(0, 6))}…: ${ms.toFixed(0)} ms`);
      }
    }
    expect(slow).toEqual([]);
  });
});
