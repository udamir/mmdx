// Left panel (A.1 rows 2–6, 8): Mermaid code and Metadata tabs, the code filter (`%% - N hidden` folding, edits in
// the filtered view written into the full file), live per-line metadata validation, the problems list with fixes,
// gutter markers, the canvas issue bar and `gotoCodeLine` / `gotoMetaLine`. Ported from prototype/app.js
// (~85–237, ~1809–1875, ~2697–2730, ~4307–4449) and index.html `#leftPane`.
import { checkMetaLine, metaToLines, splitSource } from '../../../core/meta/index.js';
import { fixIdClash } from '../../../core/ops/meta-ops.js';
import { remapSequenceMeta } from '../../../core/ops/remap.js';
import { flowPresets } from '../../../core/render/flowchart.js';
import type { Diagnostic } from '../../../core/types.js';
import { CODE_EDITOR_CSS, createCodeEditor, highlightMetaLine, type CodeEditor } from '../../../ui/code-editor.js';
import { h, icon } from '../../../ui/h.js';
import { ICONS } from '../../../ui/icons.js';
import { effect } from '../../../ui/signal.js';
import type { EditorCore } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { attachResizer, setPanel } from '../chrome/panes.js';
import { applyDoc, buildSegments, filterItems, filterLines, mergeFilteredView, viewOf, type Segment } from './util.js';

/** One problem of the code or the metadata (1-based line, null = no line). */
export interface Issue {
  line: number | null;
  msg: string;
  meta?: boolean;
  fix?: { label: string; run: () => void };
}

const blankCode = (code: string): boolean => !code.split('\n').some((l) => l.trim() && !l.trim().startsWith('%%'));

/** Problems of the Mermaid code (parser, render and theme diagnostics, unknown classes) for the problems list. */
export function codeIssues(core: EditorCore): Issue[] {
  const M = core.model, code = core.code;
  if (!M.type && blankCode(code)) return [];
  const out: Issue[] = [];
  const t = core.i18n.t;
  const diags: Diagnostic[] = core.result.diagnostics.filter((d) => d.source !== 'meta' && d.severity !== 'info');
  for (const d of diags) {
    const it: Issue = { line: d.range ? d.range.line + 1 : null, msg: d.message };
    if (d.code === 'flow.id-clash' && M.type === 'flowchart') {
      const id = String(d.params?.['id'] ?? ''), nid = String(d.params?.['newId'] ?? '');
      it.fix = {
        label: t('problems.fixRename', { id, newId: nid }),
        run: () => {
          const res = fixIdClash(core.code, core.meta, M, id);
          if (applyDoc(core, t('problems.fixLabel'), res, res.selection ?? null)) core.toast(t('problems.renamed', { id: nid }));
        },
      };
    } else if (d.fix) {
      const fix = d.fix;
      it.fix = { label: fix.title, run: () => void core.applyCode({ code: fix.apply(core.code) }, fix.title) };
    }
    out.push(it);
  }
  if (!M.type) {
    // unsupported diagram: point at the first meaningful line
    const L = code.split('\n');
    const i = L.findIndex((l) => l.trim() && !l.trim().startsWith('%%') && l.trim() !== '---');
    for (const it of out) if (it.line == null) it.line = i < 0 ? 1 : i + 1;
  }
  if (M.type === 'flowchart' && M.undefinedClasses.length) {
    // a class is fine when it names a classDef or a node / subgraph preset
    const P = flowPresets(core.result.theme, core.meta);
    for (const { cls, line } of M.undefinedClasses)
      if (!Object.hasOwn(P.node, cls) && !Object.hasOwn(P.group, cls)) out.push({ line: line + 1, msg: t('problems.undefinedClass', { cls }) });
  }
  out.sort((a, b) => (a.line ?? 1e9) - (b.line ?? 1e9));
  return out;
}

const marksOf = (list: readonly Issue[]): Map<number, string[]> => {
  const marks = new Map<number, string[]>();
  for (const it of list) if (it.line != null) (marks.get(it.line) ?? marks.set(it.line, []).get(it.line)!).push(it.msg);
  return marks;
};

