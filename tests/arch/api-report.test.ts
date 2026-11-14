// The public API report (A15): what every export of every package entry is — a value's type, an interface's members
// and a type alias's definition — as a reviewed snapshot next to the list of names (exports.test.ts). A change of a
// public signature (a new required option, a renamed member, a narrowed return type) shows up as a diff here even when
// no name changes. Update with `UPDATE_API_REPORT=1 pnpm vitest run tests/arch/api-report.test.ts` and review the diff.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const ENTRIES = ['adapters', 'core', 'diff', 'editor', 'markdown', 'react', 'studio', 'theme-editor', 'viewer', 'worker-inline'];
const SNAPSHOT = join(__dirname, '__snapshots__', 'api-report.txt');

// the types by their names (a qualified name carries the machine's path)
const oneLine = (s: string): string => s.replace(/import\("[^"]+"\)\./g, '').replace(/\s+/g, ' ').trim();
const clip = (s: string, n = 400): string => (s.length > n ? `${s.slice(0, n)}…` : s);

function report(): string {
  const files = ENTRIES.map((e) => join(ROOT, 'src', `${e}.ts`));
  const parsed = ts.getParsedCommandLineOfConfigFile(join(ROOT, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  const program = ts.createProgram(files, { ...parsed!.options, noEmit: true });
  const checker = program.getTypeChecker();
  const lines: string[] = [];
  ENTRIES.forEach((e, i) => {
    lines.push(`## ${e}`);
    const sf = program.getSourceFile(files[i]!)!;
    const mod = checker.getSymbolAtLocation(sf);
    const exports = (mod ? checker.getExportsOfModule(mod) : []).slice().sort((a, b) => a.getName().localeCompare(b.getName()));
    for (const s of exports) {
      const t = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
      const decl = t.declarations?.[0];
      let shape: string;
      if (t.flags & ts.SymbolFlags.Value && decl) {
        shape = checker.typeToString(checker.getTypeOfSymbolAtLocation(t, decl), undefined, ts.TypeFormatFlags.NoTruncation);
      } else if (decl && ts.isInterfaceDeclaration(decl)) {
        shape = `{ ${checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(t)).map((p) => `${p.getName()}${p.flags & ts.SymbolFlags.Optional ? '?' : ''}`).join(', ')} }`;
      } else if (decl && ts.isTypeAliasDeclaration(decl)) {
        shape = `= ${decl.type.getText()}`;
      } else shape = '';
      lines.push(clip(oneLine(`${s.getName()}${t.flags & ts.SymbolFlags.Value ? '' : ' (type)'}: ${shape}`)));
    }
  });
  return `${lines.join('\n')}\n`;
}

describe('public API report', () => {
  it('matches the reviewed report', () => {
    const now = report();
    const update = process.env['UPDATE_API_REPORT'] === '1';
    if (update || !existsSync(SNAPSHOT)) writeFileSync(SNAPSHOT, now);
    expect(now).toBe(readFileSync(SNAPSHOT, 'utf8'));
  });
});
