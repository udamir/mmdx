// <mmdx-editor> (§8.2, UC2): edit a diagram attached to a host page. The DiagramEditor class owns one EditorCore and
// its feature modules; the custom element is a thin wrapper around it.
import { EDITOR_MESSAGES } from './messages.js';
import { Owner } from '../reactive/owner.js';
import { registerMessages } from '../i18n.js';
import { isTextTarget } from '../ui/kit/keys.js';
import type { StaticVersion } from '../adapters/history.js';
import type { HistoryAdapter, ImageStore, DocumentAdapter, StorageAdapter, ThemeSource } from '../ports.js';
import type { WheelMode } from '../dom/viewport.js';
import { TOOLBAR_MESSAGES } from '../ui/messages/toolbar.js';
import { ensureBuiltinThemes } from '../platform/themes.js';
import type { CoreContext } from '../core/context.js';
import type { IconPack } from '../core/icons/types.js';
import { h } from '../ui/kit/h.js';
import { effect, untracked } from '../reactive/signal.js';
import { DEFAULT_FEATURES, EditorCore, type EditorFeatures, type Gesture, type Mode } from './core.js';
import type { EditorModule } from './module.js';
import { DEFAULT_MODULES } from './modules/index.js';
import { DocStore, type ChangeReason } from './store.js';
import type { ItemRef } from '../core/types.js';
import type { HistorySession } from '../view/history.js';
import type { BlockHandle } from '../ui/blocks/block.js';
import type { PillProps } from '../ui/blocks/pill.js';

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