export const CODE_PANEL_CSS = /* css */ `
${CODE_EDITOR_CSS}
.pane.left .tabs { display: flex; border-bottom: 1px solid var(--line); flex-shrink: 0; border-radius: 14px 14px 0 0; }
.pane.left .tabs [role=tab] { border: 0; border-radius: 0; padding: 9px 12px; color: var(--muted); border-bottom: 2px solid transparent; background: none; }
.pane.left .tabs [role=tab][aria-selected=true] { color: var(--ink); border-bottom-color: var(--accent); font-weight: 600; }
.pane.left .tabs-spacer { flex: 1; }
.pane .collapse-btn { border: 0; background: none; padding: 4px 12px; color: var(--muted); font-size: 18px; line-height: 1; }
.pane .collapse-btn:hover { color: var(--accent); }
.tab-body { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 8px; gap: 6px; }
.tab-body[hidden] { display: none !important; }
.code-search { display: flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 8px; padding: 0 6px 0 9px; background: var(--surface); color: var(--muted); flex-shrink: 0; }
.code-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-2); color: var(--accent); }
.code-search input { flex: 1; min-width: 0; border: 0 !important; outline: 0; padding: 7px 0; font: 12.5px var(--ds-mono); background: none; color: var(--ink); box-shadow: none !important; }
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
.pb-ln { flex-shrink: 0; color: var(--muted); font-family: var(--ds-mono); font-size: 11px; margin-top: 1px; }
.pb-tag { flex-shrink: 0; padding: 0 6px; border-radius: 4px; background: var(--surface-2); color: var(--muted); font-size: 10.5px; line-height: 17px; }
.pb-msg { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.pb-fix { display: block; margin: 2px 0 4px 30px; padding: 2px 10px; font-size: 12px; }
.issue-bar { position: absolute; top: 14px; left: calc(var(--inset-l, 0px) + 72px); right: 300px; width: fit-content; max-width: 620px; margin: 0 auto; z-index: 6; display: flex; align-items: center; gap: 9px;
  padding: 6px 6px 6px 10px; border: 1px solid var(--danger); border-radius: 10px; background: var(--danger-bg); color: var(--ink); font-size: 12.5px; box-shadow: 0 4px 16px rgba(0,0,0,.12); cursor: pointer; text-align: left; }
.issue-bar[hidden] { display: none; }
.issue-bar:hover { filter: brightness(.98); box-shadow: 0 6px 20px rgba(0,0,0,.16); }
.ib-ic { flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: var(--danger); color: #fff; font-size: 11px; font-weight: 800; }
.ib-text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ib-text b { color: var(--danger); }
.ib-open { flex-shrink: 0; padding: 3px 10px; border-radius: 7px; background: var(--danger); color: #fff; font-weight: 600; font-size: 12px; }
.ed.resizing-panes, .ed.resizing-panes * { cursor: col-resize !important; user-select: none !important; }
`;

