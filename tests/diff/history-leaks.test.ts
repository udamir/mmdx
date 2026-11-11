// @vitest-environment jsdom
// History in place leaves nothing behind (B9): opening and closing it must not keep listeners or computeds on the
// host's core alive (a leaked `syncNarrow` read the computed style of every closed History's bar on each change).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StaticVersion } from '../../src/adapters/history.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import { defineEditor, type MmdxEditorElement } from '../../src/editor/editor.js';
import { loadKind } from '../../src/platform/kinds.js';

beforeAll(async () => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
  await loadKind('flowchart');
  defineEditor();
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const wait = async (f: () => unknown, ms = 4000): Promise<void> => {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

const A = 'flowchart LR\n  a --> b\n', B = 'flowchart LR\n  a --> b --> c\n';

describe('History open and close (B9)', () => {
  it('three open / close cycles leave the core\'s listeners as they were', async () => {
    const el = document.createElement('mmdx-editor') as MmdxEditorElement;
    el.storage = memoryStorage();
    el.value = B;
    document.body.append(el);
    const ed = el.instance!;
    el.history = [{ id: 'v2', message: 'Now', source: B }, { id: 'v1', message: 'Old', source: A }] as StaticVersion[];
    // count the registrations on the core that are still live
    const core = ed.core as unknown as { on: (ev: string, cb: (d: unknown) => void) => () => void };
    let live = 0;
    const on = core.on.bind(core);
    vi.spyOn(core, 'on').mockImplementation((ev, cb) => {
      const off = on(ev, cb);
      live++;
      let gone = false;
      return () => {
        if (!gone) {
          gone = true;
          live--;
        }
        off();
      };
    });
    for (let i = 0; i < 3; i++) {
      el.toggleHistory(true, { compare: true });
      await wait(() => el.historySession?.getDiff());
      el.toggleHistory(false);
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(live).toBe(0);
    // and nothing reads the layout of a closed History's bar when the panels change
    const spy = vi.spyOn(window, 'getComputedStyle');
    ed.core.panels.set({ ...ed.core.panels.peek(), code: !ed.core.panels.peek()['code'] });
    expect(spy.mock.calls.filter(([e]) => !(e as Element).isConnected)).toEqual([]);
  });
});