export type SaveOutcome = 'saved' | 'cancelled' | 'conflict' | 'failed' | 'no-adapter';

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
  private version: string | undefined;
  private saving: Promise<SaveOutcome> | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  /** The remote-change pill (top centre), and the count of the bars asked for (the pill block loads on first use). */
  private remoteBar: BlockHandle<PillProps> | null = null;
  private remoteAsked = 0;
  /** The adapter's subscription to remote changes (one at a time; replaced when the adapter changes). */
  private unsubscribe: (() => void) | null = null;
  /** The latest remote update that arrived during a gesture or a transaction; applied when it ends. */
  private pendingRemote: { src: string; version: string } | null = null;
  private gesture: { g: Gesture; x: number; y: number; p0: { x: number; y: number }; moved: boolean; id: number; last: { x: number; y: number } } | null = null;
  private destroyed = false;
  /** The adapter's latest load (resolved without an adapter). */
  private loading: Promise<void> = Promise.resolve();
  /** The document's name (exports, the studio's title): the core's file name, so it follows every open (B35). */
  get name(): string {
    return this.core.fileName;
  }
  set name(v: string) {
    this.core.fileName = v;
  }

  constructor(host: HTMLElement, options: EditorOptions = {}) {
    registerMessages(EDITOR_MESSAGES);
    registerMessages(TOOLBAR_MESSAGES);
    this.o = { ...options };
    const name = options.name ?? 'diagram';
    const features: EditorFeatures = { ...DEFAULT_FEATURES, ...(options.features ?? {}) };
    if (options.toolbar === 'none') features.styleToolbar = false;
    this.store = new DocStore({
      onChange: (src, reason) => this.onStoreChange(src, reason),
      // a remote update waits for the transaction to end (after the caller of commit / rollback is done)
      onIdle: () => queueMicrotask(() => this.applyPendingRemote()),
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
    this.core.uploadImage = options.uploadImage ?? null;
    this.core.images = options.images ?? null;
    const core = this.core;
    const root = core.root;
    this.owner.add(() => core.destroy());

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
    // the remote-change bar waits while History is open
    this.owner.add(effect(() => {
      const history = core.stage() === 'history';
      if (this.remoteBar) this.remoteBar.el.hidden = history;
    }));
    this.owner.add(effect(() => {
      const t = core.tool();
      for (const c of Array.from(root.classList)) if (c.startsWith('tool-')) root.classList.remove(c);
      root.classList.add(`tool-${t}`);
    }));

    this.wirePointer();
    this.wireKeys();
    this.addBaseShortcuts();

    // what History needs from the document (component architecture §8.2)
    core.provide('documentSource', () => this.store.source());
    core.provide('documentName', () => core.fileName || 'diagram');
    core.historyHost = {
      setClipboard: (data) => void (core.clipboard = data as typeof core.clipboard),
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

    core.fileName = name;
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

    if (options.adapter) this.startLoad();
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
    return this.o.adapter;
  }
  set adapter(a: DocumentAdapter | undefined) {
    if (a === this.o.adapter) return;
    // the old adapter stops reporting remote changes, and what it reported is dropped
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pendingRemote = null;
    this.hideRemoteBar();
    this.version = undefined;
    if (a) this.o.adapter = a;
    else delete this.o.adapter;
    if (a) this.startLoad();
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
    this.core.uploadImage = typeof f === 'function' ? f : null;
  }

  /** The host's image store (`EditorOptions.images`; null: no library). */
  get images(): ImageStore | null {
    return this.core.images;
  }
  set images(s: ImageStore | null) {
    this.core.images = s && typeof s.list === 'function' && typeof s.put === 'function' ? s : null;
  }

  /** The base name of exports (no extension). */
  get fileName(): string {
    return this.core.fileName;
  }
  set fileName(v: string) {
    this.core.fileName = v;
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
    if (this.saving) return this.saving;
    this.saving = this.doSave().finally(() => {
      this.saving = null;
    });
    return this.saving;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this.autosaveTimer);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pendingRemote = null;
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
    return this.loading.then(() => this.core.kindsReady());
  }

  // ---- adapter ----------------------------------------------------------------------------------------------------

  private startLoad(): void {
    const p = this.loadFromAdapter();
    // a failed load is reported (toast, mmdx-error); whenLoaded() rejects for whoever waits
    p.catch(() => undefined);
    this.loading = p;
  }

  private async loadFromAdapter(): Promise<void> {
    const a = this.o.adapter;
    if (!a) return;
    try {
      const r = await a.load();
      if (this.destroyed || this.o.adapter !== a) return;
      this.version = r.version;
      if (r.name) this.core.fileName = r.name.replace(/\.(mmdx|mmd|md|txt)$/i, '');
      this.setSource(r.source, { history: 'reset' });
      this.unsubscribe?.();
      this.unsubscribe = a.subscribe?.((src, version) => {
        if (!this.destroyed && this.o.adapter === a) this.onRemote(src, version);
      }) ?? null;
      this.core.emit('mmdx-load', { source: r.source, version: r.version ?? null });
    } catch (e) {
      if (this.destroyed || this.o.adapter !== a) return;
      this.core.toast(`Could not load the diagram: ${e instanceof Error ? e.message : String(e)}`, { error: true });
      this.core.emit('mmdx-error', { diagnostics: [{ severity: 'error', code: 'load.failed', message: String(e) }] });
      throw e;
    }
  }

  private async doSave(): Promise<SaveOutcome> {
    const source = this.getSource();
    if (!this.core.emit('mmdx-save', { source }, true)) return 'cancelled';
    const a = this.o.adapter;
    if (!a) return 'no-adapter';
    try {
      const ctx: { version?: string } = {};
      if (this.version !== undefined) ctx.version = this.version;
      const res = await a.save(source, ctx);
      if ('conflict' in res) return this.resolveConflict(source, res.conflict);
      this.version = res.version ?? this.version;
      this.store.markSaved(source);
      this.hideRemoteBar();
      this.core.emit('mmdx-saved', { source, version: this.version });
      return 'saved';
    } catch (e) {
      this.core.toast(`Save failed: ${e instanceof Error ? e.message : String(e)}`, { error: true });
      this.core.emit('mmdx-error', { diagnostics: [{ severity: 'error', code: 'save.failed', message: String(e) }] });
      return 'failed';
    }
  }

  private async resolveConflict(mine: string, theirs: { source: string; version: string }): Promise<SaveOutcome> {
    this.core.emit('mmdx-conflict', { mine, theirs: theirs.source, version: theirs.version });
    const choice = await this.core.dialogs.choose<'mine' | 'theirs' | 'both' | 'cancel'>({
      title: 'Someone else saved this diagram',
      message: 'The diagram was changed since you opened it. Keep your version (overwrites theirs), take theirs (drops your changes), or open both to compare.',
      cancel: 'cancel',
      buttons: [
        { label: 'View both', value: 'both' },
        { label: 'Take theirs', value: 'theirs', danger: true },
        { label: 'Keep mine', value: 'mine', primary: true },
      ],
    });
    if (choice === 'mine') {
      this.version = theirs.version;
      return this.doSave();
    }
    if (choice === 'theirs') {
      this.version = theirs.version;
      this.setSource(theirs.source, { history: 'push', fit: false });
      return 'conflict';
    }
    if (choice === 'both') {
      const side = (title: string, text: string): HTMLElement => h('div', null, h('b', null, title), h('pre', null, text));
      const c2 = await this.core.dialogs.choose<'mine' | 'theirs' | 'cancel'>({
        title: 'Compare versions',
        class: 'compare',
        body: h('div', { class: 'compare-sides' }, side('Yours', mine), side('Theirs', theirs.source)),
        cancel: 'cancel',
        buttons: [{ label: 'Take theirs', value: 'theirs' }, { label: 'Keep mine', value: 'mine', primary: true }],
      });
      if (c2 === 'mine') {
        this.version = theirs.version;
        return this.doSave();
      }
      if (c2 === 'theirs') {
        this.version = theirs.version;
        this.setSource(theirs.source, { history: 'push', fit: false });
      }
    }
    return 'conflict';
  }

  /** A gesture is running or a transaction is open: the store holds an uncommitted state. */
  private get busy(): boolean {
    return !!this.gesture || this.store.inTransaction;
  }

  private applyPendingRemote(): void {
    const r = this.pendingRemote;
    if (!r || this.busy || this.destroyed) return;
    this.pendingRemote = null;
    this.onRemote(r.src, r.version);
  }

  /**
   * Remote update (§8.2): applied when clean (undoable), otherwise a non-blocking bar offers Reload / Keep mine. During
   * a gesture or a transaction it waits (the latest one wins) and is handled when the edit ends — committed (the
   * document is then dirty: the bar) or rolled back (clean again: applied).
   */
  private onRemote(src: string, version: string): void {
    if (this.busy) {
      this.pendingRemote = { src, version };
      return;
    }
    if (src === this.getSource()) {
      this.version = version;
      return;
    }
    if (!this.store.dirty.peek()) {
      this.version = version;
      this.setSource(src, { history: 'push', fit: false });
      return;
    }
    this.hideRemoteBar();
    // a pill at the top centre (the block loads the first time); the latest bar asked for wins
    const asked = ++this.remoteAsked;
    const reload = (): void => {
      this.version = version;
      this.setSource(src, { history: 'push', fit: false });
      this.hideRemoteBar();
    };
    void import('../ui/blocks/pill.js').then((m) => {
      if (this.destroyed || asked !== this.remoteAsked) return;
      this.core.addCss([m.PILL_CSS]);
      const bar = m.createPill({
        text: 'Changed by someone else', label: 'Remote change', class: 'remote', t: this.core.i18n.t,
        tools: [{ id: 'reload', label: 'Reload', onClick: reload }], action: { label: 'Keep mine', plain: true, onClick: () => this.hideRemoteBar() },
      });
      bar.el.hidden = this.core.stage.peek() === 'history';
      this.remoteBar = bar;
      this.core.slots['top-center'].append(bar.el);
    });
  }

  private hideRemoteBar(): void {
    this.remoteAsked++;
    this.remoteBar?.destroy();
    this.remoteBar = null;
  }

  private onStoreChange(source: string, reason: ChangeReason): void {
    this.core.fire('document');
    this.core.emit('mmdx-change', { source, reason });
    this.core.emit('mmdx-dirty', { dirty: this.store.dirty.peek() });
    if (this.o.autosave && this.o.adapter && reason !== 'load' && reason !== 'remote' && this.store.dirty.peek()) {
      this.scheduleAutosave();
    }
  }

  /** Debounced save; while a gesture or transaction is open it waits (the source would be uncommitted). */
  private scheduleAutosave(): void {
    clearTimeout(this.autosaveTimer);
    if (!this.o.autosave) return;
    this.autosaveTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (this.busy) this.scheduleAutosave();
      else void this.save();
    }, this.o.autosave);
  }

  // ---- input ------------------------------------------------------------------------------------------------------

  private wirePointer(): void {
    const core = this.core;
    const svg = core.dom.svg;
    const sig = { signal: this.ac.signal };
    svg.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 && ev.button !== 1) return;
      core.dom.root.focus({ preventScroll: true });
      const panning = core.mode.peek() !== 'edit' || core.tool.peek() === 'hand' || core.spaceDown || ev.button === 1;
      if (panning && !(ev.target as Element).closest('[data-handle]')) {
        ev.preventDefault();
        core.viewport.startPan(ev);
        return;
      }
      const hit = core.hitTest(ev);
      const g = core.startGesture(ev, hit);
      if (!g) {
        ev.preventDefault();
        core.viewport.startPan(ev);
        return;
      }
      ev.preventDefault();
      try {
        svg.setPointerCapture(ev.pointerId);
      } catch {
        // capture is best-effort
      }
      this.gesture = { g, x: ev.clientX, y: ev.clientY, p0: hit.p, moved: false, id: ev.pointerId, last: { x: ev.clientX, y: ev.clientY } };
    }, sig);
    // A drag previews once per animation frame (P1): each move renders the whole diagram, so the moves of one frame
    // are coalesced to the last one; the release applies it first, a cancel drops it. Gestures compute from the
    // pointer's offset since the press, never from the frame they are drawn in.
    let frame = 0;
    let pendingMove: { dx: number; dy: number; ev: PointerEvent } | null = null;
    const flushMove = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      const m = pendingMove;
      pendingMove = null;
      if (m && this.gesture) this.gesture.g.move(m.dx, m.dy, m.ev);
    };
    const dropMove = (): void => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pendingMove = null;
    };
    this.owner.add(dropMove);
    core.flushPreview = flushMove;
    svg.addEventListener('pointermove', (ev) => {
      core.pointer = { clientX: ev.clientX, clientY: ev.clientY };
      const d = this.gesture;
      if (!d || d.id !== ev.pointerId) return;
      if (!d.moved && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < (d.g.threshold ?? 3)) return;
      if (!d.moved) {
        d.moved = true;
        core.dragging = true;
        core.dom.root.classList.add('dragging');
      }
      d.last = { x: ev.clientX, y: ev.clientY };
      const p = core.toDiagram(ev);
      pendingMove = { dx: p.x - d.p0.x, dy: p.y - d.p0.y, ev };
      if (!frame) frame = requestAnimationFrame(flushMove);
    }, sig);
    // Whether each of the last two presses dragged: the browser counts a drag towards a double-click too (a quick press
    // and a drag, or two quick drags), and that double-click must not edit the text or enter the group of what moved.
    let dragged: [boolean, boolean] = [false, false];
    const finish = (ev: PointerEvent, cancelled: boolean): void => {
      const d = this.gesture;
      if (!d || d.id !== ev.pointerId) return;
      if (cancelled) dropMove();
      else flushMove();
      this.gesture = null;
      core.dragging = false;
      core.dom.root.classList.remove('dragging');
      dragged = [dragged[1], d.moved];
      if (cancelled) d.g.cancel?.();
      else if (d.moved) {
        // a quick release can come before the pointer's last move was delivered: the item ends where it was let go
        if (ev.clientX !== d.last.x || ev.clientY !== d.last.y) {
          const p = core.toDiagram(ev);
          d.g.move(p.x - d.p0.x, p.y - d.p0.y, ev);
        }
        d.g.end?.(ev);
      } else {
        d.g.cancel?.();
        d.g.click?.(ev);
      }
      core.drawOverlay();
      this.applyPendingRemote();
    };
    /** Cancels the running gesture (Esc, undo, a load, a stage or mode switch); true when there was one. */
    const cancel = (): boolean => {
      const d = this.gesture;
      if (!d) return false;
      dropMove();
      this.gesture = null;
      core.dragging = false;
      core.dom.root.classList.remove('dragging');
      d.g.cancel?.();
      core.drawOverlay();
      return true;
    };
    core.cancelPointer = () => void cancel();
    this.owner.add(() => (core.cancelPointer = null));
    svg.addEventListener('pointerup', (ev) => finish(ev, false), sig);
    svg.addEventListener('pointercancel', (ev) => finish(ev, true), sig);
    svg.addEventListener('lostpointercapture', (ev) => {
      if (this.gesture?.id === ev.pointerId && this.gesture.moved) finish(ev, true);
    }, sig);
    svg.addEventListener('dblclick', (ev) => {
      if (!dragged[0] && !dragged[1]) return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
    }, { capture: true, signal: this.ac.signal });
    // Esc during a gesture cancels it (one level of the Esc chain, A.11)
    core.dom.root.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !cancel()) return;
      this.applyPendingRemote();
      ev.stopPropagation();
      ev.preventDefault();
    }, { capture: true, signal: this.ac.signal });
  }

  private wireKeys(): void {
    const core = this.core;
    const root = core.dom.root;
    const sig = { signal: this.ac.signal };
    root.addEventListener('keydown', (ev) => {
      if (ev.key === ' ' && !ev.repeat && core.mode.peek() === 'edit' && !isTyping(ev)) {
        core.spaceDown = true;
        root.classList.add('space-pan');
      }
    }, sig);
    root.addEventListener('keyup', (ev) => {
      if (ev.key === ' ') {
        core.spaceDown = false;
        root.classList.remove('space-pan');
      }
    }, sig);
    root.addEventListener('focusout', () => {
      core.spaceDown = false;
      root.classList.remove('space-pan');
    }, sig);
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

// a text field, a select or editable text takes the key (B31: Space in a <select> armed space-pan)
const isTyping = (ev: KeyboardEvent): boolean => isTextTarget(ev.composedPath()[0] ?? ev.target);
