// The icon registry (T04 §4.1, §4.4): icon packs by name, as Mermaid's `registerIconPacks` takes them, looked up
// synchronously while a diagram renders. A pack's loader is called on the first lookup from it, once (concurrent
// lookups share the load), and a failed load is tried again on a lookup 30 s later. A lookup answers `ready`,
// `loading` (draw an empty box of the icon's size) or `missing` (draw the "?" placeholder); when a load finishes the
// registry emits `change` and the components re-render. Every context carries one: `configure({ iconPacks })` fills
// the shared registry, a component's own packs extend it (`extend`), SSR and Node build one with `createIconRegistry`.
//
// What every first chunk holds is this stub: the code that validates and transforms icon bodies (decode.ts) and the
// built-in Tabler subset (src/icons, with the Font Awesome look-alike table) load on first use.
import { isFaPack, isIconToken, parseIconRef, splitIconName } from './names.js';
import type { IconDecoder } from './decode.js';
import type { IconData, IconForm, IconifyInfo, IconifyJSON, IconLookup, IconMissing, IconPack, IconResult, IconSnapshot } from './types.js';

/** A failed pack load is tried again after this long (ms). */
export const ICON_RETRY_MS = 30_000;
/** The built-in set's pack name: Tabler's own prefix, so files stay portable to any Mermaid that registers Tabler. */
export const BUILTIN_PACK = 'tabler';

const LOADING: IconResult = { status: 'loading' };
const missing = (reason: IconMissing): IconResult => ({ status: 'missing', reason });

// ---- code loaded on demand (module state: code, not instance data) ------------------------------------------------

let decoder: IconDecoder | null = null;
let decoderLoad: Promise<unknown> | null = null;

/** Makes the decoder available synchronously (SSR, Node, the editor: `createIconRegistry` calls it). */
export function useIconDecoder(d: IconDecoder): void {
  decoder = d;
}

function loadDecoder(): Promise<unknown> {
  if (!decoderLoad) {
    const p = import('./decode.js').then((m) => void (decoder = m.ICON_DECODER));
    decoderLoad = p;
    p.catch(() => void (decoderLoad = null));
  }
  return decoderLoad;
}

interface Builtin {
  pack: IconifyJSON;
  /** Font Awesome name → built-in icon name. */
  fa: Readonly<Record<string, string>>;
}
let builtin: Builtin | null = null;
let builtinLoad: Promise<Builtin> | null = null;

/** The built-in set (a lazy chunk, loaded once per page). */
export function loadBuiltinIcons(): Promise<Builtin> {
  if (builtin) return Promise.resolve(builtin);
  if (!builtinLoad) {
    const p = import('../../icons/builtin.js').then((m) => (builtin = { pack: m.BUILTIN_ICONS, fa: m.FA_FALLBACK }));
    builtinLoad = p;
    p.catch(() => void (builtinLoad = null));
  }
  return builtinLoad;
}

// ---- packs --------------------------------------------------------------------------------------------------------

interface PackState {
  readonly name: string;
  data: IconifyJSON | null;
  readonly loader: (() => Promise<IconifyJSON>) | null;
  pending: Promise<void> | null;
  /** When the last load failed (0: never). */
  failedAt: number;
  readonly decoded: Map<string, IconData | 'missing' | 'invalid'>;
  /** The built-in subset (a host's pack of the same name replaces it). */
  readonly builtin: boolean;
  /** Tells the registry that owns it (change events). */
  readonly notify: (packs: readonly string[]) => void;
}

const isPackData = (v: unknown): v is IconifyJSON => !!v && typeof v === 'object' && !!(v as IconifyJSON).icons && typeof (v as IconifyJSON).icons === 'object';
const PACK_NAME = /^[a-z][\w-]*$/i;

/** One entry of `IconRegistry.packList()` (the picker's pack chips). */
export interface IconPackInfo {
  name: string;
  loaded: boolean;
  /** The last load failed (tried again 30 s later). */
  failed: boolean;
  /** The built-in subset. */
  builtin: boolean;
  info?: IconifyInfo;
}

export interface IconRegistryOptions {
  /** The built-in Tabler subset under `tabler` (default true). */
  builtin?: boolean;
  /** The decoder, synchronously available (default: loaded on the first lookup). */
  decoder?: IconDecoder;
  /** Clock for the retry delay (tests). */
  now?: () => number;
}

let ids = 0;

export class IconRegistry implements IconLookup {
  private readonly own = new Map<string, PackState>();
  private builtinState: PackState | null = null;
  private readonly listeners = new Set<(packs: readonly string[]) => void>();
  private readonly now: () => number;
  private readonly parent: IconRegistry | null;
  private table: Map<string, IconResult> | null = null;
  private tablePacks: ReadonlySet<string> = new Set();
  private readonly id = ++ids;
  private rev = 0;

