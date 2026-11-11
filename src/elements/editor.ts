// <mmdx-editor> (A9: the element moved out of editor/editor.ts, which no longer imports the element kit): attributes
// and properties over the DiagramEditor component.
import { applyKernelPatch } from '../view/kernel-options.js';
import type { HistoryEventMap } from '../view/history.js';
import type { Diagnostic } from '../core/types.js';
import type { ChangeReason } from '../editor/store.js';
import type { StaticVersion } from '../adapters/history.js';
import type { HistoryAdapter, ImageStore, DocumentAdapter, StorageAdapter, ThemeSource } from '../ports.js';
import { MmdxElement, readInlineSource, warnOnce, words, type AttrSpec, type Patch } from '../elements/base.js';
import { DEFAULT_FEATURES, type EditorFeatures } from '../editor/core.js';
import type { EditorModule } from '../editor/module.js';
import { DEFAULT_MODULES } from '../editor/modules/index.js';
import type { ItemRef } from '../core/types.js';
import type { HistorySession } from '../view/history.js';
import { DiagramEditor, type EditorOptions, type SaveOutcome, type SetSourceOptions } from '../editor/editor.js';

/** The DOM events of <mmdx-editor> (A9: typed as the viewer's, the diff's and the theme editor's are). */
export interface EditorEventMap extends HistoryEventMap {
  'mmdx-load': CustomEvent<{ source: string; version: string | null }>;
  /** Before a save; cancelable (the host saves, or refuses). */
  'mmdx-save': CustomEvent<{ source: string }>;
  'mmdx-saved': CustomEvent<{ source: string; version: string | undefined }>;
  'mmdx-conflict': CustomEvent<{ mine: string; theirs: string; version: string }>;
  'mmdx-change': CustomEvent<{ source: string; reason: ChangeReason }>;
  'mmdx-dirty': CustomEvent<{ dirty: boolean }>;
  /** Before an edit is applied; cancelable (a host's policy can veto it). */
  'mmdx-op': CustomEvent<{ type: string; code: string }>;
  'mmdx-selection': CustomEvent<{ items: { kind: string; id: string }[] }>;
  /** A link followed in View mode; cancelable. */
  'mmdx-link': CustomEvent<{ href: string; id: string | null }>;
  /** Before an export is downloaded; cancelable (the host takes the file). */
  'mmdx-export': CustomEvent<{ kind: string; name: string; data: Blob | string; type: string }>;
  'mmdx-error': CustomEvent<{ diagnostics: Diagnostic[] }>;
  'mmdx-ui': CustomEvent<{ ui: 'light' | 'dark' }>;
}

// ---- custom element ------------------------------------------------------------------------------------------------

const text = (v: string | null): string | undefined => v ?? undefined;
const FEATURE_NAMES = Object.keys(DEFAULT_FEATURES).filter((k) => k !== 'exportFormats') as (keyof EditorFeatures)[];

/**
 * Attributes and the option each one sets. `features` lists the features that are on, like the viewer's `controls`
 * (`code-panel` or `codePanel`; `none`: all off); `exportFormats` keeps its default.
 */
const ATTRS: Readonly<Record<string, AttrSpec<EditorOptions>>> = {
  'read-only': ['readOnly', (v) => (v === null ? undefined : v !== 'false')],
  ui: ['ui', (v) => (v === 'light' || v === 'dark' || v === 'auto' ? v : undefined)],
  autosave: ['autosave', (v) => (v === null ? undefined : v === 'false' ? false : Number(v) || 1500)],
  'guard-unload': ['guardUnload', (v) => (v === null ? undefined : v !== 'false')],
  name: ['name', (v) => v || undefined], theme: ['theme', text], 'theme-dark': ['themeDark', text],
  compact: ['compact', (v) => (v === null ? undefined : v === 'auto' ? 'auto' : v !== 'false')],
  wheel: ['wheel', (v) => (v === 'ctrl' || v === 'always' || v === 'zoom' || v === 'never' ? v : undefined)],
  features: ['features', (v) => {
    if (v === null) return undefined;
    const on = new Set(words(v).map((w) => w.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())));
    return Object.fromEntries(FEATURE_NAMES.map((f) => [f, on.has(f)]));
  }],
};

export class MmdxEditorElement extends MmdxElement<EditorOptions, DiagramEditor> {
  static override readonly schema = { attrs: ATTRS };

  protected create(o: EditorOptions): DiagramEditor {
    if (o.value === undefined && !o.adapter) {
      const inline = readInlineSource(this);
      if (inline) o.value = inline;
    }
    return new DiagramEditor(this, o);
  }

  /** The next editor starts from this one's document (its undo history goes with it). */
  protected override keep(e: DiagramEditor): void {
    this.props.value = e.getSource();
  }

