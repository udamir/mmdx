// Architecture checks over src/ (run by tests/arch): the import graph against the layer model, and the module rules of
// the kernel contract. Each check returns stable keys (no line numbers) so a baseline of today's violations can be
// kept in tests/arch/baseline/ and only ever shrink.
//
// Layers (temp/component-architecture.md §4): core and reactive 0 → dom, adapters 1 → ui 2 → dom/canvas 3 → view 4 →
// editor / diff / theme-editor 5 → elements, markdown, wrappers 6 → entries 7.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') ? [join(d, e.name)] : [],
  );

/** [layer rank, area] of a file path relative to src/. */
export function layerOf(r) {
  if (r === 'core.ts') return [7, 'entry'];
  if (r.startsWith('core/')) return [0, 'core'];
  if (r.startsWith('reactive/')) return [0, 'reactive'];
  if (r === 'config.ts') return [0, 'config'];
  if (r.startsWith('icons/') || r.startsWith('emoji/')) return [0, 'data'];
  if (r === 'dom/canvas.ts') return [3, 'dom/canvas'];
  if (r.startsWith('dom/')) return [1, 'dom'];
  if (r.startsWith('adapters/')) return [1, 'adapters'];
  if (r.startsWith('ui/')) return [2, 'ui'];
  if (r.startsWith('view/')) return [4, 'view'];
  if (r.startsWith('editor/')) return [5, 'editor'];
  if (r.startsWith('diff/')) return [5, 'diff'];
  if (r.startsWith('theme-editor/')) return [5, 'theme-editor'];
  if (/^(elements|markdown|wrappers)\//.test(r)) return [6, r.split('/')[0]];
  return [7, 'entry'];
}

/**
 * Core's sub-layer (architecture §8.1, core.md diagram 3) of a file relative to src/core/: C0 base types · C1 kind
 * contract · C2 resources · C3 parse · C4 layout · C5 render · C6 ops · C7 diff and export · C8 kind implementations ·
 * C9 assembly. A stage's `types.ts` is C0 (its contract types). Overrides: the icon name grammar is C0 (text reads it),
 * the style stripper parses (C3), and the lazy media kit's implementation draws (C5).
 */
export function coreLayerOf(r) {
  if (r === 'icons/names.ts') return 0;
  if (r === 'strip-styles.ts') return 3;
  if (r === 'media/kit-impl.ts') return 5;
  if (/^(kinds\/all[^/]*|pipeline|context|parse\/index|render\/index|diff\/all|all|extras)\.ts$/.test(r)) return 9;
  if (/^kinds\/(types|ops-types|diff-types|info|names|registry)\.ts$/.test(r) || r === 'summary.ts' || r.startsWith('kind/')) return 1;
  if (/^(types|geom|own|style|validate|model|ids)\.ts$/.test(r) || /^(text|scene)\//.test(r) || /^[^/]+\/types\.ts$/.test(r)) return 0;
  if (/^(meta|theme|shapes|icons|media|schema)\//.test(r) || /^(context-base|layers|item-lines|starter)\.ts$/.test(r)) return 2;
  if (r.startsWith('parse/')) return 3;
  if (r.startsWith('layout/')) return 4;
  if (r.startsWith('render/') || r === 'pipeline-core.ts') return 5;
  if (r.startsWith('ops/')) return 6;
  if (r.startsWith('diff/') || r.startsWith('export/')) return 7;
  if (r.startsWith('kinds/') || r === 'outline.ts') return 8;
  return 9;
}

const PRODUCTS = new Set(['editor', 'diff', 'theme-editor']);

/** Every relative import / re-export / dynamic import in src/: { from, to, kind: 'value' | 'type' | 'dynamic' }. */
export function importEdges(root) {
  const SRC = join(root, 'src');
  const rel = (f) => relative(SRC, f).split('\\').join('/');
  const edges = [];
  for (const f of walk(SRC)) {
    const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
    const from = rel(f);
    const target = (spec) => {
      if (!spec.startsWith('.')) return null;
      const p = resolve(dirname(f), spec);
      for (const c of [p.replace(/\.js$/, '.ts'), `${p}.ts`, join(p, 'index.ts'), p]) if (existsSync(c) && c.endsWith('.ts')) return rel(c);
      return existsSync(p) ? relative(SRC, p).split('\\').join('/') : null;
    };
    const visit = (n) => {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const to = target(n.moduleSpecifier.text);
        if (to) {
          let typeOnly;
          if (ts.isImportDeclaration(n)) {
            const c = n.importClause;
            typeOnly = !!c && (c.isTypeOnly || (!c.name && !!c.namedBindings && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly)));
          } else typeOnly = n.isTypeOnly || (!!n.exportClause && ts.isNamedExports(n.exportClause) && n.exportClause.elements.length > 0 && n.exportClause.elements.every((e) => e.isTypeOnly));
          edges.push({ from, to, kind: typeOnly ? 'type' : 'value' });
        }
      } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
        const to = target(n.arguments[0].text);
        if (to) edges.push({ from, to, kind: 'dynamic' });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return edges;
}

/** Why an import edge breaks the layer model, or null. Dynamic imports count: they are how products load each other. */
export function edgeViolation(e) {
  const [lf, af] = layerOf(e.from), [lt, at] = layerOf(e.to);
  const mod = (r) => /^editor\/modules\/([^/]+)\//.exec(r)?.[1];
  if (lt > lf) return `upward ${af} → ${at}`;
  if (PRODUCTS.has(af) && PRODUCTS.has(at) && af !== at) return `product → product ${af} → ${at}`;
  if (/^ui\/blocks\//.test(e.from) && !/^(ui|reactive)\//.test(e.to) && !/^core\/(types|diff|text|icons|shapes|model)/.test(e.to) && at !== 'adapters') return `block → ${at}`;
  if (at === 'reactive' && af === 'core') return 'core → reactive (core holds no state)';
  if (mod(e.from) && mod(e.to) && mod(e.from) !== mod(e.to)) return `module → module ${mod(e.from)} → ${mod(e.to)}`;
  if (/^editor\/kinds\//.test(e.from) && /^editor\/modules\//.test(e.to)) return 'editor kinds → editor module';
  if (/^view\/modules\/[^/]+$/.test(e.from) && /^view\/modules\/[^/]+$/.test(e.to) && !/index|viewer|lazy/.test(e.from)) return 'view module → view module';
  if (/^core\/(ops|kinds)\//.test(e.from) && /^core\/render\/(flowchart|sequence|er|state|mindmap)\.ts$/.test(e.to)) return 'ops/kinds → full renderer';
  if (af === 'core' && at === 'core') {
    const cf = coreLayerOf(e.from.slice(5)), ct = coreLayerOf(e.to.slice(5));
    if (ct > cf) return `upward core C${cf} → C${ct}`;
  }
  return null;
}

/** Stable keys of every layer violation: `from → to [kind] (why)`, sorted and de-duplicated. */
export function layerViolations(root) {
  const out = new Set();
  for (const e of importEdges(root)) {
    const why = edgeViolation(e);
    if (why) out.add(`${e.from} → ${e.to} [${e.kind}] (${why})`);
  }
  return [...out].sort();
}

/**
 * File-level import cycles (strongly connected components over value and type imports; dynamic imports load later and
 * do not count): one stable key per cycle, its files sorted.
 */
export function importCycles(root) {
  const next = new Map();
  for (const e of importEdges(root)) if (e.kind !== 'dynamic') (next.get(e.from) ?? next.set(e.from, []).get(e.from)).push(e.to);
  let n = 0;
  const index = new Map(), low = new Map(), stack = [], on = new Set(), out = [];
  const visit = (v) => {
    index.set(v, n);
    low.set(v, n++);
    stack.push(v);
    on.add(v);
    for (const w of next.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) !== index.get(v)) return;
    const c = [];
    let w;
    do {
      w = stack.pop();
      on.delete(w);
      c.push(w);
    } while (w !== v);
    if (c.length > 1) out.push(c.sort().join(' ↔ '));
  };
  for (const v of next.keys()) if (!index.has(v)) visit(v);
  return out.sort();
}

/**
 * The module rules (rule 2 of .claude/rules.md, architecture §8.2 rule 5): view, editor and diff modules reach the
 * kernel only through their scope. Counted per file and rule: `core.dom`-style DOM access, direct store writes, bare
 * `core.on(` (the unsubscribe is dropped unless kept by hand) and bare `computed(` (never disposed).
 */
export const MODULE_RULES = {
  'kernel DOM': /\bcore\.(dom|root|area|canvas|slots)\b/g,
  'store write': /\bstore\.[A-Za-z]+\.set\(/g,
  'bare core.on': /(?<![.\w])core\.on\(/g,
  'bare computed': /(?<![.\w])computed\(/g,
};

/** `file: rule ×count` for every module file that breaks a module rule, sorted. */
export function moduleViolations(root) {
  const SRC = join(root, 'src');
  const out = [];
  for (const dir of ['editor/modules', 'view/modules', 'diff/modules']) {
    for (const f of walk(join(SRC, dir))) {
      const text = readFileSync(f, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '');
      const r = relative(SRC, f).split('\\').join('/');
      for (const [rule, re] of Object.entries(MODULE_RULES)) {
        const n = (text.match(re) ?? []).length;
        if (n) out.push(`${r}: ${rule} ×${n}`);
      }
    }
  }
  return out.sort();
}

/**
 * Compares found keys with a baseline. `added`: new violations (fail); `fixed`: baseline entries that no longer occur
 * (fail too, so the baseline is shrunk in the same change). Count keys (`… ×n`) may go down only by updating the line.
 */
export function compareBaseline(found, baseline) {
  const have = new Set(found), was = new Set(baseline);
  return { added: found.filter((k) => !was.has(k)), fixed: baseline.filter((k) => !have.has(k)) };
}

export const readBaseline = (file) =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [];
