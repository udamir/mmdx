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
// contain the diff.
import { staticHistory, type HistoryAdapter, type StaticVersion, type VersionInfo } from '../adapters/history.js';
import type { ItemKind } from '../core/types.js';
import { transitionFrom, type MorphState } from '../dom/morph.js';
import { reducedMotion } from '../dom/motion.js';
import { createPill, PILL_CSS } from '../ui/blocks/pill.js';
import { h, icon } from '../ui/h.js';
import { registerMessages } from '../ui/i18n.js';
import { DIFF_MESSAGES } from '../ui/messages/diff.js';
import { computed, effect, signal, untracked } from '../ui/signal.js';
import { DIFF_CSS, DIFF_TOKENS } from '../ui/styles/diff.js';
import type { ViewCore } from '../view/core.js';
import type { HistorySession } from '../view/history.js';
import type { ViewModule } from '../view/module.js';
import { panelStacksModule } from '../view/modules/panels.js';
import { diffLayersModule } from '../view/modules/side-panels.js';
import type { Rendered } from '../core/pipeline-core.js';
import { diffBarModule } from './modules/bar.js';
import { diffExportModule } from './modules/export.js';
import { changeListModule, codeDiffModule, versionsModule, type VersionControls } from './modules/panels.js';
import type { MenuEntry } from '../ui/blocks/menu.js';
import { diffStageModule } from './modules/stage.js';
import { DiffScene } from './scene.js';
import { DiffSession, type DiffMode } from './session.js';

/** Swap: two arrows, left and right. */
export const I_SWAP = 'M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4';

export const I_CLOSE = 'M6 6l12 12M18 6L6 18';

/** The History pill's own look: the pair as coloured chips with a swap between them, or the viewed version. */
export const HISTORY_PILL_CSS = /* css */ `
.dx-pill-body { display: inline-flex; align-items: center; min-width: 0; }
.dx-pair { display: inline-flex; align-items: center; gap: 2px; min-width: 0; }
.dx-chip { font: 600 12.5px/1.4 var(--mmdx-mono); padding: 4px 9px; border-radius: 7px; white-space: nowrap; }
.dx-chip.before { color: var(--mmdx-diff-del); background: var(--mmdx-diff-del-bg); }
.dx-chip.after { color: var(--mmdx-diff-add); background: var(--mmdx-diff-add-bg); }
.dx-swap { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--mmdx-muted); }
.dx-swap:hover:not(:disabled) { background: var(--mmdx-float-2); color: var(--mmdx-text); }
.dx-version { font-weight: 500; padding: 0 8px; white-space: nowrap; }
`;

/** The id of the working copy among the versions. */
export const WORKING_COPY = 'working';

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
const EVENTS = new Set(['mmdx-compare', 'mmdx-version', 'mmdx-select', 'mmdx-view', 'mmdx-mode', 'mmdx-filters', 'mmdx-export', 'mmdx-error']);

export type HistorySource = HistoryAdapter | readonly StaticVersion[];

/** The host's history with the working copy on top while it differs from the newest version (read live; the newest version's source is fetched once per id, not on every document change). */
/** A history with History's working copy: it can tell the working copy's row without reading the history again. */
export interface WorkingCopyAdapter extends HistoryAdapter {
  workingCopy(): Promise<VersionInfo | null>;
}

