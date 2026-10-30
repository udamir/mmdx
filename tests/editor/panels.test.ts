// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { DEFAULT_MODULES } from '../../src/editor/modules/index.js';
import { panesModule } from '../../src/editor/modules/chrome/panes.js';
import { documentModule, exportMmdx, buildExport } from '../../src/editor/modules/chrome/document.js';
import { codePanelModule } from '../../src/editor/modules/panels/code-panel.js';
import { rightPanelsModule } from '../../src/editor/modules/panels/right-panels.js';
import { buildSegments, mergeFilteredView, viewOf } from '../../src/editor/modules/panels/util.js';
import type { EditorModule } from '../../src/editor/module.js';

const FLOW = 'flowchart LR\n  A["Alpha"] --> B["Beta"]\n  B --> C["Gamma"]\n';

let host: HTMLElement;
let ed: DiagramEditor | null = null;

const mount = (value: string, modules: readonly EditorModule[] = [panesModule, codePanelModule, rightPanelsModule, documentModule]): DiagramEditor => {
  ed = new DiagramEditor(host, { value, modules, storage: memoryStorage() });
  return ed;
};
const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const el = host.shadowRoot!.querySelector<T>(sel);
  if (!el) throw new Error(`no ${sel}`);
  return el;
};
const $$ = (sel: string): HTMLElement[] => Array.from(host.shadowRoot!.querySelectorAll<HTMLElement>(sel));
const type = (ta: HTMLTextAreaElement, value: string): void => {
  ta.value = value;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
};
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  ed?.destroy();
  ed = null;
  host.remove();
  vi.useRealTimers();
});

