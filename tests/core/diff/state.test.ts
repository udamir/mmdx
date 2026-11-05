// The state diagram diff (T09.7): states, composites and transitions matched as in the flowchart (ids, renames by title
// and kind, transitions by their ends then in order), notes by their state and side then in order; a state moved into
// another composite is a layout change, its title, description rows and kind content; the merged picture keeps removed
// items inside their old composite.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffDiagrams } from '../../../src/core/diff/all.js';
import { diffModels, mergeDiagrams, stripMarks } from '../../../src/core/diff/index.js';
import { renderDiffWith } from '../../../src/core/diff/render.js';
import { createContext } from '../../../src/core/context.js';
import { ALL_VIEW_KINDS } from '../../../src/core/kinds/all.js';
import { DIFF } from '../../../src/core/kinds/state-diff.js';
import { splitSource } from '../../../src/core/meta/index.js';
import type { StateModel } from '../../../src/core/model.js';
import { parse } from '../../../src/core/parse/index.js';

const A = `stateDiagram-v2
  state "Shopping cart" as Cart
  Cart : items
  state c <<choice>>
  [*] --> Cart
  Cart --> Paid : pay
  Paid --> c
  c --> Shipped : ok
  c --> Cancelled : refused
  state Box {
    [*] --> Inner
    Inner --> Extra
    Extra --> [*]
  }
  Shipped --> Box
  note right of Cart : first
  note right of Cart : second
  note left of Paid : paid note
`;

type Diff = ReturnType<typeof diffDiagrams>;
const item = (d: Diff, kind: string, id: string) => d.items.find((i) => i.kind === kind && i.id === id);
const changed = (d: Diff) => d.items.filter((i) => i.status !== 'unchanged');

function merged(before: string, after: string) {
  const [a, b] = [before, after].map((s) => splitSource(s).doc);
  const ma = parse(a!.code) as StateModel, mb = parse(b!.code) as StateModel;
  return mergeDiagrams(diffModels(ma, mb, a!.meta, b!.meta), ma, mb, a!.meta, b!.meta)!;
}