export function withWorkingCopy(history: HistorySource, current: () => string, message: string): WorkingCopyAdapter {
  const base = Array.isArray(history) ? staticHistory(history as readonly StaticVersion[]) : (history as HistoryAdapter);
  let newestSource: { id: string; source: Promise<string> } | null = null;
  const sourceOfNewest = (id: string): Promise<string> => {
    if (newestSource?.id !== id) {
      const source = base.load(id);
      const entry = { id, source };
      newestSource = entry;
      source.catch(() => {
        if (newestSource === entry) newestSource = null;
      });
    }
    return newestSource!.source;
  };
  /** The newest saved version of the last first page read (the working copy is compared with it). */
  let newestId: string | undefined;
  const workingRow = async (): Promise<VersionInfo | null> =>
    newestId && (await sourceOfNewest(newestId)) === current() ? null : { id: WORKING_COPY, message, date: new Date().toISOString() };
  const adapter: WorkingCopyAdapter = {
    async list(cursor) {
      const page = await base.list(cursor);
      if (cursor) return page;
      const versions = page.versions.filter((v) => v.id !== WORKING_COPY);
      newestId = versions[0]?.id;
      const working = await workingRow();
      return { ...page, versions: working ? [working, ...versions] : versions };
    },
    // a document change: the working copy's row only, without reading the history again (B10)
    workingCopy: workingRow,
    load: (id) => (id === WORKING_COPY ? Promise.resolve(current()) : base.load(id)),
    ...(base.subscribe ? { subscribe: base.subscribe.bind(base) } : {}),
  };
  return adapter;
}

export interface HistoryController {
  readonly session: DiffSession;
  readonly api: HistorySession;
  close(): void;
  /** Compares the newest change (the studio's Diff): the working copy or the newest version with the one before. */
  compareNewest(): void;
}

/** What History shows: nothing picked (the document), a version as it is, or a comparison. */
type Shown = 'none' | 'version' | 'compare';

