// The component's theme and chrome scheme (component architecture §7.5): component state, not document state. One
// resolution for every product, independent of the light / dark chrome scheme:
//
//   the user's pick in this session → the host's `theme` attribute (and `theme-dark` while the chrome is dark)
//   → the pick remembered in storage (per product) → the default, which follows the chrome scheme.
//
// "Follow light / dark" clears the pick. Picking a dark theme does not switch the chrome to dark. The chrome scheme:
// an explicit `ui` (light / dark), else the user's remembered toggle, else the page's.
import type { StorageAdapter } from '../adapters/storage.js';
import type { ThemeSource } from '../adapters/themes.js';
import { ensureBuiltinThemes, getShared } from '../config.js';
import { BUILTIN_IDS } from '../core/theme/builtin-ids.js';
import { HOUSE, counterpartTheme } from '../core/theme/pairs.js';
import type { ThemeRegistry } from '../core/theme/registry.js';
import { computed, signal, type ReadSignal, type Signal } from '../ui/signal.js';
import { resolveUiScheme } from '../ui/styles/base.js';

export type Scheme = 'light' | 'dark';
export type UiOption = 'light' | 'dark' | 'auto';

export interface ThemeStateOptions {
  registry: ThemeRegistry;
  storage: StorageAdapter;
  /** Storage key prefix: `viewer`, `editor`, `diff`. */
  product: string;
  scheme: ReadSignal<Scheme>;
  theme?: string | undefined;
  themeDark?: string | undefined;
}

export class ThemeState {
  /** Host attribute `theme`. */
  readonly attr: Signal<string | null>;
  /** Host attribute `theme-dark` (`auto` = the dark counterpart of `theme`). */
  readonly attrDark: Signal<string | null>;
  /** The user's pick (null = follow light / dark); `session` when made in this component. */
  readonly pick: Signal<{ id: string; session: boolean } | null>;
  /** Bumped when themes are registered or changed (the shown theme may look different under the same id). */
  readonly rev: Signal<number> = signal(0);
  private readonly resolved: ReadSignal<{ id: string; picked: string | null }>;
  /** The theme every canvas, stage, panel and export of the component draws with. */
  readonly current: ReadSignal<string>;
  /** The pick the shown theme comes from (the theme menu ticks it); null while the attribute or the default decides. */
  readonly picked: ReadSignal<string | null>;
  private readonly key: string;

  constructor(private readonly o: ThemeStateOptions) {
    this.key = `${o.product}.theme`;
    this.attr = signal<string | null>(o.theme ?? null);
    this.attrDark = signal<string | null>(o.themeDark ?? null);
    const stored = o.storage.get<string>(this.key);
    this.pick = signal<{ id: string; session: boolean } | null>(typeof stored === 'string' && stored ? { id: stored, session: false } : null);
    this.resolved = computed(() => this.resolve());
    this.current = computed(() => this.resolved().id);
    this.picked = computed(() => this.resolved().picked);
  }

  /** Re-resolves after the registry changed (a theme loaded or edited). */
  themesChanged(): void {
    this.rev.update((n) => n + 1);
  }

  /** The user picks a theme (remembered per product). */
  choose(id: string): void {
    this.pick.set({ id, session: true });
    this.o.storage.set(this.key, id);
  }

  /** "Follow light / dark": drops the pick. */
  follow(): void {
    this.pick.set(null);
    this.o.storage.remove(this.key);
  }

  private resolve(): { id: string; picked: string | null } {
    this.rev();
    const reg = this.o.registry;
    const scheme = this.o.scheme();
    const pick = this.pick();
    if (pick?.session) return { id: pick.id, picked: pick.id };
    const attr = this.attr(), dark = this.attrDark();
    if (scheme === 'dark' && dark) {
      const base = attr ?? HOUSE.light;
      const known = reg.has(base) ? reg.get(base) : null;
      if (known && known.appearance === 'dark') return { id: base, picked: null };
      return { id: dark === 'auto' ? counterpartTheme(reg, base, 'dark') : dark, picked: null };
    }
    if (attr) return { id: attr, picked: null };
    if (pick) return { id: pick.id, picked: pick.id };
    return { id: HOUSE[scheme], picked: null };
  }
}

/** The chrome's light / dark scheme: an explicit `ui`, else the remembered toggle, else the page's. */
export interface SchemeState {
  readonly scheme: Signal<Scheme>;
  /** The `ui` option: explicit light / dark, or `auto` / unset (the remembered toggle, else the page). */
  setUi(ui: UiOption | undefined): void;
  /** The user's toggle: remembered. */
  choose(s: Scheme): void;
  /** Re-resolves (the page's scheme changed). */
  apply(): void;
}

export function schemeState(storage: StorageAdapter, key: string, initial: UiOption | undefined): SchemeState {
  let ui = initial;
  const resolve = (): Scheme => {
    if (ui === 'light' || ui === 'dark') return ui;
    const stored = storage.get<string>(key);
    return stored === 'light' || stored === 'dark' ? stored : resolveUiScheme(null);
  };
  const scheme = signal<Scheme>(resolve());
  const apply = (): void => scheme.set(resolve());
  return {
    scheme,
    apply,
    setUi(u) {
      ui = u;
      apply();
    },
    choose(s) {
      storage.set(key, s);
      ui = s;
      apply();
    },
  };
}

/** Loads themes that are not registered yet: built-ins on demand, others through the theme source. */
export function themeLoader(registry: ThemeRegistry, source: ThemeSource | undefined, alive: () => boolean): (id: string) => Promise<boolean> {
  const fetched = new Set<string>();
  const ensure = async (id: string): Promise<boolean> => {
    if (registry.has(id)) return true;
    if (BUILTIN_IDS.includes(id)) return ensureBuiltinThemes().then(() => registry.has(id));
    const src = source ?? getShared().themeSource;
    if (!src || fetched.has(id)) return registry.has(id);
    fetched.add(id);
    try {
      const file = await src.get(id);
      if (!alive()) return false;
      registry.register(file);
      // a theme that extends another unknown theme pulls that one in too
      if (file.extends && !registry.has(file.extends)) await ensure(file.extends);
      return true;
    } catch {
      // missing or private theme: the diagram stays on baseline with an info diagnostic
      return false;
    }
  };
  return ensure;
}
