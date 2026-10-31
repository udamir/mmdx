// History in place (component architecture §8.2, §8.3): the `history` stage of the viewer and the editor. Opening it
// saves the canvas view, switches the host to the `history` stage (its editing modules are suspended with their
// state; the pen strokes are cleared), and pushes a DiffScene over the host's history plus its working copy onto the
// host's own canvas. The diff modules join the host for that stage: the diff bar, the History and Code panels in the
// left stack, Changes in the right one, the canvas behaviour, the exports, Restore (Edit mode, in each version's "⋯"
// menu of the History panel) and the Back pill.
// Session events reach the host as `mmdx-history-*`. Leaving pops the scene, restores the panels and the view, and
// the host's scene repaints in full. Loaded on first use: the viewer and the editor bundles never contain the diff.
import { staticHistory, type HistoryAdapter, type StaticVersion, type VersionInfo } from '../adapters/history.js';
import type { ItemKind } from '../core/types.js';
import { createPill, PILL_CSS } from '../ui/blocks/pill.js';
import { h, icon } from '../ui/h.js';
import { registerMessages } from '../ui/i18n.js';
import { DIFF_MESSAGES } from '../ui/messages/diff.js';
import { computed, effect, untracked } from '../ui/signal.js';
import { DIFF_CSS, DIFF_TOKENS } from '../ui/styles/diff.js';
import type { ViewCore } from '../view/core.js';
import type { HistorySession } from '../view/history.js';
import type { ViewModule } from '../view/module.js';
import { panelStacksModule } from '../view/modules/panels.js';
import { diffBarModule } from './modules/bar.js';
import { diffExportModule } from './modules/export.js';
import { changeListModule, codeDiffModule, versionsModule } from './modules/panels.js';
import type { MenuEntry } from '../ui/blocks/menu.js';
import { diffStageModule } from './modules/stage.js';
import { DiffScene } from './scene.js';
import { DiffSession } from './session.js';

/** Swap: two arrows, left and right. */
const I_SWAP = 'M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4';

const I_CLOSE = 'M6 6l12 12M18 6L6 18';

