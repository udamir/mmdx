import { describe, expect, it } from 'vitest';
import { polylineCrosses, routeAround, segmentCrosses } from '../../../src/core/layout/route.js';

describe('routing around containers (T07.3)', () => {
  const box = { x: 100, y: 100, w: 200, h: 100 };

  it('tells a segment through a box from one along or past it', () => {
    expect(segmentCrosses({ x: 0, y: 150 }, { x: 400, y: 150 }, box)).toBe(true);
    expect(segmentCrosses({ x: 0, y: 100 }, { x: 400, y: 100 }, box)).toBe(false); // along the border
    expect(segmentCrosses({ x: 0, y: 0 }, { x: 90, y: 400 }, box)).toBe(false);
    expect(segmentCrosses({ x: 150, y: 150 }, { x: 160, y: 160 }, box)).toBe(true); // inside
    expect(polylineCrosses([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 200, y: 150 }], [box])).toBe(true);
  });

  it('needs no route when nothing is in the way', () => {
    expect(routeAround({ x: 0, y: 0 }, { x: 400, y: 0 }, [box])).toBeNull();
  });

  it('goes around a box by its nearer corners, keeping the margin', () => {
    const a = { x: 0, y: 140 }, b = { x: 400, y: 140 };
    const pts = routeAround(a, b, [box], 16)!;
    expect(pts).toEqual([{ x: 84, y: 84 }, { x: 316, y: 84 }]);
    expect(polylineCrosses([a, ...pts, b], [box])).toBe(false);
  });

  it('threads between several boxes, and leaves out a box that holds an end', () => {
    const boxes = [box, { x: 100, y: 230, w: 200, h: 100 }, { x: 420, y: 0, w: 60, h: 400 }];
    const a = { x: 0, y: 215 }, b = { x: 600, y: 215 };
    const pts = routeAround(a, b, boxes, 10)!;
    expect(polylineCrosses([a, ...pts, b], boxes)).toBe(false);
    // the gap between the first two boxes is 30 wide: the way goes through it, then around the tall one
    expect(pts[0]!.y).toBeGreaterThan(200);
    expect(routeAround({ x: 150, y: 150 }, { x: 600, y: 150 }, [box])).toBeNull();
  });

  it('is deterministic', () => {
    const boxes = [box, { x: 350, y: 60, w: 50, h: 300 }];
    expect(routeAround({ x: 0, y: 150 }, { x: 600, y: 150 }, boxes)).toEqual(routeAround({ x: 0, y: 150 }, { x: 600, y: 150 }, boxes));
  });
});
