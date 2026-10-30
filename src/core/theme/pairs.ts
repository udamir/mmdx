// Light / dark pairs: every theme links the theme of the same family with the other appearance (`"counterpart"`),
// and when the UI switches between light and dark a diagram is shown in that linked theme. The diagram file keeps its
// own theme; the counterpart is a display choice.
import type { ThemeRegistry } from './registry.js';
import { BASELINE, canonicalId } from './registry.js';

export type Appearance = 'light' | 'dark';

/** The house pair: used for a theme whose link is missing or broken. */
export const HOUSE: Readonly<Record<Appearance, string>> = { light: BASELINE, dark: 'default-dark' };

const appearanceOf = (reg: ThemeRegistry, id: string): Appearance => (reg.get(id).appearance === 'dark' ? 'dark' : 'light');
// a theme's own link only: a link is never inherited through `extends`
const linkOf = (reg: ThemeRegistry, id: string): string | undefined => {
  const c = (reg.raw(id) as { counterpart?: unknown } | null)?.counterpart;
  return typeof c === 'string' ? c : undefined;
};

/**
 * The theme to show for a diagram whose own theme is `id` when the UI is `want`: the theme itself when its appearance
 * already matches, else its linked theme (or a theme that links to it), else the house theme of that appearance.
 */
export function counterpartTheme(reg: ThemeRegistry, id: string | null | undefined, want: Appearance): string {
  const own = canonicalId(id);
  const cur = reg.has(own) ? own : BASELINE;
  if (appearanceOf(reg, cur) === want) return cur;
  const ok = (c: string | undefined): c is string => !!c && c !== cur && reg.has(c) && appearanceOf(reg, c) === want;
  const linked = linkOf(reg, cur);
  if (ok(linked)) return linked;
  for (const t of reg.list()) if (linkOf(reg, t.id) === cur && ok(t.id)) return t.id;
  const house = HOUSE[want];
  return reg.has(house) && appearanceOf(reg, house) === want ? house : cur;
}

export interface LinkProblem {
  id: string;
  problem: 'missing' | 'unknown' | 'same-appearance' | 'not-mutual';
  counterpart?: string;
}

/** Themes whose light / dark link is missing, points nowhere, has the same appearance, or is not returned. */
export function linkProblems(reg: ThemeRegistry): LinkProblem[] {
  const out: LinkProblem[] = [];
  for (const { id } of reg.list()) {
    const c = linkOf(reg, id);
    if (c === undefined) out.push({ id, problem: 'missing' });
    else if (!reg.has(c)) out.push({ id, problem: 'unknown', counterpart: c });
    else if (appearanceOf(reg, c) === appearanceOf(reg, id)) out.push({ id, problem: 'same-appearance', counterpart: c });
    else if (linkOf(reg, c) !== id) out.push({ id, problem: 'not-mutual', counterpart: c });
  }
  return out;
}
