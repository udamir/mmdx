// <mmdx-editor> (§8.2, UC2): edit a diagram attached to a host page. The DiagramEditor class owns one EditorCore and
// its feature modules; the custom element is a thin wrapper around it.
import { EDITOR_MESSAGES } from './messages.js';
import { Owner } from '../reactive/owner.js';
import { registerMessages } from '../i18n.js';
import type { StaticVersion } from '../adapters/history.js';
import type { HistoryAdapter, ImageStore, DocumentAdapter, StorageAdapter, ThemeSource } from '../ports.js';
import type { WheelMode } from '../dom/viewport.js';
import { TOOLBAR_MESSAGES } from '../ui/messages/toolbar.js';
import { ensureBuiltinThemes } from '../platform/themes.js';
import type { CoreContext } from '../core/context.js';
import type { IconPack } from '../core/icons/types.js';
import { effect, untracked } from '../reactive/signal.js';
import { DEFAULT_FEATURES, EditorCore, type EditorFeatures, type Mode } from './core.js';
import type { EditorModule } from './module.js';
import { DEFAULT_MODULES } from './modules/index.js';
import { DocStore } from './store.js';
import { DocumentSync, type SaveOutcome } from './services/document-sync.js';
import type { ItemRef } from '../core/types.js';
import type { HistorySession } from '../view/history.js';

export interface EditorOptions {
  value?: string;
  adapter?: DocumentAdapter;
  readOnly?: boolean;
  features?: Partial<EditorFeatures>;
  panels?: Partial<{ code: boolean; properties: boolean; layers: boolean }>;
  toolbar?: 'floating' | 'none';
  /** Debounced save through the adapter, in ms; false = off. */
  autosave?: number | false;
  storage?: StorageAdapter;
  themeSource?: ThemeSource;
  ui?: 'light' | 'dark' | 'auto';
  /** The diagram theme the host sets (the user's pick in the theme menu wins; component architecture §7.5). */
  theme?: string;
  /** The theme while the chrome is dark (`auto`: the dark counterpart of `theme`). */
  themeDark?: string;
  /** The `compact` preset (§7.6): the same chrome, smaller and icon-only; automatic below a host size by default. */
  compact?: boolean | 'auto';
  /** What the mouse wheel does on the canvas: `always` (default) pans and ⌘ / Ctrl + wheel zooms; `zoom` zooms at the pointer and Shift + wheel pans. */
  wheel?: WheelMode;
  /** Ask before leaving the page with unsaved changes (opt-in; SPAs handle this themselves). */
  guardUnload?: boolean;
  /** File name used for exports. */
  name?: string;
  ctx?: Partial<CoreContext>;
  /** The component's own icon packs, over the shared ones of `configure({ iconPacks })`; read when it is created. */
  iconPacks?: readonly IconPack[];
  modules?: readonly EditorModule[];
  /** The document's versions (a HistoryAdapter or a list with sources): shows the History button. */
  history?: HistoryAdapter | readonly StaticVersion[];
  /**
   * Uploads a picture dropped, pasted or chosen in the image tool and resolves to the URL the image item references
   * (throw to refuse: the message shows as a toast). Without it images are added by URL only (no embedding).
   */
  uploadImage?: ((file: File) => Promise<{ url: string }>) | null;
  /**
   * The host's image store: the image tool's Library tab lists its pictures, and uploads (the Upload tab, a picture
   * pasted or dropped on the canvas) are put into it, before `uploadImage`. Without it there is no library.
   */
  images?: ImageStore | null;
}

export type { SaveOutcome };

/** How `setSource` replaces the document. */
export interface SetSourceOptions {
  /** `reset` (default): a new undo history; `push`: an undoable change. */
  history?: 'reset' | 'push';
  /** Fit the view to the new document (default `true`). */
  fit?: boolean;
  /** The new source is the saved one (default `true`); `false` keeps it as unsaved changes (a restored draft). */
  markSaved?: boolean;
}

