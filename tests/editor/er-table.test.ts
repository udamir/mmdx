// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { parseAttrLine } from '../../src/core/parse/er.js';
import type { EditorCore } from '../../src/editor/core.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { CANVAS_MODULES } from '../../src/editor/modules/canvas/index.js';
import type { DiagramModel } from '../../src/core/model.js';
import { erTableModule } from '../../src/editor/modules/er-table/index.js';

if (typeof globalThis.PointerEvent === 'undefined') {
  class PE extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (globalThis as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
}

const ER = 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    string id PK\n    string name\n    int age\n  }\n';

const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function mount(value = ER): EditorCore {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, modules: [erTableModule, ...CANVAS_MODULES], storage: memoryStorage() });
  editors.push(ed);
  return ed.core;
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const tableEl = (core: EditorCore, id: string): Element =>
  Array.from(core.dom.body.querySelectorAll('.el[data-kind="entity"]')).find((n) => n.getAttribute('data-id') === id)!.querySelector('rect, path')!;
const box = (core: EditorCore, id: string) => {
  const g = core.geom;
  if (g.type !== 'er') throw new Error('er expected');
  return g.entities.get(id)!;
};
/** Client point of row i (-1: the empty last row), or the title. */
const rowPoint = (core: EditorCore, id: string, i: number | 'title'): { x: number; y: number } => {
  const b = box(core, id);
  if (i === 'title') return core.toScreen({ x: b.x, y: b.y - b.h / 2 + 4 });
  const rows = b.rows!;
  const r = i < 0 ? rows.find((x) => x.add)! : rows[i]!;
  return core.toScreen({ x: b.x, y: r.y + r.h / 2 });
};
let pid = 1;
function click(core: EditorCore, target: Element, at: { x: number; y: number }, o: { shift?: boolean; mod?: boolean } = {}): void {
  pid++;
  const init = { bubbles: true, composed: true, cancelable: true, clientX: at.x, clientY: at.y, button: 0, pointerId: pid, shiftKey: !!o.shift, metaKey: !!o.mod, ctrlKey: !!o.mod };
  target.dispatchEvent(new PointerEvent('pointerdown', init));
  core.dom.svg.dispatchEvent(new PointerEvent('pointerup', init));
}
/** Press at `from`, move to `to` in steps (watching the drop line on the way), release. */
function drag(core: EditorCore, target: Element, from: { x: number; y: number }, to: { x: number; y: number }, during?: () => void): void {
  pid++;
  const at = (p: { x: number; y: number }) => ({ bubbles: true, composed: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0, pointerId: pid });
  target.dispatchEvent(new PointerEvent('pointerdown', at(from)));
  for (let i = 1; i <= 4; i++) core.dom.svg.dispatchEvent(new PointerEvent('pointermove', at({ x: from.x + ((to.x - from.x) * i) / 4, y: from.y + ((to.y - from.y) * i) / 4 })));
  during?.();
  core.dom.svg.dispatchEvent(new PointerEvent('pointerup', at(to)));
}
/**
 * Double-click at a point. A browser fires it at the canvas (the first press captured the pointer), not at the table:
 * the attribute section is tested that way. The canvas's own rename looks the item up with elementFromPoint, which
 * jsdom lacks, so title double-clicks go to the table element.
 */
const dblclick = (target: Element, at: { x: number; y: number }, onCanvas = true): void => {
  const to = onCanvas ? (target as SVGElement).ownerSVGElement ?? target : target;
  to.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true, cancelable: true, clientX: at.x, clientY: at.y }));
};
function key(core: EditorCore, k: string, o: { mod?: boolean; shift?: boolean; alt?: boolean } = {}): void {
  core.dom.root.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true, ctrlKey: !!o.mod, metaKey: !!o.mod, shiftKey: !!o.shift, altKey: !!o.alt }));
}
const names = (core: EditorCore, id = 'CUSTOMER'): string[] => (core.model.type === 'er' ? core.model.entities.get(id)!.attrs.map((a) => a.name) : []);
const selected = (core: EditorCore): number => core.dom.overlay.querySelectorAll('.attr-sel').length;
const editorInput = (core: EditorCore): HTMLInputElement | null => core.dom.wrap.querySelector<HTMLInputElement>('input.attr-edit');
function type(inp: HTMLInputElement, text: string, keyName = 'Enter'): void {
  inp.value = text;
  inp.dispatchEvent(new Event('input'));
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true }));
}

/** Double-click in the attributes section (the bottom of the card). */
function enter(core: EditorCore, id = 'CUSTOMER'): void {
  const b = box(core, id);
  dblclick(tableEl(core, id), core.toScreen({ x: b.x, y: b.y + b.h / 2 - 3 }));
}

