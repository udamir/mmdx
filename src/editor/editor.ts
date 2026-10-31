// <mmdx-editor> (§8.2, UC2): edit a diagram attached to a host page. The DiagramEditor class owns one EditorCore and
// its feature modules; the custom element is a thin wrapper around it.
import { EDITOR_MESSAGES } from '../ui/messages/editor.js';
import { registerMessages } from '../ui/i18n.js';
import type { HistoryAdapter, StaticVersion } from '../adapters/history.js';
import { TOOLBAR_MESSAGES } from '../ui/messages/toolbar.js';
import { ElementBase } from '../elements/base.js';
import type { DocumentAdapter } from '../adapters/documents.js';
import type { StorageAdapter } from '../adapters/storage.js';
import type { ThemeSource } from '../adapters/themes.js';
import { ensureBuiltinThemes } from '../config.js';
import type { CoreContext } from '../core/context.js';
import { h } from '../ui/h.js';
import { effect } from '../ui/signal.js';
import { DEFAULT_FEATURES, EditorCore, type EditorFeatures, type Gesture, type Mode } from './core.js';
import type { EditorModule } from './module.js';
import { DEFAULT_MODULES } from './modules/index.js';
import { DocStore, type ChangeReason } from './store.js';
import type { ItemRef } from '../core/types.js';

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
  /** Ask before leaving the page with unsaved changes (opt-in; SPAs handle this themselves). */
  guardUnload?: boolean;
  /** File name used for exports. */
  name?: string;
  ctx?: Partial<CoreContext>;
  modules?: readonly EditorModule[];
  /** The document's versions (a HistoryAdapter or a list with sources): shows the History button. */
  history?: HistoryAdapter | readonly StaticVersion[];
}

export type SaveOutcome = 'saved' | 'cancelled' | 'conflict' | 'failed' | 'no-adapter';

export class DiagramEditor {
  readonly core: EditorCore;
  readonly store: DocStore;
  private readonly shadow: ShadowRoot;
  private readonly o: EditorOptions;
  private readonly cleanups: (() => void)[] = [];
  private readonly ac = new AbortController();
  private version: string | undefined;
  private saving: Promise<SaveOutcome> | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private remoteBar: HTMLElement | null = null;
  private gesture: { g: Gesture; x: number; y: number; p0: { x: number; y: number }; moved: boolean; id: number } | null = null;
  private destroyed = false;
  name: string;

  constructor(private readonly host: HTMLElement, options: EditorOptions = {}) {
    registerMessages(EDITOR_MESSAGES);
    registerMessages(TOOLBAR_MESSAGES);
    this.o = { ...options };
    this.name = options.name ?? 'diagram';
    const features: EditorFeatures = { ...DEFAULT_FEATURES, ...(options.features ?? {}) };
    if (options.toolbar === 'none') features.styleToolbar = false;
    this.store = new DocStore({ onChange: (src, reason) => this.onStoreChange(src, reason) });
    this.core = new EditorCore(host, {
      store: this.store,
      features,
      ...(options.storage ? { storage: options.storage } : {}),
      ...(options.ctx ? { ctx: options.ctx } : {}),
      ...(options.themeSource ? { themeSource: options.themeSource } : {}),
      ...(options.ui && options.ui !== 'auto' ? { ui: options.ui } : {}),
      ...(options.theme ? { theme: options.theme } : {}),
      ...(options.themeDark ? { themeDark: options.themeDark } : {}),
    });
    this.shadow = this.core.shadow;
    const core = this.core;
    const root = core.root;
    this.cleanups.push(() => core.destroy());

    // panel visibility from storage, then options
    const savedPanels = core.storage.get<{ code?: boolean; properties?: boolean; layers?: boolean }>('panels') ?? {};
    core.panels.set({ code: true, properties: true, layers: true, ...savedPanels, ...(options.panels ?? {}) });
    this.cleanups.push(effect(() => {
      const p = core.panels();
      const m = core.mode();
      root.classList.toggle('no-code', !p.code || !features.codePanel || m === 'view');
      root.classList.toggle('no-right', m === 'view' ? !p.layers : !p.properties && !p.layers);
      root.classList.toggle('no-layers', !p.layers);
    }));
    this.cleanups.push(effect(() => {
      const m = core.mode();
      root.classList.toggle('mode-edit', m === 'edit');
      root.classList.toggle('mode-view', m === 'view');
    }));
    this.cleanups.push(effect(() => {
      const t = core.tool();
      for (const c of Array.from(root.classList)) if (c.startsWith('tool-')) root.classList.remove(c);
      root.classList.add(`tool-${t}`);
    }));

    this.wirePointer();
    this.wireKeys();
    this.addBaseShortcuts();

    core.useModules(options.modules ?? DEFAULT_MODULES);

    core.fileName = this.name;
    // built-in themes besides baseline load on demand; redraw when they (or a theme saved elsewhere) arrive
    this.cleanups.push(core.ctx.themes.onChange(() => {
      if (this.destroyed) return;
      core.draw();
      core.fire('theme');
    }));
    void ensureBuiltinThemes();
    if (options.readOnly) core.setMode('view');
    if (options.history) core.history.set(options.history);
    if (options.guardUnload) {
      const onBeforeUnload = (ev: BeforeUnloadEvent): void => {
        if (this.store.dirty.peek()) ev.preventDefault();
      };
      window.addEventListener('beforeunload', onBeforeUnload, { signal: this.ac.signal });
    }

    if (options.adapter) void this.loadFromAdapter();
    else this.setSource(options.value ?? '', { history: 'reset' });
  }

