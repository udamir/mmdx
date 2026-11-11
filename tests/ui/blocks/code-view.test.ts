// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCodeView, highlighted, type CodeViewDiffProps } from '../../../src/ui/blocks/code-view.js';
import { createI18n } from '../../../src/i18n.js';

const t = createI18n().t;
const SRC = ['flowchart LR', '  a[Start] --> b{Valid?}', '', '  b -->|yes| c[Done]'];
const diffProps = (over: Partial<CodeViewDiffProps> = {}): CodeViewDiffProps => ({
  mode: 'diff', a: SRC, b: ['flowchart LR', '  a[Start] --> b{Valid?}', '', '  b -->|no| c[Done]', '  c --> d'], language: 'mermaid', label: 'Code diff', t, ...over,
});
const texts = (el: Element, sel: string): string[] => [...el.querySelectorAll(sel)].map((e) => e.textContent ?? '');

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('CodeView: plain', () => {
  it('renders a numbered, highlighted listing in a labelled, focusable scroll region', () => {
    const cv = createCodeView({ mode: 'plain', lines: SRC, language: 'mermaid', label: 'Mermaid code', t, part: 'code' });
    expect(cv.el.classList.contains('mmdx-code')).toBe(true);
    expect(cv.el.getAttribute('part')).toBe('code');
    const scroll = cv.el.querySelector<HTMLElement>('.code-scroll')!;
    expect(scroll.getAttribute('role')).toBe('region');
    expect(scroll.getAttribute('aria-label')).toBe('Mermaid code');
    expect(scroll.tabIndex).toBe(0);
    expect(texts(cv.el, 'td.num')).toEqual(['1', '2', '3', '4']);
    expect(texts(cv.el, 'td.txt')).toEqual(['flowchart LR', '  a[Start] --> b{Valid?}', ' ', '  b -->|yes| c[Done]']);
    const kw = cv.el.querySelector('td.txt .t-kw')!;
    expect(kw.textContent).toBe('flowchart');
    expect(cv.el.querySelector('td.txt .t-arrow')!.textContent).toBe('-->');
    expect(cv.el.querySelector('td.txt .t-label')!.textContent).toBe('|yes|');
    expect(cv.el.querySelector('.copy')).toBeNull();
  });

  it('highlights metadata lines; text stays text (no markup injection)', () => {
    const cv = createCodeView({ mode: 'plain', lines: ['%%@ node a {"x":10,"label":"<b>hi</b>"}'], language: 'meta', label: 'Metadata', t });
    expect(cv.el.querySelector('.t-kw')!.textContent).toBe('node');
    expect(cv.el.querySelector('.t-cls')!.textContent).toBe('a');
    expect(cv.el.querySelector('.t-key')!.textContent).toBe('10');
    expect(cv.el.querySelector('b')).toBeNull();
    expect(cv.el.querySelector('td.txt')!.textContent).toBe('%%@ node a {"x":10,"label":"<b>hi</b>"}');
    expect(highlighted('', 'meta')).toEqual([' ']);
  });

  it('copies the listing and says so for a moment', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const cv = createCodeView({ mode: 'plain', lines: SRC, language: 'mermaid', label: 'Mermaid code', t, copy: true });
    const copy = cv.el.querySelector<HTMLButtonElement>('.copy')!;
    expect(copy.textContent).toBe('Copy');
    copy.click();
    expect(writeText).toHaveBeenCalledWith(SRC.join('\n'));
    await Promise.resolve();
    expect(copy.textContent).toBe('Copied');
    vi.advanceTimersByTime(2000);
    expect(copy.textContent).toBe('Copy');
    expect(cv.text()).toBe(SRC.join('\n'));
  });
});

