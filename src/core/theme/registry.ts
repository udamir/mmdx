// Theme registry (A.8 row 69, §5.3). Themes are separate files given to the components as input — diagrams only
// store the theme id and their own per-item overrides.
//
//   default-light.theme.json   the base theme: every style of every item type (grouped by diagram type) + the colour
//                              palette + "appearance": "light" | "dark" (the kind of page it draws on)
//   <custom>.theme.json        { "id", "name", "extends": "default-light", ...only what it overrides }
//
// One instance per CoreContext: no module state, no storage, no network. Loading belongs to a ThemeSource, browser
// edits to a ThemeStore (§8.3); they hand files to `register`.
import type { Diagnostic } from '../types.js';
import { BASE_THEME_ID, currentThemeId } from './builtin-ids.js';
import { resolveThemeColors } from './colors.js';
import type { ResolvedTheme, ThemeFile, ThemeInfo } from './types.js';
import { validateTheme } from './validate.js';

/** The base theme (Default Light): every other theme extends it. */
export const BASELINE = BASE_THEME_ID;
/** Longest `extends` chain followed above a theme before it is rooted on baseline. */
export const MAX_EXTENDS_DEPTH = 5;
/** Font used when not even the baseline theme names one (default-light.theme.json's font). */
export const DEFAULT_FONT = "'Open Sans', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const DEFAULT_PAD = 16;

type Obj = Record<string, unknown>;
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Objects merge key by key; anything else (arrays included) replaces. Inputs are not modified. */
export function deepMerge(base: Obj | null | undefined, over: Obj | null | undefined): Obj {
  const out: Obj = clone(base ?? {});
  for (const [k, v] of Object.entries(over ?? {})) {
    const cur = out[k];
    out[k] = isObj(v) && isObj(cur) ? deepMerge(cur, v) : clone(v);
  }
  return out;
}

/** A theme id as registered: earlier ids of the built-in themes map to the current ones, none to the base theme. */
export const canonicalId = (id: string | null | undefined): string => (id ? currentThemeId(id) : BASELINE);

export class ThemeRegistry {
  readonly #files = new Map<string, ThemeFile>();
  readonly #cache = new Map<string, ResolvedTheme>();
  readonly #listeners = new Set<() => void>();

  constructor(files: Iterable<unknown> = []) {
    for (const f of files) this.#add(f);
  }

  /** Validates (and migrates) a theme file and adds or replaces it. Returns the validation diagnostics. */
  register(file: unknown): Diagnostic[] {
    const d = this.#add(file);
    this.#changed();
    return d;
  }

