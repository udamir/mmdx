// Layout cache values (X21): positions and point lists packed into one Map<string, Point> and back.
import { describe, expect, it } from 'vitest';
import { pack, unpack } from '../../../src/core/layout/cache.js';

describe('layout cache values', () => {
  it('pack keeps the positions first and unpack gives back both, in order', () => {
    const pos = new Map([['a', { x: 1, y: 2 }], ['b', { x: 3, y: 4 }]]);
    const lists = new Map([[0, [{ x: 5, y: 6 }]], [3, [{ x: 7, y: 8 }, { x: 9, y: 10 }]]]);
    const m = pack(pos, lists);
    expect([...m.keys()].slice(0, 2)).toEqual(['a', 'b']);
    expect(m.get('a')).toEqual({ x: 1, y: 2 });
    const back = unpack(m);
    expect([...back.pos]).toEqual([...pos]);
    expect([...back.lists]).toEqual([...lists]);
  });

  it('without lists the value is a copy of the positions', () => {
    const pos = new Map([['a', { x: 1, y: 2 }]]);
    const m = pack(pos, []);
    expect(m).not.toBe(pos);
    expect(unpack(m)).toEqual({ pos, lists: new Map() });
  });
});