  protected apply(e: DiagramEditor, patch: Patch<EditorOptions>): void {
    const core = e.core;
    const p = patch as EditorOptions;
    for (const k of Object.keys(patch) as (keyof EditorOptions)[]) {
      switch (k) {
        case 'value':
          e.setSource(p.value ?? '');
          break;
        case 'adapter':
          e.adapter = p.adapter;
          break;
        case 'readOnly':
          e.readOnly = !!p.readOnly;
          break;
        case 'history':
          e.history = p.history ?? null;
          break;
        case 'uploadImage':
          e.uploadImage = p.uploadImage ?? null;
          break;
        case 'images':
          e.images = p.images ?? null;
          break;
        case 'ui':
          e.setUi(p.ui ?? 'auto');
          break;
        case 'name':
          e.fileName = p.name ?? 'diagram';
          break;
        case 'theme':
        case 'themeDark':
        case 'compact':
        case 'wheel':
          applyKernelPatch(core, { [k]: p[k] }, { wheel: 'always' });
          break;
        case 'panels':
          core.setPanels({ ...p.panels });
          break;
        case 'storage':
          applyKernelPatch(core, { storage: p.storage }, { wheel: 'always' });
          break;
        case 'themeSource':
          core.setThemeSource(p.themeSource);
          break;
        case 'features':
          // modules read the features while installing: they are installed again (History, if open, stays)
          Object.assign(core.features, DEFAULT_FEATURES, p.features);
          if (this.props.toolbar === 'none') core.features.styleToolbar = false;
          core.useModules((this.props.modules ?? DEFAULT_MODULES).map((m) => Object.create(m) as EditorModule));
          // the panels again (the new modules render what is open)
          core.setPanels({});
          break;
        case 'modules':
          core.useModules(p.modules ?? DEFAULT_MODULES);
          break;
        default:
          warnOnce(`editor: \`${k}\` is read when the editor is created`);
      }
    }
  }

  get value(): string {
    return this.live?.getSource() ?? this.props.value ?? '';
  }
  set value(v: string) {
    this.setOpt({ value: v });
  }
  get adapter(): DocumentAdapter | undefined {
    return this.live?.adapter ?? this.props.adapter;
  }
  set adapter(a: DocumentAdapter | undefined) {
    this.setOpt({ adapter: a });
  }
  get readOnly(): boolean {
    return this.live?.readOnly ?? !!(this.props.readOnly ?? this.attrOptions().readOnly);
  }
  set readOnly(v: boolean) {
    this.setOpt({ readOnly: v });
  }
  get features(): Partial<EditorFeatures> | undefined {
    return this.props.features;
  }
  /** The features: an object, or a space-separated string like the attribute. */
  set features(f: Partial<EditorFeatures> | string | undefined) {
    this.setOpt({ features: typeof f === 'string' ? (ATTRS['features']![1](f) as Partial<EditorFeatures>) : f });
  }
  get history(): HistoryAdapter | readonly StaticVersion[] | null {
    return this.live?.history ?? this.props.history ?? null;
  }
  set history(h: HistoryAdapter | readonly StaticVersion[] | null) {
    this.setOpt({ history: h ?? undefined });
  }
  /** The host's picture upload (no attribute): `editor.uploadImage = async (file) => ({ url })`; null: images by URL only. */
  get uploadImage(): ((file: File) => Promise<{ url: string }>) | null {
    return this.live?.uploadImage ?? this.props.uploadImage ?? null;
  }
  set uploadImage(f: ((file: File) => Promise<{ url: string }>) | null) {
    this.setOpt({ uploadImage: f });
  }
  /** The host's image store (no attribute): the image tool's Library, and where uploads go; null: no library. */
  get images(): ImageStore | null {
    return this.live?.images ?? this.props.images ?? null;
  }
  set images(s: ImageStore | null) {
    this.setOpt({ images: s });
  }
  get panels(): EditorOptions['panels'] {
    return this.props.panels;
  }
  set panels(p: EditorOptions['panels']) {
    this.setOpt({ panels: p });
  }
  get storage(): StorageAdapter | undefined {
    return this.props.storage;
  }
  set storage(s: StorageAdapter | undefined) {
    this.setOpt({ storage: s });
  }
  get themeSource(): ThemeSource | undefined {
    return this.props.themeSource;
  }
  set themeSource(s: ThemeSource | undefined) {
    this.setOpt({ themeSource: s });
  }
  get modules(): readonly EditorModule[] | undefined {
    return this.props.modules;
  }
  set modules(m: readonly EditorModule[] | undefined) {
    this.setOpt({ modules: m });
  }

  getSource(): string {
    return this.value;
  }
  /**
   * Replaces the document (see `SetSourceOptions`; `{ history: 'push', markSaved: false }` restores a draft as unsaved,
   * undoable changes). Before the element is connected, the source becomes its initial value.
   */
  setSource(src: string, opts?: SetSourceOptions): void {
    this.props.value = src;
    this.live?.setSource(src, opts);
  }
  /** Resolves once the editor's document is in (the adapter's load; see `DiagramEditor.whenLoaded`). */
  whenLoaded(): Promise<void> {
    return this.live ? this.live.whenLoaded() : Promise.reject(new Error('Not connected'));
  }
  save(): Promise<SaveOutcome> {
    return this.live?.save() ?? Promise.resolve('no-adapter');
  }
  undo(): void {
    this.live?.undo();
  }
  redo(): void {
    this.live?.redo();
  }
  select(items: ItemRef[]): void {
    this.live?.select(items);
  }
  focusCode(line: number): void {
    this.live?.focusCode(line);
  }
  exportAs(kind: 'mmdx' | 'mmd' | 'svg' | 'png'): Promise<void> {
    return this.live?.exportAs(kind) ?? Promise.resolve();
  }
  fit(): void {
    this.live?.fit();
  }
  plainMermaid(): Promise<void> {
    return this.live?.plainMermaid() ?? Promise.resolve();
  }
  /** Opens or closes History (when the editor has a `history`); `compare` opens on the newest change compared. */
  toggleHistory(on?: boolean, opts?: { compare?: boolean }): void {
    this.live?.toggleHistory(on, opts);
  }
  /** The open History's session, null while History is closed. */
  get historySession(): HistorySession | null {
    return this.live?.historySession ?? null;
  }
  get dirty(): boolean {
    return this.live?.dirty ?? false;
  }
}

export function defineEditor(name = 'mmdx-editor'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, class extends MmdxEditorElement {});
}

declare global {
  interface HTMLElementTagNameMap {
    'mmdx-editor': MmdxEditorElement;
  }
}
