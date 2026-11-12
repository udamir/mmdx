// Left panel (A.1 rows 2–6, 8): Mermaid code and Metadata tabs, the code filter (`%% - N hidden` folding, edits in
// the filtered view written into the full file), live per-line metadata validation, the problems list with fixes,
// gutter markers, the canvas issue bar (a Pill at the top centre while the panel is closed, loaded on first use) and
// `gotoCodeLine`. A SidePanel with a Tabs head in the left stack (chrome/panes.ts); the editors are ui/code-editor.
// Ported from prototype/app.js (~85–237, ~1809–1875, ~2697–2730, ~4307–4449) and index.html `#leftPane`.
import { createSidePanel } from '../../../ui/blocks/side-panel.js';
import { createTabs } from '../../../ui/blocks/tabs.js';
import { CODE_EDITOR_CSS, highlightMetaLine } from '../../../ui/diagram/code-editor.js';
import { h } from '../../../ui/kit/h.js';
import { signal } from '../../../reactive/signal.js';
import type { EditorModule } from '../../module.js';
import { buildSegments, filterItems, filterLines, mergeFilteredView, viewOf, type Segment } from '../../ops/code-filter.js';
import { codeIssues, createIssuePill, createProblemsList, marksOf, type Issue } from './code-problems.js';
import { createFilteredEditor } from './filtered-editor.js';
import { MetaSync } from './meta-sync.js';
import { metaToLines } from '../../../core/meta/index.js';

export type { Issue };

export const CODE_PANEL_CSS = /* css */ `
${CODE_EDITOR_CSS}
.code-body { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.tab-body { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 8px; gap: 6px; }
.tab-body[hidden] { display: none !important; }
.code-search { display: flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 8px; padding: 0 6px 0 9px; background: var(--surface); color: var(--muted); flex-shrink: 0; }
.code-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-2); color: var(--accent); }
.code-search input { flex: 1; min-width: 0; border: 0 !important; outline: 0; padding: 7px 0; font: 12.5px var(--mmdx-mono); background: none; color: var(--ink); box-shadow: none !important; }
.code-search input::-webkit-search-cancel-button { display: none; }
.code-search .count { font-size: 11px; white-space: nowrap; }
.code-search button { border: 0; background: none; color: var(--faint); padding: 0 2px; font-size: 16px; }
.code-search button:hover { color: var(--danger); }
.code-filter-bar { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: var(--warn-ink); background: var(--warn-bg); border: 1px solid var(--warn-line); border-radius: 6px; padding: 3px 8px; flex-shrink: 0; }
.code-filter-bar[hidden] { display: none; }
button.link { border: 0; background: none; color: var(--accent); padding: 0; font-size: 12px; }
.problems { flex-shrink: 0; display: flex; flex-direction: column; max-height: 34%; border-top: 1px solid var(--line); font-size: 12px; background: var(--panel); }
.problems:empty { display: none; }
.problems > .err { color: var(--danger); padding: 6px 10px; }
.pb-head { display: flex; align-items: center; gap: 7px; width: 100%; border: 0; border-bottom: 1px solid transparent; border-radius: 0; background: var(--surface-2); padding: 7px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-2); text-align: left; flex-shrink: 0; cursor: pointer; }
.pb-head[aria-expanded=true] { border-bottom-color: var(--line); }
.pb-head:hover { color: var(--ink); }
.pb-spacer { flex: 1; }
.pb-count { min-width: 18px; padding: 1px 6px; border-radius: 9px; background: var(--danger); color: #fff; font-size: 10px; font-weight: 700; text-align: center; letter-spacing: 0; }
.pb-chev { flex-shrink: 0; width: 22px; height: 22px; padding: 4px; border-radius: 6px; color: var(--muted); transition: transform .15s ease, background .15s; transform: rotate(180deg); }
.pb-head[aria-expanded=true] .pb-chev { transform: rotate(0deg); }
.pb-list { overflow: auto; padding: 4px; min-height: 0; }
.pb-item { display: flex; flex-direction: column; gap: 3px; width: 100%; border: 0; border-radius: 6px; background: transparent; padding: 5px 8px; text-align: left; color: var(--ink); font-size: 12px; line-height: 1.4; cursor: pointer; }
.pb-item:hover:not(:disabled) { background: var(--surface-2); }
.pb-item:disabled { cursor: default; opacity: 1; }
.pb-line1 { display: flex; align-items: flex-start; gap: 7px; min-width: 0; }
.pb-ic { flex-shrink: 0; width: 15px; height: 15px; margin-top: 1px; border-radius: 50%; display: grid; place-items: center; font-size: 9.5px; font-weight: 800; color: #fff; background: var(--danger); }
.pb-ln { flex-shrink: 0; color: var(--muted); font-family: var(--mmdx-mono); font-size: 11px; margin-top: 1px; }
.pb-tag { flex-shrink: 0; padding: 0 6px; border-radius: 4px; background: var(--surface-2); color: var(--muted); font-size: 10.5px; line-height: 17px; }
.pb-msg { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.pb-fix { display: block; margin: 2px 0 4px 30px; padding: 2px 10px; font-size: 12px; }
.mmdx-pill.issue { border-color: var(--mmdx-danger); background: var(--mmdx-danger-bg); max-width: min(620px, 100%); font-size: 12.5px; }
.mmdx-pill.issue .mmdx-pill-text::before { content: '!'; display: inline-grid; place-items: center; width: 18px; height: 18px; margin-right: 9px; border-radius: 50%;
  background: var(--mmdx-danger); color: #fff; font-size: 11px; font-weight: 800; }
.mmdx-pill.issue .mmdx-pill-btn, .mmdx-pill.issue .mmdx-pill-btn:hover:not(:disabled) { background: var(--mmdx-danger); color: #fff; font-weight: 600; }
`;

