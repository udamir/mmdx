// Bundle size gate (§2, §14, R5; component architecture §10). Two measurements, both gzipped per chunk and summed (what a browser downloads), exit 1 when anything is over budget:
// 1. Consumer bundles: each entry bundled on its own the way a consumer's bundler ships it (esbuild, minified, code splitting). The viewer budget applies to the first diagram on screen: the viewer's static imports plus the lazily loaded parser/renderer of that diagram type.
// 2. The library build: the real multi-entry `vite build` of vite.lib.config.ts (what `dist/` ships), whose shared chunks a per-entry bundle never sees. A row is the static import closure of an entry plus the lazy chunks a scenario loads (a diagram kind, History opened), each chunk's whitespace minified first (the library build keeps it for its pure annotations).
import { build } from 'esbuild';
import { transform } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build as viteBuild } from 'vite';
import { cssTemplatesEsbuild } from './css-templates.mjs';

const KB = 1024;
// a private directory per run: several checkouts (worktrees) share node_modules
const out = mkdtempSync(join(tmpdir(), 'mmdx-size-'));
const gz = (f) => gzipSync(readFileSync(f), { level: 9 }).length;
let failed = false;
const report = (name, bytes, budget) => {
  const ok = bytes <= budget;
  failed ||= !ok;
  console.log(`${name.padEnd(32)} ${(bytes / KB).toFixed(1).padStart(6)} kB gzip / ${budget / KB} kB  ${ok ? 'ok' : 'OVER BUDGET'}`);
};

// ---- 1. consumer bundles (esbuild, one entry at a time) ---------------------------------------------------------------

