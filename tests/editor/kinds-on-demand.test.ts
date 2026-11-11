// @vitest-environment jsdom
// The editor loads a diagram type's code on demand (T01.9): a document of a type not loaded yet draws once its kinds
// arrive, a header typed in the code panel switches to another type after its kinds load, whenLoaded() waits for them.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { forgetKinds, forgetOps, opsKind, viewKind } from '../../src/core/kinds/registry.js';
import { defineEditor, type MmdxEditorElement } from '../../src/elements/editor.js';
import { editKind, forgetEditKinds } from '../../src/editor/kinds/registry.js';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
  defineEditor();
});

beforeEach(() => {
  forgetKinds();
  forgetOps();
  forgetEditKinds();
});

const els: HTMLElement[] = [];
afterEach(() => {
  for (const el of els.splice(0)) el.remove();
});
const editor = (source: string): MmdxEditorElement => {
  const el = document.createElement('mmdx-editor');
  el.storage = memoryStorage();
  document.body.append(el);
  els.push(el);
  el.setSource(source);
  return el;
};
const items = (el: MmdxEditorElement, kind: string): number => el.shadowRoot!.querySelectorAll(`.el[data-kind="${kind}"]`).length;

describe('editor kinds on demand', () => {
  it('draws a document once the kinds of its type have loaded; whenLoaded() waits for them', async () => {
    const el = editor('flowchart LR\n  a --> b\n');
    expect(viewKind('flowchart')).toBeUndefined();
    await el.whenLoaded();
    expect(viewKind('flowchart') && opsKind('flowchart') && editKind('flowchart')).toBeTruthy();
    expect(items(el, 'node')).toBe(2);
    // the other types are not loaded
    expect(viewKind('sequence')).toBeUndefined();
    expect(viewKind('er')).toBeUndefined();
  });

  it('switches to another type typed in the code after its kinds load, and undo goes back', async () => {
    const el = editor('flowchart LR\n  a --> b\n');
    await el.whenLoaded();
    el.setSource('sequenceDiagram\n  A->>B: hi\n', { history: 'push' });
    await el.whenLoaded();
    expect(items(el, 'participant')).toBe(2);
    el.undo();
    expect(items(el, 'node')).toBe(2);
  });
});
