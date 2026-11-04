// @vitest-environment jsdom
// Z-index in the editor: ⌘[ / ⌘] step the item's `z` from its effective value (the theme's when it sets none), the
// order popover edits it and "From theme" drops the override; sequence diagrams keep the code order.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { DEFAULT_MODULES } from '../../src/editor/modules/index.js';

let host: HTMLElement;
let ed: DiagramEditor | null = null;
const flush = async (): Promise<void> => {
  await vi.dynamicImportSettled();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  ed?.destroy();
  ed = null;
  host.remove();
});

const mount = async (value: string): Promise<DiagramEditor> => {
  ed = new DiagramEditor(host, { value, modules: DEFAULT_MODULES, storage: memoryStorage() });
  await flush();
  return ed;
};

describe('z-index', () => {
  test('⌘] lifts an edge from the theme value, ⌘[ lowers it; the edge then draws over the nodes', async () => {
    const e = await mount('flowchart LR\n  A -->|x| B\n');
    e.core.select([{ kind: 'edge', id: 'A->B' }]);
    e.core.run('moveSelection', 1);
    expect(e.core.meta.edges?.['A->B']?.z).toBe(2);
    e.core.run('moveSelection', 1);
    const order = e.core.result.result.body.map((n) => (n.t === 'g' ? String(n.attrs['data-id']) : ''));
    expect(order.indexOf('A->B')).toBeGreaterThan(order.indexOf('B'));
    e.core.run('moveSelection', -1);
    expect(e.core.meta.edges?.['A->B']?.z).toBe(2);
    expect(e.core.code.trim()).toBe('flowchart LR\n  A -->|x| B');
  });

  test('several selected items step together, each from its own value', async () => {
    const e = await mount('flowchart LR\n  subgraph G\n    A\n  end\n  A --> B\n');
    e.core.select([{ kind: 'group', id: 'G' }, { kind: 'node', id: 'B' }]);
    e.core.run('moveSelection', -1);
    expect(e.core.meta.groups?.['G']?.z).toBe(-1);
    expect(e.core.meta.nodes?.['B']?.z).toBe(1);
  });

  test('sequence diagrams keep moving in the code order', async () => {
    const e = await mount('sequenceDiagram\n  A->>B: one\n  A->>B: two\n');
    const first = e.core.code;
    const m = e.core.model;
    if (m.type !== 'sequence') throw new Error('sequence');
    const msg = m.items.find((x) => x.kind === 'message')!;
    e.core.select([{ kind: 'message', id: (msg as { id: string }).id }]);
    e.core.run('moveSelection', 1);
    expect(e.core.code).not.toBe(first);
    expect(JSON.stringify(e.core.meta)).not.toContain('"z"');
  });
});
