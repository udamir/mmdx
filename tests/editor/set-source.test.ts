// @vitest-environment jsdom
// Restoring a draft: <mmdx-editor>.setSource passes `fit` and `markSaved` through, and whenLoaded() / mmdx-load tell
// the host when the adapter's document is in.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { memoryDocumentAdapter, type DocumentAdapter } from '../../src/adapters/documents.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import { defineEditor, type MmdxEditorElement } from '../../src/editor/editor.js';
import { loadKind } from '../../src/view/kinds.js';

beforeAll(async () => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
  await loadKind('flowchart');
  defineEditor();
});

const SAVED = 'flowchart LR\n  a --> b\n';
const DRAFT = 'flowchart LR\n  a --> b\n  b --> c\n';

const els: HTMLElement[] = [];
afterEach(() => {
  for (const el of els.splice(0)) el.remove();
});
const editor = (adapter?: DocumentAdapter): MmdxEditorElement => {
  const el = document.createElement('mmdx-editor');
  el.storage = memoryStorage();
  if (adapter) el.adapter = adapter;
  document.body.append(el);
  els.push(el);
  return el;
};

describe('<mmdx-editor> setSource and whenLoaded', () => {
  it('whenLoaded() resolves after the adapter\'s document is in, with mmdx-load first', async () => {
    const events: unknown[] = [];
    const el = document.createElement('mmdx-editor');
    el.addEventListener('mmdx-load', (e) => events.push((e as CustomEvent).detail));
    el.storage = memoryStorage();
    el.adapter = memoryDocumentAdapter(SAVED);
    document.body.append(el);
    els.push(el);
    expect(el.getSource()).not.toBe(SAVED);
    await el.whenLoaded();
    expect(el.getSource()).toBe(SAVED);
    expect(events).toEqual([{ source: SAVED, version: '1' }]);
  });

  it('a draft restored with { history: "push", markSaved: false } is unsaved and undoable', async () => {
    const el = editor(memoryDocumentAdapter(SAVED));
    await el.whenLoaded();
    expect(el.dirty).toBe(false);
    el.setSource(DRAFT, { history: 'push', markSaved: false, fit: false });
    expect(el.getSource()).toBe(DRAFT);
    expect(el.dirty).toBe(true);
    el.undo();
    expect(el.getSource()).toBe(SAVED);
    expect(el.dirty).toBe(false);
    el.redo();
    expect(el.getSource()).toBe(DRAFT);
    expect(el.dirty).toBe(true);
  });

  it('setSource without options still marks the source saved', async () => {
    const el = editor(memoryDocumentAdapter(SAVED));
    await el.whenLoaded();
    el.setSource(DRAFT);
    expect(el.dirty).toBe(false);
  });

  it('whenLoaded() rejects when the load failed, and resolves at once without an adapter', async () => {
    const failing: DocumentAdapter = { load: () => Promise.reject(new Error('offline')), save: async () => ({}) };
    await expect(editor(failing).whenLoaded()).rejects.toThrow('offline');
    await expect(editor().whenLoaded()).resolves.toBeUndefined();
    await expect((document.createElement('mmdx-editor') as MmdxEditorElement).whenLoaded()).rejects.toThrow('Not connected');
  });
});
