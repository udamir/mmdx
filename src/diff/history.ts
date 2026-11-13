// History in place (component architecture §8.2, §8.3) in the viewer and the editor. Opening it shows the version
// panel (History and Compare tabs) in the host's own panels, nothing picked: the document stays as it is (editable in
// the editor). What a pick shows:
// - a version on the History tab: read-only in the host's own scene, drawn as the document is (the `version` stage:
//   the editor's select, Copy, Code and Layers; nothing writes), or a viewer's DiffScene (History mode);
// - a version on the Compare tab: compared with the working copy (the top row), in a DiffScene over the host's canvas
//   (the `history` stage: the diff bar, the code diff, Changes open, the exports).
// Switching tabs shows nothing new. Restore (Edit mode) is in each version's "⋯" menu; the Back pill (top centre) and
// Esc go back to the document (the panel stays open). Closing the panel hides it: what is shown stays (the History
// button brings the panel back); with nothing older shown, or on Back without the panel, History is left. The working
// copy follows the document.
// Session events reach the host as `mmdx-history-*`. Loaded on first use: the viewer and the editor bundles never
// contain the diff. One HistoryStage per open History; the kernel's `enterStage` / `leaveStage` push and pop the
// comparison's scene and put the tool aside (A13d). What is shown is the session's one `shown` model (decision
// 2026-11-12: also the version the editor shows in its own scene), the version panel's tab is the module set's, and
// what History needs of its host (its scene, its panel stacks, its panels under other ids) is the host's HistoryHost.
import { sessionHost } from './session-host.js';
import type { ItemKind } from '../core/types.js';
import type { Rendered } from '../core/pipeline-core.js';
import { transitionFrom, type MorphState } from '../dom/morph.js';
import { reducedMotion } from '../dom/motion.js';
import { registerMessages } from '../i18n.js';
import { Owner } from '../reactive/owner.js';
import { computed, effect, untracked, type ReadSignal, type Signal } from '../reactive/signal.js';
import { PILL_CSS } from '../ui/blocks/pill.js';
import type { MenuEntry } from '../ui/blocks/menu.js';
import type { ViewCore } from '../view/core.js';
import type { HistoryHost, HistorySession } from '../view/history.js';
import type { ViewModule } from '../view/module.js';
import * as sidePanels from '../view/modules/side-panels.js';
import { historyPillModule } from './history-pill.js';
import { DIFF_MESSAGES } from './messages.js';
import { diffModuleSet } from './modules/index.js';
import * as panels from './modules/panels.js';
import type { VersionControls } from './modules/panels.js';
import { DiffScene, sceneHost } from './scene.js';
import { DiffSession, type DiffMode } from './session.js';
import type { Shown } from './shown.js';
import { DIFF_CSS, DIFF_TOKENS } from './styles.js';
import { WORKING_COPY, withWorkingCopy } from './working-copy.js';

export { HISTORY_PILL_CSS, I_SWAP } from './history-pill.js';
export { WORKING_COPY, type HistorySource, type WorkingCopyAdapter } from './working-copy.js';

const EN: Record<string, string> = {
  'history.working': 'Working copy (not saved as a version)',
  'history.workingShort': 'Working copy',
  'history.back': 'Back to the current version',
  'history.swap': 'Swap Before and After',
  'history.label': 'History',
  'history.pill': 'History · {what}',
  'history.restore': 'Restore this version',
  'history.restoreId': 'Restore {id}',
  'history.restoreTip': 'Open the shown version in the editor (undo brings the current diagram back)',
  'history.restored': 'Restored {id} — undo brings the previous diagram back',
  'history.copied': 'Copied {label} from {id}',
  'history.copyNothing': 'Select an item on Before or After to copy it',
  'history.copyHelp': 'Copy the selected item of this version (paste it after Back)',
};

/** Session events reach the host under their History names. */
const EVENTS = new Set(['mmdx-compare', 'mmdx-version', 'mmdx-select', 'mmdx-view', 'mmdx-filters', 'mmdx-export', 'mmdx-error']);

export interface HistoryController {
  close(): void;
  /** Compares the newest change (the studio's Diff): the working copy or the newest version with the one before. */
  compareNewest(): void;
}

/** Opens History on a host (the viewer or the editor): the version panel, nothing picked unless `compare`. */
export function openHistory(core: ViewCore, o: { onClose(): void; compare?: boolean }): HistoryController {
  const stage = new HistoryStage(core, o.onClose);
  stage.open(!!o.compare);
  return { close: () => stage.close(), compareNewest: () => stage.compareNewest() };
}

