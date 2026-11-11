// Shared glue of the elements (X12, task 4.9): a document's name from a file name or a URL, and one report of the fonts
// a PNG export drew with local fonts.
import { describe, expect, it } from 'vitest';
import { fontsMissing } from '../../src/dom/export.js';
import { fileStem } from '../../src/ui/kit/format.js';

describe('fileStem', () => {
  it('takes the last segment, without the query, the hash and a document extension', () => {
    expect(fileStem('docs/flow.mmdx')).toBe('flow');
    expect(fileStem('https://x.test/a/flow.mmd?v=2#top')).toBe('flow');
    expect(fileStem('C:\\\\d\\\\plan.md')).toBe('plan');
    expect(fileStem('notes.markdown')).toBe('notes');
    expect(fileStem('data.json')).toBe('data');
    expect(fileStem('picture.png')).toBe('picture.png');
    expect(fileStem('.mmdx')).toBe('diagram');
    expect(fileStem(undefined)).toBe('diagram');
    expect(fileStem('', 'keep')).toBe('keep');
  });

  it('fontsMissing: one warning with the families', () => {
    expect(fontsMissing(['Inter', 'Fira Code'])).toEqual({ severity: 'warning', code: 'export.font-missing', message: 'No font file for Inter, Fira Code: local fonts were used', params: { fonts: 'Inter, Fira Code' } });
  });
});
