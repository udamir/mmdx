// The rows of the ER table being edited, as pure functions (5.5): hit test, drop gap, ranges, steps, reorder, delete,
// and the highlights keyed by the new names.
import { describe, expect, it } from 'vitest';
import { deleteRows, gapAt, moveRows, renameHighlights, rowAt, rowRange, stepGap, stepRow, toggleRow, type TableBox } from '../../src/editor/modules/er-table/rows.js';

// a table at (100, 100), 80 × 100: title 0–20 (y 50–70), rows a 70–90, b 90–110, c 110–130, the empty row 130–150
const BOX: TableBox = { x: 100, y: 100, w: 80, h: 100, head: 20, rows: [
  { name: 'a', y: 70, h: 20 }, { name: 'b', y: 90, h: 20 }, { name: 'c', y: 110, h: 20 }, { name: '', y: 130, h: 20, add: true },
] };

describe('ER table rows', () => {
  it('rowAt: a row, the empty row, the title, outside', () => {
    expect(rowAt(BOX, { x: 100, y: 95 })).toEqual({ i: 1, add: false });
    expect(rowAt(BOX, { x: 100, y: 140 })).toEqual({ i: -1, add: true });
    expect(rowAt(BOX, { x: 100, y: 55 })).toBe('title');
    expect(rowAt(BOX, { x: 10, y: 95 })).toBeNull();
    expect(rowAt(null, { x: 100, y: 95 })).toBeNull();
    // a table taller than its rows: below them is the new attribute
    expect(rowAt({ ...BOX, h: 140 }, { x: 100, y: 165 })).toEqual({ i: -1, add: true });
  });

  it('gapAt: before the row whose middle is below y, the count after the last', () => {
    expect(gapAt(BOX, 60)).toBe(0);
    expect(gapAt(BOX, 85)).toBe(1);
    expect(gapAt(BOX, 125)).toBe(3);
    expect(gapAt(BOX, 200)).toBe(3);
  });

  it('ranges, toggles and steps', () => {
    expect(rowRange(3, 1)).toEqual([1, 2, 3]);
    expect(toggleRow([0, 2], 1)).toEqual([0, 1, 2]);
    expect(toggleRow([0, 1, 2], 1)).toEqual([0, 2]);
    expect(stepRow([], 3, 1, false)).toEqual([0]);
    expect(stepRow([], 3, -1, false)).toEqual([2]);
    expect(stepRow([2], 3, 1, false)).toEqual([2]);
    expect(stepRow([1], 3, -1, true)).toEqual([0, 1]);
    expect(stepGap([1, 2], 3, -1)).toBe(0);
    expect(stepGap([0, 1], 3, 1)).toBe(3);
  });

  it('moveRows keeps the moved rows in order and says where they are; nothing moved is null', () => {
    expect(moveRows(['a', 'b', 'c', 'd'], [0, 2], 4)).toEqual({ next: ['b', 'd', 'a', 'c'], sel: [2, 3] });
    expect(moveRows(['a', 'b', 'c', 'd'], [3], 0)).toEqual({ next: ['d', 'a', 'b', 'c'], sel: [0] });
    expect(moveRows(['a', 'b', 'c'], [1], 1)).toBeNull();
  });

  it('deleteRows: a deleted name another row still has stays', () => {
    const rows = [{ name: 'a' }, { name: 'b' }, { name: 'a' }];
    expect(deleteRows(rows, [0])).toEqual({ next: [{ name: 'b' }, { name: 'a' }], names: ['a', 'b', 'a'] });
    expect(deleteRows(rows, [1])).toEqual({ next: [{ name: 'a' }, { name: 'a' }], names: ['a', null, 'a'] });
  });

  it('renameHighlights keys the looks by the new names, drops the gone ones, keeps the title', () => {
    const hl = { __title: { bold: true }, a: { color: 'red' }, b: { italic: true } };
    expect(renameHighlights(hl, [{ name: 'a' }, { name: 'b' }], ['x', null])).toEqual({ __title: { bold: true }, x: { color: 'red' } });
  });
});