/**
 * History on one host, from open to close: the session it shows, what is picked, the switches between the document,
 * a version and a comparison (each animated, in place), Restore and Copy, and the modules it adds.
 */
class HistoryStage {
  private readonly t: ViewCore['i18n']['t'];
  /** What the product offers History: its version scene, Restore and clipboard (the editor), its panel stacks. */
  private readonly host: HistoryHost | null;
  /** The host shows a version in its own scene (the editor); otherwise History's DiffScene does. */
  private readonly ownScene: boolean;
  /** What is shown (nothing picked: the document; a version as it is; a comparison): the session's one model. */
  private readonly session: DiffSession;
  private readonly scene: DiffScene;
  /** The version panel's tab (the module set's state). */
  private tab: Signal<DiffMode> | null = null;
  private closed = false;
  /** Bumped by every pick: a version that loads after a newer pick is not shown. */
  private seq = 0;
  /** The DiffScene is over the host's canvas (the kernel's `enterStage`). */
  private inDiff = false;
  /** The running morph between two pictures of the host's scene. */
  private morph: { finish(): void } | null = null;
  private readonly owner = new Owner('history');
  private loaded: Promise<void> = Promise.resolve();
  private removeModules: () => void = () => {};

  constructor(private readonly core: ViewCore, private readonly onClose: () => void) {
    registerMessages(DIFF_MESSAGES);
    registerMessages(EN);
    this.t = core.i18n.t;
    this.host = core.historyHost;
    this.ownScene = !!this.host?.showVersion;
    this.session = new DiffSession({
      ...sessionHost(core),
      pick: false,
      drawVersions: !this.ownScene,
      emit: (type, detail, cancelable) => (EVENTS.has(type) ? core.emit(type.replace(/^mmdx-/, 'mmdx-history-'), detail, cancelable) : true),
      name: () => core.run('documentName') ?? 'diagram',
    });
    const t = this.t, shown = this.session.shown;
    const sceneLabel = computed(() => {
      const s = shown();
      return s.kind === 'version' ? t('diff.labelVersion', { id: this.label(s.id) }) : t('history.label');
    });
    // the Back pill names the viewed version: no title of it over the picture
    this.scene = new DiffScene(sceneHost(core), this.session, { reducedMotion, label: sceneLabel, canvas: () => ({ panOnDrag: true }), versionTitle: false, hostLook: this.ownScene });
  }

  private label(id: string | null): string {
    return id === WORKING_COPY ? this.t('history.workingShort') : id ?? '';
  }

  /** What is shown now: nothing picked, a version, or a comparison. */
  private kind(): Shown['kind'] {
    return this.session.shown.peek().kind;
  }

  // ---- open and close ---------------------------------------------------------------------------------------------

  /** The version panel only (nothing picked), or the newest change compared. */
  open(compare: boolean): void {
    const core = this.core, history = core.history.peek();
    if (!history) throw new Error('No history');
    core.addCss([DIFF_TOKENS, DIFF_CSS, PILL_CSS]);
    core.setHistoryState(true, null);
    core.setPanels({ history: true });
    this.removeModules = core.addModules(this.modules(compare ? 'compare' : 'history'));
    this.loaded = this.session.load({ history: withWorkingCopy(history, () => core.run('documentSource') ?? '', this.t('history.working')) });
    if (compare) this.compareNewest();
    for (const off of [
      // the working copy follows the document (edits, remote updates, host setSource, undo())
      core.on('document', () => this.session.sourceChanged(WORKING_COPY)),
      // closing the version panel leaves History when it shows nothing older; a version or a comparison stays (the
      // History button brings the panel back, Back / Esc leave)
      effect(() => {
        const on = !!core.panels()['history'];
        if (!on) untracked(() => queueMicrotask(() => this.kind() === 'none' && this.close()));
      }),
      // the history went away
      effect(() => {
        if (!core.history()) untracked(() => queueMicrotask(() => this.close()));
      }),
      // the host is told what History shows (the studio's mode switch follows a comparison)
      effect(() => {
        const what = this.session.shown().kind;
        untracked(() => core.emit('mmdx-history-show', { shown: what }));
      }),
      // and the version panel's tab and one version as it is, as <mmdx-diff>'s mmdx-mode
      this.modeEvents(),
    ]) this.owner.add(off);
    core.setHistoryState(true, this.api());
    core.emit('mmdx-history-open', {});
  }

  /** `mmdx-history-mode` when the version panel's tab, or whether one version shows as it is, changes. */
  private modeEvents(): () => void {
    let last = '';
    return effect(() => {
      const mode = this.tab?.() ?? 'history', viewOnly = this.session.viewOnly();
      const now = `${mode}|${viewOnly}`;
      if (last && now !== last) untracked(() => this.core.emit('mmdx-history-mode', { mode, viewOnly }));
      last = now;
    });
  }

