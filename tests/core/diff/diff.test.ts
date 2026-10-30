import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diffDiagrams, ignoreFacets, withLayoutOf, withoutStyle } from '../../../src/core/diff/index.js';
import { splitSource } from '../../../src/core/meta/index.js';

const sample = (name: string) => [0, 1].map((i) => readFileSync(`apps/studio-site/diff-samples/${name}.${i ? 'after' : 'before'}.mmd`, 'utf8')) as [string, string];
const find = (d: ReturnType<typeof diffDiagrams>, kind: string, id: string) => d.items.find((i) => i.kind === kind && i.id === id);

describe('diffDiagrams', () => {
  it('reports nothing for identical sources', () => {
    const [a] = sample('architecture');
    const d = diffDiagrams(a, a);
    expect(d.items.every((i) => i.status === 'unchanged')).toBe(true);
    expect(d.doc).toEqual([]);
  });

  it('classifies flowchart changes into content, layout and style', () => {
    const d = diffDiagrams(...sample('architecture'));
    expect(find(d, 'node', 'tracing')?.status).toBe('added');
    expect(find(d, 'node', 'desktop')?.status).toBe('removed');
    expect(find(d, 'node', 'lb')?.fields).toEqual([{ facet: 'content', field: 'label', before: 'Load Balancer', after: 'Load Balancer (L7)' }]);
    expect(find(d, 'node', 'cache')?.facets).toEqual(['layout']);
    expect(find(d, 'node', 'auth')?.facets).toEqual(['style']);
    expect(find(d, 'node', 'msg')?.facets).toEqual(['style']);
    expect(find(d, 'edge', 'lb->cache')?.facets).toEqual(['style']);
    expect(find(d, 'edge', 'db1->db3')?.fields.map((f) => f.field)).toEqual(['line']);
    expect(find(d, 'edge', 'svc->tracing')?.status).toBe('added');
    expect(find(d, 'edge', 'desktop->gw')?.status).toBe('removed');
  });

  it('follows a renamed node and its edges', () => {
    const d = diffDiagrams(...sample('architecture'));
    const n = find(d, 'node', 'queueUi');
    expect(n).toMatchObject({ status: 'changed', beforeId: 'queue', facets: ['content'] });
    expect(find(d, 'node', 'queue')).toBeUndefined();
    expect(find(d, 'edge', 'queueUi->msg')).toMatchObject({ status: 'unchanged', beforeId: 'queue->msg' });
  });

  it('ignores style: a restyle-only change shrinks to the one real edit', () => {
    const d = diffDiagrams(...sample('restyle'));
    expect(d.counts.style).toBeGreaterThan(5);
    const f = ignoreFacets(d, { style: true });
    expect(f.items.filter((i) => i.status !== 'unchanged').map((i) => i.id)).toEqual(['git']);
    expect(f.doc).toEqual([]);
  });

  it('aligns sequence messages by content, not position', () => {
    const d = diffDiagrams(...sample('sequence'));
    const changed = d.items.filter((i) => i.kind === 'message' && i.status !== 'unchanged');
    expect(changed.map((i) => [i.status, i.label])).toEqual([
      ['changed', 'rdc → docker: GET /networks/{name}'],
      ['added', 'init → repo: Load previous deployment state'],
      ['removed', 'vol → vol: Parsing volume from description file'],
    ]);
    // shifted messages keep their own metadata (m8 had dy -13 and is m9 now)
    expect(d.items.find((i) => i.beforeId === 'm8')).toMatchObject({ id: 'm9', status: 'unchanged' });
  });

  it('diffs ER attributes', () => {
    const d = diffDiagrams(...sample('schema'));
    const u = find(d, 'entity', 'user')!;
    expect(u.fields.filter((f) => f.facet === 'content').map((f) => f.field)).toEqual(['attribute password_hash', 'attribute last_login_at', 'attribute sha1_password', 'attribute salt']);
    expect(u.facets).toEqual(['content', 'style']);
    expect(find(d, 'entity', 'acl_permission')?.facets).toEqual(['layout']);
  });
});

describe('diff transforms', () => {
  it('withoutStyle drops classes, styles and presets but keeps positions', () => {
    const [, b] = sample('architecture');
    const s = withoutStyle(b);
    expect(s).not.toMatch(/:::|"preset"|"fill"|classDef/);
    expect(splitSource(s).doc.meta.nodes?.['cache']).toEqual({ x: 1110, y: 1110, w: 200, h: 90 });
    expect(diffDiagrams(withoutStyle(sample('restyle')[0]), withoutStyle(sample('restyle')[1])).items.filter((i) => i.status !== 'unchanged').map((i) => i.id)).toEqual(['git']);
  });

  it('withLayoutOf moves the before version onto the after layout', () => {
    const [a, b] = sample('architecture');
    const d = diffDiagrams(withLayoutOf(a, b), b);
    expect(find(d, 'node', 'cache')?.status).toBe('unchanged');
    expect(find(d, 'node', 'lb')?.facets).toEqual(['content']);
  });
});
