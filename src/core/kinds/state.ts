// The state diagram view kind (T09): what drawing a state diagram needs (the viewer loads it on demand, core bundles it
// in ALL_KINDS). States and pseudo-states are `node` items, composites `group` items, transitions `edge` items and
// notes `note` items, so the flowchart's item machinery (metadata collections, connect handles, routing, toolbars,
// layers, presets, diff facets) serves them. The chunk registers the five shapes a state diagram draws (core/shapes/
// state.ts), so its first render needs nothing else.
import type { StateModel } from '../model.js';
import type { ItemRef } from '../types.js';
import { emptyState, parseState } from '../parse/state.js';
import { renderState } from '../render/state.js';
import { registerStateShapes } from '../shapes/state.js';
import type { ViewKind } from '../kind/types.js';

registerStateShapes();

/** The composites holding a state or a composite, innermost first. */
export function stateAncestors(model: StateModel, id: string): string[] {
  const out: string[] = [];
  for (let p = model.nodes.get(id)?.parent ?? model.groups.get(id)?.parent ?? null; p && out.length <= model.groups.size; p = model.groups.get(p)?.parent ?? null) out.push(p);
  return out;
}

export const VIEW: ViewKind<StateModel> = {
  type: 'state',
  parse: parseState,
  empty: emptyState,
  // the five shapes register again when a test forgot them (idempotent and cheap)
  render: (model, env) => {
    registerStateShapes();
    return renderState(model, env);
  },

  items(model) {
    const out: ItemRef[] = [];
    for (const id of model.nodes.keys()) out.push({ kind: 'node', id });
    for (const id of model.groups.keys()) out.push({ kind: 'group', id });
    for (const e of model.edges) out.push({ kind: 'edge', id: e.id });
    for (const n of model.notes) out.push({ kind: 'note', id: n.id });
    return out;
  },
  parents(model) {
    const out: [ItemRef, ItemRef][] = [];
    for (const n of model.nodes.values()) if (n.parent && model.groups.has(n.parent)) out.push([{ kind: 'node', id: n.id }, { kind: 'group', id: n.parent }]);
    for (const g of model.groups.values()) if (g.parent && model.groups.has(g.parent)) out.push([{ kind: 'group', id: g.id }, { kind: 'group', id: g.parent }]);
    return out;
  },
  connectors: (model) =>
    model.edges.map((e) => ({
      ref: { kind: 'edge', id: e.id },
      from: { kind: model.groups.has(e.from) ? 'group' : 'node', id: e.from },
      to: { kind: model.groups.has(e.to) ? 'group' : 'node', id: e.to },
    })),
  hideWith(model, sets) {
    // a hidden state hides its notes
    const hidden = new Set([...(sets.node ?? []), ...(sets.group ?? [])]);
    for (const n of model.notes) if (hidden.has(n.target)) (sets.note ??= new Set()).add(n.id);
  },
  frames(model, lit) {
    const out: ItemRef[] = [];
    for (const id of lit) for (const g of stateAncestors(model, id)) out.push({ kind: 'group', id: g });
    return out;
  },
  summary: (model) => {
    const states = [...model.nodes.values()].filter((n) => n.kind === 'state').length + model.groups.size;
    return model.nodes.size || model.groups.size ? { key: 'label.state', params: { states, transitions: model.edges.length } } : { key: 'label.empty', params: {} };
  },
};
