// Unused-export gate (tests/arch/exports-unused.test.ts; audit success criterion, D10/D14): every value a src/ module
// exports (function, class, const, let, enum) that no other file in src/, tests/, stories/, apps/ or .storybook/ names
// and that no public entry (src/*.ts) re-exports. Such an export is dead (nobody names it) or self-only (only its own
// file uses it, so it needs no export). Names are matched as words, which is lenient: a name another file uses for
// something else counts as used, so the gate never flags a live export. Types stay out: interfaces and type aliases are
// a block's or a port's contract. Keys are `file › name` (no line numbers), so a baseline survives edits above them.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const TREES = ['src', 'tests', 'stories', 'apps', '.storybook'];
const SKIP = /[\\/](node_modules|icons[\\/]data|emoji[\\/]data)([\\/]|$)/;

const walk = (d) => {
  let entries;
  try {
    entries = readdirSync(d, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    const p = join(d, e.name);
    if (SKIP.test(p)) return [];
    return e.isDirectory() ? walk(p) : /\.(ts|mts|js|mjs)$/.test(e.name) && !e.name.endsWith('.d.ts') ? [p] : [];
  });
};

const exported = (n) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** The value names a module declares and exports itself (not the ones it re-exports from another module). */
function ownValueExports(sf) {
  const out = [];
  for (const s of sf.statements) {
    if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s) || ts.isEnumDeclaration(s)) && exported(s) && s.name) out.push(s.name.text);
    else if (ts.isVariableStatement(s) && exported(s))
      for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) out.push(d.name.text);
    // `export { a, b }` of local declarations (no `from`)
    else if (ts.isExportDeclaration(s) && !s.moduleSpecifier && !s.isTypeOnly && s.exportClause && ts.isNamedExports(s.exportClause))
      for (const e of s.exportClause.elements) if (!e.isTypeOnly) out.push(e.name.text);
  }
  return out;
}

/** The names the public entries (src/*.ts) export. */
function publicNames(root) {
  const names = new Set();
  for (const e of readdirSync(join(root, 'src'))) {
    if (!/\.ts$/.test(e) || e.endsWith('.d.ts')) continue;
    const sf = ts.createSourceFile(e, readFileSync(join(root, 'src', e), 'utf8'), ts.ScriptTarget.Latest, true);
    for (const s of sf.statements)
      if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause))
        for (const x of s.exportClause.elements) names.add((x.propertyName ?? x.name).text);
  }
  return names;
}

/** `file › name` of every own value export of a non-entry src/ module that no other file names and no entry exports. */
export function unusedExports(root) {
  const files = TREES.flatMap((t) => walk(join(root, t)));
  // word → the files it appears in
  const seen = new Map();
  const texts = new Map();
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    texts.set(f, text);
    for (const w of new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? [])) (seen.get(w) ?? seen.set(w, new Set()).get(w)).add(f);
  }
  const pub = publicNames(root);
  const out = [];
  for (const f of files) {
    const file = relative(join(root, 'src'), f).split('\\').join('/');
    if (file.startsWith('..') || !file.includes('/') || !f.endsWith('.ts')) continue; // outside src/, or an entry
    const sf = ts.createSourceFile(f, texts.get(f), ts.ScriptTarget.Latest, true);
    for (const name of ownValueExports(sf)) {
      if (pub.has(name)) continue;
      const users = seen.get(name);
      if (![...(users ?? [])].some((u) => u !== f)) out.push(`${file} › ${name}`);
    }
  }
  return out.sort();
}