/** Opens History on a host (the viewer or the editor): the version panel, nothing picked unless `compare`. */
export function openHistory(core: ViewCore, o: { onClose(): void; compare?: boolean }): HistoryController {
  registerMessages(DIFF_MESSAGES);
  registerMessages(EN);
  const t = core.i18n.t;
  const history = core.history.peek();
  if (!history) throw new Error('No history');
  core.addCss([DIFF_TOKENS, DIFF_CSS, PILL_CSS]);
  const label = (id: string | null): string => (id === WORKING_COPY ? t('history.workingShort') : id ?? '');
  // the editor shows a version in its own scene, drawn as the document; a viewer in the DiffScene
  const ownScene = core.has('showVersion');

  const session: DiffSession = new DiffSession({
    ctx: core.ctx,
    t,
    pick: false,
    emit: (type, detail, cancelable) => (EVENTS.has(type) ? core.emit(type.replace(/^mmdx-/, 'mmdx-history-'), detail, cancelable) : true),
    renderOptions: () => {
      const d = core.display.peek(), layers = core.visibleLayers.peek();
      return { theme: core.shownTheme(), ...(d.labels ? {} : { hideLabels: true }), ...(layers ? { visibleLayers: layers } : {}) };
    },
    ensureTheme: (id) => core.ensureTheme(id),
    scheme: () => core.scheme.peek(),
    name: () => core.run('documentName') ?? 'diagram',
    showVersions: () => void core.run('setPanel', 'history', true),
  });
  session.versionsShown.set(true);

  // ---- what is shown, and what the panel marks
  const shown = signal<Shown>('none');
  /** The version shown (or loading) on the History tab; null: the current one (the document, editable). */
  const viewing = signal<string | null>(null);
  const tab = signal<DiffMode>(o.compare ? 'compare' : 'history');
  const sceneLabel = computed(() => (shown() === 'version' ? t('diff.labelVersion', { id: label(viewing()) }) : t('history.label')));
  // the Back pill names the viewed version: no title of it over the picture
  const scene = new DiffScene(core, session, { reducedMotion, label: sceneLabel, canvas: () => ({ panOnDrag: true }), versionTitle: false, hostLook: ownScene });

  let closed = false;
  /** Bumped by every pick: a version that loads after a newer pick is not shown. */
  let seq = 0;
  /** While the DiffScene is over the host's canvas: what it put aside (the tool; the panels stay as they are). */
  let diff: { tool: ReturnType<typeof core.tool.peek> } | null = null;

  // ---- every switch of what the canvas shows (the document, a version, a comparison) animates: items keep their
  // place and move to the new one, the others fade in or out, the view stays and glides to a comparison's fit
  let morph: { finish(): void } | null = null;
  /** A copy of the picture on the canvas, to morph from (null with reduced motion). */
  const snapshot = (): MorphState | null => {
    if (reducedMotion() || typeof requestAnimationFrame === 'undefined') return null;
    const c = core.canvas;
    return { defs: [...c.defs.children].map((n) => n.cloneNode(true) as Element), content: c.content.cloneNode(true) as Element };
  };
  /** Runs `f`, which repaints the host's scene (another version, the document, or back from a comparison), animated. */
  const animated = (f: () => void): void => {
    morph?.finish();
    const from = snapshot();
    f();
    if (from && !diff) morph = transitionFrom(core.canvas.defs, core.canvas.content, from, () => (morph = null));
  };

  /**
   * Runs a stage switch that moves the panels between the host's panel stacks and History's: the focused control (a
   * version row) keeps the focus, so the keys (Esc, arrows) still reach the component.
   */
  const keepingFocus = (f: () => void): void => {
    const root = core.root.getRootNode() as ShadowRoot | Document;
    const had = root.activeElement as HTMLElement | null;
    f();
    if (!had || root.activeElement === had) return;
    if (had.isConnected) had.focus({ preventScroll: true });
    else core.root.focus({ preventScroll: true });
  };
  /**
   * Runs a scene switch that moves the canvas (into the comparison's pane, or back): the view moves with it, so the
   * picture stays where it is on screen, and holds while the panels slide (a comparison then glides to its fit).
   */
  const inPlace = (f: () => void): void => {
    const c = core.canvas;
    const before = c.svg.getBoundingClientRect(), view = c.saveView();
    f();
    const after = c.svg.getBoundingClientRect();
    c.restoreView({ ...view, auto: false, tx: view.tx + before.left - after.left, ty: view.ty + before.top - after.top });
  };
  const enterDiff = (): void => {
    if (diff) return;
    morph?.finish();
    // the comparison's first picture morphs from the one shown, from the same place on screen
    scene.continueFrom(snapshot());
    diff = { tool: core.tool.peek() };
    // the host's Layers card shows over a comparison as its view settings (layers and display), open as it was
    const p = core.panels.peek();
    if ('layers' in p) core.panels.set({ ...p, 'view-settings': !!p['layers'] });
    keepingFocus(() => inPlace(() => {
      core.stage.set('history');
      if (core.tool.peek() !== 'hand' && core.tool.peek() !== 'pen') core.tool.set('hand');
      core.pushScene(scene);
    }));
  };
  /** The host's scene and tool back (History stays open); the view stays where the comparison left it, the panels as they are. */
  const leaveDiff = (): void => {
    const d = diff;
    if (!d) return;
    diff = null;
    keepingFocus(() => inPlace(() => {
      core.popScene();
      core.stage.set('document');
      const p = core.panels.peek();
      if ('view-settings' in p && 'layers' in p) core.panels.set({ ...p, layers: !!p['view-settings'] });
    }));
    core.tool.set(d.tool);
  };

  /** Nothing picked: the document as it is (editable in the editor). */
  const showDocument = (): void => {
    seq++;
    if (shown.peek() === 'none') return;
    const version = ownScene && shown.peek() === 'version';
    animated(() => {
      leaveDiff();
      if (version) core.run('showVersion', null);
    });
    core.stage.set('document');
    viewing.set(null);
    shown.set('none');
    // nothing shown and the panel closed: History is left
    if (!core.panels.peek()['history']) close();
  };

  /** The current version: the top row (the working copy, or the newest version while the document is that one). */
  const current = (): string | undefined => session.versions.peek()[0]?.id;
  /** A version as it is: read-only in the host's own scene (the editor), or the DiffScene's History mode; the current one is the document, editable. */
  const showVersion = async (id: string): Promise<void> => {
    if (id === WORKING_COPY || id === current()) return showDocument();
    const ticket = ++seq;
    viewing.set(id);
    if (!ownScene) {
      enterDiff();
      session.viewVersion(id);
      shown.set('version');
      return;
    }
    let source: string;
    try {
      source = await session.sourceOf(id);
    } catch (e) {
      if (ticket !== seq || closed) return;
      viewing.set(shown.peek() === 'version' ? viewing.peek() : null);
      const message = e instanceof Error ? e.message : String(e);
      core.emit('mmdx-history-error', { diagnostics: [{ severity: 'error', code: 'load.failed', message }] });
      core.toast(`${t('diff.history.failed')}: ${message}`, { error: true });
      return;
    }
    if (ticket !== seq || closed) return;
    animated(() => {
      leaveDiff();
      core.stage.set('version');
      const tool = core.tool.peek();
      if (tool !== 'pointer' && tool !== 'hand' && tool !== 'pen') core.run('setTool', 'pointer');
      core.run('showVersion', { id, source });
    });
    shown.set('version');
    core.emit('mmdx-history-version', { base: null, head: null, viewing: id });
  };

  /** Compares two versions in the DiffScene; the panels stay as they are (Code open stays open, as the diff's code). */
  const compare = (base: string | null | undefined, head: string | null | undefined): void => {
    if (!base || !head || base === head || closed) return;
    seq++;
    const version = ownScene && shown.peek() === 'version';
    // the comparison morphs from the version on the canvas; the document is put back under it (not painted meanwhile)
    enterDiff();
    if (version) core.run('showVersion', null);
    viewing.set(null);
    shown.set('compare');
    session.setPair(base, head);
  };

  const ids = (): string[] => session.versions.peek().map((v) => v.id);
  /** The version before `id` (loads the next page when it is not loaded yet). */
  const previousOf = async (id: string): Promise<string | null> => {
    if (ids().indexOf(id) === ids().length - 1 && session.hasMore.peek()) {
      try {
        await session.loadMore();
      } catch {
        return null;
      }
    }
    const i = ids().indexOf(id);
    return i >= 0 ? ids()[i + 1] ?? null : null;
  };
  /** A version on the Compare tab: with the working copy (the top row); the top row itself with the one before it. */
  const compareRow = async (id: string): Promise<void> => {
    const top = ids()[0];
    if (!top) return;
    if (id !== top) return compare(id, top);
    const prev = await previousOf(id);
    if (!closed) compare(prev, id);
  };
  const compareNewest = (): void => {
    void loaded.then(() => {
      if (closed) return;
      tab.set('compare');
      const top = ids()[0];
      if (top) void compareRow(top);
    });
  };

  // ---- Restore (Edit mode)
  const restore = async (id: string): Promise<void> => {
    if (id === WORKING_COPY || closed) return;
    let source: string;
    try {
      source = await session.sourceOf(id);
    } catch (e) {
      if (closed) return;
      const message = e instanceof Error ? e.message : String(e);
      core.emit('mmdx-history-error', { diagnostics: [{ severity: 'error', code: 'load.failed', message }] });
      core.toast(`${t('diff.history.failed')}: ${message}`, { error: true });
      return;
    }
    // Back while the version loaded: nothing is restored
    if (closed) return;
    const info = session.versions.peek().find((v) => v.id === id) ?? { id };
    if (!core.emit('mmdx-history-restore', { id, source }, true)) return;
    close();
    core.run('restoreVersion', source, info);
  };
  // Restore (Edit mode) is in each version's "⋮" menu of the History panel
  const canRestore = core.mode.peek() === 'edit' && core.has('restoreVersion');
  // not for the current version (the top row: the document as it is)
  const rowActions = (id: string): MenuEntry[] =>
    canRestore && id !== WORKING_COPY && id !== session.versions.peek()[0]?.id
      ? [{ label: t('history.restoreId', { id: label(id) }), title: t('history.restoreTip'), class: 'restore', run: () => void restore(id) }] : [];

  // ---- the Back pill, top centre, while something is shown; Esc at the end of the Esc chain
  const swap = (): void => {
    const { base, head } = session.pair;
    if (shown.peek() === 'compare') compare(head, base);
  };
  const pillModule: ViewModule<ViewCore> = {
    id: 'history-pill',
    css: [PILL_CSS, HISTORY_PILL_CSS],
    when: { stage: ['version', 'history'] },
    install(scope) {
      // one version as it is: "History · v3"; a comparison: its two versions as coloured chips (Before red, After
      // green) with a flat swap between them. The text is what screen readers hear.
      const text = computed(() => (shown() !== 'compare' ? t('history.pill', { what: label(viewing()) }) : `${label(session.base())} → ${label(session.head())}`));
      const before = h('span', { class: 'dx-chip before', title: t('diff.view.before') });
      const after = h('span', { class: 'dx-chip after', title: t('diff.view.after') });
      const swapBtn = h('button', { type: 'button', class: 'dx-swap', 'data-tool': 'swap', 'data-f': 'pill-swap', title: `${t('history.swap')} (X)`, 'aria-label': t('history.swap'), 'aria-keyshortcuts': 'x' }, icon(I_SWAP, 16));
      scope.listen(swapBtn, 'click', swap);
      const pair = h('span', { class: 'dx-pair' }, before, swapBtn, after);
      const version = h('span', { class: 'dx-version' });
      scope.effect(() => {
        const one = shown() !== 'compare';
        pair.hidden = one;
        version.hidden = !one;
        version.textContent = one ? t('history.pill', { what: label(viewing()) }) : '';
        before.textContent = label(session.base());
        after.textContent = label(session.head());
      });
      const pill = createPill({
        text, t, label: t('history.label'), content: h('span', { class: 'dx-pill-body' }, pair, version),
        // back to the document as it is; the version panel stays (closing it leaves History)
        action: { label: t('history.back'), keys: 'escape', icon: I_CLOSE, onClick: () => showDocument() },
      });
      scope.shortcut({ id: 'history-swap', keys: ['x'], label: t('history.swap'), group: t('history.label'), when: { stage: ['history'] }, run: () => (shown.peek() === 'compare' ? (swap(), true) : false) });
      scope.slot('top-center').append(pill.el);
      scope.shortcut({ id: 'history-back', keys: ['escape'], label: t('history.back'), group: t('history.label'), run: () => void showDocument() });
      // copy an item of an old version (Before / After, or its side of a change), to paste after Back (§8.2); a
      // version shown as it is copies through the host's own selection
      scope.shortcut({ id: 'history-copy', keys: ['mod+c'], label: t('history.copyHelp'), group: t('history.label'), when: { stage: ['history'] }, run: () => void copySelected() });
      return () => pill.destroy();
    },
  };
  // the clipboard ops load on the first copy: they share a chunk with the editor's ops, which a viewer never needs
  const copySelected = async (): Promise<void> => {
    const D = session.rendered.peek();
    const key = session.selected.peek();
    const ch = key ? session.change(key) : null;
    if (!D || !ch || !core.has('setClipboard')) {
      core.toast(t('history.copyNothing'));
      return;
    }
    const v = session.view.peek();
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
    core.run('setClipboard', data);
    core.toast(t('history.copied', { label: ch.label, id: label(before ? session.base.peek() : session.head.peek()) }));
  };

  const inHistory = (m: ViewModule<ViewCore>): ViewModule<ViewCore> => ({ ...m, when: { ...m.when, stage: ['history'] } });
  // a host with panel stacks of its own (the editor's) has no `panel-stacks` module to install after
  const ownStacks = core.has('setPanel');
  const inHostStacks = (m: ViewModule<ViewCore>): ViewModule<ViewCore> => (ownStacks && m.after ? { ...m, after: m.after.filter((a) => a !== 'panel-stacks') } : m);
  const controls: VersionControls = {
    tab,
    base: computed(() => (shown() === 'compare' ? session.base() : null)),
    head: computed(() => (shown() === 'compare' ? session.head() : null)),
    // the History tab marks what shows: a version, else the current one (the document)
    viewing: computed(() => (shown() === 'version' ? viewing() : shown() === 'none' ? session.versions()[0]?.id ?? null : null)),
    row: (id) => void (tab.peek() === 'compare' ? compareRow(id) : showVersion(id)),
    pick: (side, id) => {
      if (shown.peek() !== 'compare') return void compareRow(id);
      compare(side === 'before' ? id : session.base.peek(), side === 'after' ? id : session.head.peek());
    },
    swap,
    comparePrevious: (id) => {
      tab.set('compare');
      void previousOf(id).then((prev) => compare(prev, id));
    },
  };
  // what view settings (layers, display) read over a comparison: its After version
  const documentModule: ViewModule<ViewCore> = {
    id: 'history-document',
    install(scope) {
      const after = (): Rendered | null => session.rendered.peek()?.after ?? null;
      scope.provide('documentModel', () => after()?.model ?? null);
      scope.provide('documentMeta', () => after()?.doc.meta ?? null);
      scope.provide('documentCode', () => after()?.doc.code ?? null);
    },
  };
  const modules: ViewModule<ViewCore>[] = ([
    // the version panel, whatever History shows (in the host's own panel stacks)
    versionsModule(session, { dockButton: false, rowActions, controls }),
    pillModule,
    // the host's own panel stacks hold the comparison's panels too (same widths); one without them gets the kernel's
    ...[...(ownStacks ? [] : [panelStacksModule]), diffBarModule(session), codeDiffModule(session), changeListModule(session), diffStageModule(scene), diffExportModule(session), documentModule, diffLayersModule].map(inHistory),
  ] as ViewModule<ViewCore>[]).map(inHostStacks);

  // ---- open: the version panel only
  core.historyOpen.set(true);
  core.panels.set({ ...core.panels.peek(), history: true });
  const removeModules = core.addModules(modules);
  const loaded = session.load({ history: withWorkingCopy(history, () => core.run('documentSource') ?? '', t('history.working')) });
  if (o.compare) compareNewest();

  const offs: (() => void)[] = [
    // the working copy follows the document (edits, remote updates, host setSource, undo())
    core.on('document', () => session.sourceChanged(WORKING_COPY)),
    // closing the version panel leaves History when it shows nothing older; a version or a comparison stays (the
    // History button brings the panel back, Back / Esc leave)
    effect(() => {
      const on = !!core.panels()['history'];
      if (!on) untracked(() => queueMicrotask(() => shown.peek() === 'none' && close()));
    }),
    // the history went away
    effect(() => {
      if (!core.history()) untracked(() => queueMicrotask(close));
    }),
    // the host is told what History shows (the studio's mode switch follows a comparison)
    effect(() => {
      const what = shown();
      untracked(() => core.emit('mmdx-history-show', { shown: what }));
    }),
  ];

  function close(): void {
    if (closed) return;
    closed = true;
    seq++;
    for (const off of offs) off();
    core.historySession.set(null);
    core.historyOpen.set(false);
    morph?.finish();
    if (core.isDestroyed) {
      // the host is being destroyed (its modules uninstall): nothing to give back, nothing to repaint, no event
      session.destroy();
      o.onClose();
      return;
    }
    const version = ownScene && shown.peek() === 'version';
    animated(() => {
      leaveDiff();
      if (version) core.run('showVersion', null);
    });
    core.stage.set('document');
    removeModules();
    session.destroy();
    core.panels.set({ ...core.panels.peek(), history: false });
    core.root.focus({ preventScroll: true });
    core.emit('mmdx-history-close', {});
    o.onClose();
  }

  const api: HistorySession = {
    setPair: (base, head) => compare(base, head),
    viewVersion: (id) => {
      tab.set('history');
      void showVersion(id);
    },
    setView: (v) => session.setView(v),
    setFilters: (f, dim) => session.setFilters(f, dim),
    select: (key) => session.select(key),
    next: () => session.next(),
    prev: () => session.prev(),
    get pair() {
      const what = shown.peek();
      return { base: what === 'compare' ? session.base.peek() : null, head: what === 'compare' ? session.head.peek() : null, viewing: what === 'version' ? viewing.peek() : null };
    },
    getDiff: () => (shown.peek() === 'compare' ? session.getDiff() : null),
    // as getDiff: nothing to export while History shows no version and no comparison (B23)
    exportAs: (kind, opts) => (shown.peek() === 'none' ? Promise.resolve() : session.exportAs(kind, opts ?? {})),
    close,
  };
  core.historySession.set(api);
  core.emit('mmdx-history-open', {});
  return { session, api, close, compareNewest };
}