describe('code panel', () => {
  test('typing in the code updates the model and is one undo step', () => {
    const e = mount(FLOW);
    const ta = $<HTMLTextAreaElement>('.pane.left [data-body="code"] textarea');
    expect(ta.value).toBe(e.core.code);
    type(ta, `${e.core.code}\n  C --> D`);
    type(ta, `${e.core.code}\n  C --> D["Delta"]`);
    expect(e.core.model.type === 'flowchart' && e.core.model.nodes.has('D')).toBe(false); // debounced
    vi.advanceTimersByTime(260);
    const M = e.core.model;
    expect(M.type === 'flowchart' && M.nodes.get('D')?.label).toBe('Delta');
    expect(e.store.undoLabel()).toBe('Edit code');
    e.undo();
    expect(e.core.model.type === 'flowchart' && e.core.model.nodes.has('D')).toBe(false);
    expect(e.store.canUndo.peek()).toBe(false);
    // the editor follows undo
    expect(ta.value).toBe(e.core.code);
  });

  test('%%@ lines pasted into the code move into the metadata', () => {
    const e = mount(FLOW);
    const ta = $<HTMLTextAreaElement>('.pane.left [data-body="code"] textarea');
    type(ta, `${e.core.code}\n%%@ node A {"fill":"#ff0000"}`);
    vi.advanceTimersByTime(260);
    expect(e.core.meta.nodes?.['A']?.fill).toBe('#ff0000');
    expect(e.core.code).not.toContain('%%@');
    expect(ta.value).not.toContain('%%@');
  });

  test('filtered view: merge keeps hidden lines, damaged markers are refused', () => {
    const L = ['a', 'b', 'c', 'd', 'e'];
    const segs = buildSegments([1, 3], L.length);
    const view = viewOf(L, segs);
    expect(view).toBe('%% - 1 hidden\nb\n%% - 1 hidden\nd\n%% - 1 hidden');
    const edited = view.replace('b', 'B\nb2');
    const r = mergeFilteredView(edited, segs, L);
    expect(r?.text).toBe('a\nB\nb2\nc\nd\ne');
    expect(mergeFilteredView(view.replace('%% - 1 hidden\nd', 'd'), segs, L)).toBeNull();
  });

  test('the items a code filter finds are selected; clearing the filter clears that selection', () => {
    const e = mount('flowchart LR\n  A["Alpha"] -->|"go"| B["Beta"]\n  B --> C["Gamma"]\n  subgraph G ["Alpha team"]\n    D:::worker\n  end\n');
    const search = $<HTMLInputElement>('.pane.left [data-body="code"] input[type=search]');
    const query = (q: string): string[] => {
      search.value = q;
      search.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(200);
      return e.core.selection().map((x) => `${x.kind}:${x.id}`);
    };
    // text: ids and labels (case-insensitive), connector labels
    expect(query('alpha')).toEqual(['node:A', 'group:G']);
    expect(query('go')).toEqual(['edge:A->B']);
    // node classes count, as the filtered code shows their lines
    expect(query('worker')).toEqual(['node:D']);
    // exact ids, several tokens
    expect(query('B C')).toEqual(['node:B', 'node:C']);
    // the query typed stays (the selection does not write its ids back over it)
    expect(search.value).toBe('B C');
    expect(query('nothing-like-this')).toEqual([]);
    // Esc clears the filter and the selection it made
    query('Gamma');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(search.value).toBe('');
    expect(e.core.selection()).toEqual([]);
    // a selection made on the canvas stays when its filter is cleared
    e.core.select([{ kind: 'node', id: 'A' }]);
    expect(search.value).toBe('A');
    $<HTMLButtonElement>('.code-filter-bar button').click();
    expect(e.core.selection()).toEqual([{ kind: 'node', id: 'A' }]);
  });

  test('code filter round trip writes edits into the full file and keeps hidden lines', () => {
    const e = mount(FLOW);
    const search = $<HTMLInputElement>('.pane.left [data-body="code"] input[type=search]');
    search.value = 'Gamma';
    search.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);
    const ta = $<HTMLTextAreaElement>('.pane.left [data-body="code"] textarea');
    expect(ta.value).toBe('%% - 2 hidden\n  B --> C["Gamma"]');
    expect($('.code-filter-bar').hidden).toBe(false);
    // the gutter shows ⋯ for the hidden run and the real line number of the visible line
    expect($$('.pane.left [data-body="code"] .cm-gutter > div > div').map((d) => d.textContent)).toEqual(['⋯', '3']);
    type(ta, ta.value.replace('Gamma', 'Gamma 2'));
    vi.advanceTimersByTime(260);
    expect(e.core.code).toBe('flowchart LR\n  A["Alpha"] --> B["Beta"]\n  B --> C["Gamma 2"]');
    // damaging a marker is refused with the guard message, the file is untouched
    type(ta, ta.value.replace('%% - 2 hidden\n', ''));
    vi.advanceTimersByTime(260);
    expect(e.core.code).toContain('A["Alpha"]');
    expect($('.problems .filter-err').textContent).toContain('Keep the');
  });

  test('metadata edit with a bad line keeps it and flags it', () => {
    const e = mount(`${FLOW}\n%%@ node A {"fill":"#00ff00"}\n`);
    $('.pane.left [role=tab][data-tab="meta"]').click();
    const ta = $<HTMLTextAreaElement>('.pane.left [data-body="meta"] textarea');
    expect(ta.value).toContain('%%@ node A {"fill":"#00ff00"}');
    ta.focus();
    type(ta, `${ta.value}\n%%@ node B {"fill":"#0000ff"}\n%%@ node C not json`);
    vi.advanceTimersByTime(260);
    expect(e.core.meta.nodes?.['B']?.fill).toBe('#0000ff');
    expect(ta.value).toContain('%%@ node C not json');
    const items = $$('.problems .pb-item');
    expect(items.some((b) => b.textContent?.includes('metadata') && b.textContent.includes('{json}'))).toBe(true);
    // the bad line survives a rewrite of the metadata text (e.g. after blur)
    ta.blur();
    expect(ta.value).toContain('%%@ node C not json');
    expect(e.core.issueCount.peek()).toBeGreaterThan(0);
  });

  test('problems list shows a diagnostic and Fix works', () => {
    const e = mount('flowchart TB\n  G["Node"]\n  subgraph G [Group]\n    X\n  end\n');
    const fix = $$('.problems .pb-fix')[0];
    expect(fix?.textContent).toContain('Rename subgraph');
    fix!.click();
    const M = e.core.model;
    expect(M.type === 'flowchart' && M.groups.has('G_group')).toBe(true);
    expect(e.core.result.diagnostics.some((d) => d.code === 'flow.id-clash')).toBe(false);
    expect($$('.problems .pb-fix').length).toBe(0);
  });

  test('gotoCodeLine clears a filter that hides the line', () => {
    const e = mount(FLOW);
    const search = $<HTMLInputElement>('.pane.left [data-body="code"] input[type=search]');
    search.value = 'Gamma';
    search.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);
    e.core.run('gotoCodeLine', 2);
    expect(search.value).toBe('');
    const ta = $<HTMLTextAreaElement>('.pane.left [data-body="code"] textarea');
    expect(ta.value.slice(ta.selectionStart, ta.selectionEnd)).toBe('  A["Alpha"] --> B["Beta"]');
  });
});

