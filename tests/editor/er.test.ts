// @vitest-environment jsdom
// The ER diagram in the editor since T11: subgraphs (11.17+) as groups — ⌘G and Ungroup, Delete of a subgraph, a
// dropped table joining the subgraph under the point, a relationship to a subgraph, a subgraph's title and direction
// in Properties, a group drag carrying its tables; relationship edits keeping the written form (E8); a table's
// preset from a Mermaid class — each one undo step, and every result parsed by stock Mermaid 12.2 and 11.17.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { ItemRef } from '../../src/core/types.js';
import type { EditorCore } from '../../src/editor/core.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { DEFAULT_MODULES } from '../../src/editor/modules/index.js';
import { editKind } from '../../src/editor/kinds/registry.js';
import { createConnection } from '../../src/editor/modules/connect/lib.js';
import { moveItem } from '../../src/core/ops/positions.js';
import { currentPreset } from '../../src/core/ops/style-env.js';
import { updateRel } from '../../src/core/kinds/er/ops.js';
import { stockParse } from '../helpers/mermaid.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

const SRC = `erDiagram
  subgraph Sales [Sales domain]
    CUSTOMER ||--o{ ORDER : places
  end
  PRODUCT
  ORDER }o--|| PRODUCT : contains
`;

const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

async function mount(value = SRC): Promise<{ ed: DiagramEditor; core: EditorCore }> {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, modules: DEFAULT_MODULES, storage: memoryStorage() });
  editors.push(ed);
  await ed.whenLoaded();
  ed.core.viewport.set({ k: 1, tx: 0, ty: 0 });
  ed.core.draw();
  return { ed, core: ed.core };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    await vi.dynamicImportSettled();
    await Promise.resolve();
    await Promise.resolve();
  }
};
const model = (core: EditorCore) => {
  if (core.model.type !== 'er') throw new Error(`not an ER diagram: ${core.model.type}`);
  return core.model;
};
const geom = (core: EditorCore) => {
  if (core.geom.type !== 'er') throw new Error('no ER geometry');
  return core.geom;
};
const valid = async (core: EditorCore): Promise<void> => {
  await expect(stockParse(core.code), core.code).resolves.toBeTruthy();
};
const undoes = (ed: DiagramEditor, before: string): void => {
  ed.undo();
  expect(ed.core.code).toBe(before);
};
const entity = (id: string): ItemRef => ({ kind: 'entity', id });
const group = (id: string): ItemRef => ({ kind: 'group', id });
const kind = () => editKind('er')!;

