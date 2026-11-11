// <mmdx-theme-editor> (§8.3, UC3; prototype theme-editor.js): the theme library editor.
//
//   Baseline — every style of every item type, grouped by diagram type, plus the colour palette.
//   Themes   — override only what differs from what they extend (palette colours included); the rest is inherited.
//
// Edits change a draft (tiles and the sample preview follow); Save validates it, writes it through the ThemeStore and
// registers it in the shared ThemeRegistry so open viewers and editors pick it up. Export downloads a .theme.json.
// Behind the element is the ThemeEditor class (theme-editor/editor.ts), which can also be mounted into any element.
import type { ThemeSource, ThemeStore, StorageAdapter } from '../ports.js';
import { BASELINE } from '../core/theme/registry.js';
import { TYPES } from '../theme-editor/constants.js';
import { ThemeEditor } from '../theme-editor/editor.js';
import type { ThemeEditorOptions, ThemeSamples } from '../theme-editor/types.js';
import { isObj } from '../theme-editor/util.js';
import { MmdxElement, warnOnce, type AttrSpec, type Patch } from './base.js';

export { ThemeEditor } from '../theme-editor/editor.js';
export { contrastRatio } from '../core/theme/contrast.js';
export type { ThemeEditorEventMap, ThemeEditorOptions, ThemeSamples } from '../theme-editor/types.js';

// ---- custom element ------------------------------------------------------------------------------------------------

const flag = (v: string | null): boolean | undefined => (v === null ? undefined : v !== 'false');

/** Attributes and the option each one sets (`samples`: JSON per diagram type; not JSON is ignored). */
const ATTRS: Readonly<Record<string, AttrSpec<ThemeEditorOptions>>> = {
  theme: ['theme', (v) => v || undefined], 'can-edit': ['canEdit', flag], 'can-publish': ['canPublish', flag], 'can-delete': ['canDelete', flag],
  presentation: ['presentation', (v) => (v === 'dialog' || v === 'inline' ? v : undefined)],
  ui: ['ui', (v) => (v === 'light' || v === 'dark' || v === 'auto' ? v : undefined)],
  samples: ['samples', (v) => {
    try {
      const s = JSON.parse(v ?? '') as unknown;
      if (!isObj(s)) return undefined;
      const out: ThemeSamples = {};
      for (const k of TYPES) if (typeof s[k] === 'string') out[k] = s[k] as string;
      return out;
    } catch {
      return undefined;
    }
  }],
};

export class MmdxThemeEditorElement extends MmdxElement<ThemeEditorOptions, ThemeEditor> {
  static override readonly schema = { attrs: ATTRS };

  protected create(o: ThemeEditorOptions): ThemeEditor {
    return new ThemeEditor(this, o);
  }

  protected apply(te: ThemeEditor, patch: Patch<ThemeEditorOptions>): void {
    if ('ctx' in patch) warnOnce('theme editor: `ctx` is read when the theme editor is created');
    // a switch the user cancels (unsaved changes) keeps the open theme: the attribute follows what is open
    void te.set(patch as Partial<ThemeEditorOptions>).then((id) => {
      if (patch.theme && this.getAttribute('theme') !== null && this.getAttribute('theme') !== id) this.setAttribute('theme', id);
    });
  }

  get store(): ThemeStore | undefined {
    return this.live?.options.store ?? this.props.store;
  }
  set store(v: ThemeStore | undefined) {
    if (v) this.setOpt({ store: v });
  }
  get source(): ThemeSource | undefined {
    return this.live?.options.source ?? this.props.source;
  }
  set source(v: ThemeSource | undefined) {
    this.setOpt({ source: v });
  }
  get storage(): StorageAdapter | undefined {
    return this.props.storage;
  }
  set storage(v: StorageAdapter | undefined) {
    if (v) this.setOpt({ storage: v });
  }
  get samples(): ThemeSamples | undefined {
    return this.live?.options.samples ?? this.props.samples;
  }
  set samples(v: ThemeSamples | undefined) {
    this.setOpt({ samples: v });
  }
  get theme(): string {
    return this.live?.themeId ?? this.getAttribute('theme') ?? BASELINE;
  }
  set theme(v: string) {
    this.setAttribute('theme', v);
  }
  /** True while the open theme has unsaved changes. */
  get dirty(): boolean {
    return this.live?.dirty ?? false;
  }
  /** Resolves when the theme list is loaded. */
  get ready(): Promise<void> {
    return this.live?.ready ?? Promise.resolve();
  }
  save(): Promise<boolean> {
    return this.live?.save() ?? Promise.resolve(false);
  }
  select(id: string): Promise<boolean> {
    return this.live?.select(id) ?? Promise.resolve(false);
  }
  undo(): void {
    this.live?.undo();
  }
  redo(): void {
    this.live?.redo();
  }
  open(): void {
    this.live?.open();
  }
  close(): Promise<boolean> {
    return this.live?.close() ?? Promise.resolve(true);
  }
}

export function defineThemeEditor(name = 'mmdx-theme-editor'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, class extends MmdxThemeEditorElement {});
}

declare global {
  interface HTMLElementTagNameMap {
    'mmdx-theme-editor': MmdxThemeEditorElement;
  }
}