  #add(file: unknown): Diagnostic[] {
    const { theme, diagnostics } = validateTheme(file);
    if (theme) this.#files.set(theme.id, theme);
    return diagnostics;
  }

  unregister(id: string): boolean {
    const had = this.#files.delete(canonicalId(id));
    if (had) this.#changed();
    return had;
  }

  has(id: string | null | undefined): boolean {
    return this.#files.has(canonicalId(id));
  }

  /** The theme as registered (validated), or null. A copy: changing it does not change the registry. */
  raw(id: string | null | undefined): ThemeFile | null {
    const t = this.#files.get(canonicalId(id));
    return t ? clone(t) : null;
  }

  list(): ThemeInfo[] {
    const ids = [...new Set([BASELINE, ...this.#files.keys()])].filter((id) => this.has(id));
    return ids.map((id) => {
      const t = this.#files.get(id)!;
      // appearance: what kind of page the theme draws on (inherited from what it extends)
      const appearance = this.merged(id)?.appearance === 'dark' ? 'dark' : 'light';
      return { id, name: t.name || id, appearance, extends: id === BASELINE ? null : canonicalId(t.extends) };
    });
  }

  /**
   * The fully merged theme before colour references are resolved. Unknown ids fall back to baseline. A chain that
   * loops back on itself or runs deeper than MAX_EXTENDS_DEPTH is cut there and rooted on baseline, so every merged
   * theme still has every section baseline defines.
   */
  merged(id: string | null | undefined): ThemeFile | null {
    return this.#merge(canonicalId(id), new Set(), 0);
  }

  #merge(id: string, seen: Set<string>, depth: number): ThemeFile | null {
    const raw = this.#files.get(id) ?? this.#files.get(BASELINE);
    if (!raw) return null;
    const { id: tid, name, extends: parent, ...rest } = clone(raw);
    if (tid === BASELINE) return { id: tid, ...(name !== undefined ? { name } : {}), ...rest };
    seen.add(tid);
    let p = canonicalId(parent);
    if (seen.has(p) || depth >= MAX_EXTENDS_DEPTH) p = BASELINE;
    const base = this.#merge(p, seen, depth + 1);
    return { ...(deepMerge(base as Obj | null, rest as Obj) as Omit<ThemeFile, 'id'>), id: tid, name: name || tid, extends: parent || BASELINE };
  }

  /** Theme ready for rendering: inherited, every colour reference turned into a colour. Unknown ids → baseline. */
  get(id: string | null | undefined): ResolvedTheme {
    let cid = canonicalId(id);
    if (!this.has(cid)) cid = BASELINE;
    const hit = this.#cache.get(cid);
    if (hit) return hit;
    const m = this.merged(cid) ?? { id: BASELINE };
    const basePalette = this.merged(BASELINE)?.palette ?? {};
    const t = this.#resolve(m, basePalette);
    this.#cache.set(cid, t);
    return t;
  }

  /** A theme that is being edited (not registered), merged with what it extends — for the editor's previews. */
  mergeDraft(file: ThemeFile): ThemeFile {
    const raw = validateTheme(file).theme ?? { id: file.id };
    const { id, name, extends: parent, ...rest } = raw;
    if (id === BASELINE) return { id, ...(name !== undefined ? { name } : {}), ...clone(rest) };
    return { ...(deepMerge(this.merged(parent || BASELINE) as Obj | null, rest as Obj) as Omit<ThemeFile, 'id'>), id, name: name || id, extends: parent || BASELINE };
  }

  resolveDraft(file: ThemeFile): ResolvedTheme {
    const m = this.mergeDraft(file);
    const basePalette = (file.id === BASELINE ? m.palette : this.merged(BASELINE)?.palette) ?? {};
    return this.#resolve(m, basePalette);
  }

  onChange(cb: () => void): () => void {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  #changed(): void {
    this.#cache.clear();
    for (const f of [...this.#listeners]) f();
  }

  // Every section present (ResolvedTheme): missing ones become {} — baseline normally defines them all.
  #resolve(m: ThemeFile, basePalette: Record<string, string>): ResolvedTheme {
    const palette = m.palette ?? {};
    const t = resolveThemeColors(m, palette, basePalette);
    const fc = t.flowchart ?? {};
    const sq = t.sequence ?? {};
    const er = t.er ?? {};
    const font = t.font ?? this.#files.get(BASELINE)?.font ?? DEFAULT_FONT;
    return {
      id: t.id,
      name: t.name || t.id,
      appearance: t.appearance === 'dark' ? 'dark' : 'light',
      palette: { ...palette },
      basePalette: { ...basePalette },
      font,
      canvas: { ...t.canvas, pad: t.canvas?.pad ?? DEFAULT_PAD },
      flowchart: {
        node: {}, nodePresets: {}, group: {}, groupPresets: {}, edge: {}, edgePresets: {}, pagePresets: {},
        ...fc,
      },
      sequence: {
        participant: {}, participantPresets: {}, lifeline: {}, activation: {}, activationPresets: {}, message: {},
        messagePresets: {}, note: {}, notePresets: {}, block: {}, blockPresets: {}, box: {}, boxPresets: {}, layout: {},
        pagePresets: {},
        ...sq,
      },
      er: { entity: {}, entityPresets: {}, rel: {}, relPresets: {}, pagePresets: {}, ...er },
    };
  }
}
