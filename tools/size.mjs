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
for (const k of ['flowchart', 'sequence', 'er', 'mindmap']) {
  const f = Object.keys(v.outs).find((x) => v.outs[x].entryPoint === `src/core/kinds/${k}.ts`);
  const extra = [...v.closure(f)].filter((x) => !v.base.has(x));
  if (k === 'flowchart') flow.push(...extra);
  // flowchart 84, sequence and ER 67.4 kB with mindmaps (T08: 83.6, 67 and 66.7 kB measured; every viewer +0.2 kB: the mindmap section of the bundled default theme, the type's header, names and metadata keys); mindmap 69.3 kB (68.9 kB measured: its parser, the tidy tree layout and the renderer in its own chunk; bang, cloud and the media kit load with the shapes beyond the 17)
  // flowchart 83.4 kB with the compound layout (T07: 83 kB measured, +5.1 kB: the compound layout (core/layout/compound.ts, 3.5 kB) and the router around subgraphs (core/layout/route.ts, 0.7 kB), which the flowchart's renderer uses statically, and the renderer's own part, +0.8 kB; sequence and ER unchanged, 66.5 and 66.3 kB, the engine is in the flowchart's chunk only)
  // flowchart 77.9, sequence and ER 66.9 kB with flowchart content (T06: 77.5, 66.5 and 66.1 kB measured; every viewer +0.7 kB: the browser's image size lookup, the edge animation CSS, the accessible title and description, the "Animate edges" setting; the flowchart's parser and renderer +4.8 kB: icon and image node layout, markdown and icon-token labels through the media kit, invisible links, edge ids and data, curves, the frontmatter settings, `classDef default`, tooltips, the title. The media kit itself — rich text, icons, images — is a lazy chunk loaded with the shapes beyond the 17, in the "more shapes" row)
  // flowchart 72.4, sequence and ER 66 kB with the icon registry (T04: 72, 65.5 and 65.2 kB measured; +2.8 kB: the registry every context carries — packs, lazy loaders, lookups, change events, the worker's snapshot, Mermaid's pack list — the reference forms and the scan of a source for the icons the worker needs; the code that validates and decodes icon bodies and the built-in set are lazy chunks)
  // flowchart 69.6, sequence and ER 63.1 kB with media in the scene (T03: 69.2, 62.7 and 62.4 kB measured; +0.8 kB: the grapheme-counting static measurer, the serializer and the patcher drawing `<image>` and styled runs, the image policy's default in every context, the render's diagnostics, the PNG export's missing-images report; the policy check, the placeholder, rich text and the PNG image inlining are not in it)
  // flowchart: 68.8 kB once the shapes beyond the 17 load on demand (T02.9: 68.4 kB measured, their geometry a chunk of its own, the "extended shapes" row; what stays over the 62 kB before the catalogue is the 17's outlines, text boxes and sizing, the outline clipping of connector ends, the node data reader and the name table of every shape, which the parser needs). Sequence and ER 62.4 kB: 62.0 and 61.6 kB measured (+0.4 kB: the viewer's base loads the shapes when a render misses one); the name table comes with the flowchart's parser.
  // 72.6 kB with the shape catalogue (T02: Mermaid's 53 flowchart shapes plus the figures, each with its outline, text box and sizing, the node data reader and the outline clipping of connector ends; 72.2 kB measured, the catalogue alone about 8 kB). Sequence and ER only load the 17 shapes every renderer draws (61.6 and 61.2 kB measured).
  // 62.4 kB with the kind descriptor (T01: the kinds registry and the type's view kind, +0.6 kB); 61.6 kB with the 0.3 host hooks (+0.4 kB: the host's full screen in the zoom bar, setControls, registerThemes); 61 kB with the 0.3 fixes (+0.2 kB: own-key reads and writes in the metadata parser, the patcher drawing the diff's styled runs itself instead of through a hook the diff installed). 60.8 kB with the view kernel (component architecture §10.1: 60.3 kB once the kernel was split into modules, the blocks gained roving focus and the elements a shared lifecycle; 53.4 kB with every chrome module but the zoom bar on demand; 46 kB before). Provisional (decision 19 is open).
  report(`viewer (first ${k})`, v.size(v.base) + v.size(extra), (k === 'flowchart' ? 84 : k === 'mindmap' ? 69.3 : 67.4) * KB);
}
// a flowchart that draws one of the shapes beyond the 17 (T02.9): their geometry, 4.3 kB, loads before it renders (72.7 kB measured; 73.5 kB with media in the scene, T03; 76.3 kB with the icon registry, T04); since T06 the chunk also holds the media kit (rich labels, icons, images), which a flowchart with markdown, icon tokens, icon or image nodes loads the same way (86.8 kB measured: +5.5 kB the flowchart's own growth, +5 kB the kit); 92.7 kB with the compound layout (T07, 92.3 kB measured: the flowchart's +5.1 kB)
// 93.4 kB with mindmaps (T08, 93 kB measured: the viewer's +0.2 kB)
report('viewer (flowchart, more shapes)', v.size(v.base) + v.size(new Set([...flow, ...lazy(v, 'src/core/shapes/extended.ts', new Set([...v.base, ...flow]))])), 93.4 * KB);
// the built-in icon set (T04 §4.7: about 250 Tabler icons with keywords and the Font Awesome look-alikes), a lazy chunk of its own that loads with the first built-in icon; the decoder (body validation and transforms) loads with the first icon of any pack (19.1 and 2.5 kB measured; 20.1 kB in the library build)
{
  const icons = lazy(v, 'src/icons/builtin.ts', v.base);
  if (!icons.length) {
    failed = true;
    console.log('the built-in icon set is not a lazy chunk of the viewer  FAILED');
  }
  report('built-in icons (lazy chunk)', v.size(new Set(icons)), 25 * KB);
  report('icon decoder (lazy chunk)', v.size(new Set(lazy(v, 'src/core/icons/decode.ts', v.base))), 2.6 * KB);
}
// the viewer with History opened on a flowchart (no `@mmdx/studio/diff` on the page any more)
{
  const loaded = new Set([...v.base, ...flow]);
  const hist = [...lazy(v, 'src/diff/history.ts', loaded), ...lazy(v, 'src/core/kinds/flowchart-diff.ts', loaded)];
  // 144.9 kB with the compound layout (T07, 144.5 kB measured: the flowchart's +5.1 kB)
  // 139.4 kB with flowchart content (T06, 139 kB measured: the viewer's +0.7 kB and the flowchart's +4.8 kB)
  // 133.9 kB with the icon registry (T04, 133.5 kB measured: the viewer's +2.8 kB)
  // 131.1 kB with media in the scene (T03, 130.7 kB measured: the viewer's +0.8 kB, and the diff's marks inside styled runs); 130 kB once the shapes beyond the 17 load on demand (T02.9, 129.6 kB measured); 133.8 kB with the shape catalogue (T02, 133.3 kB measured); 123.6 kB with the kind descriptor too (History also loads the flowchart's diff kind: 123.1 kB measured); 123.6 kB with the 0.3 fixes and host hooks together; 122.6 kB with History in place (the version panel first, the version view, animated switches, the overlay scrollbars); 113.4 kB once History loaded no parser or renderer it did not need
  // 145.6 kB with mindmaps (T08, 145.2 kB measured: the viewer's +0.2 kB and the diff's)
  report('viewer + History opened', v.size(loaded) + v.size(new Set(hist)), 145.6 * KB);
}
// core includes the diff engine (diffs, merged model, annotations, reports, renderDiffToSvg)
// editor: 180 kB once the editor loads diagram types on demand (T01.9: 178.2 kB without the code of the types not shown; every type's editor code is a chunk of its own, measured in the "editor (first <type>)" rows); 188.2 kB with the view kernel (187.7 kB after the kernel split, the blocks merge and the element lifecycle; 173.2 kB measured in phase 3; 184.3 kB summed per chunk once History loads the clipboard ops on demand, which splits them into chunks of their own: 177.9 kB as one stream, as before; 165 kB before the kernel), provisional like the viewer's
// diff: 86.5 kB with the kind descriptor (the per-type diffs left the entry for the diff kinds: 85.5 kB measured); 88.2 kB with the 0.3 fixes and host hooks together (87.8 kB before; 87.3 kB with animated pair switches, the Layers card and the overlay scrollbars; 84.8 kB after the kernel split, the blocks merge and the element lifecycle; component architecture §10.1: 81.8 kB once the all-kinds `diffDiagrams` left the entry and the side panels load on demand; 90.8 kB in phase 4a). The 60 kB target needs the kernel split further (decision 19).
// core 64.8 and editor 192.2 kB with the shape catalogue (T02: 64.4 and 191.8 kB measured; the editor's first chunk already held the flowchart's parser and ops, which now read the catalogue, and the ops splice statements instead of regenerating lines)
// core 64.4, editor 188.1 and diff 86.3 kB once the shapes beyond the 17 load with the flowchart's editor code (T02.9: 64, 187.7 and 85.9 kB measured; the parser and the ops read the name table only, the diff loads the shapes when a render misses one)
// core 65.7, editor 189.1 and diff 87.3 kB with media in the scene (T03: 65.3, 188.7 and 86.9 kB measured; what the viewer gained, plus in core the image policy check exported and in the diff its marks inside styled runs)
// core 70.8, editor 191.5 and diff 89.6 kB with the icon registry (T04: 70.4, 191.1 and 89.2 kB measured; the registry stub in the editor and the diff, +2.4 and +2.3 kB; in core also `createIconRegistry` with the decoder loaded at once, for synchronous lookups on the server, and `iconNamesOf`, +5.1 kB)
// editor 197 kB with the insert dock (T05: 196.5 kB measured, +5.4 kB: the dock's Text, Image, Icons, Container and Connector buttons, their shortcuts and labels, the emoji button of the inline editor, the toolbar's and Properties' media hooks, the menu drag shared with the icon picker, the popover's focus trap; the shape palette block, the pickers, the Connector and Container tools and the emoji data are lazy chunks, measured in their own rows)
// theme-editor: 117.5 kB with T05 (113.8 kB before; its style toolbar's shape picker is the ShapePalette block)
// core 79.5, theme editor 127.3 and diff 90.4 kB with flowchart content (T06: 79.1, 126.9 and 90 kB measured; core and the theme editor carry the flowchart's parser and renderer and the media kit statically, +8.7 and +9.4 kB; the diff +0.8 kB, what every viewer gained). The editor stays within 197 kB (196.1 kB measured): the flowchart's renderer left its base chunk (the presets the portable export reads are a module of their own), which makes room for the parser's growth, the inline editor's Bold, Italic and "Make rich text" and the resize of icon and image nodes
// core 85.4, theme editor 133.3 and editor 197.4 kB with the compound layout (T07: 85, 132.9 and 197 kB measured; core and the theme editor carry the flowchart's renderer statically, +5.9 kB with "Reset positions in this group" in core's ops; the editor's base +0.9 kB: that action in the group toolbar's menu, the board menu on a group and Properties). The diff is unchanged (90.1 kB)
// core 94.1, theme editor 141.4, editor 199.3 and diff 91 kB with mindmaps (T08: 93.7, 141, 198.9 and 90.6 kB measured; core and the theme editor carry every kind statically, +8.3 and +7.7 kB: the mindmap's parser, tidy tree layout, renderer, ops and diff; the editor +1.5 kB: the mindmap module's keys, which come before the canvas's, the type's names, the Page properties hook, previews per diagram type and the theme section — its kinds and gestures are lazy chunks, measured in the "editor (first mindmap)" row; the diff +0.2 kB, what every viewer gained)
for (const [entry, budget] of [['core', 94.1], ['theme-editor', 141.4], ['editor', 199.3], ['diff', 91]]) {
  const b = await bundle(entry);
  report(entry, b.size(b.base), budget * KB);
  if (entry === 'editor') {
    // the editor with a document of each type: its view, ops and edit kinds in one chunk (T01.9; 181.9, 187.4 and 180.4 kB measured)
    // 201.5 kB with the shape catalogue (T02: 195.4, 201 and 194 kB measured); 197.3 kB once the shapes beyond the 17 load with the flowchart's editor code (T02.9: 195.9, 196.9 and 189.9 kB measured)
    // 198.4 kB with media in the scene (T03: 197, 198 and 190.9 kB measured); 200.8 kB with the icon registry (T04: 199.4, 200.4 and 193.4 kB measured)
    // 207 kB with the insert dock (T05: 206.5, 205.8 and 198.7 kB measured; the editor's +5.4 kB, and in the flowchart's edit kind the icon and image node ops and the palette's sections)
    // 219 kB with flowchart content (T06: 218.6, 205.7 and 198.4 kB measured; the flowchart's +12.1 kB: its renderer's growth, the media kit, which the catalogue the edit kind reads registers with the shapes, and the parser's growth in the base)
    // 225.6 kB with the compound layout (T07: 225.2, 206.6 and 199.2 kB measured; the flowchart's +5.1 kB and the editor's +0.9 kB)
    // 227.6 kB with mindmaps (T08: 227.2, 208.4 and 201.1 kB measured: the editor's +1.5 kB)
    for (const k of ['flowchart', 'sequence', 'er']) report(`editor (first ${k})`, b.size(b.base) + b.size(lazy(b, `src/editor/kinds/${k}.ts`, b.base)), 227.6 * KB);
    {
      // a mindmap: its kinds and the mindmap module's gestures, both loaded with the first mindmap (T08: 228.3 kB measured; the view, ops and edit kinds with the geometry of bang and cloud and the media kit, which its edit kind registers as the flowchart's does, and the drag, handles and keys of the outline)
      const kind = lazy(b, 'src/editor/kinds/mindmap.ts', b.base);
      const gestures = lazy(b, 'src/editor/modules/mindmap/gestures.ts', new Set([...b.base, ...kind]));
      report('editor (first mindmap)', b.size(b.base) + b.size(new Set([...kind, ...gestures])), 228.7 * KB);
    }
    // the insert dock's lazy chunks (T05): the pickers (icon picker, image tool, emoji picker and their glue), the shape palette block, the Connector and Container tools, the English emoji data (§4.5: at most 30 kB)
    const loaded = new Set([...b.base, ...lazy(b, 'src/editor/kinds/flowchart.ts', b.base)]);
    report('editor pickers (lazy chunk)', b.size(new Set(lazy(b, 'src/editor/modules/insert/media.ts', loaded))), 12.6 * KB);
    report('shape palette (lazy chunk)', b.size(new Set(lazy(b, 'src/ui/blocks/shape-palette.ts', loaded))), 4 * KB);
    report('insert tools (lazy chunk)', b.size(new Set(lazy(b, 'src/editor/modules/insert/tools.ts', loaded))), 3 * KB);
    report('emoji data, English (lazy chunk)', b.size(new Set(lazy(b, 'src/emoji/en.ts', loaded))), 30 * KB);
    // 234.6 kB with the icon registry (T04, 234.2 kB measured)
    // 232.1 kB with media in the scene (T03, 231.7 kB measured); 230.7 kB once the shapes beyond the 17 load with the flowchart's editor code (T02.9, 230.3 kB measured); 234.8 kB with the shape catalogue (T02, 234.3 kB measured); 224 kB once the editor loads diagram types on demand (220.7 kB measured); 233 kB before
    // 239.9 kB with the insert dock (T05, 239.5 kB measured: the editor's +5.4 kB)
    // 240.5 kB with the compound layout (T07, 240.1 kB measured: the editor's +0.9 kB)
    // 242.4 kB with mindmaps (T08, 242 kB measured: the editor's +1.5 kB)
    report('editor + History opened', b.size(b.base) + b.size(lazy(b, 'src/diff/history.ts', b.base)), 242.4 * KB);
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
// a core module the viewer and the diff load on demand (view kind `flowchart`, diff kind `flowchart-diff`, the shapes
// beyond the 17): its own chunk, or (core imports it statically too) the shared chunk they load it from
const lazyChunk = (path, name) =>
  manifest[path] ? path : Object.keys(manifest).find((k) => !k.startsWith('src/') && manifest[k].isDynamicEntry && manifest[k].name === name);
const kindChunk = (name) => lazyChunk(`src/core/kinds/${name}.ts`, name);
const FLOW = kindChunk('flowchart');
const FLOW_DIFF = kindChunk('flowchart-diff');
const SHAPES = lazyChunk('src/core/shapes/extended.ts', 'extended');
const BUILTIN_ICONS = lazyChunk('src/icons/builtin.ts', 'builtin');
const HISTORY = ['src/view/modules/history.ts', 'src/diff/history.ts'];
// budgets: the measurement once History stopped importing the editor's chunk and the diff its kinds and panels (component architecture §10.1), plus about 2 kB; the viewer, editor and diff rows re-measured after the kernel split, the blocks merge and the element lifecycle, and the viewer + History and diff rows again after History in place, plus about 0.5 kB; the viewer and diff rows again with the 0.3 host hooks (the `worker-inline` entry puts the worker client into a chunk of its own), plus about 0.3 kB, and the viewer + History and diff rows once more with the 0.3 fixes and the hooks together, plus about 0.3 kB
// the shape catalogue (T02) added about 10 kB to every row with flowchart code (each row's measurement in its comment);
// loading the shapes beyond the 17 on demand (T02.9) took about 4 kB of it out of the viewer's, the diff's and the editor's first chunks again;
// media in the scene (T03) added about 0.7 kB to the viewer's, the editor's and the diff's rows (each row's measurement in its comment);
// the icon registry (T04) about 2.5 kB to every component's rows and 5.6 kB to core's (each row's measurement in its comment)
const rows = [
  // 70.8 kB once the shapes beyond the 17 load on demand (T02.9, 70.4 kB measured); 74.8 kB with the shape catalogue (74.3 kB measured); 63.8 kB with the kind descriptor (T01); 63.2 kB before
  // 71.5 kB with media in the scene (T03, 71.1 kB measured); 74.7 kB with the icon registry (T04, 74.3 kB measured)
  // 80.1 kB with flowchart content (T06, 79.7 kB measured: the viewer's +0.7 kB and the flowchart's parser and renderer; the media kit is in the shapes' lazy chunk)
  // 85.7 kB with the compound layout (T07, 85.3 kB measured: the flowchart's renderer +5.1 kB)
  // 86.3 kB with mindmaps (T08, 85.9 kB measured: the viewer's +0.2 kB, the theme's mindmap section and the type's names)
  ['viewer (first flowchart)', ['src/viewer.ts', FLOW], 86.3],
  // a flowchart that draws one of the shapes beyond the 17: their geometry loads before it renders (T02.9, 74.7 kB measured)
  // 75.8 kB with media in the scene (T03, 75.4 kB measured); 79 kB with the icon registry (T04, 78.6 kB measured)
  // 89.9 kB with flowchart content (T06, 89.5 kB measured: the chunk also holds the media kit)
  // 95.5 kB with the compound layout (T07, 95.1 kB measured)
  // 96.2 kB with mindmaps (T08, 95.8 kB measured)
  ['viewer (flowchart, more shapes)', ['src/viewer.ts', FLOW, SHAPES], 96.2],
  // the built-in icon set, a lazy chunk of its own (T04 §4.7: at most 25 kB)
  ['built-in icons (lazy chunk)', [BUILTIN_ICONS], 25],
  // the History button is in the tool dock, which loads with the `history` control (246.5 kB while History imported the editor's chunk); 143 kB with the shape catalogue (142.4 kB measured); 138.9 kB once the shapes beyond the 17 load on demand (T02.9, 138.5 kB measured)
  // 140 kB with media in the scene (T03, 139.6 kB measured); 143.1 kB with the icon registry (T04, 142.7 kB measured)
  // 148.6 kB with flowchart content (T06, 148.2 kB measured)
  // 154.2 kB with the compound layout (T07, 153.8 kB measured)
  // 154.9 kB with mindmaps (T08, 154.5 kB measured)
  ['viewer + History opened', ['src/viewer.ts', FLOW, 'src/view/modules/tool-dock.ts', ...HISTORY, FLOW_DIFF], 154.9],
  // the editor loads diagram types on demand (T01.9): 181 kB (178.8 kB measured; 194.6 kB before), the first document's type a chunk of its own; 191.6 kB with the shape catalogue (191.2 kB measured); 187.4 kB once the shapes beyond the 17 load with the flowchart's editor code (T02.9, 187 kB measured)
  // 188.4 kB with media in the scene (T03, 188 kB measured); 191.1 kB with the icon registry (T04, 190.7 kB measured)
  // 194.5 kB with the insert dock (T05, 194.1 kB measured: the dock's buttons, shortcuts and labels, the inline editor's emoji button, the media hooks of the toolbar and Properties; the pickers and the emoji data are lazy)
  // 194.9 kB with the compound layout (T07, 194.5 kB measured: "Reset positions in this group" in the group toolbar's menu, the board menu and Properties)
  // 196.6 kB with mindmaps (T08, 196.2 kB measured: the mindmap module's keys, Page properties, previews per diagram type; its gestures and kinds are lazy)
  ['editor', ['src/editor.ts'], 196.6],
  // 184.2 kB measured; 197.8 kB with the shape catalogue (197.3 kB measured); 198.2 kB once the shapes beyond the 17 load with the flowchart's editor code (T02.9, 197.8 kB measured: the same code as before, in more chunks, each compressed on its own)
  // 199.2 kB with media in the scene (T03, 198.8 kB measured); 201.9 kB with the icon registry (T04, 201.5 kB measured)
  // 206.9 kB with the insert dock (T05, 206.5 kB measured: the editor's part, and the flowchart's icon and image node ops and palette sections)
  // 219.1 kB with flowchart content (T06, 218.7 kB measured: the flowchart's renderer, its parser's growth, the media kit)
  // 225.6 kB with the compound layout (T07, 225.2 kB measured: the flowchart's renderer +5.1 kB, the editor's +0.9 kB)
  // 227.5 kB with mindmaps (T08, 227.1 kB measured: the editor's +1.5 kB)
  ['editor (first flowchart)', ['src/editor.ts', 'src/editor/kinds/flowchart.ts'], 227.5],
  // the first mindmap (T08, 70.8 kB measured): the viewer and the mindmap's kind chunk (parser, tidy tree layout, renderer)
  ['viewer (first mindmap)', ['src/viewer.ts', kindChunk('mindmap')], 71.2],
  // the first mindmap in the editor (T08, 225.7 kB measured): its kinds and the mindmap module's gestures
  ['editor (first mindmap)', ['src/editor.ts', 'src/editor/kinds/mindmap.ts', 'src/editor/modules/mindmap/gestures.ts'], 226.1],
  // the English emoji data (T05 §4.5: at most 30 kB), a lazy chunk of its own
  ['emoji data, English (lazy chunk)', ['src/emoji/en.ts'], 30],
  // 240.2 kB with the shape catalogue (239.7 kB measured); 236.2 kB once the shapes beyond the 17 load on demand (T02.9, 235.8 kB measured)
  // 237.5 kB with media in the scene (T03, 237.1 kB measured); 240.2 kB with the icon registry (T04, 239.8 kB measured)
  // 243.6 kB with the insert dock (T05, 243.2 kB measured)
  // 244 kB with the compound layout (T07, 243.6 kB measured)
  // 245.8 kB with mindmaps (T08, 245.4 kB measured)
  ['editor + History opened', ['src/editor.ts', ...HISTORY], 245.8],
  // 125.2 kB while the entry re-exported the all-kinds diff
  // 92.5 kB once the per-type diffs left the entry for the diff kinds (90.9 kB measured); 94.6 kB before; 91.5 kB with the shapes on demand (T02.9, 91.1 kB measured)
  // 92.5 kB with media in the scene (T03, 92.1 kB measured); 95.1 kB with the icon registry (T04, 94.7 kB measured)
  // 95.8 kB with flowchart content (T06, 95.4 kB measured)
  // 96.4 kB with mindmaps (T08, 96 kB measured)
  ['diff', ['src/diff.ts'], 96.4],
  // a flowchart pair with the default panels (the change list) and the flowchart's diff kind; 128 kB with the shape catalogue (127.6 kB measured); 124 kB once the shapes beyond the 17 load on demand (T02.9, 123.6 kB measured)
  // 125 kB with media in the scene (T03, 124.6 kB measured); 127.7 kB with the icon registry (T04, 127.3 kB measured)
  // 133.1 kB with flowchart content (T06, 132.7 kB measured: the flowchart's parser and renderer)
  // 138.7 kB with the compound layout (T07, 138.3 kB measured: the flowchart's renderer +5.1 kB)
  // 139.4 kB with mindmaps (T08, 139 kB measured)
  ['diff (first flowchart)', ['src/diff.ts', FLOW, FLOW_DIFF, 'src/diff/modules/panels.ts'], 139.4],
  // 65.8 kB with the kind descriptor: the same code in more, smaller chunks (one per kind and layer), each compressed on its own (54.6 kB as one esbuild stream); 63 kB before; 76.8 kB with the shape catalogue (76.4 kB measured); 77 kB with the shapes beyond the 17 in chunks of their own (T02.9, 76.6 kB measured: the name table and the geometry apart)
  // 78.5 kB with media in the scene (T03, 78.1 kB measured: the image policy check, `safeImageUrl` / `checkImageUrl`, is exported)
  // 84.1 kB with the icon registry (T04, 83.7 kB measured: the registry, `createIconRegistry` with its decoder for synchronous lookups on the server, `iconNamesOf`)
  // 93.9 kB with flowchart content (T06, 93.5 kB measured: the flowchart's parser and renderer and the media kit, which core's kinds register statically)
  // 99.5 kB with the compound layout (T07, 99.1 kB measured: the compound layout, the router, the renderer's part, "Reset positions in this group")
  // 110.4 kB with mindmaps (T08, 110 kB measured: every kind is in core, the mindmap's parser, layout, renderer, ops and diff)
  ['core', ['src/core.ts'], 110.4],
];
for (const [name, keys, budget] of rows) report(name, (await loads(keys)).n, budget * KB);
// the pickers' chunks (T05), beyond what the editor with a flowchart has loaded
{
  const have = (await loads(['src/editor.ts', 'src/editor/kinds/flowchart.ts'])).all;
  let n = 0;
  for (const k of libClosure('src/editor/modules/insert/media.ts')) if (!have.has(k)) n += await chunkSize(k);
  report('editor pickers (lazy chunk)', n, 13 * KB);
}
// the built-in icon set is never part of an entry's static closure (it loads on first use, T04 §4.7)
{
  const entries = Object.keys(manifest).filter((k) => manifest[k].isEntry);
  const pulled = entries.filter((k) => libClosure(k).has(BUILTIN_ICONS));
  if (pulled.length) {
    failed = true;
    console.log(`the built-in icon set is in the static closure of ${pulled.join(', ')}  FAILED`);
  } else console.log('the built-in icon set is in no first chunk           ok');
}
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
