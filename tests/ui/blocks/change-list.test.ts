// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramDiff, ItemChange } from '../../../src/core/diff/index.js';
import { changeKey } from '../../../src/core/diff/merge.js';
import { signal } from '../../../src/reactive/signal.js';
import { createChangeList, describeChange, fieldRow, kindLabel, type ChangeListProps } from '../../../src/ui/blocks/change-list.js';
import { createI18n } from '../../../src/i18n.js';

const t = createI18n().t;

const changes: ItemChange[] = [
  { kind: 'node', id: 'a', label: 'Start', status: 'added', facets: [], fields: [] },
  { kind: 'node', id: 'b', label: 'Gone', status: 'removed', facets: [], fields: [] },
  { kind: 'edge', id: 'L0', label: 'a → c', status: 'changed', facets: ['content', 'style'], fields: [{ facet: 'content', field: 'label', before: 'x', after: 'y' }, { facet: 'style', field: 'stroke', before: '#f00', after: undefined }] },
];
const diff: DiagramDiff = {
  type: 'flowchart', typeChanged: false, items: changes,
  doc: [{ facet: 'style', field: 'theme', before: 'default', after: 'dark' }],
  counts: { added: 1, removed: 1, changed: 1, content: 1, layout: 0, style: 2 },
};
const props = (over: Partial<ChangeListProps> = {}): ChangeListProps => ({
  doc: diff.doc, changes, keyOf: changeKey, selected: null, colorBefore: (v) => (typeof v === 'string' && v.startsWith('#') ? v : undefined), colorAfter: () => undefined,
  onSelect: () => undefined, t, ...over,
});
const key = (el: Element, k: string): void => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

afterEach(() => document.body.replaceChildren());

