import { describe, it, expect } from 'vitest';
import { parseStyleList } from '../../../src/core/parse/style.js';

const run = (s: string): { st: ReturnType<typeof parseStyleList>; bad: string[] } => {
  const bad: string[] = [];
  return { st: parseStyleList(s, (m) => bad.push(m)), bad };
};

describe('parseStyleList', () => {
  it('reads the modelled properties', () => {
    const { st, bad } = run('fill:#f9f,stroke:#333,stroke-width:4px,color:white,stroke-dasharray: 5 5,font-size:18px');
    expect(st).toEqual({ fill: '#f9f', stroke: '#333', strokeWidth: 4, text: 'white', dash: '5 5', fontSize: 18 });
    expect(bad).toEqual([]);
  });
  it('keeps rgb() with commas as one value and ignores other properties', () => {
    const { st, bad } = run('fill:rgb(1, 2, 3),rx:5,font-weight:bold,stroke:hsl(10,20%,30%) !important;');
    expect(st).toEqual({ fill: 'rgb(1, 2, 3)', stroke: 'hsl(10,20%,30%)' });
    expect(bad).toEqual([]);
  });
  it('drops and reports malformed parts', () => {
    const { st, bad } = run('fill:#12,stroke,stroke-width:wide,stroke-dasharray:a b,font-size:-3, ,color:');
    expect(st).toEqual({});
    expect(bad).toEqual([
      'invalid color "#12" for fill',
      'invalid style "stroke" — expected property:value',
      'invalid stroke-width "wide"',
      'invalid stroke-dasharray "a b"',
      'invalid font-size "-3"',
      'invalid style "color:" — expected property:value',
    ]);
  });
  it('drops values that would break out of an SVG attribute', () => {
    for (const s of ['fill:x" onmouseover="alert(1)"', 'fill:url(javascript:alert(1))', 'stroke:red;background:url(x)',
      'color:</style><script>', 'fill:expression(alert(1))', 'stroke-dasharray:1" onload="x', 'stroke-width:1" x="']) {
      const { st, bad } = run(s);
      expect(st, s).toEqual({});
      expect(bad.length, s).toBe(1);
    }
  });
});
