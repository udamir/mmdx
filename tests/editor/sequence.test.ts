// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import type { EditorCore } from '../../src/editor/core.js';
import { sequenceModule } from '../../src/editor/modules/sequence/index.js';
import { click, drag, handle, lines, mount, pev, press } from './connect.helpers.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);

const sg = (core: EditorCore) => {
  if (core.geom.type !== 'sequence') throw new Error('not a sequence');
  return core.geom;
};
const msgY = (core: EditorCore, id: string): number => sg(core).messages.get(id)!.y;
const px = (core: EditorCore, id: string): number => sg(core).participants.get(id)!.x;

const TWO = 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: hi\n';

describe('sequence: lifeline', () => {
  test('dragging from a lifeline to another creates a message there and selects it; undo removes it', () => {
    const { core, ed } = mount(TWO, [sequenceModule]);
    const y = msgY(core, 'm1') + 40;
    drag(core, handle(core, '[data-handle="lifeline"][data-id="B"]'), { x: px(core, 'B'), y }, { x: px(core, 'A') + 10, y: y + 2 });
    expect(lines(core)).toEqual(['sequenceDiagram', 'participant A', 'participant B', 'A->>B: hi', 'B->>A: message']);
    expect(core.primary()).toEqual({ kind: 'message', id: 'm2' });
    ed.undo();
    expect(lines(core)).not.toContain('B->>A: message');
  });

  test('above the first message the new one goes first; a short drag makes a self message', () => {
    const { core } = mount(TWO, [sequenceModule]);
    const y = msgY(core, 'm1') - 20;
    drag(core, handle(core, '[data-handle="lifeline"][data-id="A"]'), { x: px(core, 'A'), y }, { x: px(core, 'B'), y });
    expect(lines(core).slice(3)).toEqual(['A->>B: message', 'A->>B: hi']);
    const y2 = msgY(core, 'm2') + 40;
    drag(core, handle(core, '[data-handle="lifeline"][data-id="A"]'), { x: px(core, 'A'), y: y2 }, { x: px(core, 'A') + 30, y: y2 + 5 });
    expect(lines(core)).toContain('A->>A: message');
  });

  test('dragging along a lifeline draws a process over the messages it spans', () => {
    const { core, ed } = mount('sequenceDiagram\n  participant A\n  participant B\n  A->>B: one\n  B->>A: two\n', [sequenceModule]);
    const y0 = msgY(core, 'm1') - 10, y1 = msgY(core, 'm2') + 10;
    drag(core, handle(core, '[data-handle="lifeline"][data-id="B"]'), { x: px(core, 'B'), y: y0 }, { x: px(core, 'B'), y: y1 });
    expect(lines(core)).toEqual(['sequenceDiagram', 'participant A', 'participant B', 'activate B', 'A->>B: one', 'B->>A: two', 'deactivate B']);
    ed.undo();
    expect(lines(core)).not.toContain('activate B');
  });

  test('hovering a lifeline shows its circle', () => {
    const { core } = mount(TWO, [sequenceModule]);
    const h = core.dom.body.querySelector('[data-handle="lifeline"][data-id="A"]')!;
    h.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: px(core, 'A'), clientY: 200 }));
    expect(core.dom.overlay.querySelector('.ll-dot[data-id="A"]')).not.toBeNull();
  });
});

describe('sequence: processes', () => {
  const SRC = 'sequenceDiagram\n  participant A\n  participant B\n  A->>B: call\n  B-->>A: reply\n';

  test('two selected messages → Show as process (and again removes it)', () => {
    const { core, ed } = mount(SRC, [sequenceModule]);
    core.select([{ kind: 'message', id: 'm1' }, { kind: 'message', id: 'm2' }]);
    expect(core.run('activationInfo')).toEqual({ participant: 'B', removed: false });
    core.run('applyActivation');
    expect(lines(core).slice(3)).toEqual(['A->>+B: call', 'B-->>-A: reply']);
    expect(core.selection().length).toBe(2);
    expect(core.run('activationInfo')).toEqual({ participant: 'B', removed: true });
    core.run('applyActivation');
    expect(lines(core).slice(3)).toEqual(['A->>B: call', 'B-->>A: reply']);
    ed.undo();
    expect(lines(core).slice(3)).toEqual(['A->>+B: call', 'B-->>-A: reply']);
  });

  test('message end circle dragged to another message adds a process on that participant', () => {
    const { core } = mount(SRC, [sequenceModule]);
    core.select([{ kind: 'message', id: 'm1' }]);
    const m = sg(core).messages.get('m1')!;
    const dot = handle(core, '[data-handle="actend"][data-msg="m1"][data-pid="B"]');
    drag(core, dot, { x: m.x1, y: m.y }, { x: m.x1, y: msgY(core, 'm2') + 3 });
    expect(lines(core).slice(3)).toEqual(['A->>+B: call', 'B-->>-A: reply']);
  });

  test('process bottom handle snaps to another message', () => {
    const { core } = mount('sequenceDiagram\n  participant A\n  participant B\n  A->>+B: one\n  B->>A: two\n  B-->>-A: three\n', [sequenceModule]);
    const [aid] = [...sg(core).activations.keys()];
    core.select([{ kind: 'activation', id: aid! }]);
    const b = sg(core).activations.get(aid!)!;
    drag(core, handle(core, '[data-handle="aedge"][data-edge="bottom"]'), { x: b.x, y: b.y1 }, { x: b.x, y: msgY(core, 'm2') + 2 });
    expect(lines(core).slice(3)).toEqual(['A->>+B: one', 'B->>-A: two', 'B-->>A: three']);
    expect(core.primary()?.kind).toBe('activation');
  });
});

