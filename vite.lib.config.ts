import { defineConfig } from 'vite';
// @ts-expect-error plain ESM build helper without type declarations
import { cssTemplatesPlugin } from './tools/css-templates.mjs';

// Library build (§16): one ESM file per public entry, shared chunks split out; no runtime dependencies bundled
// except what core needs (none). `mermaid` stays external (optional peer, loaded lazily).
export default defineConfig({
  plugins: [cssTemplatesPlugin()],
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
        adapters: 'src/adapters.ts',
        markdown: 'src/markdown.ts',
        react: 'src/react.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['mermaid', /^@codemirror\//, /^@lezer\//],
      output: { chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
});
