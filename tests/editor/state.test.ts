// @vitest-environment jsdom
// The state diagram in the editor (T09.5, T09.6): its kinds loaded on demand, the palette (drops into the composite
// and region under the point; start, end and note next to a state, refused with a toast where Mermaid has no place for
// them), connect and reconnect through the connect module, texts edited inline and in Properties keeping the form in
// use, the type's Properties controls (kind, description rows, direction, Add region, note side), ⌘G / Ungroup (asking
// before inner starts and ends are rewired), Delete of a composite asking about its contents, copy / paste / duplicate,
// icons as label tokens and images in metadata — each one undo step, and every result parsed by stock Mermaid 12.2 and 11.17.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { ALL_DIFF_KINDS } from '../../src/core/kinds/all-diff.js';
import { ALL_OPS_KINDS } from '../../src/core/kinds/all-ops.js';
import { ALL_VIEW_KINDS } from '../../src/core/kinds/all.js';
import { forgetKinds, forgetOps, registerDiffs, registerKinds, registerOps, viewKind } from '../../src/core/kinds/registry.js';
import type { ItemRef, Point } from '../../src/core/types.js';
import type { EditorCore } from '../../src/editor/core.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { DEFAULT_MODULES } from '../../src/editor/modules/index.js';
import { ALL_EDIT_KINDS } from '../../src/editor/kinds/all.js';
import { editKind, forgetEditKinds, registerEditKinds } from '../../src/editor/kinds/registry.js';
import { createConnection, reconnect } from '../../src/editor/modules/connect/index.js';
import { mediaTargets, setIconOf, setImageOf, setMediaOf } from '../../src/editor/ops/media.js';
import { stockParse } from '../helpers/mermaid.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

let mermaidParse: (code: string) => Promise<unknown>;
beforeAll(async () => {
  mermaidParse = stockParse;
});

