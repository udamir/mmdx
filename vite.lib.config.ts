import { defineConfig } from 'vite';
// @ts-expect-error plain ESM build helper without type declarations
import { cssTemplatesPlugin } from './tools/css-templates.mjs';
// @ts-expect-error plain ESM build helper without type declarations
import { workerSourcePlugin } from './tools/worker-source.mjs';

// Library build (§16): one ESM file per public entry, shared chunks split out; no runtime dependencies bundled
// except what core needs (none). `mermaid` stays external (optional peer, loaded lazily).
export default defineConfig({
  plugins: [cssTemplatesPlugin(), workerSourcePlugin()],
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
      external: ['mermaid', /^@codemirror\//, /^@lezer\//],
      output: { chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
});