async function bundle(entry) {
  const dir = `${out}/esbuild/${entry}`;
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

/** The chunks a dynamic import of `input` adds to what is loaded already. */
const lazy = (b, input, loaded) => {
  const f = Object.keys(b.outs).find((x) => b.outs[x].entryPoint === input);
  return f ? [...b.closure(f)].filter((x) => !loaded.has(x)) : [];
};

console.log('consumer bundles (esbuild, per entry)');
const v = await bundle('viewer');
const flow = [];
for (const k of ['flowchart', 'sequence', 'er']) {
  const f = Object.keys(v.outs).find((x) => x.includes(`kind-${k}-`) && x.endsWith('.js'));
  const extra = [...v.closure(f)].filter((x) => !v.base.has(x));
  if (k === 'flowchart') flow.push(...extra);
  // 61 kB since 0.2.1 (+0.2 kB: own-key reads and writes in the metadata parser, the patcher drawing the diff's styled runs itself instead of through a hook the diff installed). 60.8 kB with the view kernel (component architecture §10.1: 60.3 kB once the kernel was split into modules, the blocks gained roving focus and the elements a shared lifecycle; 53.4 kB with every chrome module but the zoom bar on demand; 46 kB before). Provisional (decision 19 is open).
  report(`viewer (first ${k})`, v.size(v.base) + v.size(extra), 61 * KB);
}
// the viewer with History opened on a flowchart (no `@mmdx/studio/diff` on the page any more)
{
  const loaded = new Set([...v.base, ...flow]);
  const hist = lazy(v, 'src/diff/history.ts', loaded);
  // 122.6 kB with History in place (the version panel first, the version view, animated switches, the overlay scrollbars); 113.4 kB once History loaded no parser or renderer it did not need
  report('viewer + History opened', v.size(loaded) + v.size(hist), 123.1 * KB);
}
// core includes the diff engine (diffs, merged model, annotations, reports, renderDiffToSvg)
// editor: 188.2 kB with the view kernel (187.7 kB after the kernel split, the blocks merge and the element lifecycle; 173.2 kB measured in phase 3; 184.3 kB summed per chunk once History loads the clipboard ops on demand, which splits them into chunks of their own: 177.9 kB as one stream, as before; 165 kB before the kernel), provisional like the viewer's
// diff: 87.8 kB (87.3 kB with animated pair switches, the Layers card and the overlay scrollbars; 84.8 kB after the kernel split, the blocks merge and the element lifecycle; component architecture §10.1: 81.8 kB once the all-kinds `diffDiagrams` left the entry and the side panels load on demand; 90.8 kB in phase 4a). The 60 kB target needs the kernel split further (decision 19).
for (const [entry, budget] of [['core', 55], ['theme-editor', 120], ['editor', 188.2], ['diff', 87.8]]) {
  const b = await bundle(entry);
  report(entry, b.size(b.base), budget * KB);
  if (entry === 'editor') report('editor + History opened', b.size(b.base) + b.size(lazy(b, 'src/diff/history.ts', b.base)), 233 * KB);
}

// ---- 2. the library build (vite, every entry at once, shared chunks) -------------------------------------------------

console.log('library build (vite, dist/ chunks)');
const lib = `${out}/lib`;
await viteBuild({ configFile: 'vite.lib.config.ts', logLevel: 'error', build: { outDir: lib, emptyOutDir: true, manifest: true, sourcemap: false } });
const manifest = JSON.parse(readFileSync(`${lib}/.vite/manifest.json`, 'utf8'));
const libSize = new Map();
const chunkSize = async (key) => {
  if (!libSize.has(key)) {
    const code = readFileSync(`${lib}/${manifest[key].file}`, 'utf8');
    const min = await transform(code, { minifyWhitespace: true, format: 'esm', logLevel: 'error' });
    libSize.set(key, gzipSync(min.code, { level: 9 }).length);
  }
  return libSize.get(key);
};
const libClosure = (key, seen = new Set()) => {
  if (!manifest[key]) throw new Error(`size: ${key} is not a chunk of the library build`);
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const i of manifest[key].imports ?? []) libClosure(i, seen);
  return seen;
};
/** What a scenario loads: the static closures of the entry and of the lazy chunks it opens. */
const loads = async (keys) => {
  const all = new Set();
  for (const k of keys) libClosure(k, all);
  let n = 0;
  for (const k of all) n += await chunkSize(k);
  return { n, all };
};
const FLOW = 'src/core/kind-flowchart.ts';
const HISTORY = ['src/view/modules/history.ts', 'src/diff/history.ts'];
// budgets: the measurement once History stopped importing the editor's chunk and the diff its kinds and panels (component architecture §10.1), plus about 2 kB; the viewer, editor and diff rows re-measured after the kernel split, the blocks merge and the element lifecycle, and the viewer + History and diff rows again after History in place, plus about 0.5 kB
const rows = [
  ['viewer (first flowchart)', ['src/viewer.ts', FLOW], 62],
  // the History button is in the tool dock, which loads with the `history` control (246.5 kB while History imported the editor's chunk)
  ['viewer + History opened', ['src/viewer.ts', FLOW, 'src/view/modules/tool-dock.ts', ...HISTORY], 131.6],
  ['editor', ['src/editor.ts'], 194.6],
  ['editor + History opened', ['src/editor.ts', ...HISTORY], 245.6],
  // 125.2 kB while the entry re-exported the all-kinds diff
  ['diff', ['src/diff.ts'], 93.6],
  // a flowchart pair with the default panels (the change list)
  ['diff (first flowchart)', ['src/diff.ts', FLOW, 'src/diff/modules/panels.ts'], 117.1],
  ['core', ['src/core.ts'], 63],
];
for (const [name, keys, budget] of rows) report(name, (await loads(keys)).n, budget * KB);
// the History chunk must not pull the editor in (component architecture §10): none of the chunks only the editor loads statically is in its static closure (shared: whatever the viewer and the diff can load, History aside)
{
  const shared = new Set();
  const reach = (k) => {
    if (shared.has(k) || HISTORY.includes(k)) return;
    shared.add(k);
    for (const i of [...(manifest[k].imports ?? []), ...(manifest[k].dynamicImports ?? [])]) reach(i);
  };
  reach('src/viewer.ts');
  reach('src/diff.ts');
  const editorOnly = new Set([...libClosure('src/editor.ts')].filter((k) => !shared.has(k)));
  const pulled = [...libClosure('src/diff/history.ts')].filter((k) => editorOnly.has(k));
  if (pulled.length) {
    failed = true;
    console.log(`History's static closure imports the editor's chunks ${pulled.map((k) => manifest[k].file).join(', ')}  FAILED`);
  } else console.log('History imports no editor-only chunk                ok');
}

rmSync(out, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
