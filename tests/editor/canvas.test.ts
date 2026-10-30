// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { EditorCore } from '../../src/editor/core.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { CANVAS_MODULES } from '../../src/editor/modules/canvas/index.js';
import { mermaidFragment } from '../../src/editor/modules/canvas/structure.js';

// jsdom has no PointerEvent: a MouseEvent with a pointer id is all the editor reads
if (typeof globalThis.PointerEvent === 'undefined') {
  class PE extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (globalThis as unknown as { PointerEvent: typeof PE }).PointerEvent = PE;
}

const FLOW = 'flowchart TB\n  A[Alpha] --> B[Beta]\n  B --> C[Gamma]\n';
const SEQ = 'sequenceDiagram\n  participant P as Peter\n  participant Q as Quinn\n  P->>Q: hello\n';

const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});

function mount(value: string): { ed: DiagramEditor; core: EditorCore } {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, modules: CANVAS_MODULES, storage: memoryStorage() });
  editors.push(ed);
  return { ed, core: ed.core };
}

/** Lets the deferred end of the Esc chain register (queued after install). */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const itemEl = (core: EditorCore, kind: string, id: string): Element => {
  const e = Array.from(core.dom.body.querySelectorAll('.el')).find((n) => n.getAttribute('data-kind') === kind && n.getAttribute('data-id') === id && !n.hasAttribute('data-part'));
  if (!e) throw new Error(`no element ${kind}:${id}`);
  return e.querySelector('rect, path, polygon, ellipse, circle, text') ?? e;
};

const center = (core: EditorCore, id: string): { x: number; y: number } => {
  const g = core.geom;
  if (g.type !== 'flowchart') throw new Error('flowchart expected');
  const b = g.nodes.get(id)!;
  return core.toScreen({ x: b.x, y: b.y });
};

let pid = 1;
function pointer(target: Element, type: string, x: number, y: number, o: { shift?: boolean; alt?: boolean; id?: number } = {}): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: o.id ?? pid, shiftKey: !!o.shift, altKey: !!o.alt }));
}
/** Press, optionally drag by (dx, dy) in a few steps, release. */
function drag(core: EditorCore, target: Element, from: { x: number; y: number }, dx = 0, dy = 0, o: { shift?: boolean; alt?: boolean } = {}): void {
  pid++;
  pointer(target, 'pointerdown', from.x, from.y, o);
  const svg = core.dom.svg;
  if (dx || dy) for (let i = 1; i <= 4; i++) pointer(svg, 'pointermove', from.x + (dx * i) / 4, from.y + (dy * i) / 4, o);
  pointer(svg, 'pointerup', from.x + dx, from.y + dy, o);
}

function key(core: EditorCore, k: string, o: { mod?: boolean; shift?: boolean; alt?: boolean; code?: string; target?: Element } = {}): void {
  const code = o.code ?? (/^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : k);
  const t = o.target ?? core.dom.root;
  t.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true, composed: true, cancelable: true, ctrlKey: !!o.mod, metaKey: !!o.mod, shiftKey: !!o.shift, altKey: !!o.alt }));
  t.dispatchEvent(new KeyboardEvent('keyup', { key: k, code, bubbles: true, composed: true, ctrlKey: !!o.mod, metaKey: !!o.mod, shiftKey: !!o.shift, altKey: !!o.alt }));
}

const sel = (core: EditorCore): string[] => core.selection().map((s) => `${s.kind}:${s.id}`);

