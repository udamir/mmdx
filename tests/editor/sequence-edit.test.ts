// @vitest-environment jsdom
// Sequence editing in the editor (T11.3): the selection toolbar's message arrow (Mermaid's ten, in the arrow popover)
// and Reverse, a message end re-attached by dragging its circle sideways, a note's placement (left of, right of, over),
// a block's branches (Add / Delete in the toolbar, conditions and Delete in Properties), par / critical / break in the
// palette, a rename that keeps `@{…}` and `create`, and a rect without a text. Each a single undo step.
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { SequenceModel } from '../../src/core/model.js';
import type { EditorCore } from '../../src/editor/core.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { EDIT } from '../../src/editor/kinds/sequence/index.js';
import { labelSpec } from '../../src/editor/ops/label.js';
import { sequenceModule } from '../../src/editor/modules/sequence/index.js';
import { drag, handle, lines, mount as mountGestures } from './connect.helpers.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

/** A full editor (all modules: the selection toolbar, Properties). */
const mount = (value: string): { ed: DiagramEditor; core: EditorCore; host: HTMLElement } => {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, storage: memoryStorage() });
  editors.push(ed);
  return { ed, core: ed.core, host };
};
const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    await vi.dynamicImportSettled();
    await new Promise((r) => setTimeout(r, 0));
  }
};
const select = async (core: EditorCore, kind: 'message' | 'note' | 'block' | 'participant', id: string): Promise<void> => {
  core.select([{ kind, id }]);
  core.fire('selection');
  await settle();
  core.run('refreshToolbar');
};
const $ = <T extends Element = HTMLElement>(host: HTMLElement, sel: string): T | null => host.shadowRoot!.querySelector<T>(sel);
const model = (core: EditorCore): SequenceModel => {
  if (core.model.type !== 'sequence') throw new Error('not a sequence');
  return core.model;
};
const body = (core: EditorCore): string[] => lines(core).slice(1);

const SRC = 'sequenceDiagram\n  participant A\n  participant B\n  participant C\n  A->>B: call\n  B-->>A: reply\n  note left of A: hi\n  alt ok\n    A->>C: yes\n  else fail\n    A->>C: no\n  end\n  loop every\n    A->>B: tick\n  end\n';

describe('the message toolbar (S10)', () => {
  test('the arrow popover writes Mermaid\'s arrows, solid and dotted rows; one undo step', async () => {
    const { ed, core, host } = mount(SRC);
    await settle();
    await select(core, 'message', 'm1');
    $<HTMLButtonElement>(host, '.mtb [data-c="arrows"]')!.click();
    const choices = [...host.shadowRoot!.querySelectorAll<HTMLButtonElement>('.mtb-pop .mtb-choice')].map((b) => b.getAttribute('aria-label'));
    expect(choices.slice(0, 10)).toEqual(['->>', '->', '-x', '-)', '<<->>', '-->>', '-->', '--x', '--)', '<<-->>'].map((a) => `Mermaid arrow ${a}`));
    expect($(host, '.mtb-pop .mtb-choice.on')?.getAttribute('aria-label')).toBe('Mermaid arrow ->>');
    $<HTMLButtonElement>(host, '.mtb-pop [aria-label="Mermaid arrow --x"]')!.click();
    expect(body(core)).toContain('A--xB: call');
    expect(core.primary()).toEqual({ kind: 'message', id: 'm1' });
    ed.undo();
    expect(body(core)).toContain('A->>B: call');
  });

  test('Reverse swaps the ends (a self message has none to swap)', async () => {
    const { ed, core, host } = mount(SRC);
    await settle();
    await select(core, 'message', 'm2');
    $<HTMLButtonElement>(host, '.mtb [data-c="act:reverse"]')!.click();
    expect(body(core)).toContain('A-->>B: reply');
    ed.undo();
    expect(body(core)).toContain('B-->>A: reply');
    const self = mount('sequenceDiagram\n  A->>A: me\n');
    await settle();
    await select(self.core, 'message', 'm1');
    expect($<HTMLButtonElement>(self.host, '.mtb [data-c="act:reverse"]')!.disabled).toBe(true);
  });

  test('a message end circle dragged sideways re-attaches that end to the lifeline there', () => {
    const { core, ed } = mountGestures(SRC, [sequenceModule]);
    if (core.geom.type !== 'sequence') throw new Error('not a sequence');
    core.select([{ kind: 'message', id: 'm1' }]);
    core.drawOverlay();
    const m = core.geom.messages.get('m1')!, cx = core.geom.participants.get('C')!.x;
    drag(core, handle(core, '[data-handle="actend"][data-msg="m1"][data-pid="B"]'), { x: m.x1, y: m.y }, { x: cx + 6, y: m.y + 2 });
    expect(body(core)).toContain('A->>C: call');
    expect(core.primary()).toEqual({ kind: 'message', id: 'm1' });
    ed.undo();
    expect(body(core)).toContain('A->>B: call');
  });
});

