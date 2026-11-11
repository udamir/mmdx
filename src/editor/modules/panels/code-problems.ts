// The problems of the code panel (A.1 rows 5, 6): the code's and the metadata's issues, the Problems list (folding,
// a click to the line, a fix), the gutter marks, and the issue pill at the top centre while the panel is closed
// (loaded the first time it shows).
import { checkMetaLine } from '../../../core/meta/index.js';
import type { Diagnostic } from '../../../core/types.js';
import type { BlockHandle } from '../../../ui/blocks/block.js';
import type { PillProps } from '../../../ui/blocks/pill.js';
import { h, icon } from '../../../ui/kit/h.js';
import { signal } from '../../../reactive/signal.js';
import type { ModuleScope } from '../../../view/module.js';
import type { EditorCore } from '../../core.js';
import { withEdit } from '../../kinds/registry.js';

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
  const diags: Diagnostic[] = core.result.diagnostics.filter((d) => d.source !== 'meta' && d.severity !== 'info');
  for (const d of diags) {
    const it: Issue = { line: d.range ? d.range.line + 1 : null, msg: d.message };
    const own = withEdit(M, (k, m) => k.fixOf?.(core, m, d));
    if (own) it.fix = own;
    else if (d.fix) {
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
  out.push(...(withEdit(M, (k, m) => k.problems?.(core, m)) ?? []));
  out.sort((a, b) => (a.line ?? 1e9) - (b.line ?? 1e9));
  return out;
}

/** One row of the Problems list: the issue, a click to its line, its fix. */
function problemRow(it: Issue, t: EditorCore['i18n']['t'], goto: (line: number) => void): HTMLElement {
  const item = h('button', { type: 'button', class: 'pb-item', disabled: it.line == null },
    h('span', { class: 'pb-line1' },
      h('span', { class: 'pb-ic', 'aria-hidden': 'true' }, '!'),
      it.line != null ? h('span', { class: 'pb-ln' }, String(it.line)) : null,
      it.meta ? h('span', { class: 'pb-tag' }, t('problems.metaTag')) : null,
      h('span', { class: 'pb-msg' }, it.msg)));
  if (it.line != null) {
    const line = it.line;
    item.title = it.meta ? t('problems.gotoMeta', { line }) : t('problems.goto', { line });
    item.addEventListener('click', () => goto(line));
  }
  const row = h('div', { class: 'pb-row', role: 'listitem' }, item);
  if (it.fix) {
    const fix = it.fix;
    row.append(h('button', { type: 'button', class: 'pb-fix', onclick: () => fix.run() }, t('problems.fix', { label: fix.label })));
  }
  return row;
}

// each metadata line's check, kept while the line is there to read (P10: three per line per pass)
const checked = new Map<string, string | null>();
export function metaError(l: string): string | null {
  let e = checked.get(l);
  if (e === undefined) {
    if (checked.size > 4096) checked.clear();
    const r = checkMetaLine(l);
    checked.set(l, (e = r && 'error' in r ? r.error : null));
  }
  return e;
}

export const marksOf = (list: readonly Issue[]): Map<number, string[]> => {
  const marks = new Map<number, string[]>();
  for (const it of list) if (it.line != null) (marks.get(it.line) ?? marks.set(it.line, []).get(it.line)!).push(it.msg);
  return marks;
};

type T = EditorCore['i18n']['t'];

/** The Problems list: a head with the count (folds the list), the rows (the first 100), the filter's warning. */
export function createProblemsList(el: HTMLElement, t: T, goto: (it: Issue, line: number) => void): { render(issues: readonly Issue[], filterBroken: boolean): void } {
  let open = true;
  const render = (issues: readonly Issue[], filterBroken: boolean): void => {
    const kids: HTMLElement[] = [];
    if (filterBroken) kids.push(h('div', { class: 'err filter-err', role: 'alert' }, `⚠ ${t('code.keepHidden')}`));
    if (issues.length) {
      const head = h('button', { type: 'button', class: 'pb-head', 'aria-expanded': String(open), title: open ? t('problems.hide') : t('problems.show') },
        h('span', null, t('problems.title')), h('span', { class: 'pb-count' }, String(issues.length)), h('span', { class: 'pb-spacer' }), icon('M7 14l5-5 5 5', 14));
      head.lastElementChild?.setAttribute('class', 'mmdx-icon pb-chev');
      head.addEventListener('click', () => {
        open = !open;
        render(issues, filterBroken);
      });
      kids.push(head);
      if (open) {
        const list = h('div', { class: 'pb-list', role: 'list' });
        for (const it of issues.slice(0, 100)) list.append(problemRow(it, t, (line) => goto(it, line)));
        kids.push(list);
      }
    }
    el.replaceChildren(...kids);
  };
  return { render };
}

/** The issue pill at the top centre while the code panel is closed: placed only then, its block loaded on first show. */
export function createIssuePill(scope: ModuleScope<EditorCore>, t: T, onOpen: () => void): { sync(issues: readonly Issue[], where: string): void; destroy(): void } {
  const core = scope.core;
  const text = signal('');
  let pill: BlockHandle<PillProps> | null = null;
  let loading = false, gone = false;
  let unmount: (() => void) | null = null;
  let last: { issues: readonly Issue[]; where: string } = { issues: [], where: '' };
  const sync = (issues: readonly Issue[], where: string): void => {
    last = { issues, where };
    const n = issues.length;
    const show = !!n && !core.panels.peek().code;
    if (show && !pill) load();
    else if (show && pill && !unmount) unmount = scope.mount(core.slots['top-center'], pill.el);
    else if (!show && unmount) {
      unmount();
      unmount = null;
    }
    if (!n) return;
    const first = issues[0]!;
    text.set(`${t(n === 1 ? 'problems.count1' : 'problems.countN', { n })} ${where}` + (first.line != null ? ` — ${t('problems.lineN', { line: first.line })}: ${first.msg}` : `: ${first.msg}`));
  };
  const load = (): void => {
    if (loading) return;
    loading = true;
    void import('../../../ui/blocks/pill.js').then((m) => {
      if (gone) return;
      core.addCss([m.PILL_CSS]);
      pill = m.createPill({ text, label: t('problems.title'), class: 'issue edit-only', action: { label: t('problems.openCode'), plain: true, onClick: onOpen }, t });
      sync(last.issues, last.where);
    });
  };
  return {
    sync,
    destroy: () => {
      gone = true;
      pill?.destroy();
    },
  };
}