export class DiagramEditor {
  readonly core: EditorCore;
  readonly store: DocStore;
  private readonly o: EditorOptions;
  private readonly owner = new Owner('editor');
  private readonly ac = new AbortController();
  /** The document and its adapter: load, save, conflicts, remote updates, autosave (5.3). */
  private readonly sync: DocumentSync;
  private destroyed = false;
  /** The document's name (exports, the studio's title): the core's file name, so it follows every open (B35). */
  get name(): string {
    return this.core.fileName;
  }
  set name(v: string) {
    this.core.uiState.fileName.set(v);
  }

  constructor(host: HTMLElement, options: EditorOptions = {}) {
    registerMessages(EDITOR_MESSAGES);
    registerMessages(TOOLBAR_MESSAGES);
    this.o = { ...options };
    const name = options.name ?? 'diagram';
    const features: EditorFeatures = { ...DEFAULT_FEATURES, ...(options.features ?? {}) };
    if (options.toolbar === 'none') features.styleToolbar = false;
    this.store = new DocStore({
      onChange: (src, reason) => this.sync.onStoreChange(src, reason),
      // a remote update waits for the transaction to end (after the caller of commit / rollback is done)
      onIdle: () => queueMicrotask(() => this.sync.applyPendingRemote()),
    });
    this.core = new EditorCore(host, {
      store: this.store,
      features,
      ...(options.storage ? { storage: options.storage } : {}),
      ...(options.ctx ? { ctx: options.ctx } : {}),
      ...(options.iconPacks ? { iconPacks: options.iconPacks } : {}),
      ...(options.themeSource ? { themeSource: options.themeSource } : {}),
      ...(options.ui && options.ui !== 'auto' ? { ui: options.ui } : {}),
      ...(options.theme ? { theme: options.theme } : {}),
      ...(options.themeDark ? { themeDark: options.themeDark } : {}),
      ...(options.compact !== undefined ? { compact: options.compact } : {}),
      ...(options.wheel ? { wheel: options.wheel } : {}),
    });
    this.core.hostServices.uploadImage.set(options.uploadImage ?? null);
    this.core.hostServices.images.set(options.images ?? null);
    const core = this.core;
    const root = core.root;
    this.owner.add(() => core.destroy());
    this.sync = new DocumentSync({ core, setSource: (src, o) => this.setSource(src, o), autosave: options.autosave, owner: this.owner }, options.adapter);
    this.owner.add(() => this.sync.destroy());

    // panel visibility from storage, then options
    const savedPanels = core.storage.get<{ code?: boolean; properties?: boolean; layers?: boolean }>('panels') ?? {};
    core.setPanels({ code: true, properties: true, layers: true, ...savedPanels, ...(options.panels ?? {}) });
    this.owner.add(effect(() => {
      const p = core.panels();
      const m = core.mode();
      root.classList.toggle('no-code', !p.code || !features.codePanel || m === 'view');
      root.classList.toggle('no-right', m === 'view' ? !p.layers : !p.properties && !p.layers);
      root.classList.toggle('no-layers', !p.layers);
    }));
    this.owner.add(effect(() => {
      const m = core.mode();
      root.classList.toggle('mode-edit', m === 'edit');
      root.classList.toggle('mode-view', m === 'view');
    }));
    // switching the stage (History) or the mode ends the edit in flight: nothing keeps writing the store from a state
    // captured before, and a gesture's release never commits while History is open (§8.2)
    let firstSwitch = true;
    this.owner.add(effect(() => {
      core.stage();
      core.mode();
      if (firstSwitch) {
        firstSwitch = false;
        return;
      }
      untracked(() => core.cancelGesture());
    }));
    this.owner.add(effect(() => {
      const t = core.tool();
      for (const c of Array.from(root.classList)) if (c.startsWith('tool-')) root.classList.remove(c);
      root.classList.add(`tool-${t}`);
    }));

    core.input.wire({ signal: this.ac.signal, owner: this.owner, onIdle: () => this.sync.applyPendingRemote() });
    this.addBaseShortcuts();

    // what History needs from the document (component architecture §8.2)
    core.provide('documentSource', () => this.store.source());
    core.provide('documentName', () => core.fileName || 'diagram');
    core.historyHost = {
      setClipboard: (data) => core.uiState.clipboard.set(data as NonNullable<typeof core.clipboard>),
      showVersion: (v) => core.showVersion(v),
      restoreVersion: (source, v) => {
        core.cancelGesture();
        core.store.load(source, { history: 'push', reason: 'remote', markSaved: false });
        core.draw();
        core.viewport.setBounds(core.result.result.bounds, { fit: true });
        core.fire('model');
        core.fire('panels');
        core.toast(core.i18n.t('history.restored', { id: v.id }));
      },
    };

    core.useModules(options.modules ?? DEFAULT_MODULES);

    core.uiState.fileName.set(name);
    // built-in themes besides baseline load on demand; redraw when they (or a theme saved elsewhere) arrive
    this.owner.add(core.ctx.themes.onChange(() => {
      if (this.destroyed) return;
      core.draw();
      core.fire('theme');
    }));
    void ensureBuiltinThemes();
    if (options.readOnly) core.setMode('view');
    if (options.history) core.setHostOptions({ history: options.history });
    if (options.guardUnload) {
      const onBeforeUnload = (ev: BeforeUnloadEvent): void => {
        if (this.store.dirty.peek()) ev.preventDefault();
      };
      window.addEventListener('beforeunload', onBeforeUnload, { signal: this.ac.signal });
    }

    if (options.adapter) this.sync.startLoad();
    else this.setSource(options.value ?? '', { history: 'reset' });
  }

