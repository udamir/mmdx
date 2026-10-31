// The component's theme (component architecture §7.5): component state, not document state. One resolution for every
// product, independent of the light / dark chrome scheme:
//
//   the user's pick in this session → the host's `theme` attribute (and `theme-dark` while the chrome is dark)
//   → the pick remembered in storage (per product) → the default, which follows the chrome scheme.
//
// "Follow light / dark" clears the pick. Picking a dark theme does not switch the chrome to dark.
import type { StorageAdapter } from '../adapters/storage.js';
import { HOUSE, counterpartTheme } from '../core/theme/pairs.js';
import type { ThemeRegistry } from '../core/theme/registry.js';
import { computed, signal, type ReadSignal, type Signal } from '../ui/signal.js';

export type Scheme = 'light' | 'dark';

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
  /** Bumped when themes are registered or changed. */
  private readonly rev = signal(0);
  /** The theme every canvas, stage, panel and export of the component draws with. */
  readonly current: ReadSignal<string>;
  private readonly key: string;

  constructor(private readonly o: ThemeStateOptions) {
    this.key = `${o.product}.theme`;
    this.attr = signal<string | null>(o.theme ?? null);
    this.attrDark = signal<string | null>(o.themeDark ?? null);
    const stored = o.storage.get<string>(this.key);
    this.pick = signal<{ id: string; session: boolean } | null>(typeof stored === 'string' && stored ? { id: stored, session: false } : null);
    this.current = computed(() => this.resolve());
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

  /** The picked theme, or null while following light / dark. */
  picked(): string | null {
    return this.pick.peek()?.id ?? null;
  }

  private resolve(): string {
    this.rev();
    const reg = this.o.registry;
    const scheme = this.o.scheme();
    const pick = this.pick();
    if (pick?.session) return pick.id;
    const attr = this.attr(), dark = this.attrDark();
    if (scheme === 'dark' && dark) {
      const base = attr ?? HOUSE.light;
      const known = reg.has(base) ? reg.get(base) : null;
      if (known && known.appearance === 'dark') return base;
      return dark === 'auto' ? counterpartTheme(reg, base, 'dark') : dark;
    }
    if (attr) return attr;
    if (pick) return pick.id;
    return HOUSE[scheme];
  }
}
