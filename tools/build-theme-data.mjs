// The built-in themes core bundles, as typed modules (A17): themes/<id>.theme.json stays the data; this writes
// src/core/theme/data/<id>.ts with the file as a `ThemeFile` literal, so the compiler checks it against the theme's
// types and core does not reach out of src/ for JSON. A test (tests/core/theme/builtin-data.test.ts) fails when a
// module is out of date.
//
//   node tools/build-theme-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The themes core bundles: the base theme and its dark counterpart (the others are loaded by hosts). */
export const BUNDLED = [
  { id: 'default-light', name: 'DEFAULT_LIGHT' },
  { id: 'default-dark', name: 'DEFAULT_DARK' },
];

/** The module text for one theme. */
export function themeModule(id, name, root = ROOT) {
  const json = JSON.parse(readFileSync(join(root, 'themes', `${id}.theme.json`), 'utf8'));
  return `// Generated from themes/${id}.theme.json by tools/build-theme-data.mjs — do not edit; edit the JSON and run the tool.
import type { ThemeFile } from '../types.js';

export const ${name}: ThemeFile = ${JSON.stringify(json, null, 2)};
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const { id, name } of BUNDLED) writeFileSync(join(ROOT, 'src/core/theme/data', `${id}.ts`), themeModule(id, name));
  console.log(`wrote ${BUNDLED.length} theme modules`);
}
