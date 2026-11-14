// A filtered code editor of the code panel (A.1 rows 2, 3): its tab body with a search box (a count, ×), the bar of
// a filtered view (Show all) and the editor. Esc in the box clears it, Enter moves to the editor; × and Show all clear
// the filter. The code and the metadata tabs are one each.
import { createCodeEditor, type CodeEditor, type CodeEditorOptions } from '../../../ui/diagram/code-editor.js';
import { h, icon } from '../../../ui/kit/h.js';
import { I_search } from '../../../ui/kit/icons.js';
import type { EditorCore } from '../../core.js';

export interface FilteredEditor {
  /** The tab body (role tabpanel). */
  body: HTMLElement;
  ed: CodeEditor;
  input: HTMLInputElement;
  /** The number of lines shown. */
  count: HTMLElement;
  /** The bar shown over a filtered view, and its text. */
  bar: HTMLElement;
  info: HTMLElement;
}

export interface FilteredEditorOptions {
  t: EditorCore['i18n']['t'];
  /** The tab body's id, the id of the tab that labels it, its `data-body`. */
  id: string;
  labelledBy: string;
  body: 'code' | 'meta';
  hidden?: boolean;
  placeholder: string;
  label: string;
  editor: CodeEditorOptions;
  /** The filter was cleared (Esc, ×, Show all). */
  onClear(): void;
  signal: AbortSignal;
}

export function createFilteredEditor(o: FilteredEditorOptions): FilteredEditor {
  const { t } = o;
  const input = h('input', { type: 'search', placeholder: o.placeholder, autocomplete: 'off', 'aria-label': o.label });
  input.spellcheck = false;
  const count = h('span', { class: 'count', 'aria-live': 'polite' });
  const clear = h('button', { type: 'button', title: t('code.clearFilter'), 'aria-label': t('code.clearFilter') }, '×');
  const box = h('div', { class: 'code-search' }, icon(I_search, 15), input, count, clear);
  const info = h('span');
  const all = h('button', { type: 'button', class: 'link' }, t('code.showAll'));
  const bar = h('div', { class: 'code-filter-bar', hidden: true }, info, all);
  const ed = createCodeEditor(o.editor);
  const body = h('div', { class: 'tab-body', role: 'tabpanel', id: o.id, 'aria-labelledby': o.labelledBy, hidden: !!o.hidden, dataset: { body: o.body } }, box, bar, ed.el);
  const sig = { signal: o.signal };
  const reset = (): void => {
    input.value = '';
    o.onClear();
  };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && input.value) {
      ev.preventDefault();
      ev.stopPropagation();
      reset();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      ed.focus();
    }
  }, sig);
  clear.addEventListener('click', reset, sig);
  all.addEventListener('click', reset, sig);
  return { body, ed, input, count, bar, info };
}
