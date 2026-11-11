// The theme and colour half of a StyleTarget (A14), one for every host: the theme's palette as named colours, a free
// colour stored relative to the nearest palette colour, and the theme font. The editor's toolbars, the ER table's and
// the theme editor's tiles each built it.
import { relativeColor } from '../../../core/theme/colors.js';
import type { StyleTarget } from './types.js';

/** What the half reads: the theme's palette and font (the document's theme, or the theme editor's draft). */
export interface ThemeLook {
  palette?: Readonly<Record<string, string>> | undefined;
  font: string;
}

/** A font list's first family, unquoted (`'Open Sans', sans-serif` → `Open Sans`). */
export const fontFamilyName = (font: string): string => (font.split(',')[0] ?? '').replace(/['"]/g, '').trim();

export function themeStyleTarget(theme: () => ThemeLook): Pick<StyleTarget, 'palette' | 'customColor' | 'themeFont' | 'themeFontName'> {
  return {
    palette: () => Object.entries(theme().palette ?? {}).map(([name, value]) => ({ name, value: String(value) })),
    customColor: (hex) => relativeColor(hex, theme().palette ?? {}),
    themeFont: () => theme().font,
    themeFontName: () => fontFamilyName(theme().font),
  };
}
