// The kind-diff kit (X4, task 4.6): the bodies the per-kind diffs and merges shared by copying.
import { describe, expect, it } from 'vitest';
import { classDefFields, diffAligned, diffById, field, styleFields } from '../../../src/core/diff/kit.js';
import { keepRemoved, relabelChanged, REMOVED } from '../../../src/core/diff/merge.js';
import type { FieldChange, ItemChange, MergeEnv } from '../../../src/core/diff/types.js';
import { emptyMeta } from '../../../src/core/meta/types.js';

interface T { id: string; label: string }
const map = (...xs: T[]): Map<string, T> => new Map(xs.map((x) => [x.id, x]));
const labelField = (a: T, b: T, f: FieldChange[]): void => field(f, 'content', 'label', a.label, b.label);

describe('kind-diff kit', () => {
  it('diffById: after items added or compared, then the gone ones removed; renames keep the before id', () => {
    const out: ItemChange[] = [];
    diffById(out, 'node', map({ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'old', label: 'O' }), map({ id: 'a', label: 'A2' }, { id: 'c', label: 'C' }, { id: 'new', label: 'O' }), (x) => x.label, labelField, new Map([['old', 'new']]));
    expect(out.map((c) => [c.id, c.status, c.beforeId])).toEqual([['a', 'changed', undefined], ['c', 'added', undefined], ['new', 'unchanged', 'old'], ['b', 'removed', undefined]]);
  });

  it('diffAligned pairs positional items by their keys, the rest added or removed', () => {
    const out: ItemChange[] = [];
    const A = [{ id: 'e0', label: 'x' }, { id: 'e1', label: 'y' }], B = [{ id: 'e0', label: 'y' }, { id: 'e1', label: 'z' }];
    diffAligned(out, 'edge', A, B, (e) => e.label, () => '', (e, side) => `${side}:${e.label}`, labelField);
    expect(out.map((c) => [c.id, c.status, c.label])).toEqual([['e0', 'unchanged', 'b:y'], ['e1', 'added', 'b:z'], ['e0', 'removed', 'a:x']]);
  });

  it('classDefFields and styleFields: classes as written, the Mermaid style through the classes', () => {
    const doc: FieldChange[] = [];
    classDefFields(doc, { hot: { fill: 'red' } }, { hot: { fill: 'blue' }, cold: { fill: 'cyan' } });
    expect(doc.map((f) => f.field)).toEqual(['classDef hot', 'classDef cold']);
    const f: FieldChange[] = [];
    styleFields(f, { classes: ['hot'] }, { classes: ['hot', 'big'] }, { hot: { fill: 'red' } }, { hot: { fill: 'blue' } });
    expect(f).toEqual([
      { facet: 'style', field: 'classes', before: 'hot', after: 'hot big' },
      { facet: 'style', field: 'Mermaid style', before: { fill: 'red' }, after: { fill: 'blue' } },
    ]);
    const none: FieldChange[] = [];
    styleFields(none, {}, { classes: [] }, {}, {});
    expect(none).toEqual([]);
  });

  it('keepRemoved gives the merged id, carries the metadata and marks the change; relabelChanged marks a changed label', () => {
    const marks: [string, string][] = [];
    const before = { ...emptyMeta(), nodes: { a: { fill: '#f00' } } };
    const env = { meta: { ...emptyMeta(), nodes: {} }, before, mark: (c: ItemChange, id: string) => marks.push([c.id, id]) } as unknown as MergeEnv;
    const c: ItemChange = { kind: 'node', id: 'a', label: 'A', status: 'removed', facets: [], fields: [] };
    const kept = keepRemoved(env, c, (id) => ({ id, label: 'A' }));
    expect(kept.id).toBe(`a${REMOVED}`);
    expect(env.meta.nodes?.[`a${REMOVED}`]).toEqual({ fill: '#f00' });
    expect(marks).toEqual([['a', `a${REMOVED}`]]);
    const changed: ItemChange = { kind: 'node', id: 'a', label: 'A', status: 'changed', facets: ['content'], fields: [{ facet: 'content', field: 'label', before: 'old', after: 'new' }] };
    expect(relabelChanged(changed, { label: 'old' }, { id: 'a', label: 'new' }).label).not.toBe('new');
    const same = { id: 'a', label: 'new' };
    expect(relabelChanged(undefined, { label: 'old' }, same)).toBe(same);
  });
});