  constructor(packs: readonly IconPack[] = [], o: IconRegistryOptions = {}, parent: IconRegistry | null = null) {
    this.parent = parent;
    this.now = o.now ?? parent?.now ?? (() => Date.now());
    if (o.decoder) useIconDecoder(o.decoder);
    if (o.builtin ?? !parent) this.builtinState = this.state(BUILTIN_PACK, null, () => loadBuiltinIcons().then((b) => b.pack), true);
    for (const p of packs) this.put(p);
  }

  /** A registry of resolved icons (the render worker's, from the main thread's `snapshot`). */
  static fromSnapshot(s: IconSnapshot): IconRegistry {
    const r = new IconRegistry([], { builtin: false });
    r.table = new Map(Object.entries(s.icons));
    r.tablePacks = new Set(s.packs);
    return r;
  }

  private state(name: string, data: IconifyJSON | null, loader: (() => Promise<IconifyJSON>) | null, isBuiltin = false): PackState {
    return { name, data, loader, pending: null, failedAt: 0, decoded: new Map(), builtin: isBuiltin, notify: (p) => this.emit(p) };
  }

  private put(p: IconPack): boolean {
    if (!p || typeof p.name !== 'string' || !PACK_NAME.test(p.name)) return false;
    const data = isPackData(p.icons) ? p.icons : null;
    const loader = typeof p.loader === 'function' ? p.loader : null;
    if (!data && !loader) return false;
    this.own.set(p.name, this.state(p.name, data, data ? null : loader));
    return true;
  }

  // ---- registration -----------------------------------------------------------------------------------------------

  /** Registers packs (a pack of a registered name replaces it; `tabler` replaces the built-in subset). */
  add(packs: readonly IconPack[]): void {
    const names = packs.filter((p) => this.put(p)).map((p) => p.name);
    if (names.length) this.emit(names);
  }

  /** Turns the built-in subset on or off (`configure({ builtinIcons })`). */
  setBuiltin(on: boolean): void {
    if (on === !!this.builtinState) return;
    this.builtinState = on ? this.state(BUILTIN_PACK, null, () => loadBuiltinIcons().then((b) => b.pack), true) : null;
    this.emit([BUILTIN_PACK]);
  }

  /** A registry with these packs over this one's (a component's own `iconPacks`); it shares this one's loads. */
  extend(packs: readonly IconPack[]): IconRegistry {
    return new IconRegistry(packs, { builtin: false }, this);
  }

  /** Listens to loads finishing and packs changing (the pack names); returns a remover. */
  onChange(cb: (packs: readonly string[]) => void): () => void {
    this.listeners.add(cb);
    const off = this.parent?.onChange(cb);
    return () => {
      this.listeners.delete(cb);
      off?.();
    };
  }

  private emit(packs: readonly string[]): void {
    this.rev++;
    for (const l of [...this.listeners]) l(packs);
  }

  private pack(name: string): PackState | null {
    return this.own.get(name) ?? (name === BUILTIN_PACK ? this.builtinState : null) ?? this.parent?.pack(name) ?? null;
  }

  private get builtinOn(): boolean {
    return !!this.builtinState || !!this.parent?.builtinOn;
  }

  /** Whether a pack of this name is registered (loaded or not): label tokens with its prefix are icons. */
  has(pack: string): boolean {
    return this.table ? this.tablePacks.has(pack) : !!this.pack(pack);
  }

  /** The registered pack names. */
  packNames(): string[] {
    if (this.table) return [...this.tablePacks];
    const out = new Set(this.parent?.packNames() ?? []);
    if (this.builtinState) out.add(BUILTIN_PACK);
    for (const n of this.own.keys()) out.add(n);
    return [...out];
  }

  /** The packs with their state and info (the picker's chips: an unloaded pack loads when chosen, `load`). */
  packList(): IconPackInfo[] {
    return this.packNames().map((name) => {
      const st = this.pack(name)!;
      const e: IconPackInfo = { name, loaded: !!st.data, failed: !!st.failedAt && !st.data, builtin: st.builtin };
      if (st.data?.info) e.info = st.data.info;
      return e;
    });
  }

  /** A loaded pack's data (search), else null. */
  packData(name: string): IconifyJSON | null {
    return this.pack(name)?.data ?? null;
  }

  /** Changes with every registration and load (here or in the registry this one extends). */
  get key(): string {
    return `${this.parent ? `${this.parent.key}/` : ''}${this.id}.${this.rev}`;
  }

  // ---- lookups ----------------------------------------------------------------------------------------------------

