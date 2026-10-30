// Bundle size gate (§2, §14, R5). Each entry is bundled the way a consumer's bundler ships it (esbuild, minified,
// code splitting) and gzipped. The viewer budget applies to the first diagram on screen: the viewer's static imports
// plus the lazily loaded parser/renderer of that diagram type. Exits 1 when anything is over budget.
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { cssTemplatesEsbuild } from './css-templates.mjs';

const KB = 1024;
const out = 'node_modules/.cache/mmdx-size';
const gz = (f) => gzipSync(readFileSync(f), { level: 9 }).length;
let failed = false;
const report = (name, bytes, budget) => {
  const ok = bytes <= budget;
  failed ||= !ok;
  console.log(`${name.padEnd(24)} ${(bytes / KB).toFixed(1).padStart(6)} kB gzip / ${budget / KB} kB  ${ok ? 'ok' : 'OVER BUDGET'}`);
};

async function bundle(entry) {
  const dir = `${out}/${entry}`;
  rmSync(dir, { recursive: true, force: true });
  const r = await build({
    entryPoints: [`src/${entry}.ts`], bundle: true, format: 'esm', minify: true, splitting: true, outdir: dir,
    external: ['mermaid'], metafile: true, logLevel: 'error', plugins: [cssTemplatesEsbuild()],
  });
  const outs = r.metafile.outputs;
  const closure = (f, seen = new Set()) => {
    if (seen.has(f)) return seen;
    seen.add(f);
    for (const i of outs[f].imports) if (i.kind === 'import-statement') closure(i.path, seen);
    return seen;
  };
  const main = Object.keys(outs).find((k) => k.endsWith(`/${entry}.js`));
  const base = closure(main);
  const size = (files) => [...files].reduce((n, f) => n + gz(f), 0);
  return { outs, closure, base, size };
}

const v = await bundle('viewer');
for (const k of ['flowchart', 'sequence', 'er']) {
  const f = Object.keys(v.outs).find((x) => x.includes(`kind-${k}-`) && x.endsWith('.js'));
  const extra = [...v.closure(f)].filter((x) => !v.base.has(x));
  report(`viewer (first ${k})`, v.size(v.base) + v.size(extra), 45 * KB);
}
for (const [entry, budget] of [['core', 45], ['theme-editor', 120], ['editor', 165]]) {
  const b = await bundle(entry);
  report(entry, b.size(b.base), budget * KB);
}
process.exit(failed ? 1 : 0);
