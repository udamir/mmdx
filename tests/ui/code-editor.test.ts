// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CODE_EDITOR_CSS, createCodeEditor, lineLabels } from '../../src/ui/diagram/code-editor.js';
import { highlightLine, highlightMetaLine } from '../../src/ui/diagram/highlight.js';

afterEach(() => document.body.replaceChildren());

const classes = (tokens: readonly (readonly [string | null, string])[]): (string | null)[] => tokens.map(([c]) => c);

describe('highlighters', () => {
  it('Mermaid lines: keywords, arrows, labels, strings, classes, directions, comments and folds; the text is kept', () => {
    const line = '  a["Start"] -->|yes| b:::hot';
    const tokens = highlightLine(line);
    expect(tokens.map(([, s]) => s).join('')).toBe(line);
    expect(classes(tokens)).toEqual(expect.arrayContaining(['t-str', 't-arrow', 't-label', 't-cls']));
    expect(highlightLine('flowchart LR')).toEqual([['t-kw', 'flowchart'], [null, ' '], ['t-dir', 'LR']]);
    expect(highlightLine('%% note')).toEqual([['t-comment', '%% note']]);
    expect(highlightLine('%% - 3 hidden')).toEqual([['t-fold', '%% - 3 hidden']]);
    expect(highlightLine('%%@ node a {}')).toEqual([['t-meta', '%%@ node a {}']]);
    // message text after ":" once an arrow was seen
    expect(highlightLine('A->>B: hello').at(-1)).toEqual(['t-text', ' hello']);
  });

  it('metadata lines: kind, id, keys, strings, numbers and literals', () => {
    const line = '%%@ node a {"x":12,"fill":"#fff","on":true}';
    const tokens = highlightMetaLine(line);
    expect(tokens.map(([, s]) => s).join('')).toBe(line);
    expect(tokens.slice(0, 5)).toEqual([['t-punct', '%%@'], [null, ' '], ['t-kw', 'node'], [null, ' '], ['t-cls', 'a']]);
    expect(tokens).toContainEqual(['t-label', '"x"']);
    expect(tokens).toContainEqual(['t-key', '12']);
    expect(tokens).toContainEqual(['t-str', '"#fff"']);
    expect(tokens).toContainEqual(['t-dir', 'true']);
    expect(highlightMetaLine('not meta')).toEqual(highlightLine('not meta'));
  });

  it('lineLabels keep the real line numbers across hidden runs', () => {
    expect(lineLabels('a\n%% - 3 hidden\nb')).toEqual(['1', '⋯', '5']);
  });
});

describe('createCodeEditor', () => {
  const mount = (o: Parameters<typeof createCodeEditor>[0] = {}) => {
    const ed = createCodeEditor({ value: 'flowchart LR\n  a --> b', lineNumbers: true, label: 'Code', ...o });
    document.body.append(ed.el);
    return ed;
  };

  it('a textarea over the highlighted code, with its label and a gutter of line numbers', () => {
    const ed = mount();
    expect(ed.textarea.getAttribute('aria-label')).toBe('Code');
    expect(ed.el.querySelector('.cm-hl')!.getAttribute('aria-hidden')).toBe('true');
    expect(ed.el.querySelector('.cm-hl .t-kw')!.textContent).toBe('flowchart');
    expect([...ed.el.querySelectorAll('.cm-gutter > div > div')].map((d) => d.textContent)).toEqual(['1', '2']);
    ed.value = 'a\nb\nc';
    expect(ed.el.querySelectorAll('.cm-gutter > div > div')).toHaveLength(3);
    expect(ed.value).toBe('a\nb\nc');
  });

  it('input re-renders and calls onInput; Tab inserts two spaces (not read-only)', () => {
    const onInput = vi.fn();
    const ed = mount({ onInput });
    ed.textarea.value = 'sequenceDiagram';
    ed.textarea.dispatchEvent(new Event('input'));
    expect(onInput).toHaveBeenCalledWith('sequenceDiagram');
    expect(ed.el.querySelector('.cm-hl .t-kw')!.textContent).toBe('sequenceDiagram');
    ed.textarea.setSelectionRange(0, 0);
    ed.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(ed.value.startsWith('  sequenceDiagram')).toBe(true);
    ed.readOnly = true;
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ed.textarea.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('issue markers in the gutter; gotoLine selects a real line, false when it is hidden', () => {
    const ed = mount({ value: 'a\n%% - 2 hidden\nd' });
    ed.setMarkers(new Map([[4, ['bad']]]));
    const issue = ed.el.querySelector<HTMLElement>('.cm-issue')!;
    expect(issue.dataset['tip']).toBe('bad');
    expect(ed.gotoLine(4)).toBe(true);
    expect(ed.textarea.value.slice(ed.textarea.selectionStart, ed.textarea.selectionEnd)).toBe('d');
    expect(ed.gotoLine(2)).toBe(false);
    ed.setMarkers(null);
    expect(ed.el.querySelector('.cm-issue')).toBeNull();
  });

  it('destroy removes the editor and its listeners; the CSS uses tokens only', () => {
    const onInput = vi.fn();
    const ed = mount({ onInput });
    ed.destroy();
    expect(ed.el.isConnected).toBe(false);
    ed.textarea.dispatchEvent(new Event('input'));
    expect(onInput).not.toHaveBeenCalled();
    expect(CODE_EDITOR_CSS).not.toMatch(/var\(--(?!mmdx-|gutter)/);
  });
});

describe('highlighting per keystroke (P10)', () => {
  const type = (ta: HTMLTextAreaElement, v: string): void => {
    ta.value = v;
    ta.dispatchEvent(new Event('input'));
  };

  it('re-highlights only the lines between the unchanged first and last ones', () => {
    const seen: string[] = [];
    const hl = (line: string) => (seen.push(line), highlightLine(line));
    const lines = Array.from({ length: 50 }, (_, i) => `  n${i} --> n${i + 1}`);
    const ed = createCodeEditor({ value: ['flowchart LR', ...lines].join('\n'), highlightLine: hl });
    const code = ed.el.querySelector('code')!;
    expect(seen.length).toBe(51);
    seen.length = 0;
    const edited = ['flowchart LR', ...lines];
    edited[20] = '  n19 --> X';
    type(ed.textarea, edited.join('\n'));
    expect(seen).toEqual(['  n19 --> X']);
    // a new line, and one removed
    seen.length = 0;
    edited.splice(30, 0, '  extra');
    edited.splice(5, 1);
    type(ed.textarea, edited.join('\n'));
    expect(seen.length).toBeLessThan(30);
    expect(code.textContent).toBe(edited.join('\n') + '\n');
    expect(code.children.length).toBe(edited.length);
    // refresh draws every line again
    seen.length = 0;
    ed.refresh();
    expect(seen.length).toBe(edited.length);
    expect(code.textContent).toBe(edited.join('\n') + '\n');
    ed.destroy();
  });
});
