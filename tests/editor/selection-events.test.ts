// @vitest-environment jsdom
// Selection events (B11, P4, P5): `selection` and `mmdx-selection` fire once for every real change of the document's
// selection — however it changes (a pick, undo / redo, a rolled-back gesture) — never on construction or for the same
// items again, and a selection change does not render the diagram again.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { EditorCore } from '../../src/editor/core.js';
import { DiagramEditor } from '../../src/editor/editor.js';

const FLOW = 'flowchart TB\n  A[Alpha] --> B[Beta]\n  B --> C[Gamma]\n';
const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function mount(): { core: EditorCore; fired: string[]; emitted: string[][] } {
  const host = document.createElement('div');
  document.body.append(host);
  const fired: string[] = [], emitted: string[][] = [];
  host.addEventListener('mmdx-selection', (e) => emitted.push((e as CustomEvent<{ items: { id: string }[] }>).detail.items.map((x) => x.id)));
  const ed = new DiagramEditor(host, { value: FLOW, storage: memoryStorage() });
  editors.push(ed);
  ed.core.on('selection', () => fired.push(ed.core.selection().map((x) => x.id).join(',')));
  return { core: ed.core, fired, emitted };
}

describe('selection events', () => {
  it('nothing on construction; once per change; nothing for the same items again', () => {
    const { core, fired, emitted } = mount();
    expect(emitted).toEqual([]);
    core.select([{ kind: 'node', id: 'A' }]);
    core.select([{ kind: 'node', id: 'A' }]);
    expect(fired).toEqual(['A']);
    expect(emitted).toEqual([['A']]);
  });

  it('undo restores the selection and reports it (B11)', () => {
    const { core, emitted } = mount();
    core.select([{ kind: 'node', id: 'A' }]);
    core.change('Fill', () => void ((core.meta.nodes ??= {})['A'] = { fill: '#f00' }));
    core.select([{ kind: 'node', id: 'B' }]);
    emitted.length = 0;
    core.store.undo();
    expect(core.selection().map((x) => x.id)).toEqual(['A']);
    expect(emitted).toEqual([['A']]);
  });

  it('a pick does not render the diagram again (P4)', () => {
    const { core } = mount();
    const paint = vi.spyOn(core.storeScene, 'paintDocument');
    core.select([{ kind: 'node', id: 'A' }]);
    core.select([{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]);
    expect(paint).not.toHaveBeenCalled();
    // Select all (⌘A) neither
    core.run('selectAll');
    expect(paint).not.toHaveBeenCalled();
    expect(core.dom.body.querySelectorAll('.selected').length).toBeGreaterThan(2);
    core.select([{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]);
    // the multi-selection marks are on the picture
    expect(core.dom.body.querySelectorAll('.selected').length).toBe(2);
  });
});

describe('mmdx-op payload (B46)', () => {
  it('a gesture commit and a metadata change carry the code, as applyCode does', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const ed = new DiagramEditor(host, { value: FLOW, storage: memoryStorage() });
    editors.push(ed);
    const ops: { type: string; code?: string }[] = [];
    host.addEventListener('mmdx-op', (e) => ops.push((e as CustomEvent<{ type: string; code?: string }>).detail));
    ed.core.begin();
    (ed.core.meta.nodes ??= {})['A'] = { x: 10, y: 10 };
    ed.core.commit('Move');
    ed.core.change('Fill', () => void ((ed.core.meta.nodes ??= {})['B'] = { fill: '#f00' }));
    ed.core.applyCode({ code: FLOW + '  C --> D\n' }, 'Edit');
    expect(ops.map((o) => [o.type, typeof o.code])).toEqual([['Move', 'string'], ['Fill', 'string'], ['Edit', 'string']]);
  });
});