export const codePanelModule: EditorModule = {
  id: 'code-panel',
  css: [CODE_PANEL_CSS],
  enabled: ({ features: f }) => f.codePanel,
  install(scope) {
    const core = scope.core;
    const t = core.i18n.t;
    const store = core.store;
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const metaTab = core.features.metadataTab;

    // ---- DOM
    const uid = Math.random().toString(36).slice(2, 8);
    const tabId = (id: 'code' | 'meta'): string => `mmdx-tab-${id}-${uid}`;
    const bodyId = (id: 'code' | 'meta'): string => `mmdx-panel-${id}-${uid}`;
    const current = signal<'code' | 'meta'>('code');
    const tabs = createTabs<'code' | 'meta'>({
      label: t('code.panel'), value: current, onChange: (v) => showTab(v),
      tabs: [{ value: 'code', label: t('code.tabMermaid'), id: tabId('code'), controls: bodyId('code') }, ...(metaTab ? [{ value: 'meta' as const, label: t('code.tabMetadata'), id: tabId('meta'), controls: bodyId('meta') }] : [])],
    });
    const tipHost = (): HTMLElement => core.eventRoot;
    const codeF = createFilteredEditor({
      t, id: bodyId('code'), labelledBy: tabId('code'), body: 'code', placeholder: t('code.filterPlaceholder'), label: t('code.filterLabel'),
      editor: { lineNumbers: true, label: t('code.editorLabel'), tipHost, onInput: () => onCodeInput() }, onClear: () => clearCodeFilter(), signal: ac.signal,
    });
    const codeEd = codeF.ed;
    const metaF = metaTab
      ? createFilteredEditor({
        t, id: bodyId('meta'), labelledBy: tabId('meta'), body: 'meta', hidden: true, placeholder: t('code.metaFilterPlaceholder'), label: t('code.metaFilterLabel'),
        editor: { lineNumbers: true, label: t('code.metaEditorLabel'), highlightLine: highlightMetaLine, tipHost, onInput: () => meta.input() }, onClear: () => meta.resyncFilter(), signal: ac.signal,
      })
      : null;
    const metaEd = metaF?.ed ?? null;
    const meta = new MetaSync(core, metaF, () => renderProblems());
    const problemsEl = h('div', { class: 'problems', role: 'region', 'aria-label': t('problems.title') });
    const panel = createSidePanel({
      side: 'left', head: tabs.el, label: t('code.panel'), class: 'code-edit', closeLabel: t('code.close'), closeKeys: 'c',
      onClose: () => void core.run('setPanel', 'code', false), body: h('div', { class: 'code-body' }, codeF.body, metaF?.body, problemsEl), t,
    });
    scope.contribute(core.panelItems, { id: 'code', side: 'left', order: 10, el: panel.el, visible: () => core.mode() === 'edit' });

    // ---- tabs
    const showTab = (which: 'code' | 'meta'): void => {
      if (which === 'meta' && !metaF) which = 'code';
      current.set(which);
      codeF.body.hidden = which !== 'code';
      if (metaF) metaF.body.hidden = which !== 'meta';
      if (which === 'meta') meta.write(true);
    };
    showTab('code');

    // ---- problems: the list in the panel, the pill outside it (while it is closed); the Code tool shows a badge
    let codeIssueList: Issue[] = [];
    let filterBroken = false;
    const allIssues = (): Issue[] => [...codeIssueList, ...meta.issues.map((x) => ({ ...x, meta: true }))];
    const list = createProblemsList(problemsEl, t, (it, line) => (it.meta ? gotoMetaLine(line) : gotoCodeLine(line)));
    const pill = createIssuePill(scope, t, () => openFirstIssue());
    const syncIssueBar = (): void => {
      const where = codeIssueList.length && meta.issues.length ? t('problems.inBoth') : codeIssueList.length ? t('problems.inCode') : t('problems.inMeta');
      pill.sync(allIssues(), where);
    };
    // a draw gathers the code's and the metadata's issues, then shows them once (P10: twice per live edit)
    let holdProblems = false;
    const renderProblems = (): void => {
      if (holdProblems) return;
      codeEd.setMarkers(marksOf(codeIssueList));
      metaEd?.setMarkers(marksOf(meta.issues));
      const issues = allIssues();
      core.setIssueCount(issues.length);
      syncIssueBar();
      list.render(issues, filterBroken);
    };
    const openFirstIssue = (): void => {
      const issues = allIssues();
      const it = issues.find((x) => x.line != null);
      if (it?.line != null) (it.meta ? gotoMetaLine : gotoCodeLine)(it.line);
      else {
        core.run('setPanel', 'code', true);
        showTab(issues[0]?.meta ? 'meta' : 'code');
      }
    };
    scope.effect(() => {
      core.panels();
      syncIssueBar();
    });

    // ---- code editor ⇄ store
    let filter: { query: string; segments: Segment[] } | null = null;
    let shownCode: string | null = null; // the full code the editor represents
    let codeTimer: ReturnType<typeof setTimeout> | undefined;

    /** Renders the editor: the full file, or the filtered view for the current query. */
    const syncEditor = (): void => {
      filterBroken = false;
      const code = core.code;
      shownCode = code;
      const q = codeF.input.value;
      core.setCodeFilter(q.trim());
      const lines = q.trim() ? filterLines(code, core.model, q) : null;
      codeF.count.textContent = lines ? t(lines.length === 1 ? 'code.lines1' : 'code.linesN', { n: lines.length }) : '';
      // an old version (History) is read-only: its code and metadata can be read, filtered and copied
      const version = !!core.version.peek();
      if (metaEd) metaEd.readOnly = version;
      if (!lines) {
        filter = null;
        codeEd.readOnly = version;
        codeF.bar.hidden = true;
        if (codeEd.value !== code) codeEd.value = code;
        return;
      }
      const L = code.split('\n');
      const segments = buildSegments(lines, L.length);
      filter = { query: q, segments };
      codeEd.readOnly = !lines.length || version;
      codeF.bar.hidden = false;
      codeF.info.textContent = lines.length ? t('code.showing', { n: lines.length, total: L.length }) : t('code.noMatch');
      const view = viewOf(L, segments);
      if (codeEd.value !== view) codeEd.value = view;
    };

    const onCodeInput = (): void => {
      clearTimeout(codeTimer);
      codeTimer = setTimeout(applyCodeInput, 250);
    };
    const applyCodeInput = (): void => {
      codeTimer = undefined;
      let raw = codeEd.value;
      const wasBroken = filterBroken;
      filterBroken = false;
      if (filter) {
        const r = mergeFilteredView(raw, filter.segments, core.code.split('\n'));
        if (!r) {
          filterBroken = true;
          renderProblems();
          return;
        }
        filter.segments = r.segments;
        raw = r.text;
      }
      if (wasBroken) renderProblems();
      if (raw === core.code) return;
      applying = true;
      try {
        commitCode(raw);
      } finally {
        applying = false;
      }
    };
    let applying = false;
    const commitCode = (raw: string): void => {
      const before = core.model.type;
      if (!core.applyCode({ code: raw }, t('history.editCode'), { type: 'code.replace', reason: 'code' })) {
        syncEditor();
        return;
      }
      // %%@ lines pasted into the code moved into the metadata: show the code without them
      if (core.code !== raw) syncEditor();
      else shownCode = core.code;
      if (before !== core.model.type) core.viewport.setBounds(core.result.result.bounds, { fit: true });
    };
    // apply right away when leaving the editor (no lost keystrokes when clicking elsewhere)
    codeEd.textarea.addEventListener('blur', () => {
      if (codeTimer !== undefined) {
        clearTimeout(codeTimer);
        applyCodeInput();
      }
    }, sig);

    // the search box: selection → ids, typed query → the items it finds selected, multi-token text, Esc / Show all,
    // Enter focuses the code
    /** Ids of the selection last written into the search box (the selection → search sync below). */
    let selKey = '';
    /** The selection the filter made (cleared with the filter; a selection made on the canvas is left alone). */
    let filterSel: string | null = null;
    const keyOf = (items: readonly { kind: string; id: string }[]): string => items.map((x) => `${x.kind}:${x.id}`).join('|');
    const selectFromFilter = (): void => {
      if (core.mode.peek() !== 'edit') return;
      const items = filterItems(core.model, codeF.input.value);
      if (!items) {
        if (filterSel !== null && keyOf(core.selection()) === filterSel) {
          selKey = '';
          core.select([]);
          core.draw();
          core.fire('panels');
        }
        filterSel = null;
        return;
      }
      filterSel = keyOf(items);
      // the selection feeds the search box back (searchFromSelection): the query typed stays
      selKey = items.map((x) => x.id).join(' ');
      core.select(items);
      core.draw();
      core.fire('panels');
    };
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    codeF.input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        syncEditor();
        selectFromFilter();
      }, 150);
    }, sig);
    const clearCodeFilter = (): void => {
      syncEditor();
      selectFromFilter();
    };

    const searchFromSelection = (): void => {
      if (core.shadow.activeElement === codeF.input) return;
      const ids = core.mode.peek() === 'edit' ? core.selection().map((x) => x.id) : [];
      const key = ids.join(' ');
      if (key === selKey) return;
      selKey = key;
      if (codeF.input.value === key) return;
      codeF.input.value = key;
      if (codeTimer !== undefined || applying) return; // typing: the filter follows once the code is applied
      syncEditor();
    };
    scope.on('selection', searchFromSelection);

    // ---- metadata editor
    metaEd?.textarea.addEventListener('blur', () => meta.blur(), sig);
    metaF?.input.addEventListener('input', () => meta.resyncFilter(), sig);

    // ---- goto line
    const openPanel = (which: 'code' | 'meta'): void => {
      if (!core.panels.peek().code) core.run('setPanel', 'code', true);
      showTab(which);
    };
    const gotoCodeLine = (n: number): void => {
      openPanel('code');
      if (!codeEd.gotoLine(n)) {
        codeF.input.value = '';
        syncEditor();
        codeEd.gotoLine(n);
      }
    };
    const gotoMetaLine = (n: number): void => {
      if (!metaF) return;
      openPanel('meta');
      meta.goto(n);
    };
    scope.provide('gotoCodeLine', gotoCodeLine);

    // ---- follow the document: code (undo, ops, loads), metadata and problems after each draw
    let revSeen = '';
    let themeSeen = '';
    const onDraw = (): void => {
      if (codeTimer === undefined && (core.code !== shownCode || codeEd.readOnly !== !!core.version.peek() && !filter)) syncEditor();
      // the document's revision, or the version shown instead of it; and its type, which a kind loaded later turns from
      // unsupported into the type (the same revision: its problems change)
      const rev = `${store.revision.peek()}|${core.version.peek()?.id ?? ''}|${core.model.type ?? ''}`, theme = core.result.themeId;
      if (rev === revSeen && theme === themeSeen) return;
      revSeen = rev;
      themeSeen = theme;
      codeIssueList = codeIssues(core);
      holdProblems = true;
      const lines = !meta.typing ? metaToLines(core.meta).join('\n') : meta.key;
      if (lines !== meta.key) {
        meta.key = lines;
        meta.write();
      }
      holdProblems = false;
      renderProblems();
    };
    scope.on('draw', onDraw);
    syncEditor();
    meta.write(true);
    onDraw();

    return () => {
      clearTimeout(codeTimer);
      clearTimeout(searchTimer);
      meta.destroy();
      ac.abort();
      codeEd.destroy();
      metaEd?.destroy();
      tabs.destroy();
      panel.destroy();
      pill.destroy();
      core.setIssueCount(0);
    };
  },
};
