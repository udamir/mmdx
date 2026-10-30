// The themes shipped in themes/*.theme.json, bundled so a registry works without any loading.
// The JSON is typed loosely by the compiler; the registry validates every file on register anyway.
import { BASELINE_THEME } from './baseline.js';
import { EXTRA_THEMES } from './builtin-extra.js';
import { ThemeRegistry } from './registry.js';
import type { ThemeFile } from './types.js';

/** The house pair: Default Light (`default-light`) and Default Dark (`default-dark`), linked to each other. */
export const BUILTIN_THEMES: readonly ThemeFile[] = [BASELINE_THEME, ...EXTRA_THEMES];

export { BUILTIN_IDS } from './builtin-ids.js';

/** A registry with the built-in themes registered. */
export function createDefaultRegistry(): ThemeRegistry {
  return new ThemeRegistry(BUILTIN_THEMES);
}
