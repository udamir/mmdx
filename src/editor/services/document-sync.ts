// DocumentSync (5.3): the editor's document and its adapter (§8.2) — loading it, saving it (`mmdx-save`, the
// adapter's version, conflicts resolved in a dialog), remote updates (applied when clean, else the Reload / Keep mine
// bar; one arriving during an edit waits for it to end) and autosave. Split out of DiagramEditor, which keeps the
// public API and delegates.
import { h } from '../../ui/kit/h.js';
import type { BlockHandle } from '../../ui/blocks/block.js';
import type { PillProps } from '../../ui/blocks/pill.js';
import type { DocumentAdapter } from '../../ports.js';
import type { EditorCore } from '../core.js';
import type { ChangeReason, DocStore } from '../store.js';

export type SaveOutcome = 'saved' | 'cancelled' | 'conflict' | 'failed' | 'no-adapter';

export interface DocumentSyncHost {
  core: EditorCore;
  /** Replaces the document (DiagramEditor.setSource). */
  setSource(src: string, opts: { history: 'reset' | 'push'; fit?: boolean }): void;
  /** Autosave delay in ms after a change (0 / undefined: off). */
  autosave?: number | false | undefined;
  /** The editor's owner (the sync's effects end with it). */
  owner: { effect(f: () => unknown): void };
}

export class DocumentSync {
  adapter: DocumentAdapter | undefined;
  private readonly core: EditorCore;
  private readonly store: DocStore;
  private readonly autosave: number | false | undefined;
  /** The adapter's version of the document (sent with a save, for conflicts). */
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
  private destroyed = false;
  /** The adapter's latest load (resolved without an adapter). */
  loading: Promise<void> = Promise.resolve();

  constructor(private readonly host: DocumentSyncHost, adapter: DocumentAdapter | undefined) {
    this.core = host.core;
    this.store = host.core.store;
    this.autosave = host.autosave;
    this.adapter = adapter;
    // the remote-change bar waits while History is open
    host.owner.effect(() => {
      const history = this.core.stage() === 'history';
      if (this.remoteBar) this.remoteBar.el.hidden = history;
    });
  }

  /** Changes the adapter: the old one stops reporting remote changes, what it reported is dropped, the new one loads. */
  setAdapter(a: DocumentAdapter | undefined): void {
    if (a === this.adapter) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pendingRemote = null;
    this.hideRemoteBar();
    this.version = undefined;
    this.adapter = a;
    if (a) this.startLoad();
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
  }

  startLoad(): void {
    const p = this.loadFromAdapter();
    // a failed load is reported (toast, mmdx-error); whenLoaded() rejects for whoever waits
    p.catch(() => undefined);
    this.loading = p;
  }

  private async loadFromAdapter(): Promise<void> {
    const a = this.adapter;
    if (!a) return;
    try {
      const r = await a.load();
      if (this.destroyed || this.adapter !== a) return;
      this.version = r.version;
      if (r.name) this.core.uiState.fileName.set(r.name.replace(/\.(mmdx|mmd|md|txt)$/i, ''));
      this.host.setSource(r.source, { history: 'reset' });
      this.unsubscribe?.();
      this.unsubscribe = a.subscribe?.((src, version) => {
        if (!this.destroyed && this.adapter === a) this.onRemote(src, version);
      }) ?? null;
      this.core.emit('mmdx-load', { source: r.source, version: r.version ?? null });
    } catch (e) {
      if (this.destroyed || this.adapter !== a) return;
      this.core.toast(`Could not load the diagram: ${e instanceof Error ? e.message : String(e)}`, { error: true });
      this.core.emit('mmdx-error', { diagnostics: [{ severity: 'error', code: 'load.failed', message: String(e) }] });
      throw e;
    }
  }

  private async doSave(): Promise<SaveOutcome> {
    const source = this.store.source();
    if (!this.core.emit('mmdx-save', { source }, true)) return 'cancelled';
    const a = this.adapter;
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
      this.host.setSource(theirs.source, { history: 'push', fit: false });
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
        this.host.setSource(theirs.source, { history: 'push', fit: false });
      }
    }
    return 'conflict';
  }

  /** A gesture is running or a transaction is open: the store holds an uncommitted state. */
  private get busy(): boolean {
    return this.core.input.active || this.store.inTransaction;
  }

  /** Applies the remote update that waited for the edit in flight (when it ended). */
  applyPendingRemote(): void {
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
    if (src === this.store.source()) {
      this.version = version;
      return;
    }
    if (!this.store.dirty.peek()) {
      this.version = version;
      this.host.setSource(src, { history: 'push', fit: false });
      return;
    }
    this.hideRemoteBar();
    // a pill at the top centre (the block loads the first time); the latest bar asked for wins
    const asked = ++this.remoteAsked;
    const reload = (): void => {
      this.version = version;
      this.host.setSource(src, { history: 'push', fit: false });
      this.hideRemoteBar();
    };
    void import('../../ui/blocks/pill.js').then((m) => {
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

  /** The store changed: the events, and an autosave when the user changed the document. */
  onStoreChange(source: string, reason: ChangeReason): void {
    this.core.fire('document');
    this.core.emit('mmdx-change', { source, reason });
    this.core.emit('mmdx-dirty', { dirty: this.store.dirty.peek() });
    if (this.autosave && this.adapter && reason !== 'load' && reason !== 'remote' && this.store.dirty.peek()) {
      this.scheduleAutosave();
    }
  }

  /** Debounced save; while a gesture or transaction is open it waits (the source would be uncommitted). */
  private scheduleAutosave(): void {
    clearTimeout(this.autosaveTimer);
    if (!this.autosave) return;
    this.autosaveTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (this.busy) this.scheduleAutosave();
      else void this.save();
    }, this.autosave);
  }
}