describe('ER attribute editing (table view)', () => {
  it('double-click turns the table into an editable table with an empty last row', () => {
    const core = mount();
    expect(box(core, 'CUSTOMER').rows).toBeUndefined(); // compact card
    enter(core);
    expect(core.tableView).toBe('CUSTOMER');
    expect(core.dom.root.classList.contains('table-edit')).toBe(true);
    const rows = box(core, 'CUSTOMER').rows!;
    expect(rows.map((r) => r.name)).toEqual(['id', 'name', 'age', '']);
    expect(rows[3]!.add).toBe(true);
    expect(core.selection()).toEqual([]);
    expect(core.dom.wrap.querySelector('.table-edit-bar')?.textContent).toMatch(/Editing table CUSTOMER/);
  });

  it('two sections: double-click the title renames the table, the attributes edit them', () => {
    const core = mount();
    const label = (m: DiagramModel): string => (m.type === 'er' ? m.entities.get('CUSTOMER')!.label : '');
    const b = box(core, 'CUSTOMER');
    expect(b.head).toBeGreaterThan(0);
    expect(b.head).toBeLessThan(b.h);
    // the title section of the card: rename in place, no table view
    dblclick(tableEl(core, 'CUSTOMER'), rowPoint(core, 'CUSTOMER', 'title'), false);
    expect(core.tableView).toBeNull();
    let ta = core.dom.wrap.querySelector<HTMLTextAreaElement>('textarea.inline-edit')!;
    expect(ta.value).toBe('CUSTOMER');
    ta.value = 'Client';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(label(core.model)).toBe('Client');
    // the attributes section: table view; there the title still renames
    enter(core);
    expect(core.tableView).toBe('CUSTOMER');
    dblclick(tableEl(core, 'CUSTOMER'), rowPoint(core, 'CUSTOMER', 'title'), false);
    ta = core.dom.wrap.querySelector<HTMLTextAreaElement>('textarea.inline-edit')!;
    ta.value = 'Buyer';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(label(core.model)).toBe('Buyer');
    expect(core.tableView).toBe('CUSTOMER');
    expect(core.selection()).toEqual([]);
  });

  it('rows are selected like items: click, ⌘-click, Shift-click for a range, ⌘A; Delete removes them', () => {
    const core = mount();
    enter(core);
    const el = tableEl(core, 'CUSTOMER');
    click(core, el, rowPoint(core, 'CUSTOMER', 0));
    expect(selected(core)).toBe(1);
    click(core, el, rowPoint(core, 'CUSTOMER', 2), { shift: true });
    expect(selected(core)).toBe(3);
    click(core, el, rowPoint(core, 'CUSTOMER', 1), { mod: true });
    expect(selected(core)).toBe(2);
    key(core, 'Delete');
    expect(names(core)).toEqual(['name']);
    expect(core.code).not.toMatch(/string id PK/);
    expect(core.tableView).toBe('CUSTOMER');
    key(core, 'a', { mod: true });
    expect(selected(core)).toBe(1);
  });

  it('typing into the last row adds attributes one after another; the comment is in brackets', () => {
    const core = mount();
    enter(core);
    click(core, tableEl(core, 'CUSTOMER'), rowPoint(core, 'CUSTOMER', -1));
    const inp = editorInput(core)!;
    expect(inp.value).toBe('');
    type(inp, 'datetime created_at (when it was made)');
    expect(names(core)).toEqual(['id', 'name', 'age', 'created_at']);
    expect(core.dom.body.querySelector('.text-editing')).toBeNull();
    expect(core.code).toMatch(/datetime created_at "when it was made"/);
    // straight on to the next new attribute
    const next = editorInput(core)!;
    expect(next).not.toBe(inp);
    type(next, 'email');
    expect(names(core)).toEqual(['id', 'name', 'age', 'created_at', 'email']);
    expect(core.code).toMatch(/string email\n/);
    type(editorInput(core)!, '', 'Escape');
    expect(editorInput(core)).toBeNull();
  });

  it('double-click edits a row in place; a rename keeps its look; an emptied row is deleted', () => {
    const core = mount();
    core.change('look', () => {
      core.ensure('entity', 'CUSTOMER').attrs = { name: { color: '@red', italic: true } };
    });
    enter(core);
    dblclick(tableEl(core, 'CUSTOMER'), rowPoint(core, 'CUSTOMER', 1));
    const inp = editorInput(core)!;
    expect(inp.value).toBe('string name');
    type(inp, 'varchar(80) full_name UK (shown on invoices)');
    const M = core.model;
    const a = M.type === 'er' ? M.entities.get('CUSTOMER')!.attrs[1]! : null;
    expect(a).toEqual({ type: 'varchar(80)', name: 'full_name', keys: ['UK'], comment: 'shown on invoices' });
    expect(core.getM('entity', 'CUSTOMER').attrs).toEqual({ full_name: { color: '@red', italic: true } });
    // the table's texts stay visible (only the canvas's own rename hides them while it is open)
    expect(core.dom.body.querySelector('.text-editing')).toBeNull();
    dblclick(tableEl(core, 'CUSTOMER'), rowPoint(core, 'CUSTOMER', 2));
    type(editorInput(core)!, '');
    expect(names(core)).toEqual(['id', 'full_name']);
  });

  it('the attribute toolbar edits every selected row', async () => {
    const core = mount();
    enter(core);
    const el = tableEl(core, 'CUSTOMER');
    click(core, el, rowPoint(core, 'CUSTOMER', 1));
    click(core, el, rowPoint(core, 'CUSTOMER', 2), { shift: true });
    await tick();
    await tick();
    const bar = core.dom.wrap.querySelector<HTMLElement>('.mtb')!;
    expect(bar.hidden).toBe(false);
    const controls = Array.from(bar.querySelectorAll<HTMLElement>('.mtb-seg > [data-c]')).map((b) => b.dataset['c']);
    expect(controls).toEqual(['selection', 'presets', 'font', 'size', 'bold', 'italic', 'underline', 'textColor', 'delete']);
    bar.querySelector<HTMLButtonElement>('[data-c="italic"]')!.click();
    expect(core.getM('entity', 'CUSTOMER').attrs).toEqual({ name: { italic: true }, age: { italic: true } });
    // a preset replaces the own look
    bar.querySelector<HTMLButtonElement>('[data-c="presets"]')!.click();
    Array.from(bar.querySelectorAll<HTMLButtonElement>('.mtb-pop .pp-item')).find((b) => b.querySelector('.pp-name')?.textContent === 'Muted')!.click();
    expect(core.getM('entity', 'CUSTOMER').attrs).toEqual({ name: { preset: 'muted' }, age: { preset: 'muted' } });
    // delete from the toolbar
    bar.querySelector<HTMLButtonElement>('[data-c="delete"]')!.click();
    expect(names(core)).toEqual(['id']);
  });

  it('dragging rows reorders them (their looks go along); ⌥↑ / ⌥↓ move the selection', () => {
    const core = mount();
    core.change('look', () => {
      core.ensure('entity', 'CUSTOMER').attrs = { id: { bold: true } };
    });
    enter(core);
    const el = tableEl(core, 'CUSTOMER');
    // id below age; the drop line shows on the way
    let line = false;
    const below = rowPoint(core, 'CUSTOMER', 2);
    drag(core, el, rowPoint(core, 'CUSTOMER', 0), { x: below.x, y: below.y + 8 }, () => (line = !!core.dom.overlay.querySelector('.attr-drop')));
    expect(line).toBe(true);
    expect(core.dom.overlay.querySelector('.attr-drop')).toBeNull();
    expect(names(core)).toEqual(['name', 'age', 'id']);
    expect(core.code).toMatch(/string name\n\s+int age\n\s+string id PK/);
    expect(core.getM('entity', 'CUSTOMER').attrs).toEqual({ id: { bold: true } });
    expect(selected(core)).toBe(1);
    // the moved row stays selected: ⌥↑ moves it back up
    key(core, 'ArrowUp', { alt: true });
    expect(names(core)).toEqual(['name', 'id', 'age']);
    // several selected rows move together, in their order
    click(core, el, rowPoint(core, 'CUSTOMER', 1));
    click(core, el, rowPoint(core, 'CUSTOMER', 2), { shift: true });
    const top = rowPoint(core, 'CUSTOMER', 0);
    drag(core, el, rowPoint(core, 'CUSTOMER', 2), { x: top.x, y: top.y - 6 });
    expect(names(core)).toEqual(['id', 'age', 'name']);
    // a click without moving selects the row alone
    click(core, el, rowPoint(core, 'CUSTOMER', 0));
    expect(selected(core)).toBe(1);
  });

  it('Esc clears the rows, then leaves the table (selected); a click outside leaves too', () => {
    const core = mount();
    enter(core);
    click(core, tableEl(core, 'CUSTOMER'), rowPoint(core, 'CUSTOMER', 0));
    key(core, 'Escape');
    expect(core.tableView).toBe('CUSTOMER');
    expect(selected(core)).toBe(0);
    key(core, 'Escape');
    expect(core.tableView).toBeNull();
    expect(core.selection()).toEqual([{ kind: 'entity', id: 'CUSTOMER' }]);
    expect(box(core, 'CUSTOMER').rows).toBeUndefined();
    enter(core);
    click(core, core.dom.svg, core.toScreen({ x: -5000, y: -5000 }));
    expect(core.tableView).toBeNull();
  });
});

describe('parseAttrLine', () => {
  it('reads the comment from brackets after a space, never from a type like INT(11)', () => {
    expect(parseAttrLine('INT(11) id PK (row id)')).toEqual({ type: 'INT(11)', name: 'id', keys: ['PK'], comment: 'row id' });
    expect(parseAttrLine('varchar(255) title')).toEqual({ type: 'varchar(255)', name: 'title', keys: [], comment: '' });
    expect(parseAttrLine('int n PK, FK "quoted"')).toEqual({ type: 'int', name: 'n', keys: ['PK', 'FK'], comment: 'quoted' });
    expect(parseAttrLine('email (contact)')).toEqual({ type: 'string', name: 'email', keys: [], comment: 'contact' });
    expect(parseAttrLine('two words here and more')).toBeNull();
  });
});
