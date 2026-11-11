// The parser kit (X2, task 4.3): one preprocessing view, one frontmatter rule, one line index, one label text, one
// `%%{init}%%` reader and one first-match step of a jison lexer, shared by the parsers.
import { describe, expect, it } from 'vitest';
import { detectType } from '../../../src/core/parse/dispatch.js';
import { frontmatterAt, frontmatterSpan, isFrontmatterFence } from '../../../src/core/parse/frontmatter.js';
import { firstMatch, lexRule, prepareSource } from '../../../src/core/parse/jison.js';
import { initKey, initSection, labelText, lineIndex, stripQuotes, unquotePair } from '../../../src/core/parse/kit.js';
import { LexBudget } from '../../../src/core/parse/limits.js';
import { LineScan } from '../../../src/core/parse/line-scan.js';

describe('parser kit', () => {
  it('prepareSource blanks the frontmatter, directives and comment lines, keeps every offset, and runs entities together', () => {
    const code = '---\ntitle: T\n---\n%%{init: {}}%%\nerDiagram\n  %% a comment\n  A ||--o{ B : "#9829; x"\n';
    const { src, front } = prepareSource(code);
    expect(front).toEqual(['title: T']);
    expect(src.length).toBe(code.length + 1);
    expect(src.split('\n').map((l) => l.trim())).toEqual(['', '', '', '', 'erDiagram', '', 'A ||--o{ B : "ﬂ9829¶ x"', '', '']);
  });

  it('one frontmatter rule: a fence is a line of `---` alone, for the parsers and for detecting the type', () => {
    expect(isFrontmatterFence('---')).toBe(true);
    expect(isFrontmatterFence('  ---  ')).toBe(true);
    expect(isFrontmatterFence('---x')).toBe(false);
    expect(frontmatterSpan('\n---\na: 1\n---\nflowchart')).toEqual({ lines: ['a: 1'], end: 14 });
    expect(frontmatterSpan('---x\na: 1\n---\nflowchart')).toBeNull();
    expect(frontmatterAt(['', '---', 'a: 1', '---', 'flowchart'])).toEqual({ start: 1, end: 3 });
    expect(frontmatterAt(['---x', 'a: 1', '---'])).toBeNull();
    expect(detectType('---\ntitle: x\n---\nflowchart LR\n')).toBe('flowchart');
    // not a frontmatter: the type is read from that line, like the parsers read it
    expect(detectType('---x\ntitle: x\n---\nflowchart LR\n')).toBeNull();
  });

  it('lineIndex answers an offset\'s line and keeps the line starts', () => {
    const at = lineIndex('ab\ncd\n\nef');
    expect([0, 2, 3, 5, 6, 7, 8].map(at)).toEqual([0, 0, 1, 1, 2, 3, 3]);
    expect(at.starts).toEqual([0, 3, 6, 7]);
  });

  it('labelText decodes entities and <br>, keeps line breaks, drops control characters', () => {
    expect(labelText('a<br>b#35;\u0007\u0085c')).toBe('a\nb#c');
    expect(unquotePair('"a b"')).toBe('a b');
    expect(unquotePair('""a""')).toBe('"a"');
    expect(stripQuotes('""a""')).toBe('a');
  });

  it('reads a directive\'s section and keys, quoted or not', () => {
    const t = `%%{init: {"flowchart": {"curve": "basis", wrappingWidth: 120}, 'htmlLabels': false}}%%`;
    const flow = initSection(t, 'flowchart');
    expect(initKey(flow, 'curve')).toBe('basis');
    expect(initKey(flow, 'wrappingWidth')).toBe('120');
    expect(initKey(t, 'htmlLabels')).toBe('false');
    expect(initKey(t, 'missing')).toBeUndefined();
    expect(initSection(t, 'mindmap')).toBe('');
  });

  it('firstMatch takes the first rule of a condition that matches, predicate rules included, and charges the budget', () => {
    const src = 'direction LR\nabc\n';
    const rules = [lexRule('[a-z]+', 'word'), lexRule('.*direction\\s+LR[^\\n]*', 'dir', { test: (L, pos) => L.direction(pos, 'LR') }), lexRule('\\n', 'nl')];
    const L = new LineScan(src), budget = new LexBudget(src.length);
    expect(firstMatch(rules, [1, 0, 2], src, 0, L, budget)).toEqual({ m: 'direction LR', act: 'dir' });
    expect(firstMatch(rules, [0, 2], src, 12, L, budget)).toEqual({ m: '\n', act: 'nl' });
    expect(firstMatch(rules, [2], src, 13, L, budget)).toBeNull();
    const tiny = new LexBudget(0);
    expect(() => {
      for (;;) firstMatch(rules, [0], src, 13, L, tiny);
    }).toThrow();
  });
});