describe('the note toolbar and Properties (S11)', () => {
  test('left of, right of, over: the current one pressed', async () => {
    const { ed, core, host } = mount(SRC);
    await settle();
    await select(core, 'note', 'n1');
    const pressed = (): string[] => ['left', 'right', 'over'].filter((p) => $(host, `.mtb [data-c="act:${p}"]`)?.getAttribute('aria-pressed') === 'true');
    expect(pressed()).toEqual(['left']);
    $<HTMLButtonElement>(host, '.mtb [data-c="act:over"]')!.click();
    expect(body(core)).toContain('note over A: hi');
    await settle();
    core.run('refreshToolbar');
    expect(pressed()).toEqual(['over']);
    ed.undo();
    expect(body(core)).toContain('note left of A: hi');
  });

  test('Properties: a placement select', () => {
    const { core } = mount(SRC);
    const [ctl] = EDIT.properties!(core, model(core), { kind: 'note', id: 'n1' });
    expect(ctl).toMatchObject({ type: 'select', value: 'left of' });
    if (ctl?.type !== 'select') throw new Error('select expected');
    expect(ctl.options.map((o) => o[0])).toEqual(['left of', 'right of', 'over']);
    ctl.set('right of');
    expect(body(core)).toContain('note right of A: hi');
  });
});

describe('block branches (S8)', () => {
  test('the toolbar adds a branch to an alt and deletes the last one; a loop has no branch actions', async () => {
    const { ed, core, host } = mount(SRC);
    await settle();
    await select(core, 'block', 'b1');
    $<HTMLButtonElement>(host, '.mtb [data-c="act:addBranch"]')!.click();
    expect(body(core).slice(6, 12)).toEqual(['alt ok', 'A->>C: yes', 'else fail', 'A->>C: no', 'else otherwise', 'end']);
    ed.undo();
    expect(body(core)).not.toContain('else otherwise');
    await settle();
    core.run('refreshToolbar');
    $<HTMLButtonElement>(host, '.mtb [data-c="act:deleteBranch"]')!.click();
    expect(body(core).slice(6, 9)).toEqual(['alt ok', 'A->>C: yes', 'end']);
    await select(core, 'block', 'b2');
    expect($(host, '.mtb [data-c^="act:"]')).toBeNull();
  });

  test('Properties: the branch conditions as rows, Add branch, Delete per branch', () => {
    const { core } = mount(SRC);
    const ctls = EDIT.properties!(core, model(core), { kind: 'block', id: 'b1' });
    expect(ctls.map((c) => [c.type, c.label])).toEqual([['rows', 'Branch conditions (else)'], ['button', 'Add branch (else)'], ['button', 'Delete branch “fail”']]);
    const rows = ctls[0]!;
    if (rows.type !== 'rows') throw new Error('rows expected');
    expect(rows.value).toEqual(['fail']);
    rows.set(['broken']);
    expect(body(core)).toContain('else broken');
    const [, add] = EDIT.properties!(core, model(core), { kind: 'block', id: 'b1' });
    if (add?.type !== 'button') throw new Error('button expected');
    add.run();
    expect(body(core)).toContain('else otherwise');
    const del = EDIT.properties!(core, model(core), { kind: 'block', id: 'b1' }).find((c) => c.label === 'Delete branch “broken”');
    if (del?.type !== 'button') throw new Error('button expected');
    del.run();
    expect(body(core)).not.toContain('else broken');
    expect(body(core)).not.toContain('A->>C: no');
  });
});

describe('palette, rename and rect (S9, S3)', () => {
  test('the palette has par, critical and break; dropped on a message they wrap it', () => {
    const { core } = mount(SRC);
    const keys = (EDIT.palette?.items ?? []).flatMap((i) => ('key' in i ? [i.key] : []));
    expect(keys).toEqual(expect.arrayContaining(['loop', 'alt', 'opt', 'par', 'critical', 'break', 'rect']));
    for (const [key, head] of [['par', 'par at once'], ['critical', 'critical must succeed'], ['break', 'break on error']] as const) {
      core.select([{ kind: 'message', id: 'm1' }]);
      const item = EDIT.palette!.items.find((i) => 'key' in i && i.key === key);
      if (!item || !('key' in item)) throw new Error('no item');
      expect(EDIT.drop!(core, model(core), item, { x: 0, y: 0 })).toBe(true);
      expect(body(core)).toContain(head);
      core.store.undo();
    }
  });

  test('renaming a participant keeps its @{…} and create; a rect has no text to edit', () => {
    const { core } = mount('sequenceDiagram\n  participant A@{ "type": "queue" } as Jobs\n  A->>B: hi\n  create participant C@{ "alias": "Carol" }\n  B->>C: make\n  rect rgb(200, 220, 255)\n    A->>B: x\n  end\n');
    const ren = (id: string, v: string): void => {
      const spec = labelSpec(core, 'participant', id)!;
      core.applyCode(spec.apply(v)!, 'Edit text', { select: null });
    };
    ren('A', 'Work');
    ren('C', 'Cee');
    expect(body(core).slice(0, 4)).toEqual(['participant A@{ "type": "queue" } as Work', 'A->>B: hi', 'create participant C@{ "alias": Cee }', 'B->>C: make']);
    expect(labelSpec(core, 'block', 'b1')).toBeNull();
  });
});
