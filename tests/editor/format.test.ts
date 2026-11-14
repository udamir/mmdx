import { describe, expect, it } from 'vitest';
import { formatsAt, hasMarkup, toggleFormat, type TextFormat } from '../../src/editor/ops/format.js';
import { parseInline } from '../../src/core/text/rich.js';
// the editor code of the types with rich labels loads the media kit (the parser the formats are read with)
import '../../src/core/shapes/extended.js';

/** Toggles `f` on the part of `v` between `[` and `]` (none: the whole text); the result with its range bracketed. */
const tog = (v: string, f: TextFormat): string => {
  const a = v.indexOf('['), b = v.indexOf(']');
  const plain = v.replace(/[[\]]/g, '');
  const r = a < 0 ? toggleFormat(plain, 0, 0, f) : toggleFormat(plain, a, b - 1, f);
  return r.text.slice(0, r.a) + '[' + r.text.slice(r.a, r.b) + ']' + r.text.slice(r.b);
};

describe('text formats in a markdown string', () => {
  it('wraps the selected words, keeping the spaces at its ends outside the marks', () => {
    expect(tog('a [b c ]d', 'b')).toBe('a **[b c]** d');
    expect(tog('a [b] c', 'i')).toBe('a *[b]* c');
    expect(tog('a [b] c', 'u')).toBe('a <u>[b]</u> c');
    expect(tog('a [b] c', 's')).toBe('a <s>[b]</s> c');
  });

  it('the whole text when nothing is selected', () => {
    expect(tog('API Gateway', 'b')).toBe('**[API Gateway]**');
    expect(tog(' x ', 'u')).toBe(' <u>[x]</u> ');
  });

  it('takes a format off again, whether the marks are inside or outside the selection', () => {
    expect(tog('a [**b**] c', 'b')).toBe('a [b] c');
    expect(tog('a [b] c', 'b')).toBe('a **[b]** c');
    expect(tog('a **[b]** c', 'b')).toBe('a [b] c');
    expect(tog('a <u>[b]</u> c', 'u')).toBe('a [b] c');
    expect(tog('a [<s>b</s>] c', 's')).toBe('a [b] c');
    expect(tog('**API**', 'b')).toBe('[API]');
  });

  it('bold and italic share the stars: one comes off, the other stays', () => {
    // marks the selection held stay in it
    expect(tog('[***a***]', 'b')).toBe('[*a*]');
    expect(tog('[***a***]', 'i')).toBe('[**a**]');
    expect(tog('***[a]***', 'b')).toBe('*[a]*');
    expect(tog('**[a]**', 'i')).toBe('***[a]***');
    expect(tog('*[a]*', 'b')).toBe('***[a]***');
  });

  it('a tag is found inside the stars and outside them', () => {
    expect(tog('[**<u>a</u>**]', 'u')).toBe('[**a**]');
    expect(tog('<u>**[a]**</u>', 'u')).toBe('**[a]**');
  });

  it('marks are found through other marks around the same words', () => {
    expect(formatsAt('*<u>Web</u>*', 4, 7)).toEqual({ b: false, i: true, u: true, s: false });
    expect(formatsAt('*<u>**Web**</u>*', 0, 0)).toEqual({ b: true, i: true, u: true, s: false });
    expect(tog('*<u>**[Web]**</u>*', 'b')).toBe('*<u>[Web]</u>*');
    expect(tog('*<u>**[Web]**</u>*', 'i')).toBe('<u>**[Web]**</u>');
    expect(tog('[*<u>**Web**</u>*]', 'u')).toBe('[***Web***]');
    expect(tog('a <del>[b]</del>', 's')).toBe('a [b]');
  });

  it('reports the formats of a range, and the result reads back as those styles', () => {
    expect(formatsAt('***a***', 0, 0)).toEqual({ b: true, i: true, u: false, s: false });
    expect(formatsAt('x **a** y', 4, 5)).toEqual({ b: true, i: false, u: false, s: false });
    expect(formatsAt('**a**', 0, 0)).toEqual({ b: true, i: false, u: false, s: false });
    const v = toggleFormat(toggleFormat('a b', 2, 3, 'u').text, 0, 0, 'b').text;
    expect(v).toBe('**a <u>b</u>**');
    expect(parseInline(v, { markdown: true })).toEqual([{ text: 'a ', mark: null, bold: true }, { text: 'b', mark: null, bold: true, underline: true }]);
  });

  it('turning a format on takes it off the words inside first: a label with a bold word becomes bold as a whole', () => {
    expect(tog('x **a** y', 'b')).toBe('**[x a y]**');
    expect(tog('x ***a*** y', 'b')).toBe('**[x *a* y]**');
    expect(tog('[x <u>a</u> y]', 'u')).toBe('<u>[x a y]</u>');
    expect(tog('**a** <u>b</u>', 'u')).toBe('<u>[**a** b]</u>');
  });

  it('words inside a longer span split it', () => {
    expect(tog('**API [Gateway]**', 'b')).toBe('**API** [Gateway]');
    expect(tog('**[API] Gateway**', 'b')).toBe('[API] **Gateway**');
    expect(tog('<u>a [b] c</u>', 'u')).toBe('<u>a</u> [b] <u>c</u>');
    expect(tog('***API [Gateway]***', 'b')).toBe('***API** [Gateway]*');
    expect(formatsAt('***API** Gateway*', 9, 16)).toEqual({ b: false, i: true, u: false, s: false });
    expect(formatsAt('***API** Gateway*', 3, 6)).toEqual({ b: true, i: true, u: false, s: false });
  });

  it('hasMarkup: emphasis and the underline / strike tags', () => {
    expect(hasMarkup('plain')).toBe(false);
    expect(hasMarkup('a <u>b</u>')).toBe(true);
    expect(hasMarkup('**a**')).toBe(true);
  });
});