  close(): void {
    if (this.closed) return;
    const core = this.core;
    this.closed = true;
    this.seq++;
    this.owner.dispose();
    core.setHistoryState(false, null);
    this.morph?.finish();
    if (core.isDestroyed) {
      // the host is being destroyed (its modules uninstall): nothing to give back, nothing to repaint, no event
      this.session.destroy();
      this.onClose();
      return;
    }
    this.backToDocument();
    this.removeModules();
    this.session.destroy();
    core.setPanels({ history: false });
    core.root.focus({ preventScroll: true });
    core.emit('mmdx-history-close', {});
    this.onClose();
  }

  // ---- what the canvas shows: every switch (the document, a version, a comparison) animates — items keep their
  // place and move to the new one, the others fade in or out, the view stays and glides to a comparison's fit

  /** A copy of the picture on the canvas, to morph from (null with reduced motion). */
  private snapshot(): MorphState | null {
    if (reducedMotion() || typeof requestAnimationFrame === 'undefined') return null;
    return this.core.canvas.snapshot();
  }

  /** Runs `f`, which repaints the host's scene (another version, the document, or back from a comparison), animated. */
  private animated(f: () => void): void {
    const c = this.core.canvas;
    this.morph?.finish();
    const from = this.snapshot();
    f();
    if (from && !this.inDiff) this.morph = transitionFrom(c.defs, c.content, from, () => (this.morph = null));
  }

  /**
   * Runs a stage switch that moves the panels between the host's panel stacks and History's: the focused control (a
   * version row) keeps the focus, so the keys (Esc, arrows) still reach the component.
   */
  private keepingFocus(f: () => void): void {
    const core = this.core;
    const root = core.root.getRootNode() as ShadowRoot | Document;
    const had = root.activeElement as HTMLElement | null;
    f();
    if (!had || root.activeElement === had) return;
    if (had.isConnected) had.focus({ preventScroll: true });
    else core.root.focus({ preventScroll: true });
  }

  /**
   * The DiffScene over the host's canvas, in place (the picture stays where it is on screen and holds while the panels
   * slide; a comparison then glides to its fit). The host's Layers card shows over it as its view settings.
   */
  private enterDiff(): void {
    if (this.inDiff) return;
    const core = this.core;
    this.morph?.finish();
    // the comparison's first picture morphs from the one shown, from the same place on screen
    this.scene.continueFrom(this.snapshot());
    this.inDiff = true;
    // History's panels the host has under its own ids open as the host's are (the editor's Layers: view settings)
    const p = core.panels.peek();
    for (const [mine, its] of this.panelPairs()) if (its in p) core.setPanels({ [mine]: !!p[its] });
    const tool = core.tool.peek();
    this.keepingFocus(() => core.canvas.preservePlacement(() => core.enterStage('history', { scene: this.scene, tool: tool === 'hand' || tool === 'pen' ? tool : 'hand' })));
  }

  /** The host's scene and tool back (History stays open); the view stays where the comparison left it, the panels as they are. */
  private leaveDiff(): void {
    if (!this.inDiff) return;
    const core = this.core;
    this.inDiff = false;
    this.keepingFocus(() => core.canvas.preservePlacement(() => {
      core.leaveStage();
      const p = core.panels.peek();
      for (const [mine, its] of this.panelPairs()) if (mine in p && its in p) core.setPanels({ [its]: !!p[mine] });
    }));
  }

  /** `[History's panel, the host's]` for each panel the host has under another id (HistoryHost.panels). */
  private panelPairs(): [string, string][] {
    return Object.entries(this.host?.panels ?? {});
  }

  /** The document back on the canvas (animated): out of a comparison, a version of the host's scene put away. */
  private backToDocument(): void {
    const version = this.ownScene && this.kind() === 'version';
    this.animated(() => {
      this.leaveDiff();
      if (version) this.host?.showVersion?.(null);
    });
    this.core.setStage('document');
  }

  /** A version's source could not be read: `mmdx-history-error` and a toast; what is shown stays. */
  private failed(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    this.core.emit('mmdx-history-error', { diagnostics: [{ severity: 'error', code: 'load.failed', message }] });
    this.core.toast(`${this.t('diff.history.failed')}: ${message}`, { error: true });
  }

  // ---- picks ------------------------------------------------------------------------------------------------------

