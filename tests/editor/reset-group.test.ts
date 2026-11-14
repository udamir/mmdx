// @vitest-environment jsdom
// "Reset positions in this group" (T07) in the editor: the action, the group's ⋮ menu in the selection toolbar, the
// board's context menu and the button in Properties; one undo step, and "Nothing to reset" without a step when the
// group has no hand-placed positions.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';

// jsdom has no canvas: the text measurer falls back (its "not implemented" message is noise here)
vi.spyOn(console, 'error').mockImplementation(() => undefined);

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

let host: HTMLElement;
let ed: DiagramEditor | null = null;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  ed?.destroy();
  ed = null;
  host.remove();
  document.body.replaceChildren();
});

const CODE = 'flowchart TB\n  subgraph G[Team]\n    A[Alpha] --> B[Beta]\n  end\n  X[Outside] --> A\n';
const PLACED = `${CODE}%%@ node A {"x":100,"y":80,"fill":"#ffeecc"}\n%%@ node B {"x":120,"y":220}\n%%@ node X {"x":400,"y":60}\n`;

const mount = (value: string): DiagramEditor => {
  ed = new DiagramEditor(host, { value, storage: memoryStorage() });
  return ed;
};
const $ = <T extends Element = HTMLElement>(sel: string): T | null => host.shadowRoot!.querySelector<T>(sel);
const $$ = (sel: string): HTMLElement[] => Array.from(host.shadowRoot!.querySelectorAll<HTMLElement>(sel));
const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    await vi.dynamicImportSettled();
    await new Promise((r) => setTimeout(r, 0));
  }
};
const toast = (): string | null | undefined => $('.mmdx-toast')?.textContent;
const groupBox = (e: DiagramEditor): { x: number; y: number } => {
  const g = e.core.geom;
  if (g.type !== 'flowchart') throw new Error('flowchart expected');
  const b = g.groups.get('G')!;
  return { x: Math.round(b.x - b.w / 2), y: Math.round(b.y - b.h / 2) };
};
const selectGroup = async (e: DiagramEditor): Promise<void> => {
  e.core.select([{ kind: 'group', id: 'G' }]);
  e.core.fire('selection');
  await settle();
  e.core.run('refreshToolbar');
};
/** The metadata after the reset: the descendants lost x / y (styles kept), the group got its top-left, no size. */
const expectReset = (e: DiagramEditor, at: { x: number; y: number }): void => {
  expect(e.core.meta.nodes).toEqual({ A: { fill: '#ffeecc' }, X: { x: 400, y: 60 } });
  expect(e.core.meta.groups?.['G']).toEqual(at);
};
const steps = (e: DiagramEditor): number => {
  let n = 0;
  while (e.store.canUndo.peek()) {
    e.undo();
    n++;
  }
  return n;
};

describe('Reset positions in this group', () => {
  test('the action forgets the positions inside, keeps the group in place, one undo step', async () => {
    const e = mount(PLACED);
    await settle();
    await selectGroup(e);
    const at = groupBox(e);
    e.core.run('resetGroupPositions');
    expectReset(e, at);
    expect(e.store.undoLabel()).toBe('Reset positions in this group');
    expect(toast()).toBe('Positions in the group reset');
    expect(e.core.selection()).toEqual([{ kind: 'group', id: 'G' }]);
    expect(steps(e)).toBe(1);
    expect(e.core.meta.nodes?.['B']).toEqual({ x: 120, y: 220 });
    expect(e.core.meta.groups?.['G']).toBeUndefined();
  });

  test('a group without hand-placed positions: "Nothing to reset", no step', async () => {
    const e = mount(`${CODE}%%@ node X {"x":400,"y":60}\n`);
    await settle();
    await selectGroup(e);
    const meta = JSON.stringify(e.core.meta);
    e.core.run('resetGroupPositions');
    expect(toast()).toBe('Nothing to reset — the group has no hand-placed positions');
    expect(e.store.canUndo.peek()).toBe(false);
    expect(JSON.stringify(e.core.meta)).toBe(meta);
  });

  test('the group\'s ⋮ menu in the selection toolbar runs it; disabled when there is nothing to reset', async () => {
    const e = mount(PLACED);
    await settle();
    await selectGroup(e);
    const at = groupBox(e);
    const open = (): HTMLButtonElement | undefined => {
      $<HTMLButtonElement>('.mtb [data-c="more"]')!.click();
      return $$('.mtb-pop [role=menuitem]').find((b) => b.textContent?.includes('Reset positions in this group')) as HTMLButtonElement | undefined;
    };
    const item = open()!;
    expect(item.disabled).toBe(false);
    item.click();
    expectReset(e, at);
    expect(e.store.undoLabel()).toBe('Reset positions in this group');
    await settle();
    e.core.run('refreshToolbar');
    const again = open()!;
    expect(again.disabled).toBe(true);
    expect(again.title).toBe('Nothing to reset — the group has no hand-placed positions');
    // a node's menu has no such entry
    e.core.select([{ kind: 'node', id: 'A' }]);
    e.core.fire('selection');
    await settle();
    e.core.run('refreshToolbar');
    expect(open()).toBeUndefined();
  });

  test('Properties: a button in the group\'s geometry section', async () => {
    const e = mount(PLACED);
    await settle();
    e.core.run('setPanel', 'properties', true);
    await selectGroup(e);
    await settle();
    const at = groupBox(e);
    const btn = (): HTMLButtonElement => $<HTMLButtonElement>('.mmdx-panel.props button.reset-group')!;
    expect(btn().textContent).toBe('Reset positions in this group');
    expect(btn().disabled).toBe(false);
    btn().click();
    expectReset(e, at);
    expect(e.store.undoLabel()).toBe('Reset positions in this group');
    await settle();
    expect(btn().disabled).toBe(true);
    // a node has no such button
    e.core.select([{ kind: 'node', id: 'A' }]);
    e.core.fire('selection');
    await settle();
    expect($('.mmdx-panel.props button.reset-group')).toBeNull();
  });

  test('right-click on a group: the board menu has the entry (and selects the group)', async () => {
    const e = mount(PLACED);
    await settle();
    const at = groupBox(e);
    const el = Array.from(e.core.dom.body.querySelectorAll('.el')).find((n) => n.getAttribute('data-kind') === 'group' && n.getAttribute('data-id') === 'G')!;
    const target = el.querySelector('rect, path') ?? el;
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true, clientX: 50, clientY: 50 }));
    await settle();
    expect(e.core.selection()).toEqual([{ kind: 'group', id: 'G' }]);
    const item = $$('.ctx-menu [role=menuitem]').find((b) => b.textContent?.includes('Reset positions in this group')) as HTMLButtonElement | undefined;
    expect(item).toBeTruthy();
    item!.click();
    expectReset(e, at);
    // a node's right-click still opens nothing
    const node = Array.from(e.core.dom.body.querySelectorAll('.el')).find((n) => n.getAttribute('data-kind') === 'node' && n.getAttribute('data-id') === 'X')!;
    node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true, clientX: 50, clientY: 50 }));
    await settle();
    expect($$('.ctx-menu [role=menuitem]').some((b) => b.textContent?.includes('Reset positions'))).toBe(false);
  });
});
