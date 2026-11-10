// @vitest-environment jsdom
// Small editor fixes of the codebase audit (task 1.20): B27, B30, B31, B35.
import { afterEach, describe, expect, it } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { POSITIONAL_KINDS } from '../../src/core/ids.js';
import { DiagramEditor } from '../../src/editor/editor.js';

const FLOW = 'flowchart TB\n  A[Alpha] --> B[Beta]\n  B --> C[Gamma]\n';
const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});
const mount = (value = FLOW): DiagramEditor => {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, storage: memoryStorage() });
  editors.push(ed);
  return ed;
};
const key = (target: EventTarget, k: string, mods: KeyboardEventInit = {}): void =>
  void target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true, ...mods }));

describe('B27: Paste style applies to the whole selection', () => {
  it('⌘⌥V paints every selected item, as one step', () => {
    const ed = mount();
    const core = ed.core;
    core.change('Fill', () => void ((core.meta.nodes ??= {})['A'] = { fill: '#123456' }));
    core.select([{ kind: 'node', id: 'A' }]);
    core.run('copyStyle');
    core.select([{ kind: 'node', id: 'B' }, { kind: 'node', id: 'C' }]);
    key(core.dom.root, 'v', { metaKey: true, ctrlKey: true, altKey: true });
    expect(core.meta.nodes?.['B']?.fill).toBe('#123456');
    expect(core.meta.nodes?.['C']?.fill).toBe('#123456');
    core.store.undo();
    expect(core.meta.nodes?.['B']?.fill).toBeUndefined();
    expect(core.meta.nodes?.['C']?.fill).toBeUndefined();
  });
});

describe('B30: positional ids', () => {
  it('messages, notes, blocks, boxes and activations are positional', () => {
    expect([...POSITIONAL_KINDS].sort()).toEqual(['activation', 'block', 'box', 'message', 'note']);
  });

  it('deleting the first box moves the second box\'s metadata to its new id', () => {
    const code = 'sequenceDiagram\n  box Aqua One\n    participant A\n  end\n  box Two\n    participant B\n  end\n  A->>B: hi\n';
    const ed = mount(code);
    const core = ed.core;
    core.change('Fill', () => void ((core.meta.boxes ??= {})['box2'] = { fill: '#f00' }));
    core.select([{ kind: 'box', id: 'box1' }]);
    key(core.dom.root, 'Delete');
    expect(core.code).not.toContain('One');
    expect(core.meta.boxes?.['box1']).toEqual({ fill: '#f00' });
    expect(core.meta.boxes?.['box2']).toBeUndefined();
  });
});

describe('B31: Space in a select does not arm space-pan', () => {
  it('a <select> takes the key', () => {
    const ed = mount();
    const sel = document.createElement('select');
    ed.core.dom.root.append(sel);
    key(sel, ' ');
    expect(ed.core.spaceDown).toBe(false);
  });
});

describe('B35: editor.name follows the core', () => {
  it('a name set on the core reads back from the editor', () => {
    const ed = mount();
    ed.core.fileName = 'opened';
    expect(ed.name).toBe('opened');
    ed.name = 'renamed';
    expect(ed.core.fileName).toBe('renamed');
  });
});