describe('ChangeList', () => {
  it('renders the diagram-wide fields and one option per change with mark icons, kind and label', () => {
    const cl = createChangeList(props({ selected: 'node:a', part: 'change-list' }));
    expect(cl.el.getAttribute('part')).toBe('change-list');
    expect(cl.el.querySelector('.doc-changes summary')!.textContent).toBe('Diagram-wide (1)');
    expect(cl.el.querySelector('.doc-changes .field.m-style .fname')!.textContent).toBe('theme');
    const list = cl.el.querySelector('.changes')!;
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.getAttribute('aria-label')).toBe('Changes');
    const rows = [...cl.el.querySelectorAll<HTMLButtonElement>('.change')];
    expect(rows.map((r) => r.dataset['key'])).toEqual(['node:a', 'node:b~del', 'edge:L0']);
    expect(rows.map((r) => r.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(rows[0]!.getAttribute('role')).toBe('option');
    expect(rows[1]!.classList.contains('st-removed')).toBe(true);
    expect(rows[2]!.querySelector('.kind')!.textContent).toBe('edge');
    expect(rows[2]!.querySelector('.label')!.textContent).toBe('a → c');
    expect([...rows[2]!.querySelectorAll('.cicon')].map((c) => c.className)).toEqual(['cicon m-content', 'cicon m-style']);
    expect(rows[2]!.title).toBe('edge a → c: content, style changed (label, stroke)');
    // one tab stop: the selected row
    expect(rows.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it('a selected signal moves the selection and the tab stop in place', () => {
    const selected = signal<string | null>(null);
    const cl = createChangeList(props({ selected }));
    const rows = [...cl.el.querySelectorAll<HTMLButtonElement>('.change')];
    expect(rows.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    selected.set('edge:L0');
    expect(cl.el.querySelectorAll('.change')[2]).toBe(rows[2]);
    expect(rows[2]!.getAttribute('aria-selected')).toBe('true');
    expect(rows.map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
    // a click on the selected row clears it
    const onSelect = vi.fn();
    cl.update({ onSelect });
    cl.el.querySelectorAll<HTMLElement>('.change')[2]!.click();
    expect(onSelect).toHaveBeenCalledWith(null);
    cl.destroy();
    selected.set('node:a');
    expect(rows[0]!.getAttribute('aria-selected')).toBe('false');
  });

  it('shows the empty state without changes', () => {
    const cl = createChangeList(props({ changes: [], doc: [] }));
    expect(cl.el.querySelector('.changes')).toBeNull();
    expect(cl.el.querySelector('.empty')!.textContent).toBe('No changes with the current filters.');
  });

  it('selects on click, clears on a second click of the selected row; select() works in place', () => {
    const onSelect = vi.fn();
    const cl = createChangeList(props({ onSelect }));
    document.body.append(cl.el);
    const row = (k: string): HTMLButtonElement => cl.el.querySelector<HTMLButtonElement>(`[data-key="${k}"]`)!;
    const scrolled = vi.fn();
    row('edge:L0').scrollIntoView = scrolled;
    row('edge:L0').querySelector<HTMLElement>('.label')!.click();
    expect(onSelect).toHaveBeenLastCalledWith('edge:L0');
    const same = row('edge:L0');
    same.focus();
    cl.select('edge:L0');
    expect(row('edge:L0')).toBe(same); // no re-render
    expect(document.activeElement).toBe(same);
    expect(same.getAttribute('aria-selected')).toBe('true');
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' });
    same.click();
    expect(onSelect).toHaveBeenLastCalledWith(null);
    cl.select(null);
    expect(cl.el.querySelectorAll('[aria-selected=true]')).toHaveLength(0);
  });

  it('arrow keys, Home and End move along the rows; update() keeps the focus', () => {
    const cl = createChangeList(props());
    document.body.append(cl.el);
    const rows = (): HTMLButtonElement[] => [...cl.el.querySelectorAll<HTMLButtonElement>('.change')];
    rows()[0]!.focus();
    key(rows()[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(rows()[1]);
    key(rows()[1]!, 'End');
    expect(document.activeElement).toBe(rows()[2]);
    key(rows()[2]!, 'ArrowDown');
    expect(document.activeElement).toBe(rows()[2]);
    key(rows()[2]!, 'Home');
    expect(document.activeElement).toBe(rows()[0]);
    rows()[1]!.focus();
    const old = rows()[1];
    cl.update({ selected: 'node:b~del' });
    expect(document.activeElement).not.toBe(old);
    expect((document.activeElement as HTMLElement).dataset['key']).toBe('node:b~del');
    expect((document.activeElement as HTMLElement).getAttribute('aria-selected')).toBe('true');
  });

  it('destroy() removes the element and its listeners', () => {
    const onSelect = vi.fn();
    const cl = createChangeList(props({ onSelect }));
    document.body.append(cl.el);
    const row = cl.el.querySelector<HTMLButtonElement>('.change')!;
    cl.destroy();
    expect(cl.el.isConnected).toBe(false);
    row.click();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('change helpers', () => {
  it('describeChange, kindLabel and fieldRow', () => {
    expect(kindLabel(t, 'entity')).toBe('table');
    expect(describeChange(t, changes[0]!)).toBe('node Start: added');
    // the field list goes through its own message (a translation can place it)
    const de = (k: string, p?: Readonly<Record<string, string | number>>): string => (k === 'diff.status.changedFields' ? `${p?.['facets']} geändert [${p?.['fields']}]` : t(k, p));
    expect(describeChange(de, changes[2]!)).toBe('edge a → c: content, style geändert [label, stroke]');
    const row = fieldRow(changes[2]!.fields[1]!, (v) => String(v), () => undefined);
    expect(row.className).toBe('field m-style');
    const [before, after] = [...row.querySelectorAll('.val')];
    expect(before!.querySelector<HTMLElement>('.sw')!.style.background).toBe('rgb(255, 0, 0)');
    expect(before!.textContent).toBe('#f00');
    expect(after!.classList.contains('none')).toBe(true);
    expect(after!.textContent).toBe('—');
  });
});