describe('right panels', () => {
  test('properties change writes metadata', async () => {
    const e = mount(FLOW);
    e.core.select([{ kind: 'node', id: 'A' }]);
    await flush();
    const row = $$('.rpanel.props .f').find((r) => r.querySelector('label')?.textContent === 'Font size');
    const input = row!.querySelector<HTMLInputElement>('input[type=number]')!;
    input.value = '20';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    expect(e.core.meta.nodes?.['A']?.fontSize).toBe(20);
    expect(e.store.undoLabel()).toBe('Style');
    // a select writes right away
    const align = $$('.rpanel.props .f').find((r) => r.querySelector('label')?.textContent === 'Text align')!.querySelector('select')!;
    align.value = 'left';
    align.dispatchEvent(new Event('change'));
    expect(e.core.meta.nodes?.['A']?.align).toBe('left');
  });

  test('several items of one kind: every bulk property, shared values shown, differing ones "mixed"', async () => {
    const e = mount(FLOW);
    e.core.change('setup', () => {
      Object.assign(e.core.ensure('node', 'A'), { fontSize: 18, fill: '@lime', align: 'left' });
      Object.assign(e.core.ensure('node', 'B'), { fontSize: 18, fill: '@sky' });
    });
    e.core.select([{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]);
    await flush();
    expect($('.rpanel.props .insp-title').textContent).toBe('2 nodes selected');
    const rowOf = (label: string): HTMLElement => $$('.rpanel.props .f').find((r) => r.querySelector('label')?.textContent === label)!;
    // the same font size: shown; different fills: mixed
    const size = rowOf('Font size').querySelector<HTMLInputElement>('input[type=number]')!;
    expect(size.value).toBe('18');
    expect(rowOf('Font size').classList.contains('mixed')).toBe(false);
    const fill = rowOf('Fill').querySelector<HTMLInputElement>('input[type=text]')!;
    expect(fill.value).toBe('');
    expect(fill.placeholder).toBe('mixed');
    expect(rowOf('Fill').classList.contains('mixed')).toBe(true);
    // a select with differing values starts on "mixed"
    const align = rowOf('Text align').querySelector('select')!;
    expect(align.value).toBe('__mixed');
    expect(align.selectedOptions[0]!.textContent).toBe('mixed');
    // positions differ, sizes are the same
    expect(rowOf('X').classList.contains('mixed')).toBe(true);
    // a change goes to all of them in one step
    size.value = '22';
    size.dispatchEvent(new Event('input'));
    size.dispatchEvent(new Event('change'));
    expect([e.core.meta.nodes?.['A']?.fontSize, e.core.meta.nodes?.['B']?.fontSize]).toEqual([22, 22]);
    fill.value = '@sky';
    fill.dispatchEvent(new Event('change'));
    expect([e.core.meta.nodes?.['A']?.fill, e.core.meta.nodes?.['B']?.fill]).toEqual(['@sky', '@sky']);
    e.store.undo();
    expect([e.core.meta.nodes?.['A']?.fill, e.core.meta.nodes?.['B']?.fill]).toEqual(['@lime', '@sky']);
    // mixed kinds keep the summary
    e.core.select([{ kind: 'node', id: 'A' }, { kind: 'edge', id: 'A->B' }]);
    await flush();
    expect($('.rpanel.props .insp-title').textContent).toBe('2 items selected');
  });

  test('ER attributes: one line each (type name PK (comment)) and a style button with a popup', async () => {
    const e = mount('erDiagram\n  CUSTOMER {\n    string id PK\n    string name\n  }\n');
    e.core.select([{ kind: 'entity', id: 'CUSTOMER' }]);
    await flush();
    const lines = (): HTMLInputElement[] => $$('.rpanel.props .attr-line input') as HTMLInputElement[];
    expect(lines().map((i) => i.value)).toEqual(['string id PK', 'string name']);
    // one field: type, name, keys and the comment in brackets
    lines()[1]!.value = 'varchar(80) full_name UK (shown on invoices)';
    lines()[1]!.dispatchEvent(new Event('change'));
    expect(e.core.code).toMatch(/varchar\(80\) full_name UK "shown on invoices"/);
    await flush();
    expect(lines()[1]!.value).toBe('varchar(80) full_name UK (shown on invoices)');
    // the style button opens the popup; each change applies at once and the popup stays
    $$('.rpanel.props .attr-style')[1]!.click();
    const pop = (): HTMLElement => $('.attr-style-pop');
    pop().querySelector<HTMLButtonElement>('.asp-italic')!.click();
    expect(e.core.getM('entity', 'CUSTOMER').attrs).toEqual({ full_name: { italic: true } });
    pop().querySelector<HTMLButtonElement>('.asp-sw[aria-label="red"]')!.click();
    expect(e.core.getM('entity', 'CUSTOMER').attrs).toEqual({ full_name: { italic: true, color: '@red' } });
    expect(pop().querySelector('.asp-italic')!.classList.contains('on')).toBe(true);
    // a preset replaces the own look
    Array.from(pop().querySelectorAll<HTMLButtonElement>('.asp-chip')).find((b) => b.textContent === 'Key')!.click();
    expect(e.core.getM('entity', 'CUSTOMER').attrs).toEqual({ full_name: { preset: 'key' } });
    await flush();
    expect($$('.rpanel.props .attr-style')[1]!.classList.contains('set')).toBe(true);
    // an emptied line deletes the attribute
    lines()[0]!.value = '';
    lines()[0]!.dispatchEvent(new Event('change'));
    const M = e.core.model;
    expect(M.type === 'er' && M.entities.get('CUSTOMER')!.attrs.map((x) => x.name)).toEqual(['full_name']);
  });

  test('text section rewrites the Mermaid label', async () => {
    const e = mount(FLOW);
    e.core.select([{ kind: 'node', id: 'B' }]);
    await flush();
    const ta = $<HTMLTextAreaElement>('.rpanel.props .prop-label textarea');
    expect(ta.value).toBe('Beta');
    ta.value = 'Bravo';
    ta.dispatchEvent(new Event('blur'));
    const M = e.core.model;
    expect(M.type === 'flowchart' && M.nodes.get('B')?.label).toBe('Bravo');
  });

  test('page size Custom writes canvas w / h', async () => {
    const e = mount(FLOW);
    await flush();
    const custom = $$('.rpanel.props .page-size-seg button').find((b) => b.textContent === 'Custom')!;
    custom.click();
    const c = e.core.meta.canvas;
    expect(typeof c.w).toBe('number');
    expect(typeof c.h).toBe('number');
    await flush();
    const w = $$('.rpanel.props .page-wh input[type=number]')[0] as HTMLInputElement;
    expect(w.disabled).toBe(false);
    w.value = '900';
    w.dispatchEvent(new Event('change'));
    expect(e.core.meta.canvas.w).toBe(900);
  });

  test('layer hide hides its items in the render', async () => {
    const e = mount(`${FLOW}\n%%@ layer L1 {"name":"Infra"}\n%%@ node C {"layer":"L1"}\n`);
    await flush();
    const rendered = (): string[] => Array.from(e.core.dom.body.querySelectorAll('.el.node')).map((n) => n.getAttribute('data-id') ?? '');
    expect(rendered()).toContain('C');
    const row = $('.rpanel.layers [data-layer="L1"]');
    row.querySelector<HTMLButtonElement>('.eye')!.click();
    expect(e.core.meta.layers?.['L1']?.hidden).toBe(true);
    expect(rendered()).not.toContain('C');
    expect(rendered()).toContain('A');
    e.undo();
    expect(rendered()).toContain('C');
  });

  test('+ New layer takes the selection; count selects the items', async () => {
    const e = mount(FLOW);
    e.core.select([{ kind: 'node', id: 'A' }]);
    await flush();
    $('.rpanel.layers .rp-act').click();
    expect(e.core.meta.layers?.['L1']?.name).toBe('Layer 1');
    expect(e.core.meta.nodes?.['A']?.layer).toBe('L1');
    e.core.select([]);
    await flush();
    $('.rpanel.layers [data-layer="L1"] .count').click();
    expect(e.core.selection()).toEqual([{ kind: 'node', id: 'A' }]);
  });
});

describe('export', () => {
  test('mmdx contains the code and the %%@ lines (deleted items pruned)', async () => {
    const e = mount(`${FLOW}\n%%@ node A {"fill":"#ff0000"}\n%%@ node Gone {"x":1}\n`);
    const text = exportMmdx(e.core);
    expect(text).toContain('A["Alpha"] --> B["Beta"]');
    expect(text).toContain('%%@ node A {"fill":"#ff0000"}');
    expect(text).not.toContain('Gone');
    const file = await buildExport(e.core, 'mmd');
    expect(file.name).toBe('diagram.mmd');
    expect(String(file.data)).not.toContain('%%@');
    const svg = await buildExport(e.core, 'svg');
    expect(String(svg.data)).toMatch(/^<svg /);
  });

  test('exportAs dispatches a cancelable ds-export event', async () => {
    const e = mount(FLOW);
    const seen: string[] = [];
    host.addEventListener('ds-export', (ev) => {
      seen.push((ev as CustomEvent<{ name: string }>).detail.name);
      ev.preventDefault();
    });
    await e.exportAs('mmdx');
    expect(seen).toEqual(['diagram.mmdx']);
  });
});

describe('full editor', () => {
  test('mounts with every default module and tears down cleanly', async () => {
    const e = mount(FLOW, DEFAULT_MODULES);
    await flush();
    expect($('.tool-dock')).toBeTruthy();
    expect($('.view-params')).toBeTruthy();
    expect(host.shadowRoot!.querySelector('.view-params .vp-pill')).toBeNull(); // the type is on the page badge, not in the bar
    expect($('.zoom output').textContent).toMatch(/%$/);
    // undo button disabled when there is nothing to undo
    expect($<HTMLButtonElement>('.vt-undo button').disabled).toBe(true);
    e.core.run('autoLayout');
    e.destroy();
    ed = null;
    expect(host.shadowRoot!.childElementCount).toBe(0);
  });
});
