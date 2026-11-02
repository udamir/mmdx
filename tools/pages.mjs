// GitHub Pages site: puts the three builds together in _site/ — the documentation portal at the root, the studio demo
// (apps/studio-site) at studio/ and Storybook at storybook/. Run after build:docs, build:site and build:storybook
// (`pnpm build:pages` runs all four); `pnpm preview:pages` serves the result at http://localhost:8792/mmdx/.
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve('_site');
const parts = [
  ['docs/.vitepress/dist', ''],
  ['apps/studio-site/dist', 'studio'],
  ['storybook-static', 'storybook'],
];

rmSync(out, { recursive: true, force: true });
for (const [from, to] of parts) {
  if (!existsSync(resolve(from, 'index.html'))) {
    console.error(`pages: ${from} is missing — build it first (pnpm build:pages builds everything)`);
    process.exit(1);
  }
  cpSync(resolve(from), resolve(out, to), { recursive: true });
  console.log(`pages: ${from} → _site/${to}`);
}
// serve the folders as they are (no Jekyll processing of files and folders starting with "_")
writeFileSync(resolve(out, '.nojekyll'), '');
