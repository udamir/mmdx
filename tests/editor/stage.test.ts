// @vitest-environment jsdom
// The `history` stage (component architecture §8.2, phase 4b): another scene takes the editor's canvas, editing is
// suspended with its state kept, the document is never written, and leaving restores everything.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { BaseScene } from '../../src/view/scene.js';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

class Probe extends BaseScene {
  readonly id = 'probe';
  paints = 0;
  protected paint(): void {
    this.paints++;
    this.area!.main.show({ defs: [], page: [], body: [] });
  }
}

const SRC = 'flowchart LR\n  a[A] --> b[B]\n';
let host: HTMLElement;
let ed: DiagramEditor;
afterEach(() => {
  ed?.destroy();
  host?.remove();
});
const mount = (readOnly = false): DiagramEditor => {
  host = document.createElement('div');
  document.body.append(host);
  ed = new DiagramEditor(host, { value: SRC, storage: memoryStorage(), ui: 'light', readOnly });
  return ed;
};
const enter = (e: DiagramEditor, scene: Probe): void => {
  e.core.canvas.saveView();
  e.core.setStage('history');
  e.core.pushScene(scene);
};
const leave = (e: DiagramEditor): void => {
  e.core.popScene();
  e.core.setStage('document');
};
const key = (e: DiagramEditor, k: string, mod = false): void => {
  e.core.root.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: mod, metaKey: mod, bubbles: true, cancelable: true, composed: true }));
};
const state = (e: DiagramEditor) => ({
  source: e.getSource(),
  mode: e.core.mode.peek(),
  tool: e.core.tool.peek(),
  selection: e.core.selection().map((s) => `${s.kind}:${s.id}`),
  panels: { ...e.core.panels.peek() },
  modules: e.core.moduleIds.join(' '),
  nodes: e.core.dom.body.querySelectorAll('.el[data-kind="node"]').length,
  chrome: [...e.core.root.querySelectorAll('.mmdx-stack, .mmdx-panel, .tool-dock, .view-params, .bottom-bar')].map((x) => x.className).join(' | '),
});

describe('the history stage', () => {
  for (const readOnly of [false, true])
    it(`${readOnly ? 'View' : 'Edit'} mode: enter and leave keep the state; editing is suspended in between`, () => {
      const e = mount(readOnly);
      if (!readOnly) e.select([{ kind: 'node', id: 'a' }]);
      const before = state(e);
      const probe = new Probe();
      enter(e, probe);
      expect(probe.paints).toBe(1);
      // the scene owns the canvas: the document is not painted
      expect(e.core.dom.body.querySelectorAll('.el').length).toBe(0);
      // editing modules are suspended: their panels leave the DOM, gestures and painters are off
      expect(e.core.moduleScope('canvas-select')?.active).toBe(false);
      expect(e.core.root.querySelector('.mmdx-panel.code-edit, .mmdx-panel.props, .mmdx-panel.layers')).toBeNull();
      const hit = e.core.hitTest({ target: e.core.canvas.svg, clientX: 0, clientY: 0 });
      expect(e.core.startGesture(new MouseEvent('pointerdown') as PointerEvent, hit)).toBeNull();
      // the chrome that History keeps is still there
      expect(e.core.root.querySelector('.tool-dock')).not.toBeNull();
      expect(e.core.root.querySelector('.bottom-bar')).not.toBeNull();
      // the document is never written: undo and delete do nothing
      key(e, 'z', true);
      key(e, 'Delete');
      expect(e.getSource()).toBe(before.source);
      leave(e);
      expect(state(e)).toEqual(before);
    });

  it('a store change while History is open marks the document dirty and repaints it in full on the way back', () => {
    const e = mount();
    const probe = new Probe();
    enter(e, probe);
    e.setSource('flowchart LR\n  a --> b --> c\n', { history: 'push' });
    expect(probe.paints).toBe(1);
    expect(e.core.dom.body.querySelectorAll('.el').length).toBe(0);
    leave(e);
    expect(e.core.dom.body.querySelectorAll('.el[data-kind="node"]').length).toBe(3);
  });
});
