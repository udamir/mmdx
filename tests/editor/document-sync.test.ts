// @vitest-environment jsdom
// The editor's document sync (5.3, characterization): loading from the adapter (name, `mmdx-load`), saving with the
// adapter's version (`mmdx-save` cancelable, `mmdx-saved`, the document clean), a conflict resolved in the dialog
// (keep mine saves over theirs, take theirs loads it), a clean remote update applied, and autosave after a change.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryDocumentAdapter } from '../../src/adapters/documents.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor, type EditorOptions } from '../../src/editor/editor.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

const eds: DiagramEditor[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const e of eds.splice(0)) e.destroy();
  document.body.replaceChildren();
});
const mount = async (o: EditorOptions): Promise<DiagramEditor> => {
  const host = document.createElement('div');
  document.body.append(host);
  const e = new DiagramEditor(host, { storage: memoryStorage(), ...o });
  eds.push(e);
  await e.whenLoaded();
  return e;
};

const SRC = 'flowchart LR\n  a --> b\n';
const MINE = 'flowchart LR\n  a --> c\n';
const THEIRS = 'flowchart LR\n  a --> d\n';
const events = (e: DiagramEditor, names: string[]): string[] => {
  const seen: string[] = [];
  for (const n of names) e.core.host.addEventListener(n, () => seen.push(n));
  return seen;
};

describe('DocumentSync', () => {
  it('loads from the adapter, then saves with its version and marks the document clean', async () => {
    const a = memoryDocumentAdapter(SRC);
    const save = vi.spyOn(a, 'save');
    const e = await mount({ adapter: a });
    expect(e.getSource()).toBe(SRC);
    const seen = events(e, ['mmdx-save', 'mmdx-saved']);
    e.setSource(MINE, { history: 'push', markSaved: false });
    expect(e.dirty).toBe(true);
    await expect(e.save()).resolves.toBe('saved');
    expect(save).toHaveBeenCalledWith(MINE, expect.objectContaining({ version: expect.any(String) }));
    expect(seen).toEqual(['mmdx-save', 'mmdx-saved']);
    expect(e.dirty).toBe(false);
  });

  it('a cancelled mmdx-save does not save; no adapter is reported', async () => {
    const a = memoryDocumentAdapter(SRC);
    const e = await mount({ adapter: a });
    e.core.host.addEventListener('mmdx-save', (ev) => ev.preventDefault(), { once: true });
    await expect(e.save()).resolves.toBe('cancelled');
    e.adapter = undefined;
    await expect(e.save()).resolves.toBe('no-adapter');
  });

  it('a conflict asks: keep mine saves over theirs, take theirs loads theirs', async () => {
    const a = memoryDocumentAdapter(SRC);
    const e = await mount({ adapter: a });
    const choose = vi.spyOn(e.core.dialogs, 'choose');
    const seen = events(e, ['mmdx-conflict']);
    e.setSource(MINE, { history: 'push', markSaved: false });
    a.setRemote(THEIRS);
    // the remote update finds the document dirty: it waits for a choice (the bar), the save conflicts
    choose.mockResolvedValueOnce('mine');
    await expect(e.save()).resolves.toBe('saved');
    expect(seen).toEqual(['mmdx-conflict']);
    expect((await a.load()).source).toBe(MINE);

    e.setSource(SRC, { history: 'push', markSaved: false });
    a.setRemote(THEIRS);
    choose.mockResolvedValueOnce('theirs');
    await expect(e.save()).resolves.toBe('conflict');
    expect(e.getSource()).toBe(THEIRS);
  });

  it('applies a remote update to a clean document', async () => {
    const a = memoryDocumentAdapter(SRC);
    const e = await mount({ adapter: a });
    a.setRemote(THEIRS);
    expect(e.getSource()).toBe(THEIRS);
  });

  it('autosaves a change after the delay, not a load', async () => {
    const a = memoryDocumentAdapter(SRC);
    const e = await mount({ adapter: a, autosave: 500 });
    const save = vi.spyOn(a, 'save');
    vi.useFakeTimers();
    e.setSource(MINE, { history: 'reset' });
    vi.advanceTimersByTime(600);
    expect(save).not.toHaveBeenCalled();
    e.core.applyCode({ code: MINE.replace('c', 'e') }, 'Edit');
    vi.advanceTimersByTime(400);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
