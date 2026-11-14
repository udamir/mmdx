// Build step: the render worker as one classic script in a string (`virtual:mmdx-render-worker-source`), for
// `@mmdx/studio/worker-inline`. Pages with an opaque origin (sandboxed iframes) cannot start the worker from a URL; they start
// this source from a `blob:` URL instead. esbuild bundles it as an IIFE: no imports, no module worker needed.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { cssTemplatesEsbuild } from './css-templates.mjs';

const ID = 'virtual:mmdx-render-worker-source';

// The render worker never loads icon packs (the main thread sends it the icons it needs, T04), but a bundle without
// code splitting would inline every dynamic import, the built-in icon set (about 20 kB gzip) included: both worker
// builds get an empty set in its place.
const BUILTIN_ICONS = /[\\/]icons[\\/]builtin\.(js|ts)$/;
const EMPTY_ICONS = 'export const BUILTIN_ICONS = { prefix: "tabler", icons: {} }; export const FA_FALLBACK = {};';

/** esbuild plugin: the built-in icon set is empty in the worker. */
export function noBuiltinIconsEsbuild() {
  return {
    name: 'mmdx-no-builtin-icons',
    setup(b) {
      b.onResolve({ filter: /icons\/builtin\.js$/ }, () => ({ path: 'builtin-icons', namespace: 'mmdx-empty-icons' }));
      b.onLoad({ filter: /.*/, namespace: 'mmdx-empty-icons' }, () => ({ contents: EMPTY_ICONS, loader: 'js' }));
    },
  };
}

/** Vite / Rollup plugin (`worker.plugins`): the built-in icon set is empty in the module worker. */
export function noBuiltinIcons() {
  return {
    name: 'mmdx-no-builtin-icons',
    // before Vite's own resolver, which would resolve the module first
    enforce: 'pre',
    async resolveId(id, importer) {
      if (!/icons\/builtin\.js$/.test(id) || !importer) return null;
      const r = await this.resolve(id, importer, { skipSelf: true });
      return r && BUILTIN_ICONS.test(r.id) ? '\0mmdx-empty-icons' : null;
    },
    load(id) {
      return id === '\0mmdx-empty-icons' ? EMPTY_ICONS : null;
    },
  };
}
const ENTRY = fileURLToPath(new URL('../src/dom/render-worker.ts', import.meta.url));

/** The worker's source, minified. */
export async function renderWorkerSource() {
  const r = await build({
    entryPoints: [ENTRY], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true,
    write: false, legalComments: 'none', logLevel: 'error', plugins: [cssTemplatesEsbuild(), noBuiltinIconsEsbuild()],
  });
  return r.outputFiles[0].text;
}

/** Vite / Rollup plugin: `import source from 'virtual:mmdx-render-worker-source'` is the worker's source string. */
export function workerSourcePlugin() {
  return {
    name: 'mmdx-worker-source',
    resolveId(id) {
      return id === ID ? `\0${ID}` : null;
    },
    async load(id) {
      if (id !== `\0${ID}`) return null;
      this.addWatchFile?.(ENTRY);
      return `export default ${JSON.stringify(await renderWorkerSource())};`;
    },
  };
}
