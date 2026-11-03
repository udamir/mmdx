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
  const f = Object.keys(v.outs).find((x) => v.outs[x].entryPoint === `src/core/kinds/${k}.ts`);
  const extra = [...v.closure(f)].filter((x) => !v.base.has(x));
  if (k === 'flowchart') flow.push(...extra);
  // 62.4 kB with the kind descriptor (T01: the kinds registry and the type's view kind, +0.6 kB); 61.6 kB with the 0.3 host hooks (+0.4 kB: the host's full screen in the zoom bar, setControls, registerThemes); 61 kB with the 0.3 fixes (+0.2 kB: own-key reads and writes in the metadata parser, the patcher drawing the diff's styled runs itself instead of through a hook the diff installed). 60.8 kB with the view kernel (component architecture §10.1: 60.3 kB once the kernel was split into modules, the blocks gained roving focus and the elements a shared lifecycle; 53.4 kB with every chrome module but the zoom bar on demand; 46 kB before). Provisional (decision 19 is open).
  report(`viewer (first ${k})`, v.size(v.base) + v.size(extra), 62.4 * KB);
}
// the viewer with History opened on a flowchart (no `@mmdx/studio/diff` on the page any more)
{
  const loaded = new Set([...v.base, ...flow]);
  const hist = [...lazy(v, 'src/diff/history.ts', loaded), ...lazy(v, 'src/core/kinds/flowchart-diff.ts', loaded)];
  // 123.6 kB with the kind descriptor too (History also loads the flowchart's diff kind: 123.1 kB measured); 123.6 kB with the 0.3 fixes and host hooks together; 122.6 kB with History in place (the version panel first, the version view, animated switches, the overlay scrollbars); 113.4 kB once History loaded no parser or renderer it did not need
  report('viewer + History opened', v.size(loaded) + v.size(new Set(hist)), 123.6 * KB);
}
// core includes the diff engine (diffs, merged model, annotations, reports, renderDiffToSvg)
// editor: 180 kB once the editor loads diagram types on demand (T01.9: 178.2 kB without the code of the types not shown; every type's editor code is a chunk of its own, measured in the "editor (first <type>)" rows); 188.2 kB with the view kernel (187.7 kB after the kernel split, the blocks merge and the element lifecycle; 173.2 kB measured in phase 3; 184.3 kB summed per chunk once History loads the clipboard ops on demand, which splits them into chunks of their own: 177.9 kB as one stream, as before; 165 kB before the kernel), provisional like the viewer's
// diff: 86.5 kB with the kind descriptor (the per-type diffs left the entry for the diff kinds: 85.5 kB measured); 88.2 kB with the 0.3 fixes and host hooks together (87.8 kB before; 87.3 kB with animated pair switches, the Layers card and the overlay scrollbars; 84.8 kB after the kernel split, the blocks merge and the element lifecycle; component architecture §10.1: 81.8 kB once the all-kinds `diffDiagrams` left the entry and the side panels load on demand; 90.8 kB in phase 4a). The 60 kB target needs the kernel split further (decision 19).
for (const [entry, budget] of [['core', 55], ['theme-editor', 120], ['editor', 180], ['diff', 86.5]]) {
  const b = await bundle(entry);
  report(entry, b.size(b.base), budget * KB);
  if (entry === 'editor') {
    // the editor with a document of each type: its view, ops and edit kinds in one chunk (T01.9; 181.9, 187.4 and 180.4 kB measured)
    for (const k of ['flowchart', 'sequence', 'er']) report(`editor (first ${k})`, b.size(b.base) + b.size(lazy(b, `src/editor/kinds/${k}.ts`, b.base)), 189 * KB);
    // 224 kB once the editor loads diagram types on demand (220.7 kB measured); 233 kB before
    report('editor + History opened', b.size(b.base) + b.size(lazy(b, 'src/diff/history.ts', b.base)), 224 * KB);
  }
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
// a core kind's chunk (view kind `flowchart`, diff kind `flowchart-diff`): its own chunk, or (core imports it statically
// too) the shared chunk the viewer and the diff load it from
const kindChunk = (name) =>
  manifest[`src/core/kinds/${name}.ts`] ? `src/core/kinds/${name}.ts` : Object.keys(manifest).find((k) => !k.startsWith('src/') && manifest[k].isDynamicEntry && manifest[k].name === name);
const FLOW = kindChunk('flowchart');
const FLOW_DIFF = kindChunk('flowchart-diff');
const HISTORY = ['src/view/modules/history.ts', 'src/diff/history.ts'];
// budgets: the measurement once History stopped importing the editor's chunk and the diff its kinds and panels (component architecture §10.1), plus about 2 kB; the viewer, editor and diff rows re-measured after the kernel split, the blocks merge and the element lifecycle, and the viewer + History and diff rows again after History in place, plus about 0.5 kB; the viewer and diff rows again with the 0.3 host hooks (the `worker-inline` entry puts the worker client into a chunk of its own), plus about 0.3 kB, and the viewer + History and diff rows once more with the 0.3 fixes and the hooks together, plus about 0.3 kB
const rows = [
  // 63.8 kB with the kind descriptor (T01); 63.2 kB before
  ['viewer (first flowchart)', ['src/viewer.ts', FLOW], 63.8],
  // the History button is in the tool dock, which loads with the `history` control (246.5 kB while History imported the editor's chunk)
  ['viewer + History opened', ['src/viewer.ts', FLOW, 'src/view/modules/tool-dock.ts', ...HISTORY, FLOW_DIFF], 133],
  // the editor loads diagram types on demand (T01.9): 181 kB (178.8 kB measured; 194.6 kB before), the first document's type a chunk of its own
  ['editor', ['src/editor.ts'], 181],
  // 184.2 kB measured
  ['editor (first flowchart)', ['src/editor.ts', 'src/editor/kinds/flowchart.ts'], 186],
  ['editor + History opened', ['src/editor.ts', ...HISTORY], 230],
  // 125.2 kB while the entry re-exported the all-kinds diff
  // 92.5 kB once the per-type diffs left the entry for the diff kinds (90.9 kB measured); 94.6 kB before
  ['diff', ['src/diff.ts'], 92.5],
  // a flowchart pair with the default panels (the change list) and the flowchart's diff kind
  ['diff (first flowchart)', ['src/diff.ts', FLOW, FLOW_DIFF, 'src/diff/modules/panels.ts'], 118.1],
  // 65.8 kB with the kind descriptor: the same code in more, smaller chunks (one per kind and layer), each compressed on its own (54.6 kB as one esbuild stream); 63 kB before
  ['core', ['src/core.ts'], 65.8],
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