describe('sequence: blocks, notes, participants', () => {
  test('dragging the bottom edge of a block pulls the next message in; undo', () => {
    const { core, ed } = mount('sequenceDiagram\n  participant A\n  participant B\n  loop every minute\n    A->>B: one\n  end\n  A->>B: two\n', [sequenceModule]);
    core.select([{ kind: 'block', id: 'b1' }]);
    const blk = sg(core).blocks.get('b1')!;
    drag(core, handle(core, '[data-handle="bedge"][data-edge="bottom"]'), { x: blk.x, y: blk.y1 }, { x: blk.x, y: msgY(core, 'm2') + 10 });
    expect(lines(core).slice(3)).toEqual(['loop every minute', 'A->>B: one', 'A->>B: two', 'end']);
    expect(core.primary()).toEqual({ kind: 'block', id: 'b1' });
    ed.undo();
    expect(lines(core).slice(3)).toEqual(['loop every minute', 'A->>B: one', 'end', 'A->>B: two']);
  });

  test('pushing the last statement out is refused with a toast', () => {
    const { core } = mount('sequenceDiagram\n  participant A\n  participant B\n  loop x\n    A->>B: one\n  end\n', [sequenceModule]);
    core.select([{ kind: 'block', id: 'b1' }]);
    const blk = sg(core).blocks.get('b1')!;
    const before = core.code;
    const toast = vi.spyOn(core, 'toast');
    drag(core, handle(core, '[data-handle="bedge"][data-edge="bottom"]'), { x: blk.x, y: blk.y1 }, { x: blk.x, y: blk.y0 + 5 });
    expect(core.code).toBe(before);
    expect(toast).toHaveBeenCalledWith('A block needs at least one statement');
  });

  test('note edge handle stretches the note over more participants; undo', () => {
    const { core, ed } = mount('sequenceDiagram\n  participant A\n  participant B\n  participant C\n  Note over A: n\n', [sequenceModule]);
    core.select([{ kind: 'note', id: 'n1' }]);
    const n = sg(core).notes.get('n1')!;
    drag(core, handle(core, '[data-handle="nedge"][data-edge="right"]'), { x: n.x + n.w / 2, y: n.y }, { x: px(core, 'C') + 5, y: n.y });
    expect(lines(core)).toContain('Note over A,C: n');
    ed.undo();
    expect(lines(core)).toContain('Note over A: n');
  });

  test('dragging a note / block / process edge shows its size until released', () => {
    const { core } = mount('sequenceDiagram\n  participant A\n  participant B\n  participant C\n  A->>+B: one\n  B-->>-A: two\n  Note over A: n\n', [sequenceModule]);
    const badge = (): string | null => core.dom.overlay.querySelector('.size-badge-text')?.textContent ?? null;
    core.select([{ kind: 'note', id: 'n1' }]);
    const n = sg(core).notes.get('n1')!;
    const from = { x: n.x + n.w / 2, y: n.y };
    const g = press(core, handle(core, '[data-handle="nedge"][data-edge="right"]'), from)!;
    expect(badge()).toBeNull();
    g.move(px(core, 'C') + 5 - from.x, 0, pev('pointermove', { x: px(core, 'C') + 5, y: n.y }));
    const n2 = sg(core).notes.get('n1')!;
    expect(badge()).toBe(`${Math.round(n2.w)} × ${Math.round(n2.h)}`);
    g.end?.(pev('pointerup', { x: px(core, 'C') + 5, y: n.y }));
    expect(badge()).toBeNull();
    // a process: the size of the preview while its edge snaps
    const [aid] = [...sg(core).activations.keys()];
    core.select([{ kind: 'activation', id: aid! }]);
    const b = sg(core).activations.get(aid!)!;
    const ga = press(core, handle(core, '[data-handle="aedge"][data-edge="bottom"]'), { x: b.x, y: b.y1 })!;
    ga.move(0, 30, pev('pointermove', { x: b.x, y: b.y1 + 30 }));
    expect(badge()).toMatch(/^\d+ × \d+$/);
    ga.cancel?.();
    core.drawOverlay();
    expect(badge()).toBeNull();
  });

  test('◀ ▶ arrows of a selected participant call moveSelection', () => {
    const { core } = mount(TWO, [sequenceModule]);
    const calls: number[] = [];
    core.provide('moveSelection', (d) => {
      calls.push(d);
    });
    core.select([{ kind: 'participant', id: 'A' }]);
    expect(core.dom.overlay.querySelector('.pmove.off[data-dir="-1"]')).not.toBeNull();
    click(core, handle(core, '[data-handle="pmove"][data-dir="1"]'), { x: 0, y: 0 });
    expect(calls).toEqual([1]);
  });
});
