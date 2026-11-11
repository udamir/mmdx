// The built-in theme modules (A17) are generated from themes/*.theme.json: a JSON edit without the tool run fails here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUNDLED, themeModule } from '../../../tools/build-theme-data.mjs';
import { validateTheme } from '../../../src/core/theme/validate.js';
import { BUILTIN_THEMES } from '../../../src/core/theme/builtin.js';

const ROOT = join(__dirname, '../../..');

describe('built-in theme data', () => {
  it('each module is the JSON it is generated from (node tools/build-theme-data.mjs)', () => {
    for (const { id, name } of BUNDLED) expect(readFileSync(join(ROOT, 'src/core/theme/data', `${id}.ts`), 'utf8'), id).toBe(themeModule(id, name, ROOT));
  });

  it('the bundled themes validate without a diagnostic', () => {
    for (const t of BUILTIN_THEMES) expect(validateTheme(t).diagnostics, t.id).toEqual([]);
  });
});
