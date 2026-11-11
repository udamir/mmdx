// @vitest-environment jsdom
// itemEls matches by selector (P22): ids with quotes, backslashes and line breaks still find their elements only.
import { describe, expect, it } from 'vitest';
import { itemEls } from '../../src/editor/modules/canvas/shared.js';

describe('itemEls', () => {
  it('finds an item by kind and id, whatever its id holds', () => {
    const body = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const ids = ['a', 'a"b', 'c\\d', 'e\nf', 'say "hi"\\'];
    for (const id of ids)
      for (const kind of ['node', 'edge']) {
        const e = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        e.setAttribute('class', 'el');
        e.setAttribute('data-kind', kind);
        e.setAttribute('data-id', id);
        body.append(e);
      }
    const core = { dom: { body } } as unknown as Parameters<typeof itemEls>[0];
    for (const id of ids) {
      const found = itemEls(core, { kind: 'node', id });
      expect(found).toHaveLength(1);
      expect(found[0]!.getAttribute('data-id')).toBe(id);
      expect(found[0]!.getAttribute('data-kind')).toBe('node');
    }
    expect(itemEls(core, { kind: 'node', id: 'zz' })).toEqual([]);
  });
});