const SRC = `stateDiagram-v2
  [*] --> Idle
  Idle --> Busy : go
  state Busy {
    [*] --> Work
    Work --> Done
    Done --> [*]
  }
  Busy --> Idle
  note right of Idle : waiting
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
  // the Properties inspectors load the first time the panel shows; the dialogs answer in a microtask
  for (let i = 0; i < 3; i++) {
    await vi.dynamicImportSettled();
    await Promise.resolve();
    await Promise.resolve();
  }
};

const model = (core: EditorCore) => {
  if (core.model.type !== 'state') throw new Error(`not a state diagram: ${core.model.type}`);
  return core.model;
};
const geom = (core: EditorCore) => {
  if (core.geom.type !== 'state') throw new Error('no state geometry');
  return core.geom;
};
const box = (core: EditorCore, id: string) => geom(core).nodes.get(id) ?? geom(core).groups.get(id)!;
const kind = () => editKind('state')!;
const item = (key: string) => kind().palette!.items.find((x) => 'key' in x && x.key === key)!;
const drop = (core: EditorCore, key: string, pt: Point): boolean => kind().drop!(core, core.model as never, item(key) as never, pt);
/** The code's lines, trimmed at the end only (indentation is part of what Mermaid reads). */
const lines = (core: EditorCore): string[] => core.code.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() && !l.startsWith('%%'));
const valid = async (core: EditorCore): Promise<void> => {
  await expect(mermaidParse(core.code), core.code).resolves.toBeTruthy();
};
const node = (id: string): ItemRef => ({ kind: 'node', id });
const group = (id: string): ItemRef => ({ kind: 'group', id });
const far = (core: EditorCore): Point => {
  let x = 0, y = 0;
  for (const b of [...geom(core).nodes.values(), ...geom(core).groups.values()]) {
    x = Math.max(x, b.x + b.w / 2);
    y = Math.max(y, b.y + b.h / 2);
  }
  return { x: x + 1000, y: y + 1000 };
};
/** A point beside an item (outside it, on its left or right), at its height. */
const beside = (core: EditorCore, id: string, side: 'left' | 'right', gap = 30): Point => {
  const b = box(core, id);
  return { x: b.x + (side === 'left' ? -1 : 1) * (b.w / 2 + gap), y: b.y };
};
/** One action is one undo step: undo gives the code before it back. */
const undoes = (ed: DiagramEditor, before: string): void => {
  ed.undo();
  expect(ed.core.code).toBe(before);
};
const props = (core: EditorCore) => core.root.querySelector<HTMLElement>('.mmdx-panel.props')!;
const select = async (core: EditorCore, ref: ItemRef): Promise<void> => {
  core.select([ref]);
  await flush();
};
/** The item's text field in Properties (the first label field). */
const textField = (core: EditorCore): HTMLInputElement | HTMLTextAreaElement =>
  props(core).querySelector<HTMLInputElement | HTMLTextAreaElement>('.prop-label > input, .prop-label > textarea:not(.prop-rows)')!;
const setText = (core: EditorCore, v: string): void => {
  const f = textField(core);
  f.value = v;
  f.dispatchEvent(new Event('blur'));
};
const control = <T extends Element>(core: EditorCore, sel: string): T => {
  const e = props(core).querySelector<T>(sel);
  if (!e) throw new Error(`no ${sel} in Properties`);
  return e;
};
const choose = (core: EditorCore, sel: string, v: string): void => {
  const s = control<HTMLSelectElement>(core, sel);
  s.value = v;
  s.dispatchEvent(new Event('change'));
};

describe('state diagram: kinds on demand and the palette', () => {
  it('loads the state kinds for a stateDiagram-v2 document and draws it; the palette has 8 items', async () => {
    forgetKinds();
    forgetOps();
    forgetEditKinds();
    expect(editKind('state')).toBeUndefined();
    let core: EditorCore;
    try {
      ({ core } = await mount());
      expect(viewKind('state') && editKind('state')).toBeTruthy();
    } finally {
      // the other tests use the kinds the setup registered
      registerKinds(ALL_VIEW_KINDS);
      registerDiffs(ALL_DIFF_KINDS);
      registerOps(ALL_OPS_KINDS);
      registerEditKinds(ALL_EDIT_KINDS);
    }
    expect(core.model.type).toBe('state');
    expect(core.dom.body.querySelectorAll('.el[data-kind="node"]').length).toBe(6);
    expect(core.dom.body.querySelectorAll('.el[data-kind="group"]').length).toBe(1);
    expect(kind().palette!.items.map((x) => ('key' in x ? x.key : ''))).toEqual(['state', 'start', 'end', 'choice', 'fork', 'join', 'composite', 'note']);
  });
});

describe('state diagram: palette drops', () => {
  it('a state at the top level, at the drop point; one undo step', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    const pt = far(core);
    expect(drop(core, 'state', pt)).toBe(true);
    expect(lines(core).at(-1)).toBe('  s1');
    expect(model(core).nodes.get('s1')!.parent).toBeNull();
    expect(core.meta.nodes?.['s1']).toMatchObject({ x: Math.round(pt.x), y: Math.round(pt.y) });
    expect(core.primary()).toEqual(node('s1'));
    await valid(core);
    undoes(ed, before);
  });

  it('a state inside the composite under the point', async () => {
    const { core } = await mount();
    const w = box(core, 'Work');
    expect(drop(core, 'state', { x: w.x, y: w.y + 30 })).toBe(true);
    expect(lines(core).slice(3, 9)).toEqual(['  state Busy {', '    [*] --> Work', '    Work --> Done', '    Done --> [*]', '    s1', '  }']);
    expect(model(core).nodes.get('s1')!.parent).toBe('Busy');
    await valid(core);
  });

  it('a state into the second region of a composite with --', async () => {
    const { core } = await mount('stateDiagram-v2\n  state Active {\n    [*] --> A1\n    --\n    [*] --> B1\n  }\n');
    const b = box(core, 'B1');
    expect(drop(core, 'state', { x: b.x + 5, y: b.y + 5 })).toBe(true);
    expect(lines(core)).toEqual(['stateDiagram-v2', '  state Active {', '    [*] --> A1', '    --', '    [*] --> B1', '    s1', '  }']);
    expect(model(core).nodes.get('s1')).toMatchObject({ parent: 'Active', region: 1 });
    // the first region: before the `--`
    const a = box(core, 'A1');
    expect(drop(core, 'state', { x: a.x + 5, y: a.y + 5 })).toBe(true);
    expect(lines(core).slice(2, 5)).toEqual(['    [*] --> A1', '    s2', '    --']);
    expect(model(core).nodes.get('s2')).toMatchObject({ parent: 'Active', region: 0 });
    await valid(core);
  });

  it('a choice, a fork and a join', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    for (const k of ['choice', 'fork', 'join']) expect(drop(core, k, far(core))).toBe(true);
    expect(lines(core).slice(-3)).toEqual(['  state choice1 <<choice>>', '  state fork1 <<fork>>', '  state join1 <<join>>']);
    expect(['choice1', 'fork1', 'join1'].map((id) => model(core).nodes.get(id)!.kind)).toEqual(['choice', 'fork', 'join']);
    await valid(core);
    ed.undo();
    ed.undo();
    undoes(ed, before);
  });

  it('a start next to a state writes [*] --> it', async () => {
    const { ed, core } = await mount('stateDiagram-v2\n  A --> B\n');
    const before = core.code;
    expect(drop(core, 'start', beside(core, 'A', 'left'))).toBe(true);
    expect(lines(core)).toEqual(['stateDiagram-v2', '  A --> B', '  [*] --> A']);
    expect(core.primary()).toEqual(node('[*]start'));
    await valid(core);
    undoes(ed, before);
  });

  it('a start where the scope has one: refused with a toast, the existing start selected', async () => {
    const { core } = await mount();
    const toast = vi.spyOn(core, 'toast');
    const before = core.code;
    expect(drop(core, 'start', beside(core, 'Idle', 'left'))).toBe(false);
    expect(toast).toHaveBeenCalledWith('This scope has a start already');
    expect(core.code).toBe(before);
    expect(core.selection()).toEqual([node('[*]start')]);
    // inside the composite: the composite's own start
    const w = box(core, 'Work');
    expect(drop(core, 'start', { x: w.x + w.w / 2 + 5, y: w.y })).toBe(false);
    expect(core.selection()).toEqual([node('Busy/[*]start')]);
  });

  it('an end next to a state writes it --> [*]; with no state near it is refused', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    expect(drop(core, 'end', beside(core, 'Idle', 'left'))).toBe(true);
    expect(lines(core).at(-1)).toBe('  Idle --> [*]');
    expect(core.primary()).toEqual(node('[*]end'));
    await valid(core);
    undoes(ed, before);
    const toast = vi.spyOn(core, 'toast');
    expect(drop(core, 'end', far(core))).toBe(false);
    expect(toast).toHaveBeenCalledWith('An end needs a state before it: drop it next to a state');
    expect(core.code).toBe(before);
  });

  it('a note next to a state: the side from the drop position', async () => {
    const { ed, core } = await mount('stateDiagram-v2\n  A --> B\n');
    const before = core.code;
    expect(drop(core, 'note', beside(core, 'A', 'left'))).toBe(true);
    expect(lines(core).at(-1)).toBe('  note left of A : Note');
    expect(core.primary()).toEqual({ kind: 'note', id: 'n1' });
    await valid(core);
    undoes(ed, before);
    expect(drop(core, 'note', beside(core, 'B', 'right'))).toBe(true);
    expect(lines(core).at(-1)).toBe('  note right of B : Note');
    await valid(core);
  });

  it('a composite: state Group1 { around a new state }', async () => {
    const { ed, core } = await mount('stateDiagram-v2\n  A --> B\n');
    const before = core.code;
    expect(drop(core, 'composite', far(core))).toBe(true);
    expect(lines(core)).toEqual(['stateDiagram-v2', '  A --> B', '  state Group1 {', '    s1', '  }']);
    expect(core.primary()).toEqual(group('Group1'));
    expect(model(core).nodes.get('s1')!.parent).toBe('Group1');
    await valid(core);
    undoes(ed, before);
  });
});

describe('state diagram: connect and reconnect', () => {
  it('two states of one composite: the transition is written inside it', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    expect(createConnection(core, node('Done'), 't', node('Work'))).toBe(true);
    expect(lines(core).slice(4, 9)).toEqual(['    [*] --> Work', '    Work --> Done', '    Done --> [*]', '    Done --> Work', '  }']);
    expect(core.primary()).toEqual({ kind: 'edge', id: 'Done->Work' });
    await valid(core);
    undoes(ed, before);
  });

  it('states of different composites: the transition is written at the top level', async () => {
    const { core } = await mount();
    expect(createConnection(core, node('Idle'), 'r', node('Work'))).toBe(true);
    expect(lines(core).slice(-2)).toEqual(['  note right of Idle : waiting', '  Idle --> Work']);
    expect(model(core).nodes.get('Work')!.parent).toBe('Busy');
    await valid(core);
  });

  it('a refused connection (into a start) shows the reason and leaves the code as it was', async () => {
    const { core } = await mount();
    const toast = vi.spyOn(core, 'toast');
    const before = core.code;
    expect(createConnection(core, node('Idle'), 'l', node('[*]start'))).toBe(false);
    expect(toast).toHaveBeenCalledWith('A start has no incoming transitions');
    expect(core.code).toBe(before);
    expect(createConnection(core, node('Idle'), 'l', node('Busy/[*]start'))).toBe(false);
    expect(core.code).toBe(before);
  });

  it('reconnect: an end of a transition moves to another state, its label kept', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    expect(reconnect(core, 'edge', 'Done->Busy/[*]end', 'a', node('Work'))).toBe(true);
    expect(lines(core)[6]).toBe('    Work --> [*]');
    await valid(core);
    undoes(ed, before);
    expect(reconnect(core, 'edge', 'Idle->Busy', 'b', node('Work'))).toBe(true);
    expect(lines(core)[2]).toBe('  Idle --> Work : go');
    await valid(core);
  });
});

describe('state diagram: texts', () => {
  it('renaming a state with spaces adds state "…" as id (Properties); one undo step', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    await select(core, node('Idle'));
    expect(textField(core).value).toBe('Idle');
    setText(core, 'Idle now');
    expect(lines(core)).toContain('  state "Idle now" as Idle');
    expect(model(core).nodes.get('Idle')!.label).toBe('Idle now');
    await valid(core);
    undoes(ed, before);
  });

  it('a state written state "x" as id keeps that form (inline edit)', async () => {
    const { core } = await mount('stateDiagram-v2\n  state "Waiting" as W\n  [*] --> W\n');
    expect(core.run('inlineEdit', node('W'))).toBe(true);
    const ta = core.dom.wrap.querySelector<HTMLTextAreaElement>('textarea.inline-edit')!;
    expect(ta.value).toBe('Waiting');
    ta.value = 'On hold';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(lines(core)).toEqual(['stateDiagram-v2', '  state "On hold" as W', '  [*] --> W']);
    await valid(core);
  });

  it('a transition label, a composite title and a note text (Properties)', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    await select(core, { kind: 'edge', id: 'Idle->Busy' });
    setText(core, 'start now');
    expect(lines(core)[2]).toBe('  Idle --> Busy : start now');
    await select(core, group('Busy'));
    setText(core, 'Busy work');
    expect(model(core).groups.get('Busy')!.label).toBe('Busy work');
    expect(lines(core)).toContain('  state "Busy work" as Busy {');
    await select(core, { kind: 'note', id: 'n1' });
    setText(core, 'still waiting');
    expect(lines(core).at(-1)).toBe('  note right of Idle : still waiting');
    await valid(core);
    ed.undo();
    ed.undo();
    undoes(ed, before);
  });
});

describe('state diagram: the type\'s Properties', () => {
  it('the kind select switches a state to a choice and back', async () => {
    const { ed, core } = await mount('stateDiagram-v2\n  A --> B\n  B --> C\n');
    const before = core.code;
    await select(core, node('B'));
    choose(core, 'select[aria-label="Kind"]', 'choice');
    expect(model(core).nodes.get('B')!.kind).toBe('choice');
    expect(lines(core)).toEqual(['stateDiagram-v2', '  state B <<choice>>', '  A --> B', '  B --> C']);
    await valid(core);
    await select(core, node('B'));
    choose(core, 'select[aria-label="Kind"]', 'state');
    expect(core.code).toBe(before);
    ed.undo();
    undoes(ed, before);
  });

  it('description rows write id : row lines (a state without a title gets one first: the first text is the title)', async () => {
    const { ed, core } = await mount('stateDiagram-v2\n  A --> B\n');
    const before = core.code;
    await select(core, node('A'));
    const ta = control<HTMLTextAreaElement>(core, 'textarea.prop-rows');
    ta.value = 'first row\n\nsecond row';
    ta.dispatchEvent(new Event('blur'));
    expect(lines(core)).toEqual(['stateDiagram-v2', '  state "A" as A', '  A : first row', '  A : second row', '  A --> B']);
    expect(model(core).nodes.get('A')!.descriptions).toEqual(['first row', 'second row']);
    await valid(core);
    undoes(ed, before);
  });

  it('a composite: the direction select writes direction LR in its block; Add region adds --', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    await select(core, group('Busy'));
    choose(core, 'select[aria-label="Direction"]', 'LR');
    expect(lines(core).slice(3, 5)).toEqual(['  state Busy {', '    direction LR']);
    expect(model(core).groups.get('Busy')!.dir).toBe('LR');
    await valid(core);
    undoes(ed, before);
    await select(core, group('Busy'));
    const add = Array.from(props(core).querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === 'Add region')!;
    add.click();
    expect(model(core).groups.get('Busy')!.regions).toBe(2);
    expect(lines(core).slice(4, 10)).toEqual(['    [*] --> Work', '    Work --> Done', '    Done --> [*]', '    --', '    s1', '  }']);
    expect(model(core).nodes.get('s1')).toMatchObject({ parent: 'Busy', region: 1 });
    await valid(core);
    undoes(ed, before);
  });

  it('a note\'s side', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    await select(core, { kind: 'note', id: 'n1' });
    choose(core, 'select[aria-label="Side"]', 'left');
    expect(lines(core).at(-1)).toBe('  note left of Idle : waiting');
    await valid(core);
    undoes(ed, before);
  });
});

describe('state diagram: group and ungroup', () => {
  it('⌘G on two states makes a composite around them', async () => {
    const { ed, core } = await mount('stateDiagram-v2\n  [*] --> A\n  A --> B\n  B --> C\n');
    const before = core.code;
    core.select([node('A'), node('B')]);
    await core.run('groupSelection');
    await flush();
    const M = model(core);
    const gid = [...M.groups.keys()][0]!;
    expect(M.nodes.get('A')!.parent).toBe(gid);
    expect(M.nodes.get('B')!.parent).toBe(gid);
    expect(M.nodes.get('C')!.parent).toBeNull();
    expect(lines(core).filter((l) => /^\s*state /.test(l))).toHaveLength(1);
    await valid(core);
    undoes(ed, before);
  });

  it('Ungroup of a composite with an inner start and end asks first, then rewires them', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    const confirm = vi.spyOn(core.dialogs, 'confirm').mockResolvedValue(true);
    core.select([group('Busy')]);
    await core.run('ungroupSelection');
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toBe('Ungroup the composite?');
    const M = model(core);
    expect(M.groups.size).toBe(0);
    expect(M.edges.map((e) => `${e.from}->${e.to}`).sort()).toEqual(['Done->Idle', 'Idle->Work', 'Work->Done', '[*]start->Idle'].sort());
    expect(lines(core)).toContain('  Idle --> Work : go');
    await valid(core);
    undoes(ed, before);
  });

  it('Ungroup answered Cancel changes nothing', async () => {
    const { core } = await mount();
    const before = core.code;
    vi.spyOn(core.dialogs, 'confirm').mockResolvedValue(false);
    core.select([group('Busy')]);
    await core.run('ungroupSelection');
    await flush();
    expect(core.code).toBe(before);
  });

  it('Ungroup without inner pseudo-states asks nothing', async () => {
    const { ed, core } = await mount('stateDiagram-v2\n  state G {\n    A --> B\n  }\n  B --> C\n');
    const before = core.code;
    const confirm = vi.spyOn(core.dialogs, 'confirm');
    core.select([group('G')]);
    await core.run('ungroupSelection');
    await flush();
    expect(confirm).not.toHaveBeenCalled();
    expect(lines(core)).toEqual(['stateDiagram-v2', '  A --> B', '  B --> C']);
    await valid(core);
    undoes(ed, before);
  });
});

describe('state diagram: delete', () => {
  it('a composite with states asks; "Keep contents" unwraps it', async () => {
    const { ed, core } = await mount('stateDiagram-v2\n  X --> G\n  state G {\n    A --> B\n  }\n');
    const before = core.code;
    const ask = vi.spyOn(core.dialogs, 'choose').mockResolvedValue('keep');
    core.select([group('G')]);
    core.run('deleteSelection');
    await flush();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]![0].buttons.map((b) => b.label)).toEqual(['Cancel', 'Keep contents', 'Delete with contents']);
    expect(model(core).groups.size).toBe(0);
    expect(model(core).nodes.has('A') && model(core).nodes.has('B')).toBe(true);
    expect(lines(core)).toContain('  A --> B');
    await valid(core);
    undoes(ed, before);
  });

  it('"Delete with contents" removes the composite and everything in it; Cancel nothing', async () => {
    const { ed, core } = await mount('stateDiagram-v2\n  X --> G\n  state G {\n    A --> B\n  }\n');
    const before = core.code;
    const ask = vi.spyOn(core.dialogs, 'choose').mockResolvedValue(null);
    core.select([group('G')]);
    core.run('deleteSelection');
    await flush();
    expect(core.code).toBe(before);
    ask.mockResolvedValue('all');
    core.select([group('G')]);
    core.run('deleteSelection');
    await flush();
    expect(lines(core)).toEqual(['stateDiagram-v2', '  X']);
    expect(model(core).nodes.has('A')).toBe(false);
    await valid(core);
    undoes(ed, before);
  });

  it('a state goes with its transitions and notes; the other ends stay', async () => {
    const { ed, core } = await mount();
    const before = core.code;
    core.select([node('Idle')]);
    core.run('deleteSelection');
    await flush();
    const M = model(core);
    expect(M.nodes.has('Idle')).toBe(false);
    expect(M.notes).toHaveLength(0);
    expect(M.groups.has('Busy')).toBe(true);
    expect(M.edges.some((e) => e.from === 'Idle' || e.to === 'Idle')).toBe(false);
    expect(lines(core).slice(0, 2)).toEqual(['stateDiagram-v2', '  state Busy {']);
    await valid(core);
    undoes(ed, before);
  });
});

describe('state diagram: copy, paste, duplicate', () => {
  it('duplicate (⌘D) of a state: a new id, its title and description rows kept', async () => {
    const { ed, core } = await mount('stateDiagram-v2\n  A --> B\n  A : title\n  A : row\n');
    const before = core.code;
    core.select([node('A')]);
    core.run('duplicateSelection');
    const sel = core.selection();
    expect(sel).toHaveLength(1);
    const id = sel[0]!.id;
    expect(id).not.toBe('A');
    expect(model(core).nodes.get(id)!.label).toBe('title');
    expect(model(core).nodes.get(id)!.descriptions).toEqual(['row']);
    await valid(core);
    undoes(ed, before);
  });

  it('copy / paste of a composite: new ids, the transitions between the copies kept', async () => {
    const { ed, core } = await mount('stateDiagram-v2\n  state G {\n    A --> B\n  }\n');
    const before = core.code;
    core.select([group('G')]);
    core.run('copySelection');
    core.run('pasteAt', far(core));
    const M = model(core);
    expect(M.groups.size).toBe(2);
    const copy = [...M.groups.keys()].find((g) => g !== 'G')!;
    const inner = M.groups.get(copy)!.children;
    expect(inner).toHaveLength(2);
    expect(inner.some((c) => c === 'A' || c === 'B')).toBe(false);
    expect(M.edges.some((e) => e.from === inner[0] && e.to === inner[1])).toBe(true);
    await valid(core);
    undoes(ed, before);
  });

  it('duplicate of two connected states copies the transition between them', async () => {
    const { core } = await mount('stateDiagram-v2\n  A --> B\n');
    core.select([node('A'), node('B')]);
    core.run('duplicateSelection');
    const ids = core.selection().map((s) => s.id);
    expect(ids).toHaveLength(2);
    expect(model(core).edges.some((e) => e.from === ids[0] && e.to === ids[1])).toBe(true);
    await valid(core);
  });
});

describe('state diagram: icons and images', () => {
  it('an image state is the flowchart image node in metadata: a picture or an icon as its source, the same keys', async () => {
    const { ed, core } = await mount('stateDiagram-v2\n  A --> B\n');
    const before = core.code;
    // a plain state takes no icon (an icon is an image state's source), but a picture
    expect(kind().media!(core.model as never, node('A'), core)).toMatchObject({ node: null, canIcon: false, canImage: true });
    core.select([node('A')]);
    expect(mediaTargets(core, 'icon')).toEqual([]);
    expect(mediaTargets(core, 'image')).toEqual([node('A')]);
    // a picture: Mermaid Chart's default size, caption below, the aspect kept; the code stays
    expect(setImageOf(core, [node('B')], 'https://example.com/x.png')).toBe(true);
    expect(core.meta.nodes?.['B']).toEqual({ img: 'https://example.com/x.png', w: 200, h: 200, pos: 'b', constraint: 'on' });
    expect(core.code).toBe(before);
    expect(kind().media!(core.model as never, node('B'), core)).toMatchObject({ node: 'image', image: 'https://example.com/x.png', canIcon: true, pos: 'b', w: 200, h: 200, constraint: 'on' });
    expect((core.result.result.geom as { nodes: Map<string, { asset?: unknown }> }).nodes.get('B')!.asset).toBeDefined();
    // the caption above, the lock off
    expect(setMediaOf(core, [node('B')], { pos: 't', constraint: null })).toBe(true);
    expect(core.meta.nodes?.['B']).toMatchObject({ pos: 't' });
    expect(core.meta.nodes?.['B']?.['constraint']).toBeUndefined();
    // an icon instead of the picture, in a frame
    expect(setIconOf(core, [node('B')], 'tabler:user')).toBe(true);
    expect(core.meta.nodes?.['B']).toEqual({ icon: 'tabler:user', h: 60, pos: 't', form: 'square' });
    expect(setMediaOf(core, [node('B')], { form: 'circle' })).toBe(true);
    expect(kind().media!(core.model as never, node('B'), core)).toMatchObject({ node: 'icon', icon: 'tabler:user', form: 'circle' });
    // and a picture again; removing it leaves a plain state
    expect(setImageOf(core, [node('B')], 'https://example.com/y.png')).toBe(true);
    expect(core.meta.nodes?.['B']).toEqual({ img: 'https://example.com/y.png', h: 60, w: 200, pos: 't', constraint: 'on' });
    expect(setImageOf(core, [node('B')], null)).toBe(true);
    expect(core.meta.nodes?.['B']).toBeUndefined();
    expect(core.code).toBe(before);
    for (let i = 0; i < 6; i++) ed.undo();
    expect(core.meta.nodes?.['B']).toBeUndefined();
  });
});
