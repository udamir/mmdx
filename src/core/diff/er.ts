// The ER diff (the view kind's `diff`: items matched by identity, or by aligning positional ones, each change put into one
// facet) and its merged picture (`merge`: the after version plus the removed items, changed text marked word by word).
// Since T11: classes and Mermaid styles are style changes; subgraphs (11.17+) are matched by id, a table or subgraph
// moved into another subgraph is a layout change, and removed items are kept in their old subgraph in the picture.
import type { DiagramMeta } from '../meta/types.js';
import type { Entity, ErAttribute, ErGroup, ErModel } from '../model.js';
import { field, metaFields, finish, added, removed, changedPresets, mermaidStyleOf } from './kit.js';
import type { FieldChange, ItemChange } from './types.js';
import { carryMeta, changedField, REMOVED, type MergeEnv } from './merge.js';
import { mergeText } from './text.js';
import { deleted, inserted, stripMarks } from '../text/marks.js';

// ---- diff ---------------------------------------------------------------------------------------------------------

export function diffEr(a: ErModel, b: ErModel, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void {
  field(doc, 'layout', 'direction', a.direction, b.direction);
  const presets = changedPresets(ma, mb, 'entity'), relPresets = changedPresets(ma, mb, 'rel'), groupPresets = changedPresets(ma, mb, 'group');
  for (const c of new Set([...Object.keys(a.classDefs), ...Object.keys(b.classDefs)])) field(doc, 'style', `classDef ${c}`, a.classDefs[c], b.classDefs[c]);
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
  for (const [id, eb] of b.entities) {
    const ea = a.entities.get(id);
    if (!ea) {
      items.push(added('entity', id, eb.label || id));
      continue;
    }
    const f: FieldChange[] = [];
    field(f, 'content', 'label', ea.label, eb.label);
    attrFields(ea, eb, f);
    field(f, 'layout', 'subgraph', ea.parent, eb.parent);
    field(f, 'style', 'classes', ea.classes.join(' ') || undefined, eb.classes.join(' ') || undefined);
    field(f, 'style', 'Mermaid style', mermaidStyleOf(ea.classes, ea.style, a.classDefs), mermaidStyleOf(eb.classes, eb.style, b.classDefs));
    metaFields(f, ma.entities?.[id], mb.entities?.[id], presets);
    items.push(finish('entity', id, eb.label || id, f));
  }
  for (const [id, ea] of a.entities) if (!b.entities.has(id)) items.push(removed('entity', id, ea.label || id));

  // subgraphs: by id
  for (const [id, gb] of b.groups) {
    const ga = a.groups.get(id);
    if (!ga) {
      items.push(added('group', id, gb.label || id));
      continue;
    }
    const f: FieldChange[] = [];
    field(f, 'content', 'label', ga.label, gb.label);
    field(f, 'layout', 'parent subgraph', ga.parent, gb.parent);
    field(f, 'layout', 'direction', ga.dir, gb.dir);
    field(f, 'style', 'classes', ga.classes.join(' ') || undefined, gb.classes.join(' ') || undefined);
    field(f, 'style', 'Mermaid style', mermaidStyleOf(ga.classes, ga.style, a.classDefs), mermaidStyleOf(gb.classes, gb.style, b.classDefs));
    metaFields(f, ma.groups?.[id], mb.groups?.[id], groupPresets);
    items.push(finish('group', id, gb.label || id, f));
  }
  for (const [id, ga] of a.groups) if (!b.groups.has(id)) items.push(removed('group', id, ga.label || id));

  const relName = (r: ErModel['rels'][number]) => `${r.from} — ${r.to}${r.label ? ` (${r.label})` : ''}`;
  const bRels = new Map(b.rels.map((r) => [r.id, r])), aRels = new Map(a.rels.map((r) => [r.id, r]));
  for (const rb of b.rels) {
    const ra = aRels.get(rb.id);
    if (!ra) {
      items.push(added('rel', rb.id, relName(rb)));
      continue;
    }
    const f: FieldChange[] = [];
    field(f, 'content', 'label', ra.label, rb.label);
    field(f, 'content', 'cardinality', `${ra.fromCard} … ${ra.toCard}`, `${rb.fromCard} … ${rb.toCard}`);
    field(f, 'content', 'identifying', ra.identifying, rb.identifying);
    metaFields(f, ma.rels?.[rb.id], mb.rels?.[rb.id], relPresets);
    items.push(finish('rel', rb.id, relName(rb), f));
  }
  for (const ra of a.rels) if (!bRels.has(ra.id)) items.push(removed('rel', ra.id, relName(ra)));
}

// ---- merged picture -----------------------------------------------------------------------------------------

/** The merged ER: the after version plus the removed items, changed text marked word by word. */
export function mergeEr(env: MergeEnv, a: ErModel, b: ErModel): ErModel {
  const { meta, byAfter, removed, mark } = env;
  const ma = env.before;
  const entities = new Map(b.entities);
  const groups = new Map<string, ErGroup>();
  for (const [id, g] of b.groups) groups.set(id, { ...g, children: [...g.children] });
  for (const [id, g] of groups) if (changedField(byAfter.get(`group:${id}`), 'label')) g.label = mergeText(a.groups.get(id)?.label ?? '', g.label);
  // removed subgraphs, in their old parent (its after self when it is kept, else the removed one)
  const gone = removed.filter((x) => x.kind === 'group');
  const goneIds = new Set(gone.map((c) => c.id));
  const groupId = (id: string | null): string | null => (id === null ? null : groups.has(id) ? id : goneIds.has(id) ? id + REMOVED : null);
  for (const c of gone) {
    const g = a.groups.get(c.id)!;
    groups.set(c.id + REMOVED, { ...g, id: c.id + REMOVED, parent: null, children: [] });
    carryMeta(meta, ma, 'group', c.id, c.id + REMOVED);
    mark(c, c.id + REMOVED);
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
    entities.set(c.id + REMOVED, { ...e, id: c.id + REMOVED, attrs: [...e.attrs], lines: new Set(), parent });
    if (parent) groups.get(parent)!.children.push(c.id + REMOVED);
    carryMeta(meta, ma, 'entity', c.id, c.id + REMOVED);
    mark(c, c.id + REMOVED);
  }
  const ent = (id: string) => (entities.has(id) || groups.has(id) ? id : id + REMOVED);
  const aRels = new Map(a.rels.map((r) => [r.id, r]));
  const rels = b.rels.map((r) => {
    const c = byAfter.get(`rel:${r.id}`);
    const ra = aRels.get(r.id);
    return ra && changedField(c, 'label') ? { ...r, label: mergeText(ra.label, r.label) } : r;
  });
  for (const c of removed.filter((x) => x.kind === 'rel')) {
    const r = aRels.get(c.id)!;
    rels.push({ ...r, id: c.id + REMOVED, from: ent(r.from), to: ent(r.to) });
    carryMeta(meta, ma, 'rel', c.id, c.id + REMOVED);
    mark(c, c.id + REMOVED);
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

