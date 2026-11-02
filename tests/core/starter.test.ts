import { describe, expect, it } from 'vitest';
import { detectType, parse, starterSource } from '../../src/core.js';

describe('starterSource', () => {
  it('gives the empty diagram of each type, which parses without errors', () => {
    for (const [type, kind] of [['flowchart', 'flowchart'], ['sequence', 'sequence'], ['er', 'er']] as const) {
      const src = starterSource(type);
      expect(detectType(src)).toBe(kind);
      expect(parse(src).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    }
    expect(starterSource('flowchart')).toBe('flowchart TB\n');
  });
  it('throws for an unknown type', () => {
    expect(() => starterSource('gantt' as never)).toThrow(/gantt/);
  });
});
