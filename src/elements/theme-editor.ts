// <mmdx-theme-editor> (§8.3, UC3; prototype theme-editor.js): the theme library editor.
//
//   Baseline — every style of every item type, grouped by diagram type, plus the colour palette.
//   Themes   — override only what differs from what they extend (palette colours included); the rest is inherited.
//
// Edits change a draft (tiles and the sample preview follow); Save validates it, writes it through the ThemeStore and
// registers it in the shared ThemeRegistry so open viewers and editors pick it up. Export downloads a .theme.json.
// Behind the element is the ThemeEditor class (theme-editor/editor.ts), which can also be mounted into any element.
import type { ThemeSource, ThemeStore } from '../adapters/themes.js';
import type { StorageAdapter } from '../adapters/storage.js';
import { BASELINE } from '../core/theme/registry.js';
import { TYPES } from '../theme-editor/constants.js';
import { ThemeEditor } from '../theme-editor/editor.js';
import type { ThemeEditorOptions, ThemeSamples } from '../theme-editor/types.js';
import { isObj } from '../theme-editor/util.js';
import { ElementBase } from './base.js';

export { ThemeEditor } from '../theme-editor/editor.js';
export { contrastRatio } from '../core/theme/contrast.js';
export type { ThemeEditorEventMap, ThemeEditorOptions, ThemeSamples } from '../theme-editor/types.js';

// ---- custom element ------------------------------------------------------------------------------------------------

export class MmdxThemeEditorElement extends ElementBase {
  static observedAttributes = ['theme', 'can-edit', 'can-publish', 'can-delete', 'presentation', 'ui', 'samples'];
  private editor: ThemeEditor | null = null;
  private pending: ThemeEditorOptions = {};

  connectedCallback(): void {
    this.editor = new ThemeEditor(this, { ...this.attrOptions(), ...this.pending });
  }

  disconnectedCallback(): void {
    this.editor?.destroy();
    this.editor = null;
  }

  attributeChangedCallback(): void {
    this.editor?.set(this.attrOptions());
  }

  private attrOptions(): ThemeEditorOptions {
    const o: ThemeEditorOptions = {};
    const a = (n: string): string | null => this.getAttribute(n);
    const bool = (n: string): boolean | undefined => (this.hasAttribute(n) ? a(n) !== 'false' : undefined);
    const theme = a('theme');
    if (theme) o.theme = theme;
    const ce = bool('can-edit'), cp = bool('can-publish'), cd = bool('can-delete');
    if (ce !== undefined) o.canEdit = ce;
    if (cp !== undefined) o.canPublish = cp;
    if (cd !== undefined) o.canDelete = cd;
    const pres = a('presentation');
    if (pres === 'dialog' || pres === 'inline') o.presentation = pres;
    const ui = a('ui');
    if (ui === 'light' || ui === 'dark' || ui === 'auto') o.ui = ui;
    const samples = a('samples');
    if (samples) {
      try {
        const s = JSON.parse(samples) as unknown;
        if (isObj(s)) {
          const out: ThemeSamples = {};
          for (const k of TYPES) if (typeof s[k] === 'string') out[k] = s[k] as string;
          o.samples = out;
        }
      } catch {
        // not JSON: ignored (set the `samples` property instead)
      }
    }
    return o;
  }

  private setOpt(patch: Partial<ThemeEditorOptions>): void {
    if (this.editor) this.editor.set(patch);
    else Object.assign(this.pending, patch);
  }

  /** The imperative editor (null while disconnected). */
  get instance(): ThemeEditor | null {
    return this.editor;
  }
  get store(): ThemeStore | undefined {
    return this.editor?.options.store ?? this.pending.store;
  }
  set store(v: ThemeStore | undefined) {
    if (v) this.setOpt({ store: v });
  }
  get source(): ThemeSource | undefined {
    return this.editor?.options.source ?? this.pending.source;
  }
  set source(v: ThemeSource | undefined) {
    if (v) this.setOpt({ source: v });
  }
  set storage(v: StorageAdapter) {
    this.setOpt({ storage: v });
  }
  get samples(): ThemeSamples | undefined {
    return this.editor?.options.samples ?? this.pending.samples;
  }
  set samples(v: ThemeSamples | undefined) {
    if (v) this.setOpt({ samples: v });
  }
  get theme(): string {
    return this.editor?.themeId ?? this.getAttribute('theme') ?? BASELINE;
  }
  set theme(v: string) {
    this.setAttribute('theme', v);
  }
  /** True while the open theme has unsaved changes. */
  get dirty(): boolean {
    return this.editor?.dirty ?? false;
  }
  /** Resolves when the theme list is loaded. */
  get ready(): Promise<void> {
    return this.editor?.ready ?? Promise.resolve();
  }
  save(): Promise<boolean> {
    return this.editor?.save() ?? Promise.resolve(false);
  }
  select(id: string): Promise<boolean> {
    return this.editor?.select(id) ?? Promise.resolve(false);
  }
  undo(): void {
    this.editor?.undo();
  }
  redo(): void {
    this.editor?.redo();
  }
  open(): void {
    this.editor?.open();
  }
  close(): Promise<boolean> {
    return this.editor?.close() ?? Promise.resolve(true);
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