  // ---- public API (§8.2) ------------------------------------------------------------------------------------------

  getSource(): string {
    return this.store.source();
  }

  /**
   * Replaces the document. A gesture or transaction in flight is cancelled first (rolled back, like Esc): the call is
   * synchronous, so the new source is what `getSource()` returns right after it, and the gesture cannot write state
   * captured before the load over it. (Remote updates from the adapter wait for the gesture to end instead.)
   */
  setSource(src: string, opts: SetSourceOptions = {}): void {
    this.core.loadSource(src, { history: opts.history ?? 'reset', reason: opts.history === 'push' ? 'remote' : 'load', ...(opts.fit !== undefined ? { fit: opts.fit } : {}), markSaved: opts.markSaved !== false });
  }

  get adapter(): DocumentAdapter | undefined {
    return this.sync.adapter;
  }
  set adapter(a: DocumentAdapter | undefined) {
    // the old adapter stops reporting remote changes, and what it reported is dropped
    this.sync.setAdapter(a);
  }

  /** The document's versions; null hides the History button. */
  get history(): HistoryAdapter | readonly StaticVersion[] | null {
    return this.core.history.peek();
  }
  set history(h: HistoryAdapter | readonly StaticVersion[] | null) {
    this.core.setHostOptions({ history: h ?? null });
  }

  /** Opens or closes History (when there is a history): the version panel; `compare` opens on the newest change compared. */
  toggleHistory(on?: boolean, opts?: { compare?: boolean }): void {
    this.core.run('toggleHistory', on, opts);
  }

  /** The open History's session (the `<mmdx-diff>` methods), null while History is closed (§8.3). */
  get historySession(): HistorySession | null {
    return this.core.historySession.peek();
  }

  get readOnly(): boolean {
    return this.core.mode.peek() === 'view';
  }
  set readOnly(v: boolean) {
    this.core.setMode(v ? 'view' : 'edit');
  }

  setMode(m: Mode): void {
    this.core.setMode(m);
  }

  /** Undo; a gesture or transaction in flight is cancelled first. */
  undo(): void {
    this.core.undo();
  }

  redo(): void {
    this.core.redo();
  }

  /** Marks the current source (or `source`) as saved: `dirty` is false until the document changes again. */
  markSaved(source?: string): void {
    this.store.markSaved(source);
  }