describe('canvas selection', () => {
  it('click selects, Shift-click toggles, undo keeps working', () => {
    const { core } = mount(FLOW);
    drag(core, itemEl(core, 'node', 'A'), center(core, 'A'));
    expect(sel(core)).toEqual(['node:A']);
    drag(core, itemEl(core, 'node', 'B'), center(core, 'B'), 0, 0, { shift: true });
    expect(sel(core).sort()).toEqual(['node:A', 'node:B']);
    expect(itemEl(core, 'node', 'A').closest('.el')!.classList.contains('selected')).toBe(true);
    drag(core, itemEl(core, 'node', 'A'), center(core, 'A'), 0, 0, { shift: true });
    expect(sel(core)).toEqual(['node:B']);
  });

  it('marquee selects the boxes and connectors fully inside it; a background click clears', () => {
    const { core } = mount(FLOW);
    const g = core.geom;
    if (g.type !== 'flowchart') throw new Error();
    const a = g.nodes.get('A')!, b = g.nodes.get('B')!;
    const p0 = core.toScreen({ x: Math.min(a.x - a.w / 2, b.x - b.w / 2) - 10, y: a.y - a.h / 2 - 10 });
    const p1 = core.toScreen({ x: Math.max(a.x + a.w / 2, b.x + b.w / 2) + 10, y: b.y + b.h / 2 + 10 });
    drag(core, core.dom.svg, p0, p1.x - p0.x, p1.y - p0.y);
    expect(sel(core).sort()).toEqual(['edge:A->B', 'node:A', 'node:B']);
    // the selected connector is marked along its line
    expect(core.dom.overlay.querySelectorAll('.sel-line')).toHaveLength(1);
    drag(core, core.dom.svg, { x: -500, y: -500 });
    expect(sel(core)).toEqual([]);
    expect(core.dom.overlay.querySelector('.sel-line')).toBeNull();
  });

  it('⌘A and the marquee select every kind of item, in every diagram type', () => {
    const DIAGRAMS = [
      'flowchart TB\n  subgraph G [Team]\n    A[Alpha] --> B[Beta]\n  end\n  B --> C[Gamma]\n',
      'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    string name\n  }\n',
      'sequenceDiagram\n  box Team\n    participant P as Peter\n    participant Q as Quinn\n  end\n  participant R\n  P->>+Q: hello\n  Q-->>-P: hi\n  Note over P,Q: a note\n  loop every day\n    P->>R: ping\n  end\n',
    ];
    for (const code of DIAGRAMS) {
      const { core } = mount(code);
      const drawn = [...new Set(Array.from(core.dom.body.querySelectorAll('.el[data-kind][data-id]')).map((n) => `${n.getAttribute('data-kind')}:${n.getAttribute('data-id')}`))].sort();
      key(core, 'a', { mod: true });
      expect(sel(core).sort()).toEqual(drawn);
      // a marquee around the whole diagram takes the same
      core.select([]);
      const b = core.result.result.bounds;
      const p0 = core.toScreen({ x: b.x - 50, y: b.y - 50 }), p1 = core.toScreen({ x: b.x + b.w + 50, y: b.y + b.h + 50 });
      drag(core, core.dom.svg, p0, p1.x - p0.x, p1.y - p0.y);
      expect(sel(core).sort()).toEqual(drawn);
    }
  });

  it('a sequence multi-selection moves and deletes together, processes included', () => {
    const { core } = mount('sequenceDiagram\n  participant P\n  participant Q\n  P->>+Q: hello\n  Q-->>-P: hi\n  Note over P: a note\n');
    key(core, 'a', { mod: true });
    expect(sel(core)).toContain('activation:Q:1');
    const g = core.geom;
    if (g.type !== 'sequence') throw new Error();
    const p = g.participants.get('P')!;
    drag(core, itemEl(core, 'participant', 'P'), core.toScreen({ x: p.x, y: p.y }), 40, 0);
    expect(core.getM('participant', 'P').x).toBeDefined();
    expect(core.getM('participant', 'Q').x).toBeDefined();
    key(core, 'Delete');
    expect(core.code.trim()).toBe('sequenceDiagram');
  });

  it('marquee left to right takes what is fully inside, right to left what it touches', () => {
    const { core } = mount(FLOW);
    const g = core.geom;
    if (g.type !== 'flowchart') throw new Error();
    const a = g.nodes.get('A')!, b = g.nodes.get('B')!;
    // drags between two diagram points, in the given direction
    const marquee = (from: { x: number; y: number }, to: { x: number; y: number }): string[] => {
      core.select([]);
      const p0 = core.toScreen(from), p1 = core.toScreen(to);
      drag(core, core.dom.svg, p0, p1.x - p0.x, p1.y - p0.y);
      return sel(core).sort();
    };
    // the top half of A only
    const left = a.x - a.w / 2 - 10, right = a.x + a.w / 2 + 10;
    expect(marquee({ x: left, y: a.y - a.h / 2 - 10 }, { x: right, y: a.y })).toEqual([]);
    expect(marquee({ x: right, y: a.y - a.h / 2 - 10 }, { x: left, y: a.y })).toEqual(['node:A']);
    // the gap between A and B: only the connector's middle
    const gapY = (a.y + a.h / 2 + b.y - b.h / 2) / 2;
    expect(marquee({ x: left, y: gapY - 4 }, { x: right, y: gapY + 4 })).toEqual([]);
    expect(marquee({ x: right, y: gapY - 4 }, { x: left, y: gapY + 4 })).toEqual(['edge:A->B']);
    // beside the connector: nothing either way
    expect(marquee({ x: right + 200, y: gapY - 4 }, { x: right + 100, y: gapY + 4 })).toEqual([]);
    // the crossing marquee is drawn dashed while dragging
    const p0 = core.toScreen({ x: right, y: gapY - 4 });
    pid++;
    pointer(core.dom.svg, 'pointerdown', p0.x, p0.y);
    pointer(core.dom.svg, 'pointermove', p0.x - 60, p0.y + 20);
    expect(core.dom.overlay.querySelector('.marquee')!.classList.contains('crossing')).toBe(true);
    pointer(core.dom.svg, 'pointerup', p0.x - 60, p0.y + 20);
  });

  it('Alt/Option shows the copy cursor: over the canvas, and while an Alt-drag copies', () => {
    const { core } = mount(FLOW);
    const root = core.dom.root;
    const c = center(core, 'A');
    pointer(core.dom.svg, 'pointermove', c.x, c.y, { alt: true });
    expect(root.classList.contains('alt-copy')).toBe(true);
    pointer(core.dom.svg, 'pointermove', c.x, c.y);
    expect(root.classList.contains('alt-copy')).toBe(false);
    // during the copy drag the whole editor shows it, and stops when the copy is dropped
    pid++;
    pointer(itemEl(core, 'node', 'A'), 'pointerdown', c.x, c.y, { alt: true });
    pointer(core.dom.svg, 'pointermove', c.x + 60, c.y + 60, { alt: true });
    expect(root.classList.contains('copying')).toBe(true);
    pointer(core.dom.svg, 'pointerup', c.x + 60, c.y + 60, { alt: true });
    expect(root.classList.contains('copying')).toBe(false);
    expect(core.model.type === 'flowchart' && core.model.nodes.size).toBe(4);
    // sequence diagrams cannot copy by Alt-drag: no copy cursor
    const seq = mount(SEQ).core;
    pointer(seq.dom.svg, 'pointermove', 10, 10, { alt: true });
    expect(seq.dom.root.classList.contains('alt-copy')).toBe(false);
  });

  it('Shift-click adds connectors to a multi-selection', () => {
    const { core } = mount(FLOW);
    core.select([{ kind: 'node', id: 'A' }]);
    for (const id of ['A->B', 'B->C']) {
      const e = Array.from(core.dom.body.querySelectorAll('.el[data-kind="edge"]')).find((n) => n.getAttribute('data-id') === id && !n.hasAttribute('data-part'))!;
      const hit = e.querySelector('.hit') ?? e.querySelector('path')!;
      drag(core, hit, { x: 0, y: 0 }, 0, 0, { shift: true });
    }
    expect(sel(core).sort()).toEqual(['edge:A->B', 'edge:B->C', 'node:A']);
    expect(core.dom.overlay.querySelectorAll('.sel-line')).toHaveLength(2);
  });

  it('drag moves a node (x / y in metadata), one undo step', () => {
    const { ed, core } = mount(FLOW);
    const c = center(core, 'A');
    drag(core, itemEl(core, 'node', 'A'), c, 40, 20);
    const m = core.getM('node', 'A');
    const g = core.geom;
    if (g.type !== 'flowchart') throw new Error();
    expect(m.x).toBe(g.nodes.get('A')!.x);
    expect(typeof m.y).toBe('number');
    expect(ed.getSource()).toMatch(/%%@/);
    ed.undo();
    expect(core.getM('node', 'A').x).toBeUndefined();
  });

  it('arrow keys nudge by 1 / Shift by 10 and undo', () => {
    const { ed, core } = mount(FLOW);
    core.select([{ kind: 'node', id: 'A' }]);
    const g = core.geom;
    if (g.type !== 'flowchart') throw new Error();
    const x0 = Math.round(g.nodes.get('A')!.x), y0 = Math.round(g.nodes.get('A')!.y);
    key(core, 'ArrowRight');
    expect(core.getM('node', 'A').x).toBe(x0 + 1);
    key(core, 'ArrowDown', { shift: true });
    expect(core.getM('node', 'A').y).toBe(y0 + 10);
    ed.undo();
    expect(core.getM('node', 'A').y).toBe(y0);
    ed.undo();
    expect(core.getM('node', 'A').x).toBeUndefined();
  });

  it('Delete removes the selection from the code, undo restores it', () => {
    const { ed, core } = mount(FLOW);
    core.select([{ kind: 'node', id: 'C' }]);
    key(core, 'Delete');
    expect(core.code).not.toMatch(/Gamma/);
    expect(core.model.type === 'flowchart' && core.model.nodes.has('C')).toBe(false);
    ed.undo();
    expect(core.code).toMatch(/Gamma/);
  });

  it('⌘G groups and ⇧⌘G ungroups (round trip), with undo', async () => {
    const { ed, core } = mount(FLOW);
    core.select([{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]);
    key(core, 'g', { mod: true });
    expect(core.code).toMatch(/subgraph/);
    const p = core.primary();
    expect(p?.kind).toBe('group');
    // the name is typed in place: Enter applies
    const ta = core.dom.wrap.querySelector('textarea.inline-edit') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    ta.value = 'Front';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(core.code).toMatch(/Front/);
    await settle();
    key(core, 'g', { mod: true, shift: true });
    expect(core.code).not.toMatch(/subgraph/);
    expect(sel(core).sort()).toEqual(['node:A', 'node:B']);
    ed.undo();
    expect(core.code).toMatch(/subgraph/);
  });

  it('copy / paste makes ids with _2, duplicate too; refused in sequence', () => {
    const { ed, core } = mount(FLOW);
    core.select([{ kind: 'node', id: 'A' }]);
    key(core, 'c', { mod: true });
    key(core, 'v', { mod: true });
    expect(core.model.type === 'flowchart' && core.model.nodes.has('A_2')).toBe(true);
    expect(sel(core)).toEqual(['node:A_2']);
    ed.undo();
    expect(core.model.type === 'flowchart' && core.model.nodes.has('A_2')).toBe(false);
    core.select([{ kind: 'node', id: 'B' }]);
    key(core, 'd', { mod: true });
    expect(core.model.type === 'flowchart' && core.model.nodes.has('B_2')).toBe(true);

    const s = mount(SEQ).core;
    s.select([{ kind: 'participant', id: 'P' }]);
    key(s, 'c', { mod: true });
    expect(s.dom.root.querySelector('.ds-toast')?.textContent).toBe('Copy works for flowchart shapes / groups and ER tables');
  });

  it('the clipboard text is a Mermaid fragment', () => {
    const { core } = mount(FLOW);
    const t = mermaidFragment(core.model, core.code, [{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]);
    expect(t).toMatch(/^flowchart TB\n/);
    expect(t).toMatch(/A\["Alpha"\]/);
    expect(t).toMatch(/A --> B/);
    expect(t).not.toMatch(/Gamma/);
  });

  it('align left lines up the left edges', () => {
    const { ed, core } = mount('flowchart LR\n  A[Short] --> B[A much longer label]\n');
    core.select([{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }]);
    core.run('arrange', 'left');
    const g = core.geom;
    if (g.type !== 'flowchart') throw new Error();
    const a = g.nodes.get('A')!, b = g.nodes.get('B')!;
    expect(Math.abs(a.x - a.w / 2 - (b.x - b.w / 2))).toBeLessThan(1);
    ed.undo();
    expect(core.getM('node', 'B').x).toBeUndefined();
  });

  it('inline edit applies the label on Enter, Esc cancels', () => {
    const { ed, core } = mount(FLOW);
    expect(core.run('inlineEdit', { kind: 'node', id: 'B' })).toBe(true);
    let ta = core.dom.wrap.querySelector('textarea.inline-edit') as HTMLTextAreaElement;
    expect(ta.value).toBe('Beta');
    ta.value = 'Bravo';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(core.code).toMatch(/Bravo/);
    expect(core.dom.wrap.querySelector('textarea.inline-edit')).toBeNull();
    core.run('inlineEdit', { kind: 'node', id: 'B' });
    ta = core.dom.wrap.querySelector('textarea.inline-edit') as HTMLTextAreaElement;
    ta.value = 'Nope';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(core.code).not.toMatch(/Nope/);
    ed.undo();
    expect(core.code).toMatch(/Beta/);
  });

  it('Esc chain: paint → group → selection', async () => {
    const { core } = mount('flowchart TB\n  subgraph G[Team]\n    A[Alpha]\n    B[Beta]\n  end\n  A --> B\n');
    await settle();
    // a click inside a group selects the group (Miro-like)
    drag(core, itemEl(core, 'node', 'A'), center(core, 'A'));
    expect(sel(core)).toEqual(['group:G']);
    core.run('enterGroup', 'G');
    expect(core.enteredGroup.peek()).toBe('G');
    expect(core.dom.wrap.querySelector('.group-edit-bar')?.textContent).toMatch(/Editing group Team/);
    drag(core, itemEl(core, 'node', 'A'), center(core, 'A'));
    expect(sel(core)).toEqual(['node:A']);
    core.run('setPainting', true);
    expect(core.tool.peek()).toBe('paint');
    key(core, 'Escape');
    expect(core.tool.peek()).toBe('pointer');
    expect(core.enteredGroup.peek()).toBe('G');
    key(core, 'Escape');
    expect(core.enteredGroup.peek()).toBeNull();
    expect(sel(core)).toEqual(['group:G']);
    key(core, 'Escape');
    expect(sel(core)).toEqual([]);
  });

  it('paint roller applies a style; ⌘⌥C / ⌘⌥V copy and paste it', () => {
    const { ed, core } = mount(FLOW);
    core.change('style', () => {
      core.ensure('node', 'A').fill = '#ff0000';
    });
    core.select([{ kind: 'node', id: 'A' }]);
    key(core, 'c', { mod: true, alt: true, code: 'KeyC' });
    core.select([{ kind: 'node', id: 'B' }]);
    key(core, 'v', { mod: true, alt: true, code: 'KeyV' });
    expect(core.getM('node', 'B').fill).toBe('#ff0000');
    ed.undo();
    expect(core.getM('node', 'B').fill).toBeUndefined();
    core.select([{ kind: 'node', id: 'A' }]);
    core.run('setPainting', true);
    drag(core, itemEl(core, 'node', 'C'), center(core, 'C'));
    expect(core.getM('node', 'C').fill).toBe('#ff0000');
    expect(core.tool.peek()).toBe('pointer');
    expect(sel(core)).toEqual(['node:C']);
  });

  it('⌘A selects every box and connector; Tab moves the selection and announces it', () => {
    const { core } = mount(FLOW);
    key(core, 'a', { mod: true });
    expect(sel(core).sort()).toEqual(['edge:A->B', 'edge:B->C', 'node:A', 'node:B', 'node:C']);
    core.select([]);
    key(core, 'Tab');
    expect(sel(core)).toEqual(['node:A']);
    expect(core.dom.root.querySelector('.ds-sr')?.textContent).toBe('Selected node Alpha, 1 connection');
    key(core, 'Tab');
    expect(sel(core)).toEqual(['node:B']);
    expect(core.dom.root.querySelector('.ds-sr')?.textContent).toBe('Selected node Beta, 2 connections');
    key(core, 'Tab', { shift: true });
    expect(sel(core)).toEqual(['node:A']);
  });

  it('right-click on the board offers Paste / Unlock all, else a disabled "Nothing to paste"', () => {
    const { core } = mount(FLOW);
    core.dom.svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: -300, clientY: -300 }));
    let menu = core.dom.wrap.querySelector('.ctx-menu');
    expect(menu?.textContent).toMatch(/Nothing to paste/);
    expect((menu?.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    core.popovers.close();
    core.change('lock', () => {
      core.ensure('node', 'A').locked = true;
    });
    core.dom.svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: -300, clientY: -300 }));
    menu = core.dom.wrap.querySelector('.ctx-menu');
    expect(menu?.textContent).toMatch(/Unlock all \(1\)/);
    (menu?.querySelector('button') as HTMLButtonElement).click();
    expect(core.getM('node', 'A').locked).toBeUndefined();
  });

  it('locked items do not move; resize keeps the minimum size', () => {
    const { core } = mount(FLOW);
    core.change('lock', () => {
      core.ensure('node', 'A').locked = true;
    });
    const before = center(core, 'A');
    drag(core, itemEl(core, 'node', 'A'), before, 50, 50);
    expect(center(core, 'A')).toEqual(before);
    core.select([{ kind: 'node', id: 'B' }]);
    const handle = core.dom.overlay.querySelector('[data-handle="resize"]');
    expect(handle).toBeTruthy();
    const hx = Number(handle!.getAttribute('x')), hy = Number(handle!.getAttribute('y'));
    drag(core, handle!, { x: hx, y: hy }, -500, -500);
    expect(core.getM('node', 'B').w).toBe(30);
    expect(core.getM('node', 'B').h).toBe(20);
  });

  it('resizing shows the item size until the handle is released', () => {
    const { core } = mount(FLOW);
    core.select([{ kind: 'node', id: 'B' }]);
    const handle = core.dom.overlay.querySelector('[data-handle="resize"]')!;
    const hx = Number(handle.getAttribute('x')), hy = Number(handle.getAttribute('y'));
    expect(core.dom.overlay.querySelector('.size-badge-text')).toBeNull();
    pid++;
    pointer(handle, 'pointerdown', hx, hy);
    pointer(core.dom.svg, 'pointermove', hx + 40, hy + 20);
    const m = core.getM('node', 'B');
    expect(core.dom.overlay.querySelector('.size-badge-text')?.textContent).toBe(`${m.w} × ${m.h}`);
    pointer(core.dom.svg, 'pointerup', hx + 40, hy + 20);
    expect(core.dom.overlay.querySelector('.size-badge, .size-badge-text')).toBeNull();
  });

  it('the empty code offers the diagram types', () => {
    const { core } = mount('');
    const chooser = core.dom.wrap.querySelector('.type-chooser') as HTMLElement;
    expect(chooser.hidden).toBe(false);
    (chooser.querySelector('[data-start="sequence"]') as HTMLButtonElement).click();
    expect(core.model.type).toBe('sequence');
    expect(chooser.hidden).toBe(true);
    expect((core.dom.wrap.querySelector('.empty-hint') as HTMLElement).hidden).toBe(false);
  });

  it('View mode: links raise a cancelable ds-link event', () => {
    const { ed, core } = mount('flowchart TB\n  A[Docs]\n  click A href "https://example.com/docs"\n');
    ed.setMode('view');
    const target = core.dom.body.querySelector('[data-link]');
    expect(target).toBeTruthy();
    let got: unknown = null;
    core.dom.root.getRootNode();
    (core.dom.shadow.host as HTMLElement).addEventListener('ds-link', (ev) => {
      got = (ev as CustomEvent).detail;
      ev.preventDefault();
    });
    target!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(got).toEqual({ href: 'https://example.com/docs', id: 'A' });
  });
});
