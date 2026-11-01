// @vitest-environment jsdom
// A text edit (inline editor, Properties text field) applies to the document as it is when the edit ends, not to the
// snapshot taken when it opened: a remote update while typing survives, and an item that is gone is left alone.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { CANVAS_MODULES } from '../../src/editor/modules/canvas/index.js';
import { panesModule } from '../../src/editor/modules/chrome/panes.js';
import { rightPanelsModule } from '../../src/editor/modules/panels/right-panels.js';
import { labelSpec } from '../../src/editor/ops/label.js';
import type { EditorModule } from '../../src/editor/module.js';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

const FLOW = 'flowchart LR\n  A["Alpha"] --> B["Beta"]\n';
const REMOTE = 'flowchart LR\n  A["Alpha"] --> B["Beta"]\n  B --> C["Gamma"]\n';

let ed: DiagramEditor | null = null;
afterEach(() => {
  ed?.destroy();
  ed = null;
  document.body.replaceChildren();
});
const mount = (value: string, modules: readonly EditorModule[]): DiagramEditor => {
  const host = document.createElement('div');
  document.body.append(host);
  ed = new DiagramEditor(host, { value, modules, storage: memoryStorage() });
  return ed;
};
const flush = async (): Promise<void> => {
  // the Properties inspectors load the first time the panel shows
  await vi.dynamicImportSettled();
  await Promise.resolve();
  await Promise.resolve();
};

describe('text edits apply to the current document', () => {
  it('inline editor: a remote update while typing is kept', () => {
    const e = mount(FLOW, CANVAS_MODULES);
    expect(e.core.run('inlineEdit', { kind: 'node', id: 'B' })).toBe(true);
    const ta = e.core.dom.wrap.querySelector<HTMLTextAreaElement>('textarea.inline-edit')!;
    expect(ta.getAttribute('aria-label')).toBe('Text');
    ta.value = 'Bravo';
    e.setSource(REMOTE, { history: 'push', fit: false });
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const M = e.core.model;
    expect(M.type === 'flowchart' && M.nodes.get('B')?.label).toBe('Bravo');
    expect(M.type === 'flowchart' && M.nodes.get('C')?.label).toBe('Gamma');
  });

  it('Properties text field: a remote update while typing is kept', async () => {
    const e = mount(FLOW, [panesModule, rightPanelsModule]);
    e.core.select([{ kind: 'node', id: 'B' }]);
    await flush();
    const ta = e.core.root.querySelector<HTMLTextAreaElement>('.mmdx-panel.props .prop-label textarea')!;
    ta.focus();
    ta.value = 'Bravo';
    e.setSource(REMOTE, { history: 'push', fit: false });
    ta.dispatchEvent(new Event('blur'));
    const M = e.core.model;
    expect(M.type === 'flowchart' && M.nodes.get('B')?.label).toBe('Bravo');
    expect(M.type === 'flowchart' && M.nodes.get('C')?.label).toBe('Gamma');
  });

  it('gives up when the item is gone, or a positional id now names another item', () => {
    const e = mount(FLOW, []);
    const spec = labelSpec(e.core, 'node', 'B')!;
    e.setSource('flowchart LR\n  A["Alpha"]\n', { history: 'push' });
    expect(spec.apply('Bravo')).toBeNull();

    e.setSource('sequenceDiagram\n  P->>Q: hello\n');
    const msg = labelSpec(e.core, 'message', 'm1')!;
    expect(msg.value).toBe('hello');
    // a message inserted above: m1 is now another message
    e.setSource('sequenceDiagram\n  P->>Q: first\n  P->>Q: hello\n', { history: 'push' });
    expect(msg.apply('hi')).toBeNull();
    e.setSource('sequenceDiagram\n  P->>Q: hello\n  P->>Q: later\n', { history: 'push' });
    expect(msg.apply('hi')?.code).toContain('P->>Q: hi\n  P->>Q: later');
  });
});
