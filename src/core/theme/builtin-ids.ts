// Ids of the built-in themes (the house light / dark pair), without loading the files.
/** The base theme (Default Light): every other theme extends it. */
export const BASE_THEME_ID = 'default-light';
export const BUILTIN_IDS: readonly string[] = [BASE_THEME_ID, 'default-dark'];

/** Earlier ids of the built-in themes, still accepted wherever a theme id is read (diagrams, theme files). */
export const THEME_ALIASES: Readonly<Record<string, string>> = { studio: 'default-light', baseline: 'default-light', 'studio-dark': 'default-dark' };

/** A theme id with an earlier id of a built-in theme replaced by the current one. */
export const currentThemeId = (id: string): string => (Object.hasOwn(THEME_ALIASES, id) ? THEME_ALIASES[id]! : id);
