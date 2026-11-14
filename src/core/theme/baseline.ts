// The base theme (Default Light, default-light.theme.json) alone: every style of every item type. Enough to render any diagram; the other built-in
// themes load on demand where bundle size matters (the viewer, §R5).
import { DEFAULT_LIGHT } from './data/default-light.js';
import type { ThemeFile } from './types.js';

export const BASELINE_THEME: ThemeFile = DEFAULT_LIGHT;