  /** The host's picture upload (`EditorOptions.uploadImage`; null: images by URL only). */
  get uploadImage(): ((file: File) => Promise<{ url: string }>) | null {
    return this.core.uploadImage;
  }
  set uploadImage(f: ((file: File) => Promise<{ url: string }>) | null) {
    this.core.hostServices.uploadImage.set(typeof f === 'function' ? f : null);
  }

  /** The host's image store (`EditorOptions.images`; null: no library). */
  get images(): ImageStore | null {
    return this.core.images;
  }
  set images(s: ImageStore | null) {
    this.core.hostServices.images.set(s && typeof s.list === 'function' && typeof s.put === 'function' ? s : null);
  }

  /** The base name of exports (no extension). */
  get fileName(): string {
    return this.core.fileName;
  }
  set fileName(v: string) {
    this.core.uiState.fileName.set(v);
  }

  /** The id of the theme the diagram is shown in (the host's, the user's pick or the default; §7.5). */
  get theme(): string {
    return this.core.shownTheme();
  }

  /** Repaints the document and the panels (e.g. after a theme was edited elsewhere). */
  redraw(): void {
    this.core.afterChange();
  }

  select(items: ItemRef[]): void {
    this.core.select(items);
  }

  focusCode(line: number): void {
    this.core.run('gotoCodeLine', line);
  }

  exportAs(kind: 'mmdx' | 'mmd' | 'svg' | 'png'): Promise<void> {
    return this.core.run('exportAs', kind) ?? Promise.resolve();
  }

  fit(): void {
    this.core.viewport.setBounds(this.core.result.result.bounds, { fit: true });
  }

  /** Shows the diagram rendered by stock Mermaid (what YouTrack / GitHub show) in a dialog. */
  plainMermaid(): Promise<void> {
    return this.core.run('plainMermaid') ?? Promise.resolve();
  }

  get dirty(): boolean {
    return this.store.dirty.peek();
  }

  /** Saves through the adapter (§8.2 flow): `mmdx-save` (cancelable) → adapter.save → `mmdx-saved` or conflict dialog. */
  save(): Promise<SaveOutcome> {
    return this.sync.save();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ac.abort();
    this.owner.dispose();
  }

  /**
   * Resolves once the document is in: right away without an adapter, else when the adapter's latest load finished
   * (after `mmdx-load`), and once the editor code of its diagram type has loaded (types load on demand); rejects when
   * the adapter's load failed. A host that restores a draft waits for it, then calls
   * `setSource(draft, { history: 'push', markSaved: false })`.
   */
  whenLoaded(): Promise<void> {
    // and the editor code of the document's diagram type, which loads on demand
    return this.sync.loading.then(() => this.core.kindsReady()).then(() => this.core.modulesReady());
  }

  private addBaseShortcuts(): void {
    const core = this.core;
    core.shortcuts.add(
      // the document is never written while History is open
      { id: 'undo', keys: ['mod+z'], label: 'Undo', group: 'Edit', editOnly: true, when: { stage: ['document'] }, run: () => this.undo() },
      { id: 'redo', keys: ['mod+shift+z', 'mod+y'], label: 'Redo', group: 'Edit', editOnly: true, when: { stage: ['document'] }, run: () => this.redo() },
      { id: 'save', keys: ['mod+s'], label: 'Save', group: 'File', inText: true, when: { stage: ['document'] }, run: () => { void this.save(); } },
      { id: 'fit', keys: ['f'], label: 'Fit to view', group: 'View', run: () => this.fit() },
      { id: 'space-pan', keys: ['space'], label: 'Hold Space and drag to pan', group: 'View', hintOnly: true },
    );
  }

  /** The chrome scheme: `light`, `dark`, or `auto` (the remembered choice, else the page). */
  setUi(ui: 'light' | 'dark' | 'auto'): void {
    this.o.ui = ui;
    this.core.setUi(ui === 'auto' ? undefined : ui);
  }
}

