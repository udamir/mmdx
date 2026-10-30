import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error plain ESM build helper without type declarations
import { cssTemplatesPlugin } from '../../tools/css-templates.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');

// examples/ and themes/ are served as static files next to the app (the studio fetches their manifests)
function copyAssets(): Plugin {
  return {
    name: 'mmdx-copy-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // plain fetches only: module imports of the theme JSON (`?import`, `/@fs/…`) stay with Vite
        if ((req.url ?? '').includes('?')) return next();
        const m = /^\/(?:[\w.-]+\/)?(examples|themes)\/([\w.-]+)$/.exec(decodeURIComponent(req.url ?? ''));
        const file = m ? resolve(repo, m[1]!, m[2]!) : '';
        if (!file || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8');
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      const out = resolve(here, 'dist');
      for (const dir of ['examples', 'themes']) {
        mkdirSync(resolve(out, dir), { recursive: true });
        cpSync(resolve(repo, dir), resolve(out, dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  root: here,
  // GitHub Pages serves the site under /<repo>/; override with BASE=/ for other hosts
  base: process.env['BASE'] ?? './',
  // favicons, app icons and the web manifest (brand/ holds the master logo files)
  publicDir: resolve(here, 'public'),
  server: { port: 8790, fs: { allow: [repo] } },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    target: 'es2022',
    // stock Mermaid (lazy: Plain Mermaid compare and the viewer fallback) is one large chunk by itself
    chunkSizeWarningLimit: 3000,
    // the studio plus one demo page per component (UC1–UC3)
    rollupOptions: {
      input: {
        index: resolve(here, 'index.html'),
        viewer: resolve(here, 'viewer.html'),
        editor: resolve(here, 'editor.html'),
        'theme-editor': resolve(here, 'theme-editor.html'),
      },
    },
  },
  plugins: [copyAssets(), cssTemplatesPlugin()],
});
