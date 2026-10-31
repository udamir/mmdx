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
  // 55 kB with the view kernel (component architecture §10, phase-0 measurement: 53.4 kB with every chrome module but
  // the zoom bar loaded on demand; 46 kB before). Provisional until the eager / lazy split of the kernel is decided.
  report(`viewer (first ${k})`, v.size(v.base) + v.size(extra), 55 * KB);
}
// core includes the diff engine (diffs, merged model, annotations, reports, renderDiffToSvg)
// editor: 176 kB with the view kernel (173.2 kB measured; 165 kB before), provisional like the viewer's
// diff: 93 kB on the view kernel (component architecture §10, phase 4a: 90.8 kB measured; 86.7 kB before with every
// kind static). The renderers load on demand; the parsers stay in the entry for its synchronous `diffDiagrams`
// export (8.5 kB), the kernel and the blocks replace the diff's own chrome. The 60 kB target needs the panels on
// demand as in the viewer.
for (const [entry, budget] of [['core', 55], ['theme-editor', 120], ['editor', 176], ['diff', 93]]) {
  const b = await bundle(entry);
  report(entry, b.size(b.base), budget * KB);
}
process.exit(failed ? 1 : 0);
