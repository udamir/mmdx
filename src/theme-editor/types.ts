// Types of the theme editor: its public options and events, and the shapes its modules share.
import type { ThemeSource, ThemeStore } from '../adapters/themes.js';
import type { StorageAdapter } from '../adapters/storage.js';
import type { CoreContext } from '../core/context.js';
import type { FieldDef, FieldOption } from '../core/schema/style-fields.js';
import type { ThemeFile } from '../core/theme/types.js';
import type { DiagramType } from '../core/types.js';

export type ThemeSamples = Partial<Record<DiagramType, string>>;

export interface ThemeEditorOptions {
  /** Where themes are read and saved (default: in memory, with the built-in themes). */
  store?: ThemeStore;
  /** Read-only themes the store's themes may extend (e.g. the shipped theme files). */
  source?: ThemeSource;
  /** Theme selected on open (default: baseline). */
  theme?: string;
  canEdit?: boolean;
  canPublish?: boolean;
  canDelete?: boolean;
  /** Mermaid samples per diagram type for the preview. */
  samples?: ThemeSamples;
  presentation?: 'inline' | 'dialog';
  /** UI preferences: `teSamples` (edited sample code), `teZoom` (tile zoom). */
  storage?: StorageAdapter;
  ui?: 'light' | 'dark' | 'auto';
  ctx?: Partial<CoreContext>;
}

export interface ThemeEditorEventMap {
  /** Before a theme is written to the store; cancelable. */
  'mmdx-theme-save': CustomEvent<{ theme: ThemeFile }>;
  'mmdx-theme-saved': CustomEvent<{ theme: ThemeFile; version: string }>;
  /** The draft became dirty or clean. */
  'mmdx-theme-dirty': CustomEvent<{ id: string; dirty: boolean }>;
  'mmdx-theme-select': CustomEvent<{ id: string }>;
  /** Dialog presentation closed. */
  'mmdx-theme-close': CustomEvent<{ id: string }>;
}

/** A theme of the library: the file, where it comes from, and its store version. */
export interface Entry {
  file: ThemeFile;
  version?: string;
  inStore: boolean;
  inSource: boolean;
  sourceFile?: ThemeFile;
  usage?: number;
}

/** The selected tile: an item style (default / shape default / preset) or a page preset. */
export interface TileSel {
  type: DiagramType;
  kind: string;
  presets?: string;
  preset: string | null;
  fields: readonly string[];
  /** The box under the gallery where the tile's other properties show. */
  props: HTMLElement;
  shape?: string;
  shapesKey?: string;
}

/** A field row's definition (a style field of the schema, or one of the editor's own). */
export interface LocalField {
  label: string;
  type: FieldDef['type'] | 'text';
  step?: number;
  min?: number;
  max?: number;
  options?: readonly FieldOption[];
}
