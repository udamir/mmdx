// Smart guides' engine (task 005): where a moved or resized box snaps (edges and centres, equal spacing between and
// continuing, parent margins opposite and corner, the tolerance, the tie order) and what holds for the drawn box.
import { describe, expect, it } from 'vitest';
import { guidesFor, snapBox, type Guide, type GuideInput, type Rect } from '../../src/editor/lib/align-guides.js';

const r = (x: number, y: number, w: number, h: number): Rect => ({ x0: x, y0: y, x1: x + w, y1: y + h });
const MOVE: GuideInput['anchors'] = { x: ['lo', 'mid', 'hi'], y: ['lo', 'mid', 'hi'] };
const RESIZE: GuideInput['anchors'] = { x: ['hi'], y: ['hi'] };
const input = (box: Rect, others: Rect[], o: Partial<GuideInput> = {}): GuideInput => ({ box, others, parent: null, anchors: MOVE, tol: 6, ...o });
const ofType = <T extends Guide['type']>(gs: Guide[], t: T): Extract<Guide, { type: T }>[] => gs.filter((g): g is Extract<Guide, { type: T }> => g.type === t);

describe('snapBox: alignment', () => {
  const A = r(0, 0, 100, 50);

  it('an edge snaps to the nearest edge of another box', () => {
    expect(snapBox(input(r(3, 200, 80, 40), [A]))).toEqual({ dx: -3, dy: null });
    expect(snapBox(input(r(200, 47, 80, 30), [A])).dy).toBe(3); // top to A's bottom
  });

  it('a centre snaps to another centre', () => {
    expect(snapBox(input(r(12, 200, 80, 40), [A])).dx).toBe(-2);
  });

  it('within 6 screen px: the tolerance is in diagram units at the zoom', () => {
    expect(snapBox(input(r(5.9, 300, 30, 30), [A])).dx).toBeCloseTo(-5.9);
    expect(snapBox(input(r(6.1, 300, 30, 30), [A])).dx).toBeNull();
    // zoom 2: 6 px are 3 units
    expect(snapBox(input(r(2.95, 300, 30, 30), [A], { tol: 3 })).dx).toBeCloseTo(-2.95);
    expect(snapBox(input(r(3.05, 300, 30, 30), [A], { tol: 3 })).dx).toBeNull();
  });

  it('nothing near: no snap on either axis', () => {
    expect(snapBox(input(r(500, 500, 30, 30), [A]))).toEqual({ dx: null, dy: null });
    expect(snapBox(input(r(0, 0, 30, 30), []))).toEqual({ dx: null, dy: null });
  });
});

describe('snapBox: equal spacing', () => {
  const L = r(0, 0, 100, 50), R = r(300, 0, 100, 50);

  it('between the two row neighbours: equal gaps on both sides', () => {
    expect(snapBox(input(r(162, 0, 80, 50), [L, R])).dx).toBe(-2);
  });

  it('continuing the gap of a neighbour pair, on either side', () => {
    const LL = r(0, 0, 100, 50), L2 = r(150, 0, 100, 50);
    expect(snapBox(input(r(298, 0, 60, 50), [LL, L2])).dx).toBe(2);
    const R2 = r(300, 0, 100, 50), RR = r(450, 0, 100, 50);
    expect(snapBox(input(r(192, 0, 60, 50), [R2, RR])).dx).toBe(-2);
  });

  it('only boxes in the row count (overlapping across the axis)', () => {
    expect(snapBox(input(r(162, 100, 80, 40), [L, R])).dx).toBeNull();
  });

  it('a resize does not snap to equal spacing', () => {
    expect(snapBox(input(r(160, 0, 78, 50), [L, R])).dx).toBe(1);
    expect(snapBox(input(r(160, 0, 78, 50), [L, R], { anchors: RESIZE })).dx).toBeNull();
  });
});

describe('snapBox: parent margins', () => {
  const P = r(0, 0, 400, 300);

  it('centred in the parent (left = right)', () => {
    expect(snapBox(input(r(152, 40, 100, 50), [], { parent: P }))).toEqual({ dx: -2, dy: null });
  });

  it('the same inset from a corner: y snaps first, x then holds against the final y', () => {
    // left 48, bottom 50: the bottom goes to 48 (y first), and x is then already in line (0, the grid stays off)
    expect(snapBox(input(r(48, 100, 100, 150), [], { parent: P }))).toEqual({ dx: 0, dy: 2 });
  });

  it('a margin of 0 or less never counts', () => {
    expect(snapBox(input(r(-3, -1, 50, 50), [], { parent: P }))).toEqual({ dx: null, dy: null });
  });

  it('a resize moves the right / bottom edge to the equal margin', () => {
    expect(snapBox(input(r(50, 50, 297, 100), [], { parent: P, anchors: RESIZE }))).toEqual({ dx: 3, dy: null });
  });
});

