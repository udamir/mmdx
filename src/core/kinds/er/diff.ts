// The ER diff (the view kind's `diff`: items matched by identity, or by aligning positional ones, each change put into one
// facet) and its merged picture (`merge`: the after version plus the removed items, changed text marked word by word).
// Since T11: classes and Mermaid styles are style changes; subgraphs (11.17+) are matched by id, a table or subgraph
// moved into another subgraph is a layout change, and removed items are kept in their old subgraph in the picture.
import type { DiagramMeta } from '../../meta/types.js';
import type { Entity, ErAttribute, ErGroup, ErModel } from '../../model.js';
import { classDefFields, diffById, field, metaFields, changedPresets, styleFields } from '../../diff/kit.js';
import type { FieldChange, ItemChange } from '../../diff/types.js';
import { keepRemoved, relabelChanged, REMOVED } from '../../diff/merge.js';
import { type MergeEnv } from '../../diff/types.js';
import { mergeText } from '../../diff/text.js';
import { deleted, inserted, stripMarks } from '../../text/marks.js';

// ---- diff ---------------------------------------------------------------------------------------------------------

export function diffEr(a: ErModel, b: ErModel, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void {
  field(doc, 'layout', 'direction', a.direction, b.direction);
  const presets = changedPresets(ma, mb, 'entity'), relPresets = changedPresets(ma, mb, 'rel'), groupPresets = changedPresets(ma, mb, 'group');
  classDefFields(doc, a.classDefs, b.classDefs);
  // one spelling for an attribute, added, changed or removed (B34)
  const show = (v: ErAttribute) => `${v.type} ${v.name}${v.keys.length ? ` ${v.keys.join(',')}` : ''}${v.comment ? ` "${v.comment}"` : ''}`;
  const attrFields = (ea: Entity, eb: Entity, f: FieldChange[]) => {
    const A = new Map(ea.attrs.map((x) => [x.name, x])), B = new Map(eb.attrs.map((x) => [x.name, x]));
    for (const [n, x] of B) {
      const y = A.get(n);
      field(f, 'content', `attribute ${n}`, y ? show(y) : undefined, show(x));
    }
    for (const [n, y] of A) if (!B.has(n)) field(f, 'content', `attribute ${n}`, show(y), undefined);
    field(f, 'content', 'attribute order', ea.attrs.map((x) => x.name).filter((n) => B.has(n)), eb.attrs.map((x) => x.name).filter((n) => A.has(n)));
  };
  diffById(items, 'entity', a.entities, b.entities, (e, id) => e.label || id, (ea, eb, f) => {
    field(f, 'content', 'label', ea.label, eb.label);
    attrFields(ea, eb, f);
    field(f, 'layout', 'subgraph', ea.parent, eb.parent);
    styleFields(f, ea, eb, a.classDefs, b.classDefs);
    metaFields(f, ma.entities?.[eb.id], mb.entities?.[eb.id], presets);
  });
  diffById(items, 'group', a.groups, b.groups, (g, id) => g.label || id, (ga, gb, f) => {
    field(f, 'content', 'label', ga.label, gb.label);
    field(f, 'layout', 'parent subgraph', ga.parent, gb.parent);
    field(f, 'layout', 'direction', ga.dir, gb.dir);
    styleFields(f, ga, gb, a.classDefs, b.classDefs);
    metaFields(f, ma.groups?.[gb.id], mb.groups?.[gb.id], groupPresets);
  });
  const relName = (r: ErModel['rels'][number]) => `${r.from} — ${r.to}${r.label ? ` (${r.label})` : ''}`;
  const rels = (m: ErModel) => new Map(m.rels.map((r) => [r.id, r]));
  diffById(items, 'rel', rels(a), rels(b), relName, (ra, rb, f) => {
    field(f, 'content', 'label', ra.label, rb.label);
    field(f, 'content', 'cardinality', `${ra.fromCard} … ${ra.toCard}`, `${rb.fromCard} … ${rb.toCard}`);
    field(f, 'content', 'identifying', ra.identifying, rb.identifying);
    metaFields(f, ma.rels?.[rb.id], mb.rels?.[rb.id], relPresets);
  });
}

// ---- merged picture -----------------------------------------------------------------------------------------

/** The merged ER: the after version plus the removed items, changed text marked word by word. */
export function mergeEr(env: MergeEnv, a: ErModel, b: ErModel): ErModel {
  const { byAfter, removed } = env;
  const entities = new Map(b.entities);
  const groups = new Map<string, ErGroup>();
  for (const [id, g] of b.groups) groups.set(id, { ...g, children: [...g.children] });
  for (const [id, g] of groups) g.label = relabelChanged(byAfter.get(`group:${id}`), a.groups.get(id), g).label;
  // removed subgraphs, in their old parent (its after self when it is kept, else the removed one)
  const gone = removed.filter((x) => x.kind === 'group');
  const goneIds = new Set(gone.map((c) => c.id));
  const groupId = (id: string | null): string | null => (id === null ? null : groups.has(id) ? id : goneIds.has(id) ? id + REMOVED : null);
  for (const c of gone) {
    const g = a.groups.get(c.id)!;
    const kept = keepRemoved(env, c, (id) => ({ ...g, id, parent: null, children: [] }));
    groups.set(kept.id, kept);
  }
  for (const c of gone) {
    const g = groups.get(c.id + REMOVED)!;
    g.parent = groupId(a.groups.get(c.id)!.parent);
    if (g.parent) groups.get(g.parent)!.children.push(g.id);
  }
  for (const [id, e] of entities) {
    const c = byAfter.get(`entity:${id}`);
    const ea = a.entities.get(id);
    if (!ea || c?.status !== 'changed' || !c.facets.includes('content')) continue;
    entities.set(id, { ...e, label: mergeText(ea.label, e.label), attrs: mergeAttrs(ea.attrs, e.attrs) });
  }
  for (const c of removed.filter((x) => x.kind === 'entity')) {
    const e = a.entities.get(c.id)!;
    const parent = groupId(e.parent);
    const kept = keepRemoved(env, c, (id) => ({ ...e, id, attrs: [...e.attrs], lines: new Set<number>(), parent }));
    entities.set(kept.id, kept);
    if (parent) groups.get(parent)!.children.push(kept.id);
  }
  const ent = (id: string) => (entities.has(id) || groups.has(id) ? id : id + REMOVED);
  const aRels = new Map(a.rels.map((r) => [r.id, r]));
  const rels = b.rels.map((r) => {
    const c = byAfter.get(`rel:${r.id}`);
    const ra = aRels.get(r.id);
    return ra ? relabelChanged(c, ra, r) : r;
  });
  for (const c of removed.filter((x) => x.kind === 'rel')) {
    const r = aRels.get(c.id)!;
    rels.push(keepRemoved(env, c, (id) => ({ ...r, id, from: ent(r.from), to: ent(r.to) })));
  }
  const model: ErModel = { ...b, entities, rels, groups, classDefs: { ...a.classDefs, ...b.classDefs } };
  return model;
}

const delAttr = (x: ErAttribute): ErAttribute => ({ ...x, type: deleted(x.type), name: deleted(x.name), comment: deleted(x.comment), keys: x.keys.map(deleted) as ErAttribute['keys'] });
const insAttr = (x: ErAttribute): ErAttribute => ({ ...x, type: inserted(x.type), name: inserted(x.name), comment: inserted(x.comment), keys: x.keys.map(inserted) as ErAttribute['keys'] });

/** The after attributes in order, with removed ones put back after their previous neighbour, and changes marked. */
function mergeAttrs(before: readonly ErAttribute[], after: readonly ErAttribute[]): ErAttribute[] {
  const A = new Map(before.map((x) => [x.name, x]));
  const B = new Set(after.map((x) => x.name));
  const out: ErAttribute[] = after.map((x) => {
    const y = A.get(x.name);
    if (!y) return insAttr(x);
    if (y.type === x.type && y.comment === x.comment && y.keys.join() === x.keys.join()) return x;
    return { ...x, type: mergeText(y.type, x.type), comment: mergeText(y.comment, x.comment), keys: (y.keys.join() === x.keys.join() ? x.keys : [mergeText(y.keys.join(','), x.keys.join(','))]) as ErAttribute['keys'] };
  });
  let prev: string | null = null;
  for (const y of before) {
    if (B.has(y.name)) {
      prev = y.name;
      continue;
    }
    const at = prev === null ? 0 : out.findIndex((x) => stripMarks(x.name) === prev) + 1;
    out.splice(at, 0, delAttr(y));
    prev = y.name;
  }
  return out;
}

