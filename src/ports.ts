// The host interfaces (architecture §8.1 `ports`): what a host plugs in. Types only; src/adapters/ has the
// implementations that ship with mmdx.
import type { VersionInfo } from './core/diff/report.js';
import type { ThemeFile, ThemeInfo } from './core/theme/types.js';

export type { ContentUrlKind, UrlResolver } from './core/validate.js';
export type { VersionInfo };

/** Undoes a subscription. */
export type Unsubscribe = () => void;

/** A port that may tell about changes made elsewhere (another tab, user or upload): `subscribe` returns the undo. */
export interface Subscribable<A extends unknown[] = []> {
  subscribe?(cb: (...a: A) => void): Unsubscribe;
}

// ---- stock Mermaid (the fallback renderer and the plain-Mermaid views)
/** Minimal surface of stock Mermaid used by the fallback renderer and the plain-Mermaid compare view. */
export interface MermaidLike {
  initialize(cfg: Record<string, unknown>): void;
  render(id: string, text: string, container?: Element): Promise<{ svg: string }>;
  /** Mermaid 11.1+: the icon packs `fa:` tokens, icon nodes and architecture diagrams draw from (T04: mmdx forwards its packs). */
  registerIconPacks?(packs: { name: string; icons?: unknown; loader?: () => Promise<unknown> }[]): void;
}

// ---- storage (§8.2 `storage`, A.12): UI preferences, never the document
export interface StorageAdapter {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

// ---- documents (§8.2): how the editor loads and saves its document
export interface LoadResult {
  source: string;
  name?: string;
  version?: string;
}

export type DocumentSaveResult = { version?: string } | { conflict: { source: string; version: string } };

export interface DocumentAdapter {
  load(): Promise<LoadResult>;
  /** Always `.mmdx` content (§5.1). */
  save(source: string, ctx: { version?: string }): Promise<DocumentSaveResult>;
  /** Live updates from the host (another tab or user). Returns an unsubscribe function. */
  subscribe?(cb: (source: string, version: string) => void): () => void;
}

// ---- themes (§8.3): read by every component, written by the theme editor
export interface ThemeSource {
  list(): Promise<ThemeInfo[]>;
  get(id: string): Promise<ThemeFile>;
  subscribe?(cb: () => void): () => void;
}

export type SaveResult = { version: string } | { conflict: ThemeFile };

export interface ThemeStore extends ThemeSource {
  /** `theme` is the theme editor's saved copy (the saved theme in the library and the registry): a store that keeps it keeps a copy. */
  save(theme: ThemeFile, opts: { version?: string }): Promise<SaveResult>;
  delete?(id: string): Promise<void>;
  publish?(id: string): Promise<void>;
  /** Number of diagrams that use the theme, when the host can tell. */
  usage?(id: string): Promise<number>;
  /** The list with each theme's file and usage in one read (P19): the theme editor's library uses it when the store has it, instead of `list()`, then `get()` and `usage()` per theme. */
  listWithUsage?(): Promise<{ info: ThemeInfo; file: ThemeFile; usage?: number }[]>;
}

// ---- history (diff §8.6): the versions of a diagram, newest first
export interface HistoryAdapter {
  /** Newest first. May page: pass `next` from the previous page as `cursor`. */
  list(cursor?: string): Promise<{ versions: VersionInfo[]; next?: string }>;
  /** The source of one version (untrusted: validated like any source). */
  load(id: string): Promise<string>;
  /** Calls `cb` when the history changed (a new version was saved); returns an unsubscribe. */
  subscribe?(cb: () => void): () => void;
}

// ---- images: the editor's image library and uploads
/** A picture in the host's image store. */
export interface ImageInfo {
  id: string;
  /** What the diagram references (written into the code or the metadata): a URL, or a host reference `resolveUrl` maps to one. */
  url: string;
  /** A small version for the library's grid (a URL the browser loads as is; default: `url`, resolved). */
  thumb?: string;
  /** The file name or a title, shown and searched in the library. */
  name?: string;
  /** The pixel size, when the host knows it. */
  w?: number;
  h?: number;
  /** The MIME type and the size in bytes. */
  type?: string;
  size?: number;
  /** ISO date of the upload. */
  date?: string;
}

/** One page of pictures, newest first; `next` asks for the next one. */
export interface ImagePage {
  images: ImageInfo[];
  next?: string;
}

export interface ImageStore {
  /** Pictures, newest first. May page (pass `next` back as `cursor`) and filter by `query` (a name; a store may ignore it). */
  list(o?: { cursor?: string; query?: string }): Promise<ImagePage>;
  /** One picture's record. */
  get(id: string): Promise<ImageInfo>;
  /** Stores a file and resolves to its record (throw to refuse it: the message is shown). */
  put(file: Blob, o?: { name?: string }): Promise<ImageInfo>;
  /** Removes a picture from the store (diagrams that reference it keep the reference). */
  delete?(id: string): Promise<void>;
  /** Calls `cb` when the store changed (a picture added or removed elsewhere); returns an unsubscribe. */
  subscribe?(cb: () => void): () => void;
}

// ---- full screen by the host page (sandboxed iframes)
/**
 * Full screen provided by the host page, for components in sandboxed iframes without `allowfullscreen` (the host can
 * show the frame in a modal instead). The zoom bar's full-screen button uses it when the browser's full screen is
 * unavailable.
 */
export interface HostFullscreen {
  /** Whether the host can show the component full screen now. */
  available(): boolean;
  enter(): Promise<void>;
  exit(): Promise<void>;
  /** Whether the host shows it full screen, for hosts that can leave full screen by themselves (read on toggle and on window resize). */
  active?(): boolean;
}