  // ---- public API (§8.2) ------------------------------------------------------------------------------------------

  getSource(): string {
    return this.store.source();
  }

  setSource(src: string, opts: { history?: 'reset' | 'push'; fit?: boolean; markSaved?: boolean } = {}): void {
    const before = this.store.model.peek().type;
    this.store.load(src, { history: opts.history ?? 'reset', reason: opts.history === 'push' ? 'remote' : 'load', markSaved: opts.markSaved !== false });
    if (opts.history !== 'push') {
      this.core.enteredGroup.set(null);
      this.core.pageSelected.set(false);
    }
    this.core.draw();
    if (opts.fit !== false || before !== this.store.model.peek().type) this.core.viewport.setBounds(this.core.result.result.bounds, { fit: true });
    this.core.fire('model');
    this.core.fire('panels');
  }

  get adapter(): DocumentAdapter | undefined {
    return this.o.adapter;
  }
  set adapter(a: DocumentAdapter | undefined) {
    if (a) this.o.adapter = a;
    else delete this.o.adapter;
    if (a) void this.loadFromAdapter();
  }

  /** The document's versions; null hides the History button. */
  get history(): HistoryAdapter | readonly StaticVersion[] | null {
    return this.core.history.peek();
  }
  set history(h: HistoryAdapter | readonly StaticVersion[] | null) {
    this.core.history.set(h ?? null);
  }

