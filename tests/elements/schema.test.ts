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
});
