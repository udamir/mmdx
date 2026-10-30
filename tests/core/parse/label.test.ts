import { describe, it, expect } from 'vitest';
import { cleanLabel, encodeLabel, isMarkdownString } from '../../../src/core/parse/label.js';

describe('cleanLabel', () => {
  it('strips one level of quotes and backticks', () => {
    expect(cleanLabel('"Hello"')).toBe('Hello');
    expect(cleanLabel("'Hello'")).toBe('Hello');
    expect(cleanLabel('"`md`"')).toBe('md');
    expect(cleanLabel('" "')).toBe(' ');
    expect(cleanLabel(undefined)).toBe('');
    expect(cleanLabel(null)).toBe('');
  });
  it('decodes <br>, #quot;, #35;, numeric codes and the three HTML entities', () => {
    expect(cleanLabel('a<br>b<BR/>c<br />d')).toBe('a\nb\nc\nd');
    expect(cleanLabel('say #quot;hi#quot; #35;1')).toBe('say "hi" #1');
    expect(cleanLabel('#9829;')).toBe('♥');
    expect(cleanLabel('a &amp; b &lt;c&gt;')).toBe('a & b <c>');
  });
  it('decodes in one pass and leaves invalid code points as written', () => {
    expect(cleanLabel('&amp;lt;')).toBe('&lt;');
    expect(cleanLabel('#55296;')).toBe('#55296;');
    expect(cleanLabel('#9999999;')).toBe('#9999999;');
  });
});

describe('encodeLabel', () => {
  it('writes <br> for newlines and #quot; for quotes', () => {
    expect(encodeLabel('a\nb')).toBe('a<br>b');
    expect(encodeLabel('say "hi"')).toBe('say #quot;hi#quot;');
    expect(encodeLabel('Step #1 & co')).toBe('Step #1 & co');
  });
  it('is the inverse of cleanLabel on a double-quoted label', () => {
    const samples = ['', ' ', 'plain', 'a\nb', '"q"', '#quot;', '#35;', '#12;', '&amp;', '&lt;br&gt;', '<br>', '<BR/>',
      '`tick`', '`', 'a`b`', "'x'", ' padded ', 'x\r\ny'];
    for (const s of samples) expect(cleanLabel(`"${encodeLabel(s)}"`)).toBe(s.replace(/\r\n/g, '\n'));
  });
  it('round-trips random strings', () => {
    const alphabet = 'ab #&;<>/"\'`\nqutlgmpbr0123456789';
    let seed = 7;
    const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let k = 0; k < 2000; k++) {
      let s = '';
      for (let i = rnd(16); i > 0; i--) s += alphabet[rnd(alphabet.length)];
      expect(cleanLabel(`"${encodeLabel(s)}"`)).toBe(s);
    }
  });
});

describe('isMarkdownString', () => {
  it('detects "`…`"', () => {
    expect(isMarkdownString('"`**b**`"')).toBe(true);
    expect(isMarkdownString('`x`')).toBe(true);
    expect(isMarkdownString('"x"')).toBe(false);
    expect(isMarkdownString(undefined)).toBe(false);
  });
});