  /** Opens or closes the History view (when there is a history). */
  toggleHistory(on?: boolean): void {
    this.core.run('toggleHistory', on);
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

  undo(): void {
    this.store.undo();
    this.core.afterChange();
  }

  redo(): void {
    this.store.redo();
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
    this.ac.abort();
    for (const c of this.cleanups.reverse()) {
      try {
        c();
      } catch (e) {
        console.error('[mmdx] cleanup failed', e);
      }
    }
    this.cleanups.length = 0;
  }

  // ---- adapter ----------------------------------------------------------------------------------------------------

  private async loadFromAdapter(): Promise<void> {
    const a = this.o.adapter;
    if (!a) return;
    try {
      const r = await a.load();
      if (this.destroyed || this.o.adapter !== a) return;
      this.version = r.version;
      if (r.name) this.name = this.core.fileName = r.name.replace(/\.(mmdx|mmd|md|txt)$/i, '');
      this.setSource(r.source, { history: 'reset' });
      if (a.subscribe) {
        const off = a.subscribe((src, version) => this.onRemote(src, version));
        this.cleanups.push(off);
      }
    } catch (e) {
      this.core.toast(`Could not load the diagram: ${e instanceof Error ? e.message : String(e)}`, { error: true });
      this.core.emit('mmdx-error', { diagnostics: [{ severity: 'error', code: 'load.failed', message: String(e) }] });
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
      const pre = (t: string): HTMLElement => h('pre', { style: 'max-height:260px;overflow:auto;font:12px/1.5 var(--mmdx-mono);background:var(--mmdx-surface-2);padding:8px;border-radius:6px;margin:0' }, t);
      const c2 = await this.core.dialogs.choose<'mine' | 'theirs' | 'cancel'>({
        title: 'Compare versions',
        body: h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;min-width:0' }, h('div', null, h('b', null, 'Yours'), pre(mine)), h('div', null, h('b', null, 'Theirs'), pre(theirs.source))),
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

  /** Remote update (§8.2): applied when clean (undoable), otherwise a non-blocking bar offers Reload / Keep mine. */
  private onRemote(src: string, version: string): void {
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
    const bar = h('div', { class: 'mmdx-float', role: 'status', style: 'position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:40;display:flex;gap:8px;align-items:center;padding:6px 8px 6px 14px' },
      h('span', null, 'Changed by someone else'),
      h('button', { type: 'button', onclick: () => { this.version = version; this.setSource(src, { history: 'push', fit: false }); this.hideRemoteBar(); } }, 'Reload'),
      h('button', { type: 'button', class: 'primary', onclick: () => this.hideRemoteBar() }, 'Keep mine'));
    this.remoteBar = bar;
    this.core.dom.root.append(bar);
  }

  private hideRemoteBar(): void {
    this.remoteBar?.remove();
    this.remoteBar = null;
  }

  private onStoreChange(source: string, reason: ChangeReason): void {
    this.core.emit('mmdx-change', { source, reason });
    this.core.emit('mmdx-dirty', { dirty: this.store.dirty.peek() });
    if (this.o.autosave && this.o.adapter && reason !== 'load' && reason !== 'remote' && this.store.dirty.peek()) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = setTimeout(() => void this.save(), this.o.autosave);
    }
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
      this.gesture = { g, x: ev.clientX, y: ev.clientY, p0: hit.p, moved: false, id: ev.pointerId };
    }, sig);
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
      const p = core.toDiagram(ev);
      d.g.move(p.x - d.p0.x, p.y - d.p0.y, ev);
    }, sig);
    const finish = (ev: PointerEvent, cancelled: boolean): void => {
      const d = this.gesture;
      if (!d || d.id !== ev.pointerId) return;
      this.gesture = null;
      core.dragging = false;
      core.dom.root.classList.remove('dragging');
      if (cancelled) d.g.cancel?.();
      else if (d.moved) d.g.end?.(ev);
      else {
        d.g.cancel?.();
        d.g.click?.(ev);
      }
      core.drawOverlay();
    };
    svg.addEventListener('pointerup', (ev) => finish(ev, false), sig);
    svg.addEventListener('pointercancel', (ev) => finish(ev, true), sig);
    svg.addEventListener('lostpointercapture', (ev) => {
      if (this.gesture?.id === ev.pointerId && this.gesture.moved) finish(ev, true);
    }, sig);
    // Esc during a gesture cancels it (one level of the Esc chain, A.11)
    core.dom.root.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !this.gesture) return;
      const g = this.gesture.g;
      this.gesture = null;
      core.dragging = false;
      core.dom.root.classList.remove('dragging');
      g.cancel?.();
      core.drawOverlay();
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
      { id: 'undo', keys: ['mod+z'], label: 'Undo', group: 'Edit', editOnly: true, run: () => this.undo() },
      { id: 'redo', keys: ['mod+shift+z', 'mod+y'], label: 'Redo', group: 'Edit', editOnly: true, run: () => this.redo() },
      { id: 'save', keys: ['mod+s'], label: 'Save', group: 'File', inText: true, run: () => { void this.save(); } },
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

const isTyping = (ev: KeyboardEvent): boolean => {
  const t = ev.composedPath()[0] as HTMLElement | undefined;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

// ---- custom element ------------------------------------------------------------------------------------------------

export class MmdxEditorElement extends ElementBase {
  static observedAttributes = ['read-only', 'ui', 'autosave', 'name'];
  private editor: DiagramEditor | null = null;
  private pending: EditorOptions = {};

  connectedCallback(): void {
    const o: EditorOptions = { ...this.pending };
    if (this.hasAttribute('read-only')) o.readOnly = this.getAttribute('read-only') !== 'false';
    const ui = this.getAttribute('ui');
    if (ui === 'light' || ui === 'dark' || ui === 'auto') o.ui = ui;
    const as = this.getAttribute('autosave');
    if (as !== null && as !== 'false') o.autosave = Number(as) || 1500;
    if (this.hasAttribute('guard-unload')) o.guardUnload = true;
    const name = this.getAttribute('name');
    if (name) o.name = name;
    if (o.value === undefined && !o.adapter) {
      const script = this.querySelector(':scope > script[type="text/mermaid"]');
      if (script?.textContent) o.value = script.textContent.replace(/^\s*\n/, '');
    }
    this.editor = new DiagramEditor(this, o);
  }

  disconnectedCallback(): void {
    this.editor?.destroy();
    this.editor = null;
  }

  attributeChangedCallback(name: string, _old: string | null, v: string | null): void {
    const e = this.editor;
    if (!e) return;
    if (name === 'read-only') e.readOnly = v !== null && v !== 'false';
    else if (name === 'ui' && (v === 'light' || v === 'dark' || v === 'auto')) e.setUi(v);
    else if (name === 'name' && v) e.name = e.core.fileName = v;
  }

  private opt<K extends keyof EditorOptions>(k: K, v: EditorOptions[K]): void {
    if (v === undefined) delete this.pending[k];
    else this.pending[k] = v;
  }

  get value(): string {
    return this.editor?.getSource() ?? this.pending.value ?? '';
  }
  set value(v: string) {
    if (this.editor) this.editor.setSource(v);
    else this.opt('value', v);
  }
  get adapter(): DocumentAdapter | undefined {
    return this.editor?.adapter ?? this.pending.adapter;
  }
  set adapter(a: DocumentAdapter | undefined) {
    if (this.editor) this.editor.adapter = a;
    else this.opt('adapter', a);
  }
  get readOnly(): boolean {
    return this.editor?.readOnly ?? !!this.pending.readOnly;
  }
  set readOnly(v: boolean) {
    if (this.editor) this.editor.readOnly = v;
    else this.opt('readOnly', v);
  }
  set features(f: Partial<EditorFeatures>) {
    this.opt('features', f);
  }
  get history(): HistoryAdapter | readonly StaticVersion[] | null {
    return this.editor?.history ?? this.pending.history ?? null;
  }
  set history(h: HistoryAdapter | readonly StaticVersion[] | null) {
    if (this.editor) this.editor.history = h;
    else this.opt('history', h ?? undefined);
  }
  set panels(p: EditorOptions['panels']) {
    this.opt('panels', p);
  }
  set storage(s: StorageAdapter) {
    this.opt('storage', s);
  }
  set themeSource(s: ThemeSource) {
    this.opt('themeSource', s);
  }
  set modules(m: readonly EditorModule[]) {
    this.opt('modules', m);
  }

  getSource(): string {
    return this.value;
  }
  setSource(src: string, opts?: { history?: 'reset' | 'push' }): void {
    if (this.editor) this.editor.setSource(src, opts);
    else this.opt('value', src);
  }
  save(): Promise<SaveOutcome> {
    return this.editor?.save() ?? Promise.resolve('no-adapter');
  }
  undo(): void {
    this.editor?.undo();
  }
  redo(): void {
    this.editor?.redo();
  }
  select(items: ItemRef[]): void {
    this.editor?.select(items);
  }
  focusCode(line: number): void {
    this.editor?.focusCode(line);
  }
  exportAs(kind: 'mmdx' | 'mmd' | 'svg' | 'png'): Promise<void> {
    return this.editor?.exportAs(kind) ?? Promise.resolve();
  }
  fit(): void {
    this.editor?.fit();
  }
  plainMermaid(): Promise<void> {
    return this.editor?.plainMermaid() ?? Promise.resolve();
  }
  /** Opens or closes the History view (when the editor has a `history`). */
  toggleHistory(on?: boolean): void {
    this.editor?.toggleHistory(on);
  }
  get dirty(): boolean {
    return this.editor?.dirty ?? false;
  }
  /** The underlying editor (advanced use; undefined while disconnected). */
  get instance(): DiagramEditor | undefined {
    return this.editor ?? undefined;
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
