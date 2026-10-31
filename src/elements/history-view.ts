// The History of a diagram inside the editor and the viewer (diff design §15): their History button covers the
// component with <mmdx-diff> over the document's versions — the host's history plus the working copy when it differs
// from the newest version. Back returns to the diagram; in the editor, Restore opens the shown version (undoable).
// The diff is used through its tag name: the page loads `mmdx/diff`, and the editor and viewer bundles never contain
// it (their History button appears once <mmdx-diff> is defined). This module itself loads on first use.
import { staticHistory, type HistoryAdapter, type StaticVersion, type VersionInfo } from '../adapters/history.js';
import type { StorageAdapter } from '../adapters/storage.js';
import type { CoreContext } from '../core/context.js';
import type { I18n } from '../ui/i18n.js';
import type { DiagramDiff, DiffAction, MmdxDiffElement } from './diff.js';

// English strings; a host catalog (configure({ i18n })) overrides them by key. Kept here rather than registered, so
// this lazy module imports nothing the viewer's main bundle already holds (that would split it into more chunks).
const EN: Record<string, string> = {
  'history.working': 'Working copy (not saved as a version)',
  'history.back': 'Back to the diagram',
  'history.backTip': 'Close the history (Esc)',
  'history.restore': 'Restore this version',
  'history.restoreTip': 'Open the shown version in the editor (undo brings the current diagram back)',
  'history.label': 'Diagram history',
};

/** The id of the working copy among the versions. */
export const WORKING_COPY = 'working';

export type HistorySource = HistoryAdapter | readonly StaticVersion[];

export interface HistoryViewOptions {
  /** The positioned element the view covers. */
  container: HTMLElement;
  history: HistorySource;
  /** The diagram as it is now (the working copy). */
  current: string;
  t: I18n['t'];
  name?: string;
  ui?: 'light' | 'dark';
  storage?: StorageAdapter;
  ctx?: Partial<CoreContext>;
  /** Restore a version (the editor); without it there is no Restore button (the viewer). */
  onRestore?: (source: string, version: VersionInfo) => void;
  onClose: () => void;
  /** Give a short host (a docs-page viewer) room for the panels while the view is open. */
  grow?: boolean;
}

export interface HistoryView {
  readonly diff: MmdxDiffElement;
  close(): void;
}

/** True once `mmdx/diff` defined <mmdx-diff> on the page. */
export const diffAvailable = (): boolean => typeof customElements !== 'undefined' && !!customElements.get('mmdx-diff');

/** The host's history with the working copy on top when it differs from the newest version. */
export function withWorkingCopy(history: HistorySource, current: string, message: string): HistoryAdapter {
  const base = Array.isArray(history) ? staticHistory(history as readonly StaticVersion[]) : (history as HistoryAdapter);
  return {
    async list(cursor) {
      const page = await base.list(cursor);
      if (cursor) return page;
      const newest = page.versions[0];
      if (newest && (await base.load(newest.id)) === current) return page;
      const working: VersionInfo = { id: WORKING_COPY, message, date: new Date().toISOString() };
      return { ...page, versions: [working, ...page.versions.filter((v) => v.id !== WORKING_COPY)] };
    },
    load: (id) => (id === WORKING_COPY ? Promise.resolve(current) : base.load(id)),
    ...(base.subscribe ? { subscribe: base.subscribe.bind(base) } : {}),
  };
}

export function openHistoryView(o: HistoryViewOptions): HistoryView {
  const t = (key: string): string => {
    const s = o.t(key);
    return s === key ? EN[key] ?? key : s;
  };
  const el = document.createElement('mmdx-diff') as MmdxDiffElement;
  el.className = 'mmdx-history-view';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', t('history.label'));
  el.style.cssText = 'position:absolute;inset:0;height:auto;min-height:0;z-index:2000;';
  // a narrow host (a docs-page viewer) keeps the canvas wide: the change list stays closed
  el.setAttribute('panels', o.container.getBoundingClientRect().width >= 1100 ? 'history changes' : 'history');
  el.setAttribute('theme-dark', 'auto');
  el.setAttribute('name', o.name ?? 'diagram');
  if (o.ui) el.setAttribute('ui', o.ui);
  if (o.storage) el.storage = o.storage;
  if (o.ctx) el.ctx = o.ctx;
  el.features = { fullscreen: false };
  const adapter = withWorkingCopy(o.history, o.current, t('history.working'));
  const inst = (): DiagramDiff | null => el.instance;
  let closed = false;
  if (o.grow) o.container.style.minHeight = '560px';
  const close = (): void => {
    if (closed) return;
    closed = true;
    el.remove();
    if (o.grow) o.container.style.removeProperty('min-height');
    o.container.focus({ preventScroll: true });
    o.onClose();
  };
  const shown = (p: { head: string | null; viewing: string | null }): string | null => p.viewing ?? p.head;
  const restore = async (): Promise<void> => {
    const pair = inst()?.pair;
    const id = pair ? shown(pair) : null;
    if (!id || id === WORKING_COPY || !o.onRestore) return;
    const source = await adapter.load(id);
    const info = (await adapter.list()).versions.find((v) => v.id === id) ?? { id };
    close();
    o.onRestore(source, info);
  };
  const actions: DiffAction[] = [
    ...(o.onRestore ? [{ id: 'restore', label: t('history.restore'), title: t('history.restoreTip'), enabled: (p: { head: string | null; viewing: string | null }) => { const id = shown(p); return !!id && id !== WORKING_COPY; }, run: () => void restore() }] : []),
    { id: 'back', label: t('history.back'), title: t('history.backTip'), primary: true, run: close },
  ];
  el.actions = actions;
  el.history = adapter;
  // the view owns the keyboard while it is open: nothing reaches the editor's shortcuts underneath; Esc closes it
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !ev.defaultPrevented) close();
    ev.stopPropagation();
  });
  el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  o.container.append(el);
  queueMicrotask(() => (el.shadowRoot?.querySelector('.root') as HTMLElement | null)?.focus({ preventScroll: true }));
  return { diff: el, close };
}
