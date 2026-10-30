// @vitest-environment jsdom
// Shapes menu (A.3 rows 30–31): palette per diagram type, click / addShape with placement rules, presets, S key.
import { describe, expect, test, vi } from 'vitest';
import type { EditorCore } from '../../src/editor/core.js';
import { shapesModule } from '../../src/editor/modules/shapes/index.js';
import { lines, mount } from './connect.helpers.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);

const menuOf = (core: EditorCore): HTMLElement => core.dom.root.querySelector('.shapes-menu')!;
const subOf = (core: EditorCore): HTMLElement => core.dom.root.querySelector('.shapes-sub')!;
const press = (el: Element, type: string, x = 0, y = 0): void => {
  const ev = new MouseEvent(type, { bubbles: true, composed: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  el.dispatchEvent(ev);
};

describe('shapes menu', () => {
  test('flowchart: 11 shapes; S toggles; clicking an item adds a node in the middle and closes the menu; undo', () => {
    const { core, ed } = mount('flowchart TB\n  A["A"]\n', [shapesModule]);
    const menu = menuOf(core);
    expect(menu.hidden).toBe(true);
    core.dom.root.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
    expect(menu.hidden).toBe(false);
    expect(menu.querySelectorAll('.pal-item').length).toBe(11);
    const queue = [...menu.querySelectorAll('.pal-item')].find((b) => b.textContent === 'Queue')!;
    press(queue, 'pointerdown');
    press(queue, 'pointerup');
    expect(menu.hidden).toBe(true);
    const sel = core.primary()!;
    expect(sel.kind).toBe('node');
    expect(lines(core)).toContain(`${sel.id}["Queue"]`);
    expect(core.getM('node', sel.id).shape).toBe('hcyl'); // not a Mermaid shape: rect + meta shape
    ed.undo();
    expect(core.model.type === 'flowchart' && core.model.nodes.has(sel.id)).toBe(false);
  });

  test('a shape dropped inside a subgraph joins it (addShape action), with a preset', () => {
    const { core } = mount('flowchart TB\n  subgraph G ["Group"]\n    A["A"]\n  end\n', [shapesModule]);
    const g = core.geom.type === 'flowchart' ? core.geom.groups.get('G')! : null;
    core.run('addShape', 'diamond', { at: { x: g!.x + 3, y: g!.y + 3 }, preset: 'warning' });
    const id = core.primary()!.id;
    expect(core.model.type === 'flowchart' && core.model.nodes.get(id)?.parent).toBe('G');
    expect(lines(core)).toContain(`${id}{"Decision"}`);
    expect(core.getM('node', id)).toMatchObject({ x: core.snapV(g!.x + 3), y: core.snapV(g!.y + 3), preset: 'warning' });
  });

  test('preset submenu opens beside a hovered item with a default tile', () => {
    const { core } = mount('flowchart TB\n  A["A"]\n', [shapesModule]);
    core.run('toggleShapesMenu');
    const item = menuOf(core).querySelector('.pal-item')!;
    item.dispatchEvent(new MouseEvent('pointerenter'));
    const sub = subOf(core);
    expect(sub.hidden).toBe(false);
    expect(sub.querySelector('.pp-name')?.textContent).toBe('default');
    expect(sub.style.getPropertyValue('--cols')).not.toBe('');
  });

  test('sequence: participant before the one right of the drop point; note over the nearest; loop around the nearest message', () => {
    const { core, ed } = mount('sequenceDiagram\n  participant A\n  participant B\n  A->>B: hi\n', [shapesModule]);
    const sg = core.geom.type === 'sequence' ? core.geom : null;
    const ax = sg!.participants.get('A')!.x, bx = sg!.participants.get('B')!.x, my = sg!.messages.get('m1')!.y;
    core.run('addShape', 'actor', { at: { x: (ax + bx) / 2, y: 10 } });
    expect(lines(core).slice(1, 4)).toEqual(['participant A', 'actor Actor1', 'participant B']);
    ed.undo();
    core.run('addShape', 'note', { at: { x: bx + 5, y: my + 30 } });
    expect(lines(core)).toContain('Note over B: note');
    expect(core.primary()?.kind).toBe('note');
    core.run('addShape', 'loop', { at: { x: ax, y: my }, preset: 'warning' });
    expect(lines(core).slice(3, 6)).toEqual(['loop every minute', 'A->>B: hi', 'end']);
    expect(core.primary()).toEqual({ kind: 'block', id: 'b1' });
    expect(core.getM('block', 'b1').preset).toBe('warning');
    ed.undo();
    expect(lines(core)).not.toContain('loop every minute');
    expect(core.getM('block', 'b1').preset).toBeUndefined();
  });

  test('sequence: a block without messages is refused', () => {
    const { core } = mount('sequenceDiagram\n  participant A\n', [shapesModule]);
    const toast = vi.spyOn(core, 'toast');
    core.run('addShape', 'alt');
    expect(toast).toHaveBeenCalledWith('Add a message first (drag between two participants)');
  });

  test('ER: S shows the table presets; a tile click adds a table', () => {
    const { core } = mount('erDiagram\n  A {\n    string id\n  }\n', [shapesModule]);
    core.dom.root.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
    expect(menuOf(core).hidden).toBe(true);
    const sub = subOf(core);
    expect(sub.hidden).toBe(false);
    const tile = sub.querySelector('.pp-item')!;
    press(tile, 'pointerdown');
    press(tile, 'pointerup');
    expect(core.primary()?.kind).toBe('entity');
    expect(core.model.type === 'er' && core.model.entities.size).toBe(2);
    expect(sub.hidden).toBe(true);
  });
});