describe('state diff', () => {
  it('identical sources: nothing changed', () => {
    const d = diffDiagrams(A, A);
    expect(d.type).toBe('state');
    expect(changed(d)).toEqual([]);
    expect(d.doc).toEqual([]);
  });

  it('added, removed and changed states; a description row and a kind change are content', () => {
    const B = A.replace('Cart : items', 'Cart : items and totals')
      .replace('state c <<choice>>', 'state c <<fork>>')
      .replace('  c --> Cancelled : refused\n', '  c --> Archived\n');
    const d = diffDiagrams(A, B);
    expect(item(d, 'node', 'Cart')).toMatchObject({ status: 'changed', facets: ['content'], fields: [{ field: 'descriptions', before: 'items', after: 'items and totals' }] });
    expect(item(d, 'node', 'c')).toMatchObject({ status: 'changed', facets: ['content'], fields: [{ field: 'kind', before: 'choice', after: 'fork' }] });
    expect(item(d, 'node', 'Archived')?.status).toBe('added');
    expect(item(d, 'node', 'Cancelled')?.status).toBe('removed');
    expect(item(d, 'edge', 'c->Archived')?.status).toBe('added');
    expect(item(d, 'edge', 'c->Cancelled')?.status).toBe('removed');
    expect(item(d, 'node', 'Paid')?.status).toBe('unchanged');
    // pseudo-states are matched by id
    expect(item(d, 'node', '[*]start')?.status).toBe('unchanged');
    expect(item(d, 'node', 'Box/[*]start')?.status).toBe('unchanged');
  });

  it('a state moved into another composite is layout; a composite title, direction and regions', () => {
    const B = A.replace('  Shipped --> Box\n', '  Shipped --> Box\n  state Box {\n    Paid\n  }\n')
      .replace('  state Box {\n    [*]', '  state "Packing box" as Box {\n    direction LR\n    [*]')
      .replace('    Extra --> [*]\n', '    Extra --> [*]\n    --\n    [*] --> Label\n');
    const d = diffDiagrams(A, B);
    expect(item(d, 'node', 'Paid')).toMatchObject({ status: 'changed', facets: ['layout'], fields: [{ facet: 'layout', field: 'composite', before: null, after: 'Box (region 1)' }] });
    const box = item(d, 'group', 'Box')!;
    expect(box.facets).toEqual(['content', 'layout']);
    expect(box.fields.map((f) => [f.facet, f.field, f.before, f.after])).toEqual([
      ['content', 'label', 'Box', 'Packing box'],
      ['layout', 'direction', undefined, 'LR'],
      ['layout', 'regions', 1, 2],
    ]);
    expect(item(d, 'node', 'Label')?.status).toBe('added');
  });

  it('transitions are matched by their ends, then in order; a label change is content', () => {
    const B = A.replace('Cart --> Paid : pay', 'Cart --> Paid : pay now\n  Cart --> Paid : retry');
    const d = diffDiagrams(A, B);
    expect(item(d, 'edge', 'Cart->Paid')).toMatchObject({ status: 'changed', facets: ['content'], fields: [{ field: 'label', before: 'pay', after: 'pay now' }] });
    expect(item(d, 'edge', 'Cart->Paid#2')?.status).toBe('added');
    expect(changed(d)).toHaveLength(2);
  });

  it('notes are matched by (state, side), then in order: an inserted note and an edited one', () => {
    const B = A.replace('  note right of Cart : first\n', '  note right of Cart : zero\n  note right of Cart : first\n').replace(': second', ': second edited');
    const d = diffDiagrams(A, B);
    const notes = d.items.filter((i) => i.kind === 'note');
    expect(notes.map((n) => [n.id, n.beforeId, n.status])).toEqual([
      ['n2', 'n1', 'unchanged'],
      ['n3', 'n2', 'changed'],
      ['n4', 'n3', 'unchanged'],
      ['n1', undefined, 'added'],
    ]);
    expect(item(d, 'note', 'n3')).toMatchObject({ facets: ['content'], fields: [{ field: 'text', before: 'second', after: 'second edited' }] });
    // a note that only moved to the other side
    const side = diffDiagrams(A, A.replace('note left of Paid', 'note right of Paid'));
    expect(changed(side)).toEqual([expect.objectContaining({ kind: 'note', id: 'n3', facets: ['layout'], fields: [{ facet: 'layout', field: 'side', before: 'left', after: 'right' }] })]);
  });

  it('a renamed state (same title and kind) is one change; its transitions and notes follow it', () => {
    const B = A.replace(/\bCart\b/g, 'Basket');
    const d = diffDiagrams(A, B);
    expect(changed(d)).toEqual([expect.objectContaining({ kind: 'node', id: 'Basket', beforeId: 'Cart', facets: ['content'], fields: [{ facet: 'content', field: 'id', before: 'Cart', after: 'Basket' }] })]);
    expect(item(d, 'edge', 'Basket->Paid')).toMatchObject({ status: 'unchanged', beforeId: 'Cart->Paid' });
    expect(item(d, 'note', 'n1')?.status).toBe('unchanged');
  });

  it('doc fields, classes and metadata looks', () => {
    const B = `---\ntitle: Orders\n---\n${A.replace('stateDiagram-v2\n', 'stateDiagram-v2\n  direction LR\n')}  classDef bad fill:#f00\n  class Cancelled bad\n%%@ node Paid {"x":10,"y":20}\n%%@ group Box {"fill":"#eee"}\n`;
    const d = diffDiagrams(A, B);
    expect(d.doc.map((f) => [f.facet, f.field])).toEqual([['layout', 'direction'], ['content', 'title'], ['style', 'classDef bad']]);
    expect(item(d, 'node', 'Cancelled')).toMatchObject({ facets: ['style'] });
    expect(item(d, 'node', 'Paid')).toMatchObject({ facets: ['layout'], fields: [{ field: 'position' }] });
    expect(item(d, 'group', 'Box')).toMatchObject({ facets: ['style'] });
  });

  it('the merged model keeps a removed state inside its old composite, a removed composite with its contents, and marks changed text', () => {
    const B = A.replace('    Inner --> Extra\n    Extra --> [*]\n', '    Inner --> [*]\n')
      .replace('Cart --> Paid : pay', 'Cart --> Paid : pay now')
      .replace('  note right of Cart : second\n', '');
    const m = merged(A, B);
    const model = m.model as StateModel;
    expect(model.nodes.get('Extra~del')).toMatchObject({ parent: 'Box' });
    expect(model.groups.get('Box')!.children).toContain('Extra~del');
    expect(model.edges.find((e) => e.id === 'Inner->Extra~del')).toMatchObject({ from: 'Inner', to: 'Extra~del', scope: 'Box' });
    expect(new Set(model.edges.map((e) => e.index)).size).toBe(model.edges.length);
    expect(stripMarks(model.edges.find((e) => e.id === 'Cart->Paid')!.label)).toBe('pay now');
    expect(model.notes.find((n) => n.id === 'n2~del')).toMatchObject({ target: 'Cart', text: 'second' });
    expect(m.status.get('node:Extra~del')?.status).toBe('removed');
    expect(m.status.get('note:n2~del')?.status).toBe('removed');

    // a removed composite: its states inside it, both kept in the picture
    const C = A.replace(/  state Box \{\n[\s\S]*?\n  \}\n/, '').replace('  Shipped --> Box\n', '');
    const mc = merged(A, C).model as StateModel;
    expect(mc.groups.get('Box~del')).toMatchObject({ parent: null });
    expect(mc.nodes.get('Inner~del')).toMatchObject({ parent: 'Box~del' });
    expect(mc.nodes.get('Box/[*]start~del')).toMatchObject({ parent: 'Box~del' });
    expect(mc.groups.get('Box~del')!.children).toEqual(expect.arrayContaining(['Inner~del', 'Extra~del']));
    expect(mc.edges.find((e) => e.id === 'Shipped->Box~del')).toMatchObject({ from: 'Shipped', to: 'Box~del' });

    // and it draws, the removed state inside its composite's frame
    const r = renderDiffWith(ALL_VIEW_KINDS, A, B, createContext());
    expect(r.merged?.result.geom.type).toBe('state');
    const geom = r.merged!.result.geom;
    if (geom.type !== 'state') throw new Error('not a state diagram');
    const extra = geom.nodes.get('Extra~del')!, box = geom.groups.get('Box')!;
    expect(Math.abs(extra.x - box.x)).toBeLessThan(box.w / 2);
    expect(Math.abs(extra.y - box.y)).toBeLessThan(box.h / 2);
    expect(renderDiffWith(ALL_VIEW_KINDS, A, C, createContext()).merged?.result.geom.type).toBe('state');
  });

  it('diff lines and highlight shapes', () => {
    const model = parse(A) as StateModel;
    expect([...DIFF.diffLines(model, { kind: 'group', id: 'Box' })].sort((x, y) => x - y)).toEqual([9, 10, 11, 12, 13, 14]);
    expect([...DIFF.diffLines(model, { kind: 'edge', id: 'Cart->Paid' })]).toEqual([5]);
    expect([...DIFF.diffLines(model, { kind: 'note', id: 'n2' })]).toEqual([16]);
    expect([...DIFF.diffLines(model, { kind: 'node', id: 'Cart' })]).toEqual(expect.arrayContaining([1, 2, 4, 5]));
    expect(DIFF.positionalIds).toBeUndefined();
    const geom = renderDiffWith(ALL_VIEW_KINDS, A, A, createContext()).after.result.geom;
    if (geom.type !== 'state') throw new Error('not a state diagram');
    expect(DIFF.shape(geom, { kind: 'node', id: 'Cart' })?.t).toBe('rect');
    expect(DIFF.shape(geom, { kind: 'group', id: 'Box' })?.t).toBe('rect');
    expect(DIFF.shape(geom, { kind: 'note', id: 'n1' })?.t).toBe('rect');
    expect(DIFF.shape(geom, { kind: 'edge', id: 'Cart->Paid' })).toMatchObject({ t: 'path', label: expect.any(Object) });
  });

  it('the order lifecycle example against an edited copy', () => {
    const src = readFileSync(join(__dirname, '../../../examples/order-lifecycle.mmdx'), 'utf8');
    const edited = src
      .replace('  Cart : editable by the customer\n', '')
      .replace('    Backordered --> Reserved : restocked\n', '')
      .replace('  state Validation {\n', '  state Validation {\n    Fraud --> Reserved\n')
      .replace('Fulfilment --> Shipped : handed over', 'Fulfilment --> Shipped : handed to courier')
      .replace('  note right of Cart : prices are locked at checkout\n', '')
      .replace('%%@ node Payment {"preset":"active"}\n', '%%@ node Payment {"preset":"done"}\n');
    const d = diffDiagrams(src, edited);
    expect(item(d, 'node', 'Cart')).toMatchObject({ facets: ['content'], fields: [{ field: 'descriptions' }] });
    expect(item(d, 'node', 'Fraud')?.status).toBe('added');
    expect(item(d, 'edge', 'Backordered->Reserved')?.status).toBe('removed');
    expect(item(d, 'edge', 'Fulfilment->Shipped')).toMatchObject({ facets: ['content'] });
    // note ids are positions: the removed note keeps its before id, the kept one its after id
    const notes = d.items.filter((i) => i.kind === 'note');
    expect(notes.map((n) => [n.id, n.beforeId, n.status, n.label])).toEqual([
      ['n1', 'n2', 'unchanged', 'Note: tracking number sent by e-mail'],
      ['n1', undefined, 'removed', 'Note: prices are locked at checkout'],
    ]);
    expect(item(d, 'node', 'Payment')).toMatchObject({ facets: ['style'] });
    expect(item(d, 'group', 'Fulfilment')?.status).toBe('unchanged');
    const r = renderDiffWith(ALL_VIEW_KINDS, src, edited, createContext());
    expect(r.merged?.result.geom.type).toBe('state');
    expect(r.merged!.status.get('edge:Backordered->Reserved~del')?.status).toBe('removed');
    expect(r.merged!.status.get('note:n1~del')?.status).toBe('removed');
  });
});
