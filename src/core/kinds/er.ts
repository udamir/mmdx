// The er view kind: what drawing a er needs (the viewer loads it on demand, core bundles it in ALL_KINDS). Tables are
// `entity` items, relationships `rel` items and subgraphs (11.17+, T11.6) `group` items, so the flowchart's group
// machinery (frames around a hover highlight, layers, presets, ⌘G / Ungroup, "Reset positions in this group") serves
// them.
import type { ErModel } from '../model.js';
import type { ItemRef } from '../types.js';
import { emptyEr, parseER } from '../parse/er.js';
import { renderER } from '../render/er.js';
import type { ViewKind } from '../kind/types.js';

/** The subgraphs holding a table or a subgraph, innermost first. */
function erAncestors(model: ErModel, id: string): string[] {
  const out: string[] = [];
  for (let p = model.entities.get(id)?.parent ?? model.groups.get(id)?.parent ?? null; p && out.length <= model.groups.size; p = model.groups.get(p)?.parent ?? null) out.push(p);
  return out;
}

export const VIEW: ViewKind<ErModel> = {
  type: 'er',
  parse: parseER,
  empty: emptyEr,
  render: renderER,

  items: (model) => [
    ...[...model.entities.keys()].map((id): ItemRef => ({ kind: 'entity', id })),
    ...[...model.groups.keys()].map((id): ItemRef => ({ kind: 'group', id })),
    ...model.rels.map((r): ItemRef => ({ kind: 'rel', id: r.id })),
  ],
  parents(model) {
    const out: [ItemRef, ItemRef][] = [];
    for (const e of model.entities.values()) if (e.parent && model.groups.has(e.parent)) out.push([{ kind: 'entity', id: e.id }, { kind: 'group', id: e.parent }]);
    for (const g of model.groups.values()) if (g.parent && model.groups.has(g.parent)) out.push([{ kind: 'group', id: g.id }, { kind: 'group', id: g.parent }]);
    return out;
  },
  connectors: (model) =>
    model.rels.map((r) => ({
      ref: { kind: 'rel', id: r.id },
      from: { kind: model.groups.has(r.from) ? 'group' : 'entity', id: r.from },
      to: { kind: model.groups.has(r.to) ? 'group' : 'entity', id: r.to },
    })),
  frames(model, lit) {
    const out: ItemRef[] = [];
    for (const id of lit) for (const g of erAncestors(model, id)) out.push({ kind: 'group', id: g });
    return out;
  },
  summary: (model) => (model.entities.size ? { key: 'label.er', params: { entities: model.entities.size, rels: model.rels.length } } : { key: 'label.empty', params: {} }),
};
