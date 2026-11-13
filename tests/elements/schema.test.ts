// The elements' schema (A9): the observed attributes follow from each element's attribute table, so none can be
// left out (the studio observed none).
import { describe, expect, it } from 'vitest';
import { MmdxDiffElement } from '../../src/elements/diff.js';
import { MmdxEditorElement } from '../../src/elements/editor.js';
import { MmdxStudioElement } from '../../src/elements/studio.js';
import { MmdxThemeEditorElement } from '../../src/elements/theme-editor.js';
import { MmdxViewerElement } from '../../src/elements/viewer.js';

describe('element schema', () => {
  it('every element observes the attributes of its schema', () => {
    for (const el of [MmdxViewerElement, MmdxEditorElement, MmdxDiffElement, MmdxThemeEditorElement, MmdxStudioElement]) {
      expect(el.observedAttributes, el.name).toEqual(Object.keys(el.schema.attrs));
      expect(el.observedAttributes.length, el.name).toBeGreaterThan(0);
    }
    expect(MmdxStudioElement.observedAttributes).toEqual(expect.arrayContaining(['examples', 'wheel']));
  });

  it('an attribute reads the same on every element: an unknown wheel or ui is the default (X12)', () => {
    for (const el of [MmdxViewerElement, MmdxEditorElement, MmdxDiffElement]) {
      const attrs = el.schema.attrs as Readonly<Record<string, readonly [string, (v: string | null) => unknown]>>;
      expect(['zoom', 'bogus', null].map((v) => attrs['wheel']![1](v)), el.name).toEqual(['zoom', undefined, undefined]);
      expect(['dark', 'bogus', null].map((v) => attrs['ui']![1](v)), el.name).toEqual(['dark', undefined, undefined]);
      expect(['auto', 'false', '', null].map((v) => attrs['compact']![1](v)), el.name).toEqual(['auto', false, true, undefined]);
    }
  });
});