describe('snapBox: ties and resize anchors', () => {
  const L = r(0, 0, 100, 50), R = r(300, 0, 100, 50);

  it('at the same distance alignment wins over spacing, spacing over parent margins', () => {
    // spacing wants −3, an edge in line +3
    expect(snapBox(input(r(163, 0, 80, 50), [L, R, r(166, 500, 50, 50)])).dx).toBe(3);
    // spacing wants −3, centring in the parent +3
    expect(snapBox(input(r(163, 0, 80, 50), [L, R], { parent: r(-100, -100, 612, 400) })).dx).toBe(-3);
  });

  it('a resize snaps only its right and bottom edges', () => {
    const O = r(0, 0, 100, 50);
    expect(snapBox(input(r(0, 200, 97, 40), [O], { anchors: RESIZE }))).toEqual({ dx: 3, dy: null });
    // its left edge (2 from O's) and centre (3 from O's) are not snapping lines: the left edge stays where it is
    expect(snapBox(input(r(2, 200, 90, 40), [O], { anchors: RESIZE })).dx).toBeNull();
  });
});

describe('guidesFor', () => {
  it('a line runs across the box and the nearest match on each side only', () => {
    const A = r(0, 0, 100, 50), C = r(0, 300, 60, 40), D = r(0, -200, 50, 50);
    const lines = ofType(guidesFor(input(r(0, 100, 80, 40), [A, C, D])), 'line');
    expect(lines).toEqual([{ type: 'line', axis: 'x', at: 0, from: 0, to: 340 }]);
  });

  it('a line within one unit still holds (positions are rounded); two units off do not', () => {
    const A = r(0, 0, 100, 50);
    expect(ofType(guidesFor(input(r(1, 100, 80, 40), [A])), 'line')).toHaveLength(1);
    expect(ofType(guidesFor(input(r(2, 100, 80, 40), [A])), 'line')).toHaveLength(0);
  });

  it('equal gaps: one segment per gap, in the middle of the overlap', () => {
    const L = r(0, 0, 100, 50), R = r(300, 10, 100, 60);
    expect(ofType(guidesFor(input(r(160, 0, 80, 50), [L, R])), 'gap')).toEqual([
      { type: 'gap', axis: 'x', segs: [{ a: 100, b: 160, cross: 25 }, { a: 240, b: 300, cross: 30 }] },
    ]);
    const LL = r(0, 0, 100, 50), L2 = r(150, 0, 100, 50);
    expect(ofType(guidesFor(input(r(300, 0, 60, 50), [LL, L2])), 'gap')).toEqual([
      { type: 'gap', axis: 'x', segs: [{ a: 100, b: 150, cross: 25 }, { a: 250, b: 300, cross: 25 }] },
    ]);
    // a resize shows no spacing
    expect(ofType(guidesFor(input(r(160, 0, 80, 50), [L, R], { anchors: RESIZE })), 'gap')).toEqual([]);
  });

  it('equal margins: opposite and corner pairs, each margin from the box to the frame', () => {
    const P = r(0, 0, 400, 300);
    expect(ofType(guidesFor(input(r(150, 40, 100, 50), [], { parent: P })), 'margin')).toEqual([
      { type: 'margin', segs: [{ axis: 'x', a: 0, b: 150, cross: 65 }, { axis: 'x', a: 250, b: 400, cross: 65 }] },
    ]);
    const corner = ofType(guidesFor(input(r(40, 40, 100, 50), [], { parent: P })), 'margin')[0]!;
    expect(corner.segs).toEqual([{ axis: 'x', a: 0, b: 40, cross: 65 }, { axis: 'y', a: 0, b: 40, cross: 90 }]);
    // touching or crossing the frame: none
    expect(ofType(guidesFor(input(r(-10, -10, 100, 50), [], { parent: P })), 'margin')).toEqual([]);
    // a resize: only pairs with its right or bottom margin (left = top is not its doing)
    expect(ofType(guidesFor(input(r(40, 40, 100, 50), [], { parent: P, anchors: RESIZE })), 'margin')).toEqual([]);
  });
});
