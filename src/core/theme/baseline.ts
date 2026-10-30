// The base theme (Default Light, default-light.theme.json) alone: every style of every item type. Enough to render any diagram; the other built-in
// themes load on demand where bundle size matters (the viewer, §R5).
import baseline from '../../../themes/default-light.theme.json' with { type: 'json' };
import type { ThemeFile } from './types.js';

export const BASELINE_THEME = baseline as unknown as ThemeFile;
