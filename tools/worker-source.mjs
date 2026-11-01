// Build step: the render worker as one classic script in a string (`virtual:mmdx-render-worker-source`), for
// `mmdx/worker-inline`. Pages with an opaque origin (sandboxed iframes) cannot start the worker from a URL; they start
// this source from a `blob:` URL instead. esbuild bundles it as an IIFE: no imports, no module worker needed.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { cssTemplatesEsbuild } from './css-templates.mjs';

const ID = 'virtual:mmdx-render-worker-source';
const ENTRY = fileURLToPath(new URL('../src/dom/render-worker.ts', import.meta.url));

/** The worker's source, minified. */
export async function renderWorkerSource() {
  const r = await build({
    entryPoints: [ENTRY], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true,
    write: false, legalComments: 'none', logLevel: 'error', plugins: [cssTemplatesEsbuild()],
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
