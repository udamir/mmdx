// Architecture guard (T01): code outside a diagram type's own files never branches on the type. Each type's behaviour
// lives in its kinds (core/kinds/<type>*.ts, editor/kinds/<type>.ts) and its own files (parse/<type>.ts,
// render/<type>.ts, ops/<type>.ts, diff/<type>.ts, its editor module); generic code asks the type's kind instead.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIAGRAM_TYPES } from '../../src/core/kinds/info.js';

const ROOT = join(__dirname, '../..');
const SRC = join(ROOT, 'src');

/** A type's own files and folders, where branching on it is the point. */
const OWN = [
  /^src\/core\/kinds\//,
  /^src\/editor\/kinds\//,
  /\/(flowchart|sequence|er)\.ts$/,
  /^src\/editor\/modules\/(sequence|er-table)\//,
  /^src\/editor\/modules\/panels\/props-er\.ts$/,
];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

const types = DIAGRAM_TYPES.join('|');
/** `….type === 'flowchart'`, `type !== 'er'`, `case 'sequence':` and the like. */
const BRANCH = new RegExp(`(\\btype\\s*[!=]==?\\s*'(${types})'|'(${types})'\\s*[!=]==?\\s*[\\w.]*type\\b|case\\s+'(${types})'\\s*:)`);

describe('no per-type branches outside the types\' own files', () => {
  it('generic code asks the kind instead of comparing the diagram type', () => {
    const found: string[] = [];
    for (const f of files(SRC)) {
      const rel = relative(ROOT, f).split('\\').join('/');
      if (OWN.some((r) => r.test(rel))) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (BRANCH.test(line)) found.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(found).toEqual([]);
  });

  it('the guard catches a branch', () => {
    expect(BRANCH.test("if (model.type === 'sequence') {")).toBe(true);
    expect(BRANCH.test("  case 'er':")).toBe(true);
    expect(BRANCH.test("const k = editKind(model.type);")).toBe(false);
  });
});
