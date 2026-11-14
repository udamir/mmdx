// @vitest-environment jsdom
// Where the floating bars go (editor/lib/place.ts): the free strip measures the tool dock once per canvas size and view, not per placement (P22, BUG-029).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { freeStrip } from '../../src/editor/lib/place.js';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});
const eds: DiagramEditor[] = [];
afterEach(() => {
  for (const e of eds.splice(0)) e.destroy();
  document.body.replaceChildren();
});

describe('freeStrip', () => {
  it('measures the dock again only after the view or the canvas size changed', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const e = new DiagramEditor(host, { value: 'flowchart LR\n  A --> B\n', storage: memoryStorage() });
    eds.push(e);
    await e.whenLoaded();
    const core = e.core, wrap = core.dom.wrap;
    const query = vi.spyOn(wrap, 'querySelector');
    const docks = (): number => query.mock.calls.filter(([s]) => s === '.tool-dock').length;
    const first = freeStrip(core);
    expect(freeStrip(core)).toEqual(first);
    freeStrip(core);
    expect(docks()).toBe(1);
    // a pan (the `view` event) measures again
    core.viewport.panBy(5, 0);
    freeStrip(core);
    expect(docks()).toBe(2);
    freeStrip(core);
    expect(docks()).toBe(2);
    // and so does a resize of the canvas
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 900, 600));
    freeStrip(core);
    expect(docks()).toBe(3);
  });
});
