import { describe, expect, it } from 'vitest';
import { stripMermaidStyles } from '../../src/core/strip-styles.js';

describe('stripMermaidStyles', () => {
  it('drops style statements and class shorthands, keeps the structure and labels', () => {
    const code = [
      'flowchart LR',
      '  a["A:::not a class"]:::hot --> b[B]',
      '  classDef hot fill:#f00',
      '  class b hot',
      '  style a stroke:#000',
      '  linkStyle 0 stroke:#00f',
      '',
      '',
      '  b --> c',
      '',
    ].join('\n');
    expect(stripMermaidStyles(code)).toBe(['flowchart LR', '  a["A:::not a class"] --> b[B]', '', '  b --> c'].join('\n'));
  });

  it('leaves sequence and ER code alone', () => {
    const seq = 'sequenceDiagram\n  participant A\n  A->>B: hi';
    expect(stripMermaidStyles(seq)).toBe(seq);
  });
});
