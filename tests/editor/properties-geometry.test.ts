// @vitest-environment jsdom
// The geometry fields of Properties, for one item and for several of one kind (one set of helpers for both): boxes
// show their rounded position and size, connectors their routing and label position (ER relationships: the label
// counted from the other end).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { ItemRef } from '../../src/core/types.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { panesModule } from '../../src/editor/modules/chrome/panes.js';
import { rightPanelsModule } from '../../src/editor/modules/panels/right-panels.js';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

let ed: DiagramEditor | null = null;
afterEach(() => {
  ed?.destroy();
  ed = null;
  document.body.replaceChildren();
});
const mount = (value: string): DiagramEditor => {
  const host = document.createElement('div');
  document.body.append(host);
  ed = new DiagramEditor(host, { value, modules: [panesModule, rightPanelsModule], storage: memoryStorage() });
  return ed;
};
const flush = async (): Promise<void> => {
  // the Properties inspectors load the first time the panel shows
  await vi.dynamicImportSettled();
  await Promise.resolve();
  await Promise.resolve();
};
/** What each geometry field shows (a number's placeholder is the value in effect; a select names it in its first option). */
const fields = async (e: DiagramEditor, items: ItemRef[]): Promise<Record<string, string>> => {
  e.select(items);
  await flush();
  const out: Record<string, string> = {};
  for (const el of e.core.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.mmdx-panel.props [id^="f-"]')) {
    const name = el.id.split('-')[1]!;
    if (!['x', 'y', 'w', 'h', 'routing', 'labelAt', 'fromSide'].includes(name)) continue;
    out[name] = el instanceof HTMLSelectElement ? el.selectedOptions[0]!.text : el.type === 'number' ? el.value || el.placeholder : el.value;
  }
  return out;
};

describe('Properties geometry', () => {
  it('a node and several nodes: rounded position and size', async () => {
    const e = mount('flowchart LR\n  A[Alpha] --> B[Beta]\n');
    const g = e.core.geom;
    if (g.type !== 'flowchart') throw new Error('flowchart expected');
    const a = g.nodes.get('A')!;
    const one = await fields(e, [{ kind: 'node', id: 'A' }]);
    expect(one).toMatchObject({ x: String(Math.round(a.x)), y: String(Math.round(a.y)), w: String(Math.round(a.w)), h: String(Math.round(a.h)) });
    const both = await fields(e, [{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]);
    expect(Object.keys(both).sort()).toEqual(['h', 'w', 'x', 'y']);
    expect(both.h).toBe(String(Math.round(a.h)));
  });

  it('connectors: routing and label position; relationships count the label from the other end', async () => {
    const e = mount('flowchart LR\n  A --> B\n  B --> C\n');
    const M = e.core.model;
    if (M.type !== 'flowchart') throw new Error('flowchart expected');
    const one = await fields(e, [{ kind: 'edge', id: M.edges[0]!.id }]);
    expect(one.routing).toMatch(/curved/i);
    expect(one.labelAt).toBe('0.5');
    expect('fromSide' in one).toBe(true);
    const both = await fields(e, M.edges.map((x) => ({ kind: 'edge' as const, id: x.id })));
    expect(both.routing).toMatch(/curved/i);
    expect(both.labelAt).toBe('0.5');

    e.setSource('erDiagram\n  A ||--o{ B : has\n  B ||--o{ C : has\n');
    const R = e.core.model;
    if (R.type !== 'er') throw new Error('er expected');
    const rel = await fields(e, [{ kind: 'rel', id: R.rels[0]!.id }]);
    const at = (e.core.result.theme.er.rel as unknown as { labelAt?: number }).labelAt;
    expect(rel.labelAt).toBe(String(1 - (typeof at === 'number' ? at : 0.5)));
    const rels = await fields(e, R.rels.map((x) => ({ kind: 'rel' as const, id: x.id })));
    expect(rels.labelAt).toBe(rel.labelAt);
  });
});
