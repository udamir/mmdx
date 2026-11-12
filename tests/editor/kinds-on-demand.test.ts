// @vitest-environment jsdom
// The editor loads a diagram type's code on demand (T01.9): a document of a type not loaded yet draws once its kinds
// arrive, a header typed in the code panel switches to another type after its kinds load, whenLoaded() waits for them.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { forgetKinds, forgetOps, opsKind, viewKind } from '../../src/core/kinds/registry.js';
import { defineEditor, type MmdxEditorElement } from '../../src/elements/editor.js';
import { editKind, forgetEditKinds } from '../../src/editor/kinds/registry.js';
import { loadKind } from '../../src/platform/kinds.js';

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

  it('a type whose parser another component loaded first (the studio\'s gallery) waits for the editor\'s own kinds: nothing is parsed or drawn meanwhile, then it draws; no ops lookup fails', async () => {
    const el = editor('flowchart LR\n  a --> b\n');
    await el.whenLoaded();
    // a viewer on the page loaded the ER parser and renderer; the editor's ER chunk (its ops) is not loaded yet
    await loadKind('er');
    expect(viewKind('er') && !opsKind('er')).toBeTruthy();
    const core = el.instance!.core;
    // before the fix: the model was an ER model at once and the empty-state check's ops lookup threw (KindNotLoaded)
    expect(() => el.setSource('erDiagram\n  A ||--o{ B : has\n')).not.toThrow();
    // while the editor's ER kinds load nothing is parsed (no problems) and nothing is drawn
    expect(core.model).toEqual({ type: null, diagnostics: [] });
    expect(() => core.isEmptyDiagram()).not.toThrow();
    expect(items(el, 'node') + items(el, 'entity')).toBe(0);
    await el.whenLoaded();
    expect(core.model.type).toBe('er');
    expect(items(el, 'entity')).toBe(2);
    // the problems of the moment it waited (unsupported) are gone once it parses
    expect(core.issueCount.peek()).toBe(0);
  });

  it('a History version of a type whose parser another component loaded first waits for the editor\'s own kinds: it is not parsed meanwhile, and is parsed and drawn once they arrive; no ops lookup fails (BUG-005)', async () => {
    const el = editor('flowchart LR\n  a --> b\n');
    await el.whenLoaded();
    await loadKind('er');
    expect(viewKind('er') && !opsKind('er')).toBeTruthy();
    const core = el.instance!.core;
    // before the fix: the version was parsed with every registered kind, an ER model whose ops are not loaded, and the empty-state check threw (KindNotLoaded)
    expect(() => core.showVersion({ id: 'v1', source: 'erDiagram\n  A ||--o{ B : has\n' })).not.toThrow();
    expect(core.model).toEqual({ type: null, diagnostics: [] });
    expect(() => core.isEmptyDiagram()).not.toThrow();
    expect(items(el, 'node') + items(el, 'entity')).toBe(0);
    await core.kindsReady();
    expect(core.model.type).toBe('er');
    expect(core.isEmptyDiagram()).toBe(false);
    expect(items(el, 'entity')).toBe(2);
    // the document itself is untouched, and shows again when the version closes
    core.showVersion(null);
    expect(core.model.type).toBe('flowchart');
    expect(items(el, 'node')).toBe(2);
  });
});
