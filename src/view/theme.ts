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
export class SchemeState {
  readonly scheme: Signal<Scheme>;
  private ui: UiOption | undefined;

  constructor(private readonly storage: StorageAdapter, private readonly key: string, ui: UiOption | undefined) {
    this.ui = ui;
    this.scheme = signal<Scheme>(this.resolve());
  }

  /** The `ui` option: explicit light / dark, or `auto` / unset (the remembered toggle, else the page). */
  setUi(ui: UiOption | undefined): void {
    this.ui = ui;
    this.apply();
  }

  /** The user's toggle: remembered. */
  choose(s: Scheme): void {
    this.storage.set(this.key, s);
    this.ui = s;
    this.apply();
  }

  /** Re-resolves (the page's scheme changed). */
  apply(): void {
    this.scheme.set(this.resolve());
  }

  private resolve(): Scheme {
    const ui = this.ui;
    if (ui === 'light' || ui === 'dark') return ui;
    const stored = this.storage.get<string>(this.key);
    if (stored === 'light' || stored === 'dark') return stored;
    return resolveUiScheme(null);
  }
}

/** Loads themes that are not registered yet: built-ins on demand, others through the theme source. */
export class ThemeLoader {
  private readonly fetched = new Set<string>();

  constructor(private readonly registry: ThemeRegistry, private readonly source: ThemeSource | undefined, private readonly alive: () => boolean) {}

  ensure(id: string): Promise<boolean> {
    if (this.registry.has(id)) return Promise.resolve(true);
    if (BUILTIN_IDS.includes(id)) return ensureBuiltinThemes().then(() => this.registry.has(id));
    return this.fetch(id);
  }

  private async fetch(id: string): Promise<boolean> {
    const src = this.source ?? getShared().themeSource;
    if (!src || this.fetched.has(id)) return this.registry.has(id);
    this.fetched.add(id);
    try {
      const file = await src.get(id);
      if (!this.alive()) return false;
      this.registry.register(file);
      // a theme that extends another unknown theme pulls that one in too
      if (file.extends && !this.registry.has(file.extends)) await this.ensure(file.extends);
      return true;
    } catch {
      // missing or private theme: the diagram stays on baseline with an info diagnostic
      return false;
    }
  }
}
