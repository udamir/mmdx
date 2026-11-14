// @vitest-environment jsdom
// B42: a second editor on the page loads the mindmap gestures when its document becomes a mindmap, although the
// mindmap kind is loaded already (no `model` event then).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';

const editors: DiagramEditor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
  document.body.replaceChildren();
});
const mount = (value: string): DiagramEditor => {
  const host = document.createElement('div');
  document.body.append(host);
  const ed = new DiagramEditor(host, { value, storage: memoryStorage() });
  editors.push(ed);
  return ed;
};

describe('mindmap gestures in a second editor (B42)', () => {
  it('load when the code becomes a mindmap', async () => {
    mount('mindmap\n  root\n    A');
    const b = mount('flowchart LR\n  A --> B');
    const add = vi.spyOn(b.core, 'addGestureSource');
    // typed into the code panel: a transaction, no `model` event
    b.core.applyCode({ code: 'mindmap\n  root\n    A\n    B' }, 'Typing');
    await vi.waitFor(() => expect(add).toHaveBeenCalled());
  });
});
