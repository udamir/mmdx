import { defineConfig } from 'vite';
import { cssTemplatesPlugin } from './tools/css-templates.mjs';
import { noBuiltinIcons, workerSourcePlugin } from './tools/worker-source.mjs';

// Library build (§16): one ESM file per public entry, shared chunks split out; no runtime dependencies bundled
// except what core needs (none). `mermaid` stays external (the optional peer; the code never imports it by name).
export default defineConfig({
  plugins: [cssTemplatesPlugin(), workerSourcePlugin()],
  // relative asset URLs: the render worker is found next to the chunk that starts it (`../assets/…`), so apps that
  // bundle mmdx resolve and emit it; an absolute `/assets/…` URL only works on a site that serves mmdx's dist at its root
  base: './',
  // the module render worker: one file (its lazy imports inlined), without the built-in icon set (it never loads packs)
  worker: { plugins: () => [noBuiltinIcons()], rollupOptions: { output: { inlineDynamicImports: true } } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    minify: 'esbuild',
    lib: {
      entry: {
        core: 'src/core.ts',
        viewer: 'src/viewer.ts',
        editor: 'src/editor.ts',
        'theme-editor': 'src/theme-editor.ts',
        studio: 'src/studio.ts',
        diff: 'src/diff.ts',
        adapters: 'src/adapters.ts',
        markdown: 'src/markdown.ts',
        react: 'src/react.ts',
        // the render worker as a string (a classic script for `blob:` URLs), only for hosts that import it
        'worker-inline': 'src/worker-inline.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['mermaid'],
      output: { chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
});