describe('ER: subgraphs in the editor', () => {
  it('the subgraph is a group item with its tables in it, drawn around them', async () => {
    const { core } = await mount();
    const g = geom(core).groups.get('Sales')!, c = geom(core).entities.get('CUSTOMER')!;
    expect(Math.abs(c.x - g.x)).toBeLessThan(g.w / 2);
    expect(Math.abs(c.y - g.y)).toBeLessThan(g.h / 2);
    expect(core.parentOf(entity('ORDER'))).toBe('Sales');
    expect(kind().describe(model(core), group('Sales'))).toEqual({ title: 'Sales domain', sub: 'subgraph · id Sales · 2 items' });
  });

  it('⌘G makes a subgraph of tables; refused across subgraphs', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    expect(kind().canGroup(model(core), [entity('CUSTOMER'), entity('PRODUCT')])).toMatchObject({ ok: false });
    core.select([entity('PRODUCT')]);
    await core.run('groupSelection');
    await flush();
    const M = model(core);
    const gid = [...M.groups.keys()].find((id) => id !== 'Sales')!;
    expect(M.entities.get('PRODUCT')!.parent).toBe(gid);
    expect(M.entities.get('ORDER')!.parent).toBe('Sales');
    await valid(core);
    undoes(ed, before);
  });

  it('Ungroup removes the frame and keeps the tables', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    core.select([group('Sales')]);
    await core.run('ungroupSelection');
    await flush();
    const M = model(core);
    expect(M.groups.size).toBe(0);
    expect([...M.entities.keys()].sort()).toEqual(['CUSTOMER', 'ORDER', 'PRODUCT']);
    expect(core.code.trimEnd()).toBe('erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  PRODUCT\n  ORDER }o--|| PRODUCT : contains');
    await valid(core);
    undoes(ed, before);
  });

  it('a table dropped on a subgraph is written into it', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    const g = geom(core).groups.get('Sales')!;
    const item = kind().palette!.items.find((x) => 'key' in x && x.key === 'entity')!;
    expect(kind().drop!(core, model(core) as never, item as never, { x: g.x, y: g.y + g.h / 2 - 5 })).toBe(true);
    expect(model(core).entities.get('ENTITY_1')!.parent).toBe('Sales');
    await valid(core);
    undoes(ed, before);
  });

  it('a relationship to a subgraph (after its end)', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    expect(createConnection(core, entity('PRODUCT'), 'r', group('Sales'))).toBe(true);
    const r = model(core).rels.at(-1)!;
    expect([r.from, r.to]).toEqual(['PRODUCT', 'Sales']);
    expect(geom(core).rels.get(r.id)).toBeTruthy();
    expect(model(core).diagnostics).toEqual([]);
    await valid(core);
    undoes(ed, before);
  });

  it("the subgraph's title inline and its direction in Properties", async () => {
    const { ed, core } = await mount();
    const before = core.code;
    const t = kind().text(model(core), group('Sales'))!;
    expect(t.value).toBe('Sales domain');
    core.applyCode(t.write(core.code, 'Sales & billing'), 'Rename');
    expect(model(core).groups.get('Sales')!.label).toBe('Sales & billing');
    const ctl = kind().properties!(core, model(core), group('Sales'));
    expect(ctl).toHaveLength(1);
    const sel = ctl[0]!;
    if (sel.type !== 'select') throw new Error('expected a select');
    sel.set('LR');
    expect(model(core).groups.get('Sales')!.dir).toBe('LR');
    await valid(core);
    undoes(ed, core.code.replace('    direction LR\n', ''));
    undoes(ed, before);
  });

  it('dragging a subgraph carries its tables', async () => {
    const { core } = await mount();
    const c0 = geom(core).entities.get('CUSTOMER')!, p0 = geom(core).entities.get('PRODUCT')!;
    const { meta } = moveItem(core.model, core.meta, core.geom, group('Sales'), 40, 20);
    expect(meta.entities?.['CUSTOMER']).toMatchObject({ x: Math.round(c0.x) + 40, y: Math.round(c0.y) + 20 });
    // the tables outside were pinned where they were drawn
    expect(meta.entities?.['PRODUCT']).toMatchObject({ x: Math.round(p0.x), y: Math.round(p0.y) });
  });

  it('Delete of a subgraph removes its frame only', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    core.select([group('Sales')]);
    core.run('deleteSelection');
    await flush();
    expect(model(core).groups.size).toBe(0);
    expect(model(core).entities.size).toBe(3);
    await valid(core);
    undoes(ed, before);
  });
});

describe('ER: relationships and classes in the editor', () => {
  it('a cardinality changed in Properties keeps the written words', async () => {
    const { ed, core } = await mount('erDiagram\n  CUSTOMER only one to zero or more ORDER : places\n');
    const before = core.code;
    core.applyCode(updateRel(core.code, model(core), 'CUSTOMER--ORDER', { toCard: 'one-many' }), 'Relationship');
    expect(core.code.trimEnd()).toBe('erDiagram\n  CUSTOMER only one to one or more ORDER : places');
    await valid(core);
    undoes(ed, before);
  });

  it('a class that names a preset gives the table that preset (as in the flowchart)', async () => {
    const { core } = await mount('erDiagram\n  A:::nosuch\n  B\n');
    const P = Object.keys(core.result.theme.er.entityPresets ?? {});
    expect(P.length).toBeGreaterThan(0);
    const { core: c2 } = await mount(`erDiagram\n  A:::${P[0]}\n  B\n`);
    expect(currentPreset(c2.styleEnv(), entity('A'))).toBe(P[0]);
    expect(currentPreset(core.styleEnv(), entity('A'))).toBe('');
    // a class with neither a classDef nor a preset is a problem
    expect(kind().problems!(core, model(core))).toEqual([{ line: 2, msg: expect.stringContaining('nosuch') }]);
  });
});