export const codePanelModule: EditorModule = {
  id: 'code-panel',
  css: CODE_PANEL_CSS,
  enabled: (f) => f.codePanel,
  install(core) {
    const t = core.i18n.t;
    const store = core.store;
    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const cleanups: (() => void)[] = [];
    const metaTab = core.features.metadataTab;

    // ---- DOM
    const uid = Math.random().toString(36).slice(2, 8);
    const tab = (id: 'code' | 'meta', label: string): HTMLButtonElement =>
      h('button', { type: 'button', role: 'tab', id: `ds-tab-${id}-${uid}`, 'aria-controls': `ds-panel-${id}-${uid}`, 'aria-selected': 'false', tabindex: '-1', dataset: { tab: id } }, label);
    const tabCode = tab('code', t('code.tabMermaid'));
    const tabMeta = metaTab ? tab('meta', t('code.tabMetadata')) : null;
    const closeBtn = h('button', { type: 'button', class: 'collapse-btn', title: t('code.close'), 'aria-label': t('code.close') }, '×');
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('code.panel') }, tabCode, tabMeta, h('span', { class: 'tabs-spacer' }), closeBtn);

    const search = (placeholder: string, label: string): { box: HTMLElement; input: HTMLInputElement; count: HTMLElement; clear: HTMLButtonElement } => {
      const input = h('input', { type: 'search', placeholder, autocomplete: 'off', 'aria-label': label });
      input.spellcheck = false;
      const count = h('span', { class: 'count', 'aria-live': 'polite' });
      const clear = h('button', { type: 'button', title: t('code.clearFilter'), 'aria-label': t('code.clearFilter') }, '×');
      const box = h('div', { class: 'code-search' }, icon(ICONS.search, 15), input, count, clear);
      return { box, input, count, clear };
    };
    const filterBar = (): { bar: HTMLElement; info: HTMLElement; all: HTMLButtonElement } => {
      const info = h('span');
      const all = h('button', { type: 'button', class: 'link' }, t('code.showAll'));
      const bar = h('div', { class: 'code-filter-bar', hidden: true }, info, all);
      return { bar, info, all };
    };

    const tipHost = (): HTMLElement => core.dom.root;
    const cs = search(t('code.filterPlaceholder'), t('code.filterLabel'));
    const cf = filterBar();
    const codeEd: CodeEditor = createCodeEditor({ lineNumbers: true, label: t('code.editorLabel'), tipHost, onInput: () => onCodeInput() });
    const codeBody = h('div', { class: 'tab-body', role: 'tabpanel', id: `ds-panel-code-${uid}`, 'aria-labelledby': tabCode.id, dataset: { body: 'code' } }, cs.box, cf.bar, codeEd.el);

    const ms = search(t('code.metaFilterPlaceholder'), t('code.metaFilterLabel'));
    const mf = filterBar();
    const metaEd: CodeEditor | null = metaTab ? createCodeEditor({ lineNumbers: true, label: t('code.metaEditorLabel'), highlightLine: highlightMetaLine, tipHost, onInput: () => onMetaInput() }) : null;
    const metaBody = metaEd && tabMeta
      ? h('div', { class: 'tab-body', role: 'tabpanel', id: `ds-panel-meta-${uid}`, 'aria-labelledby': tabMeta.id, hidden: true, dataset: { body: 'meta' } }, ms.box, mf.bar, metaEd.el)
      : null;

    const problems = h('div', { class: 'problems', role: 'region', 'aria-label': t('problems.title') });
    const pane = h('section', { class: 'pane left edit-only', part: 'panel', 'aria-label': t('code.panel') }, tabs, codeBody, metaBody, problems);
    core.dom.root.append(pane);
    cleanups.push(attachResizer(core, pane, 'left'));

    const issueBar = h('button', { type: 'button', class: 'issue-bar edit-only', hidden: true });
    core.dom.wrap.append(issueBar);

    // ---- tabs (ARIA tabs pattern)
    let current: 'code' | 'meta' = 'code';
    const showTab = (which: 'code' | 'meta'): void => {
      if (which === 'meta' && !metaBody) which = 'code';
      current = which;
      for (const [b, body, id] of [[tabCode, codeBody, 'code'], [tabMeta, metaBody, 'meta']] as const) {
        if (!b || !body) continue;
        const on = id === which;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        body.hidden = !on;
      }
      if (which === 'meta') writeMetaText(true);
    };
    tabs.addEventListener('click', (ev) => {
      const b = (ev.target as Element).closest<HTMLElement>('[role=tab]');
      if (b) showTab(b.dataset['tab'] === 'meta' ? 'meta' : 'code');
    }, sig);
    tabs.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight' && ev.key !== 'Home' && ev.key !== 'End') return;
      if (!(ev.target as Element).matches('[role=tab]')) return;
      ev.preventDefault();
      const list = [tabCode, tabMeta].filter((x): x is HTMLButtonElement => !!x);
      const i = list.indexOf(ev.target as HTMLButtonElement);
      const next = ev.key === 'Home' ? list[0] : ev.key === 'End' ? list[list.length - 1] : list[(i + (ev.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
      if (next) {
        showTab(next.dataset['tab'] === 'meta' ? 'meta' : 'code');
        next.focus();
      }
    }, sig);
    showTab('code');
    closeBtn.addEventListener('click', () => setPanel(core, 'code', false), sig);

    // ---- problems
    let codeIssueList: Issue[] = [];
    let metaIssueList: Issue[] = [];
    let filterBroken = false;
    let problemsOpen = true;
    const allIssues = (): Issue[] => [...codeIssueList, ...metaIssueList.map((x) => ({ ...x, meta: true }))];

    const renderProblems = (): void => {
      codeEd.setMarkers(marksOf(codeIssueList));
      metaEd?.setMarkers(marksOf(metaIssueList));
      const issues = allIssues();
      core.issueCount.set(issues.length);
      syncIssueBar();
      const kids: HTMLElement[] = [];
      if (filterBroken) kids.push(h('div', { class: 'err filter-err', role: 'alert' }, `⚠ ${t('code.keepHidden')}`));
      if (issues.length) {
        const head = h('button', { type: 'button', class: 'pb-head', 'aria-expanded': String(problemsOpen), title: problemsOpen ? t('problems.hide') : t('problems.show') },
          h('span', null, t('problems.title')), h('span', { class: 'pb-count' }, String(issues.length)), h('span', { class: 'pb-spacer' }), icon('M7 14l5-5 5 5', 14));
        head.lastElementChild?.setAttribute('class', 'ds-icon pb-chev');
        head.addEventListener('click', () => {
          problemsOpen = !problemsOpen;
          renderProblems();
        });
        kids.push(head);
        if (problemsOpen) {
          const list = h('div', { class: 'pb-list', role: 'list' });
          for (const it of issues.slice(0, 100)) {
            const item = h('button', { type: 'button', class: 'pb-item', disabled: it.line == null },
              h('span', { class: 'pb-line1' },
                h('span', { class: 'pb-ic', 'aria-hidden': 'true' }, '!'),
                it.line != null ? h('span', { class: 'pb-ln' }, String(it.line)) : null,
                it.meta ? h('span', { class: 'pb-tag' }, t('problems.metaTag')) : null,
                h('span', { class: 'pb-msg' }, it.msg)));
            if (it.line != null) {
              const line = it.line;
              item.title = it.meta ? t('problems.gotoMeta', { line }) : t('problems.goto', { line });
              item.addEventListener('click', () => (it.meta ? gotoMetaLine(line) : gotoCodeLine(line)));
            }
            const row = h('div', { class: 'pb-row', role: 'listitem' }, item);
            if (it.fix) {
              const fix = it.fix;
              row.append(h('button', { type: 'button', class: 'pb-fix', onclick: () => fix.run() }, t('problems.fix', { label: fix.label })));
            }
            list.append(row);
          }
          kids.push(list);
        }
      }
      problems.replaceChildren(...kids);
    };

    // outside the code panel: a bar on the canvas (while the panel is closed); the Code tool shows a badge
    const syncIssueBar = (): void => {
      const issues = allIssues();
      const n = issues.length;
      issueBar.hidden = !n || core.panels.peek().code;
      if (!n) return;
      const first = issues[0]!;
      const where = codeIssueList.length && metaIssueList.length ? t('problems.inBoth') : codeIssueList.length ? t('problems.inCode') : t('problems.inMeta');
      const text = h('span', { class: 'ib-text' }, h('b', null, t(n === 1 ? 'problems.count1' : 'problems.countN', { n })), ` ${where}`,
        first.line != null ? ` — ${t('problems.lineN', { line: first.line })}: ${first.msg}` : `: ${first.msg}`);
      issueBar.replaceChildren(h('span', { class: 'ib-ic', 'aria-hidden': 'true' }, '!'), text, h('span', { class: 'ib-open' }, t('problems.openCode')));
      issueBar.title = t('problems.openFirst');
    };
    issueBar.addEventListener('click', () => {
      const issues = allIssues();
      const it = issues.find((x) => x.line != null);
      if (it?.line != null) (it.meta ? gotoMetaLine : gotoCodeLine)(it.line);
      else {
        setPanel(core, 'code', true);
        showTab(issues[0]?.meta ? 'meta' : 'code');
      }
    }, sig);
    cleanups.push(effect(() => {
      core.panels();
      syncIssueBar();
    }));

    // ---- code editor ⇄ store
    let filter: { query: string; segments: Segment[] } | null = null;
    let shownCode: string | null = null; // the full code the editor represents
    let codeTimer: ReturnType<typeof setTimeout> | undefined;

    /** Renders the editor: the full file, or the filtered view for the current query. */
    const syncEditor = (): void => {
      filterBroken = false;
      const code = core.code;
      shownCode = code;
      const q = cs.input.value;
      core.codeFilter.set(q.trim());
      const lines = q.trim() ? filterLines(code, core.model, q) : null;
      cs.count.textContent = lines ? t(lines.length === 1 ? 'code.lines1' : 'code.linesN', { n: lines.length }) : '';
      if (!lines) {
        filter = null;
        codeEd.readOnly = false;
        cf.bar.hidden = true;
        if (codeEd.value !== code) codeEd.value = code;
        return;
      }
      const L = code.split('\n');
      const segments = buildSegments(lines, L.length);
      filter = { query: q, segments };
      codeEd.readOnly = !lines.length;
      cf.bar.hidden = false;
      cf.info.textContent = lines.length ? t('code.showing', { n: lines.length, total: L.length }) : t('code.noMatch');
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
      if (!core.emit('ds-op', { type: 'code.replace', code: raw }, true)) {
        syncEditor();
        return;
      }
      const oldModel = core.model, oldCode = core.code;
      store.begin();
      try {
        store.setCode(raw, t('history.editCode'));
        const model = core.model;
        if (model.type === 'sequence' && oldModel.type === 'sequence') store.meta.set(remapSequenceMeta(core.meta, oldModel, oldCode, model, core.code));
        const sel = core.selection();
        const keep = sel.filter((r) => store.exists(r));
        if (keep.length !== sel.length) core.select(keep);
      } finally {
        store.commit(t('history.editCode'), 'code');
      }
      // %%@ lines pasted into the code moved into the metadata: show the code without them
      if (core.code !== raw) syncEditor();
      else shownCode = core.code;
      const typeChanged = oldModel.type !== core.model.type;
      core.afterChange();
      if (typeChanged) core.viewport.setBounds(core.result.result.bounds, { fit: true });
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
      const items = filterItems(core.model, cs.input.value);
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
    cs.input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        syncEditor();
        selectFromFilter();
      }, 150);
    }, sig);
    cs.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && cs.input.value) {
        ev.preventDefault();
        ev.stopPropagation();
        cs.input.value = '';
        syncEditor();
        selectFromFilter();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        codeEd.focus();
      }
    }, sig);
    const clearCodeFilter = (): void => {
      cs.input.value = '';
      syncEditor();
      selectFromFilter();
    };
    cs.clear.addEventListener('click', clearCodeFilter, sig);
    cf.all.addEventListener('click', clearCodeFilter, sig);

    const searchFromSelection = (): void => {
      if (core.dom.shadow.activeElement === cs.input) return;
      const ids = core.mode.peek() === 'edit' ? core.selection().map((x) => x.id) : [];
      const key = ids.join(' ');
      if (key === selKey) return;
      selKey = key;
      if (cs.input.value === key) return;
      cs.input.value = key;
      if (codeTimer !== undefined || applying) return; // typing: the filter follows once the code is applied
      syncEditor();
    };
    cleanups.push(core.on('selection', searchFromSelection));

    // ---- metadata editor: %%@ lines, the same filter, per-line checks
    let metaText = '';
    let metaFilter: Segment[] | null = null;
    let metaBroken = false;
    let metaTimer: ReturnType<typeof setTimeout> | undefined;
    let metaKey = '';

    /** Rebuilds the metadata text from the store; invalid lines (not in the metadata) are kept at the end. */
    const writeMetaText = (force = false): void => {
      if (!force && metaEd && core.dom.shadow.activeElement === metaEd.textarea) return;
      const lines = metaToLines(core.meta);
      const known = new Set(lines);
      const bad = metaText.split('\n').filter((l) => !known.has(l) && checkMetaLine(l) && 'error' in checkMetaLine(l)!);
      const next = [...lines, ...bad].join('\n');
      if (next === metaText && !force) return;
      metaText = next;
      syncMetaEditor();
    };
    const syncMetaEditor = (): void => {
      if (!metaEd) {
        checkMeta();
        return;
      }
      const L = metaText.split('\n');
      const tokens = ms.input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const lines = tokens.length ? L.map((l, i) => (tokens.some((tk) => l.toLowerCase().includes(tk)) ? i : -1)).filter((i) => i >= 0) : null;
      ms.count.textContent = lines ? t(lines.length === 1 ? 'code.lines1' : 'code.linesN', { n: lines.length }) : '';
      if (!lines) {
        metaFilter = null;
        metaEd.readOnly = false;
        mf.bar.hidden = true;
        if (metaEd.value !== metaText) metaEd.value = metaText;
      } else {
        const segments = buildSegments(lines, L.length);
        metaFilter = segments;
        metaEd.readOnly = !lines.length;
        mf.bar.hidden = false;
        mf.info.textContent = lines.length ? t('code.metaShowing', { n: lines.length, total: L.length }) : t('code.noMatch');
        const view = viewOf(L, segments);
        if (metaEd.value !== view) metaEd.value = view;
      }
      checkMeta();
    };
    /** Editor text → metaText (false when the hidden-line markers of a filtered view were damaged). */
    const readMetaEditor = (): boolean => {
      if (!metaEd) return true;
      if (!metaFilter) {
        metaText = metaEd.value;
        return true;
      }
      const r = mergeFilteredView(metaEd.value, metaFilter, metaText.split('\n'));
      if (!r) return false;
      metaFilter = r.segments;
      metaText = r.text;
      return true;
    };
    const checkMeta = (): void => {
      const out: Issue[] = [];
      if (metaBroken) out.push({ line: null, msg: t('code.keepHiddenMeta') });
      metaText.split('\n').forEach((l, i) => {
        const r = checkMetaLine(l);
        if (r && 'error' in r) out.push({ line: i + 1, msg: r.error });
      });
      metaIssueList = out;
      renderProblems();
    };
    const onMetaInput = (): void => {
      clearTimeout(metaTimer);
      metaTimer = setTimeout(applyMetaInput, 250);
    };
    const applyMetaInput = (): void => {
      metaTimer = undefined;
      metaBroken = !readMetaEditor();
      if (metaBroken) {
        checkMeta();
        return;
      }
      // applied as you type, like the Mermaid code; invalid lines are skipped (and flagged)
      const next = splitSource(metaText).doc.meta;
      checkMeta();
      if (JSON.stringify(next) === JSON.stringify(core.meta)) return;
      core.change(t('history.editMeta'), () => store.meta.set(next));
    };
    metaEd?.textarea.addEventListener('blur', () => {
      if (metaTimer !== undefined) {
        clearTimeout(metaTimer);
        applyMetaInput();
      }
      writeMetaText();
    }, sig);
    const resyncMetaFilter = (): void => {
      if (readMetaEditor()) syncMetaEditor();
    };
    ms.input.addEventListener('input', resyncMetaFilter, sig);
    ms.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && ms.input.value) {
        ev.preventDefault();
        ev.stopPropagation();
        ms.input.value = '';
        resyncMetaFilter();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        metaEd?.focus();
      }
    }, sig);
    const clearMetaFilter = (): void => {
      ms.input.value = '';
      resyncMetaFilter();
    };
    ms.clear.addEventListener('click', clearMetaFilter, sig);
    mf.all.addEventListener('click', clearMetaFilter, sig);

    // ---- goto line
    const openPanel = (which: 'code' | 'meta'): void => {
      if (!core.panels.peek().code) setPanel(core, 'code', true);
      showTab(which);
    };
    const gotoCodeLine = (n: number): void => {
      openPanel('code');
      if (!codeEd.gotoLine(n)) {
        cs.input.value = '';
        syncEditor();
        codeEd.gotoLine(n);
      }
    };
    const gotoMetaLine = (n: number): void => {
      if (!metaEd) return;
      openPanel('meta');
      if (!metaEd.gotoLine(n)) {
        ms.input.value = '';
        syncMetaEditor();
        metaEd.gotoLine(n);
      }
    };
    cleanups.push(core.provide('gotoCodeLine', gotoCodeLine), core.provide('gotoMetaLine', gotoMetaLine));

    // ---- follow the document: code (undo, ops, loads), metadata and problems after each draw
    let revSeen = -1;
    let themeSeen = '';
    const onDraw = (): void => {
      if (codeTimer === undefined && core.code !== shownCode) syncEditor();
      const rev = store.revision.peek(), theme = core.result.themeId;
      if (rev === revSeen && theme === themeSeen) return;
      revSeen = rev;
      themeSeen = theme;
      codeIssueList = codeIssues(core);
      if (metaTimer === undefined) {
        const lines = metaToLines(core.meta).join('\n');
        if (lines !== metaKey) {
          metaKey = lines;
          writeMetaText();
        }
      }
      renderProblems();
    };
    cleanups.push(core.on('draw', onDraw));
    syncEditor();
    writeMetaText(true);
    onDraw();

    return () => {
      clearTimeout(codeTimer);
      clearTimeout(metaTimer);
      clearTimeout(searchTimer);
      ac.abort();
      for (const c of cleanups) c();
      codeEd.destroy();
      metaEd?.destroy();
      pane.remove();
      issueBar.remove();
      core.issueCount.set(0);
    };
  },
};