describe('CodeView: diff', () => {
  it('renders the unified diff: counts, both line numbers, signs, highlighted text', () => {
    const cv = createCodeView(diffProps({ notes: ['style removed'] }));
    expect(texts(cv.el, '.code-head .stat')).toEqual(['+2', '−1']);
    expect(cv.el.querySelector('.code-head .muted')!.textContent).toBe('lines');
    const note = cv.el.querySelector('.code-note')!;
    expect(note.textContent).toBe('style removed');
    expect(note.getAttribute('title')).toBe('Switched-off facets are left out of the diff');
    const del = cv.el.querySelector('tr.ln-del')!;
    expect(texts(del, 'td')).toEqual(['4', '', '−', '  b -->|yes| c[Done]']);
    expect(del.querySelector('.t-label')!.textContent).toBe('|yes|');
    const adds = cv.el.querySelectorAll('tr.ln-add');
    expect(texts(adds[1]!, 'td')).toEqual(['', '5', '+', '  c --> d']);
    expect(adds[1]!.querySelector('.t-arrow')!.textContent).toBe('-->');
    expect(cv.el.querySelectorAll('tr.ln-same')).toHaveLength(3);
  });

  it('collapses long unchanged runs; the skip row expands in place and keeps the focus in the listing', () => {
    const a = Array.from({ length: 30 }, (_, i) => `  n${i} --> n${i + 1}`);
    const b = [...a.slice(0, 29), '  n29 --> end'];
    const cv = createCodeView(diffProps({ a, b }));
    document.body.append(cv.el);
    const skip = cv.el.querySelector<HTMLButtonElement>('tr.skip button')!;
    expect(skip.textContent).toBe('⋯ 26 unchanged lines');
    const before = cv.el.querySelectorAll('tr').length;
    skip.focus();
    skip.click();
    expect(cv.el.querySelector('tr.skip')).toBeNull();
    expect(cv.el.querySelectorAll('tr').length).toBe(before - 1 + 26);
    expect(document.activeElement).toBe(cv.el.querySelector('.code-scroll'));
  });

  it('narrows to the selected lines with gap rows and "Show all"', () => {
    const onShowAll = vi.fn();
    const a = ['flowchart LR', '  a --> b', '  b --> c', '  c --> d', '  d --> e'];
    const b = ['flowchart LR', '  a --> b', '  b --> c2', '  c --> d', '  d --> e'];
    const cv = createCodeView(diffProps({ a, b, sel: { a: new Set([0, 2]), b: new Set([0, 2]), label: 'b' }, onShowAll }));
    expect(cv.el.querySelector('.code-filter')!.textContent).toBe('Lines of bShow all');
    expect(cv.el.querySelector('.code-filter b')!.textContent).toBe('b');
    expect(cv.el.querySelectorAll('tr.gap')).toHaveLength(1);
    expect(texts(cv.el, 'tr:not(.gap) td.txt')).toEqual(['flowchart LR', '  b --> c', '  b --> c2']);
    const all = cv.el.querySelector<HTMLButtonElement>('.code-filter button')!;
    expect(all.title).toBe('Show the whole file');
    all.click();
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it('empty states: no lines of the item, no metadata, no differences', () => {
    const none = { a: new Set<number>(), b: new Set<number>(), label: 'x' };
    expect(createCodeView(diffProps({ sel: none })).el.querySelector('.empty')!.textContent).toBe('No code lines for this item (it lives in the metadata).');
    expect(createCodeView(diffProps({ sel: none, language: 'meta' })).el.querySelector('.empty')!.textContent).toBe('No metadata lines for this item.');
    const same = createCodeView(diffProps({ b: SRC }));
    expect(same.el.querySelector('.empty')!.textContent).toBe('No differences with the current filters.');
    expect(same.el.querySelector('.code-scroll')).toBeNull();
  });

  it('copy in the header copies the after side; update() keeps the focus', () => {
    const cv = createCodeView(diffProps({ copy: true, sel: { a: new Set([3]), b: new Set([3]), label: 'b' }, onShowAll: () => undefined }));
    document.body.append(cv.el);
    expect(cv.el.querySelector('.code-head .copy')).not.toBeNull();
    expect(cv.text()).toBe(diffProps().b.join('\n'));
    const all = cv.el.querySelector<HTMLButtonElement>('[data-f=code-show-all]')!;
    all.focus();
    cv.update({ notes: ['layout replaced'] });
    expect(document.activeElement).not.toBe(all);
    expect((document.activeElement as HTMLElement).dataset['f']).toBe('code-show-all');
    expect(cv.el.querySelector('.code-note')!.textContent).toBe('layout replaced');
  });

  it('switches mode through update() and destroy() releases listeners and the copy timer', () => {
    const onShowAll = vi.fn();
    const cv = createCodeView(diffProps({ sel: { a: new Set([3]), b: new Set([3]), label: 'b' }, onShowAll }));
    document.body.append(cv.el);
    const all = cv.el.querySelector<HTMLButtonElement>('.code-filter button')!;
    cv.update({ mode: 'plain', lines: ['graph TD'], language: 'mermaid', label: 'Code', t });
    expect(cv.el.querySelector('.code-head')).toBeNull();
    expect(texts(cv.el, 'td.txt')).toEqual(['graph TD']);
    all.click();
    expect(onShowAll).not.toHaveBeenCalled(); // the old render's listeners are released
    cv.destroy();
    expect(cv.el.isConnected).toBe(false);
  });
});