  /** Nothing picked: the document as it is (editable in the editor). */
  showDocument(): void {
    this.seq++;
    if (this.kind() === 'none') return;
    this.backToDocument();
    this.session.show({ kind: 'none' });
    // nothing shown and the panel closed: History is left
    if (!this.core.panels.peek()['history']) this.close();
  }

  /** The current version: the top row (the working copy, or the newest version while the document is that one). */
  private current(): string | undefined {
    return this.session.versions.peek()[0]?.id;
  }

  /** A version as it is: read-only in the host's own scene (the editor), or the DiffScene's History mode; the current one is the document, editable. */
  async showVersion(id: string): Promise<void> {
    if (id === WORKING_COPY || id === this.current()) return this.showDocument();
    const core = this.core;
    const ticket = ++this.seq;
    if (!this.ownScene) {
      // History's scene draws it (the session renders the version)
      this.enterDiff();
      this.session.show({ kind: 'version', id });
      core.emit('mmdx-history-version', { base: null, head: null, viewing: id });
      return;
    }
    let source: string;
    try {
      source = await this.session.sourceOf(id);
    } catch (e) {
      if (ticket !== this.seq || this.closed) return;
      this.failed(e);
      return;
    }
    if (ticket !== this.seq || this.closed) return;
    this.animated(() => {
      this.leaveDiff();
      core.setStage('version');
      const tool = core.tool.peek();
      if (tool !== 'pointer' && tool !== 'hand' && tool !== 'pen') core.run('setTool', 'pointer');
      this.host?.showVersion?.({ id, source });
    });
    // the host's scene draws it; the session only says which version is shown
    this.session.show({ kind: 'version', id });
    core.emit('mmdx-history-version', { base: null, head: null, viewing: id });
  }

  /** Compares two versions in the DiffScene; the panels stay as they are (Code open stays open, as the diff's code). */
  compare(base: string | null | undefined, head: string | null | undefined): void {
    if (!base || !head || base === head || this.closed) return;
    this.seq++;
    const version = this.ownScene && this.kind() === 'version';
    // the comparison morphs from the version on the canvas; the document is put back under it (not painted meanwhile)
    this.enterDiff();
    if (version) this.host?.showVersion?.(null);
    this.session.setPair(base, head);
  }

  private ids(): string[] {
    return this.session.versions.peek().map((v) => v.id);
  }

  /** The version before `id` (loads the next page when it is not loaded yet). */
  private async previousOf(id: string): Promise<string | null> {
    const ids = (): string[] => this.ids();
    if (ids().indexOf(id) === ids().length - 1 && this.session.hasMore.peek()) {
      try {
        await this.session.loadMore();
      } catch {
        return null;
      }
    }
    const i = ids().indexOf(id);
    return i >= 0 ? ids()[i + 1] ?? null : null;
  }

  /** A version on the Compare tab: with the working copy (the top row); the top row itself with the one before it. */
  private async compareRow(id: string): Promise<void> {
    const top = this.ids()[0];
    if (!top) return;
    if (id !== top) return this.compare(id, top);
    const prev = await this.previousOf(id);
    if (!this.closed) this.compare(prev, id);
  }

  compareNewest(): void {
    void this.loaded.then(() => {
      if (this.closed) return;
      this.tab?.set('compare');
      const top = this.ids()[0];
      if (top) void this.compareRow(top);
    });
  }

  private swap(): void {
    const s = this.session.shown.peek();
    if (s.kind === 'compare') this.compare(s.head, s.base);
  }

  // ---- Restore (Edit mode) and Copy -------------------------------------------------------------------------------

  private async restore(id: string): Promise<void> {
    if (id === WORKING_COPY || this.closed) return;
    let source: string;
    try {
      source = await this.session.sourceOf(id);
    } catch (e) {
      if (this.closed) return;
      this.failed(e);
      return;
    }
    // Back while the version loaded: nothing is restored
    if (this.closed) return;
    const info = this.session.versions.peek().find((v) => v.id === id) ?? { id };
    if (!this.core.emit('mmdx-history-restore', { id, source }, true)) return;
    this.close();
    this.host?.restoreVersion?.(source, info);
  }

  /** Restore (Edit mode), in each version's "⋮" menu of the History panel; not for the current version (the top row: the document as it is). */
  private rowActions(id: string): MenuEntry[] {
    const canRestore = this.core.mode.peek() === 'edit' && !!this.host?.restoreVersion;
    return canRestore && id !== WORKING_COPY && id !== this.current()
      ? [{ label: this.t('history.restoreId', { id: this.label(id) }), title: this.t('history.restoreTip'), class: 'restore', run: () => void this.restore(id) }] : [];
  }

