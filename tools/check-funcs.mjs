// Function-size gate (tests/arch/funcs.test.ts): every function, method or closure in src/ longer than MAX_LINES.
// Keys are `file › name` (no line numbers), so a baseline stays valid while code above a function moves.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

export const MAX_LINES = 300;

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') ? [join(d, e.name)] : [],
  );

/** `{ key: 'file › name', lines }` for every function over `max` lines, longest first. */
export function longFunctions(root, max = MAX_LINES) {
  const out = [];
  for (const f of walk(join(root, 'src')).filter((f) => !/[\\/](icons|emoji)[\\/]data/.test(f))) {
    const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
    const file = relative(join(root, 'src'), f).split('\\').join('/');
    const name = (n) => {
      if (ts.isConstructorDeclaration(n)) return 'constructor';
      if (n.name && ts.isIdentifier(n.name)) return n.name.text;
      const p = n.parent;
      if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) && ts.isIdentifier(p.name)) return p.name.text;
      if (p && ts.isCallExpression(p)) return `<arg of ${p.expression.getText(sf).slice(0, 30)}>`;
      return '<anon>';
    };
    const visit = (n) => {
      if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isConstructorDeclaration(n)) {
        const lines = sf.getLineAndCharacterOfPosition(n.getEnd()).line - sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
        if (lines > max) out.push({ key: `${file} › ${name(n)}`, lines });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out.sort((a, b) => b.lines - a.lines);
}
