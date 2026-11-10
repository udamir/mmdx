// The metadata key registry (meta/keys.ts, B7): every list of metadata keys comes from one fail-closed table, so
// "Reset style", "Style off", Auto layout and the diff agree on what a key is, and keys the table does not know are
// never thrown away.
import { describe, expect, it } from 'vitest';
import { metaFacet } from '../../../src/core/diff/kit.js';
import { withoutStyle } from '../../../src/core/diff/transform.js';
import { CLEANERS, classOf, COPY_KEYS, META_KEYS } from '../../../src/core/meta/keys.js';
import { joinSource, splitSource } from '../../../src/core/meta/index.js';
import { emptyMeta, type DiagramMeta } from '../../../src/core/meta/types.js';
import { resetItemStyle, resetLayout } from '../../../src/core/ops/meta-ops.js';

const meta = (m: Partial<DiagramMeta>): DiagramMeta => ({ ...emptyMeta(), ...m });

describe('META_KEYS', () => {
  it('every key has a class and a cleaner; unknown keys are "unknown", never look', () => {
    for (const k of Object.keys(META_KEYS)) {
      expect(['layout', 'content', 'look', 'state']).toContain(classOf(k));
      expect(typeof CLEANERS[k]).toBe('function');
    }
    expect(classOf('futureKey')).toBe('unknown');
    expect(classOf('__proto__')).toBe('unknown');
  });

  it('page keys take their page class', () => {
    expect(classOf('pad')).toBe('look');
    expect(classOf('pad', 'canvas')).toBe('layout');
  });

  it('Copy style keeps its keys and their order', () => {
    expect(COPY_KEYS.slice(0, 4)).toEqual(['preset', 'fill', 'stroke', 'strokeWidth']);
    expect(COPY_KEYS).toHaveLength(38);
    expect(COPY_KEYS.every((k) => classOf(k) === 'look')).toBe(true);
  });
});

describe('B7: one classification everywhere', () => {
  it('Reset style keeps the picture, its frame, the layer, waypoints and unknown keys', () => {
    const m = meta({ nodes: { A: { img: 'a.png', w: 80, h: 60, pos: 'b', constraint: 'on', fill: '#f00', layer: 'L1', futureKey: 1 } as never } });
    expect(resetItemStyle(m, { kind: 'node', id: 'A' }).meta.nodes!['A']).toEqual({ img: 'a.png', w: 80, h: 60, pos: 'b', constraint: 'on', layer: 'L1', futureKey: 1 });
  });

  it('Style off keeps pictures, nudges, folds and unknown keys of a mindmap node', () => {
    const src = joinSource({ code: 'mindmap\n  root\n    A', meta: meta({ nodes: { A: { img: 'a.png', dx: 4, collapsed: true, fill: '#f00', futureKey: 1 } as never } }) });
    const out = splitSource(withoutStyle(src)).doc.meta.nodes!['A'];
    expect(out).toEqual({ img: 'a.png', dx: 4, collapsed: true, futureKey: 1 });
  });

  it('a metadata icon or picture change is content; an unknown key is content; a lock is no change', () => {
    expect(metaFacet('icon')).toBe('content');
    expect(metaFacet('img')).toBe('content');
    expect(metaFacet('futureKey')).toBe('content');
    expect(metaFacet('locked')).toBeNull();
    expect(metaFacet('collapsed')).toBe('layout');
    expect(metaFacet('fill')).toBe('style');
  });

  it('Auto layout forgets a mindmap branch\'s nudges and side, keeps its look and picture', () => {
    const m = meta({ nodes: { A: { dx: 4, dy: 2, side: 'l', fill: '#f00', img: 'a.png' } as never } });
    expect(resetLayout(m).meta.nodes!['A']).toEqual({ fill: '#f00', img: 'a.png' });
  });
});