  /** Copies the selected change's item of its old version, to paste after Back (the clipboard ops load on the first copy: a viewer never needs them). */
  private async copySelected(): Promise<void> {
    const core = this.core, s = this.session, t = this.t;
    const D = s.rendered.peek();
    const key = s.selected.peek();
    const ch = key ? s.change(key) : null;
    if (!D || !ch || !this.host?.setClipboard) {
      core.toast(t('history.copyNothing'));
      return;
    }
    const v = s.view.peek();
    const before = v === 'before' || ch.status === 'removed';
    const r = before ? D.before : D.after;
    const id = before ? ch.beforeId ?? ch.id : ch.id;
    let ops: typeof import('../core/ops/clipboard.js');
    try {
      ops = await import('../core/ops/clipboard.js');
    } catch (e) {
      core.toast(e instanceof Error ? e.message : String(e), { error: true });
      return;
    }
    // what was selected when ⌘C was pressed is copied, also after Back meanwhile
    if (core.isDestroyed) return;
    const data = ops.copyItems(r.model, r.doc.meta, [{ kind: ch.kind as ItemKind, id }], { code: r.doc.code, geom: r.result.geom });
    if (!data) {
      core.toast(t('history.copyNothing'));
      return;
    }
    this.host?.setClipboard?.(data);
    core.toast(t('history.copied', { label: ch.label, id: this.label(before ? s.base.peek() : s.head.peek()) }));
  }

  // ---- modules and the session facade -----------------------------------------------------------------------------

  /** The module set over this session (diffModuleSet, A13), with History's own: the Back pill and what view settings read. */
  private modules(tab: DiffMode): ViewModule<ViewCore>[] {
    const s = this.session;
    const controls: VersionControls = {
      row: (id, on) => void (on === 'compare' ? this.compareRow(id) : this.showVersion(id)),
      pick: (side, id) => {
        const now = s.shown.peek();
        if (now.kind !== 'compare') return void this.compareRow(id);
        this.compare(side === 'before' ? id : now.base, side === 'after' ? id : now.head);
      },
      swap: () => this.swap(),
      comparePrevious: (id) => void this.previousOf(id).then((prev) => this.compare(prev, id)),
    };
    const comparing: ReadSignal<boolean> = computed(() => s.shown().kind === 'compare');
    const viewing: ReadSignal<string | null> = computed(() => {
      const now = s.shown();
      return now.kind === 'version' ? now.id : null;
    });
    const pill = historyPillModule({
      t: this.t, label: (id) => this.label(id), comparing, viewing, base: s.base, head: s.head,
      swap: () => this.swap(), showDocument: () => this.showDocument(), copySelected: () => void this.copySelected(),
    });
    // what view settings (layers, display) read over a comparison: its After version
    const documentModule: ViewModule<ViewCore> = {
      id: 'history-document',
      install(scope) {
        const after = (): Rendered | null => s.rendered.peek()?.after ?? null;
        scope.provide('documentModel', () => after()?.model ?? null);
        scope.provide('documentMeta', () => after()?.doc.meta ?? null);
        scope.provide('documentCode', () => after()?.doc.code ?? null);
      },
    };
    const set = diffModuleSet(this.scene, {
      tab,
      code: { panels, sidePanels },
      history: { rowActions: (id) => this.rowActions(id), controls, ownStacks: !!this.host?.ownStacks, withPanel: [pill], inStage: [documentModule] },
    });
    this.tab = set.tab;
    return set.modules;
  }

  /** `historySession`: the `<mmdx-diff>` methods over what History shows. */
  private api(): HistorySession {
    const s = this.session, shown = s.shown;
    return {
      setPair: (base, head) => this.compare(base, head),
      viewVersion: (id) => {
        this.tab?.set('history');
        // History's own scene shows it with the version list (the editor's scene, as the list is)
        if (!this.ownScene) void this.core.run('setPanel', 'history', true);
        void this.showVersion(id);
      },
      setView: (v) => s.setView(v),
      setFilters: (f, dim) => s.setFilters(f, dim),
      select: (key) => s.select(key),
      next: () => s.next(),
      prev: () => s.prev(),
      get pair() {
        const now = shown.peek();
        return { base: now.kind === 'compare' ? now.base : null, head: now.kind === 'compare' ? now.head : null, viewing: now.kind === 'version' ? now.id : null };
      },
      getDiff: () => (shown.peek().kind === 'compare' ? s.getDiff() : null),
      exportAs: (kind, opts) => (shown.peek().kind === 'none' ? Promise.resolve() : s.exportAs(kind, opts ?? {})), // as getDiff (B23)
      close: () => this.close(),
    };
  }
}
