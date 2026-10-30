// The built-in dark theme (Default Dark, `default-dark`), the linked counterpart of Default Light (`default-light`).
import dark from '../../../themes/default-dark.theme.json' with { type: 'json' };
import type { ThemeFile } from './types.js';

export const EXTRA_THEMES: readonly ThemeFile[] = [dark] as unknown as ThemeFile[];