  resolve(written: string, form: IconForm = 'token'): string | null {
    if (typeof written !== 'string') return null;
    if (form !== 'token') return parseIconRef(written, form);
    const t = written.trim();
    return isIconToken(t, (p) => this.has(p)) ? parseIconRef(t) : null;
  }

  get(name: string): IconResult {
    return this.look(name)[0];
  }

  /** A lookup and what it waits for when loading. */
  private look(name: string): [IconResult, Promise<unknown> | null] {
    if (this.table) return [this.table.get(name) ?? missing('icon'), null];
    const [p, icon] = splitIconName(name);
    const st = this.pack(p);
    if (!st) return isFaPack(p) && this.builtinOn ? this.faFallback(icon) : [missing('pack'), null];
    if (!decoder) return [LOADING, this.waitOn(loadDecoder(), p)];
    if (!st.data) {
      if (st.pending) return [LOADING, st.pending];
      if (!st.loader) return [missing('failed'), null];
      if (st.failedAt && this.now() - st.failedAt < ICON_RETRY_MS) return [missing('failed'), null];
      return [LOADING, this.startLoad(st)];
    }
    let d = st.decoded.get(icon);
    if (d === undefined) st.decoded.set(icon, (d = decoder.decodeIcon(st.data, icon)));
    return [d === 'missing' ? missing('icon') : d === 'invalid' ? missing('invalid') : { status: 'ready', icon: d }, null];
  }

  /** `fa:fa-car` without a Font Awesome pack: the built-in look-alike (`tabler:car`), reported as a fallback. */
  private faFallback(icon: string): [IconResult, Promise<unknown> | null] {
    if (!builtin) return [LOADING, this.waitOn(loadBuiltinIcons(), BUILTIN_PACK)];
    const target = Object.prototype.hasOwnProperty.call(builtin.fa, icon) ? builtin.fa[icon] : undefined;
    if (!target) return [missing('icon'), null];
    const [r, wait] = this.look(`${BUILTIN_PACK}:${target}`);
    return [r.status === 'ready' ? { ...r, fallback: `${BUILTIN_PACK}:${target}` } : r, wait];
  }

  /** Emits `change` once a load this registry waits on settles (the decoder, the built-in chunk). */
  private waitOn(p: Promise<unknown>, pack: string): Promise<unknown> {
    const done = (): void => this.emit([pack]);
    p.then(done, done);
    return p;
  }

  private startLoad(st: PackState): Promise<void> {
    const load = async (): Promise<void> => {
      try {
        const data: unknown = await st.loader!();
        if (!isPackData(data)) throw new Error(`icon pack "${st.name}": not an Iconify JSON pack`);
        st.data = data;
        st.failedAt = 0;
      } catch {
        st.failedAt = this.now() || 1;
      } finally {
        st.pending = null;
        st.notify([st.name]);
      }
    };
    return (st.pending = load());
  }

  /** Loads a pack (the picker's chip); resolves when it is loaded or failed. */
  async load(pack: string): Promise<void> {
    const st = this.pack(pack);
    if (!st) return;
    if (!decoder) await loadDecoder().catch(() => undefined);
    if (st.data) return;
    if (st.pending) return st.pending;
    if (st.loader) await this.startLoad(st);
  }

  /**
   * Loads what these icons need (the decoder, their packs, the built-in set for Font Awesome look-alikes); resolves
   * once every one is ready or missing. SSR awaits it before rendering (`renderToSvg`), so the render draws them.
   */
  async preload(names: Iterable<string>): Promise<void> {
    const list = [...names];
    for (let round = 0; round < 4; round++) {
      const waits: Promise<unknown>[] = [];
      for (const n of list) {
        const [r, w] = this.look(n);
        if (r.status === 'loading' && w) waits.push(w);
      }
      if (!waits.length) return;
      await Promise.allSettled(waits);
    }
  }

  /** These icons' lookups as plain data, plus the pack names (the render worker's registry, `fromSnapshot`). */
  snapshot(names: Iterable<string>): IconSnapshot {
    const icons: Record<string, IconResult> = {};
    for (const n of names) icons[n] = this.get(n);
    return { packs: this.packNames(), icons };
  }

  /** The packs as Mermaid's `registerIconPacks` takes them (the stock-Mermaid fallback), sharing this registry's loads. */
  mermaidPacks(): IconPack[] {
    return this.packNames().map((name) => {
      const st = this.pack(name)!;
      if (st.data) return { name, icons: st.data };
      return {
        name,
        loader: async () => {
          await this.load(name);
          if (!st.data) throw new Error(`icon pack "${name}" failed to load`);
          return st.data;
        },
      };
    });
  }
}
