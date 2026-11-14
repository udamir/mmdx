// Icon packs (T04): the subset of Iconify's JSON format the registry reads, the pack shape Mermaid's
// `registerIconPacks` takes (so one configuration feeds mmdx and the stock-Mermaid fallback), and what a lookup
// returns. Types only: every context carries a registry, the code that decodes icons loads on demand.

/** One icon of an Iconify JSON pack: an SVG body (the inside of `<svg>`) and its box and transformations. */
export interface IconifyIcon {
  body: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  /** Quarter turns (0–3). */
  rotate?: number;
  hFlip?: boolean;
  vFlip?: boolean;
  /** Kept for old names; not listed in search. */
  hidden?: boolean;
}

/** Another name of an icon, optionally transformed (`rotate`, flips; `width`… override the parent's). */
export interface IconifyAlias extends Omit<IconifyIcon, 'body'> {
  parent: string;
}

/** What the picker shows about a pack. */
export interface IconifyInfo {
  name?: string;
  author?: { name: string; url?: string };
  license?: { title: string; spdx?: string; url?: string };
  /** Multicolour icons (logos). */
  palette?: boolean;
  version?: string;
}

/** An Iconify JSON pack (`@iconify-json/<set>/icons.json`); everything else in the file is ignored. */
export interface IconifyJSON {
  prefix: string;
  icons: Record<string, IconifyIcon>;
  aliases?: Record<string, IconifyAlias>;
  /** Defaults of the icons' box (Iconify: 16 × 16 at 0, 0). */
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  info?: IconifyInfo;
  /** Category name → icon names (search). */
  categories?: Record<string, string[]>;
  /** mmdx extension: search keywords per icon name (the built-in pack ships them). */
  keywords?: Record<string, string[]>;
}

/**
 * An icon pack as Mermaid's `registerIconPacks` takes it: the icons, or a loader called the first time an icon of the
 * pack is looked up. `name` is the prefix diagrams write (`azure:computer-vision`) and overrides the pack's own `prefix`.
 */
export interface IconPack {
  name: string;
  icons?: IconifyJSON;
  loader?: () => Promise<IconifyJSON>;
}

/** A decoded icon: its validated body with the transformations applied, and its view box. */
export interface IconData {
  body: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Drawn in `currentColor` (takes the item's colour); false for multicolour icons (logos), which keep theirs. */
  mono: boolean;
}

/** Why an icon is not drawn: no such pack, no such icon, a body that failed validation, or the pack failed to load. */
export type IconMissing = 'pack' | 'icon' | 'invalid' | 'failed';

/** A lookup: drawn (`ready`), not yet (`loading`, its pack or the decoder is on the way) or not at all (`missing`). */
export type IconResult =
  | { status: 'ready'; icon: IconData; /** The built-in look-alike drawn for a Font Awesome name (`tabler:car`). */ fallback?: string }
  | { status: 'loading' }
  | { status: 'missing'; reason: IconMissing };

/**
 * How a reference is written: a label token (`fa:fa-car`, `azure:computer-vision`, recognised only for registered
 * packs and Font Awesome), an icon node's value (`@{ icon: "logos:aws-ec2" }`: any `pack:name`) or CSS classes
 * (mindmap `::icon(fa fa-car)`, `mdi mdi-skull`).
 */
export type IconForm = 'token' | 'node' | 'class';

/** What renderers read (the render context's `icons`): name resolution and synchronous lookups. */
export interface IconLookup {
  /** The canonical `pack:name` a reference names, or null when it is not an icon reference. */
  resolve(written: string, form?: IconForm): string | null;
  /** The icon a canonical name names, now; a pack or decoder still loading says so and loads. */
  get(name: string): IconResult;
}

/** Resolved icons as plain data (the render worker gets them with each request: it cannot call loaders). */
export interface IconSnapshot {
  /** The registered pack names (label tokens of these packs are icons). */
  packs: string[];
  icons: Record<string, IconResult>;
}