const HISTORY_PILL_CSS = /* css */ `
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
  'history.back': 'Back',
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
export function withWorkingCopy(history: HistorySource, current: () => string, message: string): HistoryAdapter {
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
  return {
    async list(cursor) {
      const page = await base.list(cursor);
      if (cursor) return page;
      const newest = page.versions[0];
      const versions = page.versions.filter((v) => v.id !== WORKING_COPY);
      if (newest && (await sourceOfNewest(newest.id)) === current()) return { ...page, versions };
      const working: VersionInfo = { id: WORKING_COPY, message, date: new Date().toISOString() };
      return { ...page, versions: [working, ...versions] };
    },
    load: (id) => (id === WORKING_COPY ? Promise.resolve(current()) : base.load(id)),
    ...(base.subscribe ? { subscribe: base.subscribe.bind(base) } : {}),
  };
}

export interface HistoryController {
  readonly session: DiffSession;
  readonly api: HistorySession;
  close(): void;
}

const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Opens the `history` stage on a host (the viewer or the editor). */
export function openHistory(core: ViewCore, o: { onClose(): void }): HistoryController {
  registerMessages(DIFF_MESSAGES);
  registerMessages(EN);
  const t = core.i18n.t;
  const history = core.history.peek();
  if (!history) throw new Error('No history');
  core.addCss([DIFF_TOKENS, DIFF_CSS, PILL_CSS]);
  const label = (id: string | null): string => (id === WORKING_COPY ? t('history.workingShort') : id ?? '');

  // ---- what History leaves as it was
  const view = core.canvas.saveView();
  const panels = core.panels.peek();
  const tool = core.tool.peek();

  const session: DiffSession = new DiffSession({
    ctx: core.ctx,
    t,
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
  const sceneLabel = computed(() => (session.viewOnly() ? t('diff.labelVersion', { id: label(session.viewing()) }) : t('history.label')));
  const scene = new DiffScene(core, session, { reducedMotion, label: sceneLabel, canvas: () => ({ panOnDrag: true }) });

  let closed = false;

  // ---- Restore (Edit mode) and Back
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
  const rowActions = (id: string): MenuEntry[] =>
    canRestore ? [{ label: t('history.restoreId', { id: label(id) }), title: t('history.restoreTip'), disabled: id === WORKING_COPY, class: 'restore', run: () => void restore(id) }] : [];

  // ---- the Back pill, top centre; Esc at the end of the Esc chain
  const pillModule: ViewModule<ViewCore> = {
    id: 'history-pill',
    css: [PILL_CSS, HISTORY_PILL_CSS],
    install(scope) {
      // one version as it is: "History · v3"; a comparison: its two versions as coloured chips (Before red, After
      // green) with a flat swap between them. The text is what screen readers hear.
      const text = computed(() => (session.viewOnly() ? t('history.pill', { what: label(session.viewing()) }) : `${label(session.base())} → ${label(session.head())}`));
      const swap = (): void => {
        const { base, head } = session.pair;
        if (base && head && !session.viewOnly.peek()) session.setPair(head, base);
      };
      const before = h('span', { class: 'dx-chip before', title: t('diff.view.before') });
      const after = h('span', { class: 'dx-chip after', title: t('diff.view.after') });
      const swapBtn = h('button', { type: 'button', class: 'dx-swap', 'data-tool': 'swap', 'data-f': 'pill-swap', title: `${t('history.swap')} (X)`, 'aria-label': t('history.swap'), 'aria-keyshortcuts': 'x' }, icon(I_SWAP, 16));
      scope.listen(swapBtn, 'click', swap);
      const pair = h('span', { class: 'dx-pair' }, before, swapBtn, after);
      const version = h('span', { class: 'dx-version' });
      scope.effect(() => {
        const one = session.viewOnly();
        pair.hidden = one;
        version.hidden = !one;
        version.textContent = one ? t('history.pill', { what: label(session.viewing()) }) : '';
        before.textContent = label(session.base());
        after.textContent = label(session.head());
      });
      const pill = createPill({
        text, t, label: t('history.label'), content: h('span', { class: 'dx-pill-body' }, pair, version),
        action: { label: t('history.back'), keys: 'escape', icon: I_CLOSE, onClick: () => close() },
      });
      scope.shortcut({ id: 'history-swap', keys: ['x'], label: t('history.swap'), group: t('history.label'), run: () => (session.viewOnly.peek() ? false : (swap(), true)) });
      scope.slot('top-center').append(pill.el);
      scope.shortcut({ id: 'history-back', keys: ['escape'], label: t('history.back'), group: t('history.label'), run: () => void close() });
      // copy an item of an old version (Before / After, or its side of a change), to paste after Back (§8.2)
      scope.shortcut({ id: 'history-copy', keys: ['mod+c'], label: t('history.copyHelp'), group: t('history.label'), run: () => void copySelected() });
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
  const modules: ViewModule<ViewCore>[] = [
    panelStacksModule, diffBarModule(session), versionsModule(session, { dockButton: false, rowActions }), codeDiffModule(session), changeListModule(session),
    diffStageModule(scene), diffExportModule(session), pillModule,
  ].map(inHistory);

  // ---- open: the stage first (suspends the document's modules), then the panels, the modules and the scene
  core.stage.set('history');
  if (core.tool.peek() !== 'hand' && core.tool.peek() !== 'pen') core.tool.set('hand');
  const wide = core.root.getBoundingClientRect().width >= 1100;
  core.panels.set({ ...panels, history: true, code: false, changes: wide });
  const removeModules = core.addModules(modules);
  core.pushScene(scene);
  session.versionsShown.set(true);
  void session.load({ history: withWorkingCopy(history, () => core.run('documentSource') ?? '', t('history.working')) });

  const offs: (() => void)[] = [
    // the working copy follows the document (remote update, host setSource, undo() from code)
    core.on('document', () => session.sourceChanged(WORKING_COPY)),
    // History mode (one version as it is) needs the version panel
    effect(() => {
      const on = !!core.panels()['history'];
      untracked(() => session.setVersionsShown(on));
    }),
    // the history went away
    effect(() => {
      if (!core.history()) untracked(() => queueMicrotask(close));
    }),
  ];

  function close(): void {
    if (closed) return;
    closed = true;
    for (const off of offs) off();
    core.historySession.set(null);
    if (core.isDestroyed) {
      // the host is being destroyed (its modules uninstall): nothing to give back, nothing to repaint, no event
      session.destroy();
      o.onClose();
      return;
    }
    core.popScene();
    removeModules();
    session.destroy();
    core.stage.set('document');
    core.panels.set(panels);
    core.tool.set(tool);
    core.canvas.restoreView(view);
    core.root.focus({ preventScroll: true });
    core.emit('mmdx-history-close', {});
    o.onClose();
  }

  const api: HistorySession = {
    setPair: (base, head) => session.setPair(base, head),
    viewVersion: (id) => session.viewVersion(id),
    setView: (v) => session.setView(v),
    setFilters: (f, dim) => session.setFilters(f, dim),
    select: (key) => session.select(key),
    next: () => session.next(),
    prev: () => session.prev(),
    get pair() {
      return session.pair;
    },
    getDiff: () => session.getDiff(),
    exportAs: (kind, opts) => session.exportAs(kind, opts ?? {}),
    close,
  };
  core.historySession.set(api);
  core.emit('mmdx-history-open', {});
  return { session, api, close };
}
