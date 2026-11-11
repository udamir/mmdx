// The state diagram ops kind (T09.5): presets and geometry, the clipboard (states and composites with what they hold),
// auto-placed states, composite contents, the direction, and the metadata of notes (numbered in code order).
import type { StateModel } from '../model.js';
import { isPseudo } from '../parse/state.js';
import { cloneState, deleteState, remapStateNotes, setStateDirection, stateDescendants } from '../ops/state.js';
import { tidy } from '../ops/meta-util.js';
import { stateEdgePreset, stateGroupPreset, stateNodePreset, statePresets } from '../render/state-presets.js';
import type { StateGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import type { OpsKind } from '../kind/ops-types.js';
import { asPresets, collectionOps, pinAutoPlaced, resetGroupScope } from './ops-kit.js';
import { minOf } from '../geom.js';

export const OPS: OpsKind<StateModel, StateGeometry> = {
  type: 'state',
  theme: { slots: { node: 'state.node', group: 'state.composite', edge: 'state.transition', note: 'state.note' } },
  presets: (theme, meta) => asPresets(statePresets(theme, meta)),
  ...collectionOps<StateModel, StateGeometry>([
    {
      kind: 'node', ids: (m) => m.nodes.keys(), has: (m, id) => m.nodes.has(id), taken: true, boxes: (g) => g.nodes,
      texts: (m) => [...m.nodes.values()].map((n) => [n.id, [isPseudo(n.id) ? n.kind : n.id, n.label, ...n.descriptions, ...n.classes]] as const),
    },
    { kind: 'group', ids: (m) => m.groups.keys(), has: (m, id) => m.groups.has(id), taken: true, boxes: (g) => g.groups, texts: (m) => [...m.groups.values()].map((g) => [g.id, [g.id, g.label, ...g.classes]] as const) },
    { kind: 'edge', ids: (m) => m.edges.map((e) => e.id), lines: (g) => g.edges, texts: (m) => m.edges.map((e) => [e.id, [e.label]] as const) },
    { kind: 'note', ids: (m) => m.notes.map((n) => n.id), boxes: (g) => g.notes, texts: (m) => m.notes.map((n) => [n.id, [n.text]] as const) },
  ]),
  codePreset(model, meta, theme, { kind, id }) {
    const P = statePresets(theme, meta);
    if (kind === 'node') {
      const n = model.nodes.get(id);
      return n ? stateNodePreset(n, meta, P) : '';
    }
    if (kind === 'group') {
      const g = model.groups.get(id);
      return g ? stateGroupPreset(g, meta, P) : '';
    }
    if (kind === 'edge') {
      const e = model.edges.find((x) => x.id === id);
      return e ? stateEdgePreset(e, meta) : '';
    }
    return undefined;
  },
  codeLink: (model, { kind, id }) => (kind === 'node' ? model.nodes.get(id)?.link : kind === 'group' ? model.groups.get(id)?.link : undefined),
  codeEnds: (model, { kind, id }) => (kind === 'edge' && model.edges.some((e) => e.id === id) ? { start: 'none', end: 'arrow' } : null),
  lines(M, { kind, id }) {
    const set = new Set<number>();
    if (kind === 'node') {
      M.nodes.get(id)?.lines.forEach((l) => set.add(l));
    } else if (kind === 'group') {
      const g = M.groups.get(id);
      g?.lines.forEach((l) => set.add(l));
      for (const b of g?.blocks ?? []) for (let i = b.line; i <= (b.endLine ?? b.line); i++) set.add(i);
      for (const e of M.edges) if (e.from === id || e.to === id) set.add(e.src);
    } else if (kind === 'edge') {
      const e = M.edges.find((x) => x.id === id);
      if (e) set.add(e.src);
    } else if (kind === 'note') {
      const n = M.notes.find((x) => x.id === id);
      if (n) for (let i = n.line; i <= n.endLine; i++) set.add(i);
    }
    return [...set].sort((a, b) => a - b);
  },
  isEmpty: (model) => !model.nodes.size && !model.groups.size,
  blocks: (model) => [...model.groups.values()].flatMap((g) => g.blocks.flatMap((b) => (b.endLine !== undefined ? [{ start: b.line, end: b.endLine }] : []))),
  unit(M, { kind, id }) {
    if (kind === 'group') {
      const b = M.groups.get(id)?.blocks[0];
      return b ? { start: b.line, end: b.endLine ?? b.line } : null;
    }
    if (kind === 'note') {
      const n = M.notes.find((x) => x.id === id);
      return n ? { start: n.line, end: n.endLine } : null;
    }
    if (kind === 'edge') {
      const e = M.edges.find((x) => x.id === id);
      return e ? { start: e.src, end: e.src } : null;
    }
    const n = kind === 'node' ? M.nodes.get(id) : undefined;
    const li = n ? n.defLine ?? minOf(n.lines) : undefined;
    return li === undefined || !Number.isFinite(li) ? null : { start: li, end: li };
  },
  // a state's place in the code says nothing in the picture (and moving its first mention can change its kind or
  // composite): no order slider
  orderRank: () => null,
  relocate: (M, ref, line) => (ref.kind === 'note' && line !== undefined ? M.notes.find((n) => n.line === line)?.id : ref.kind === 'edge' ? M.edges.find((e) => e.src === line)?.id : undefined),
  remapMeta(meta, before, _bc, after) {
    const notes = remapStateNotes(meta.notes, before.notes, after.notes);
    return notes === meta.notes ? meta : { ...meta, ...(notes ? { notes } : {}) };
  },
  copyable: (model, it) => (it.kind === 'node' && model.nodes.has(it.id) && !isPseudo(it.id)) || (it.kind === 'group' && model.groups.has(it.id)),
  copySet(model, items) {
    const nodes = new Set<string>(), groups = new Set<string>();
    for (const it of items) {
      if (it.kind === 'node') nodes.add(it.id);
      if (it.kind === 'group') {
        groups.add(it.id);
        const d = stateDescendants(model, it.id);
        d.nodes.forEach((n) => nodes.add(n));
        d.groups.forEach((g) => groups.add(g));
      }
    }
    const rest: ItemRef[] = [
      ...[...model.nodes.keys()].filter((id) => !nodes.has(id)).map((id) => ({ kind: 'node' as const, id })),
      ...[...model.groups.keys()].filter((id) => !groups.has(id)).map((id) => ({ kind: 'group' as const, id })),
    ];
    return { ends: new Set([...nodes, ...groups]), rest };
  },
  remove: (code, model, items) => deleteState(code, model, items),
  clone: cloneState,
  idKind: (model, id) => (model.groups.has(id) ? 'group' : 'node'),
  // auto-placed states are laid out below hand-placed ones
  pinAuto: (meta, _model, geom) => (geom?.type === 'state' ? pinAutoPlaced(meta, geom.nodes, 'node') : meta),
  descendants: stateDescendants,
  resetScope(meta, model, geom, gid) {
    if (!model.groups.has(gid)) return meta;
    return resetGroupScope(meta, gid, {
      leaf: 'node', inside: stateDescendants(model, gid), box: geom?.type === 'state' ? geom.groups.get(gid) : undefined,
      clearLines: (within) => {
        for (const e of model.edges)
          if (within(e.from) && within(e.to) && meta.edges?.[e.id]?.points) {
            delete meta.edges[e.id]!.points;
            tidy(meta, 'edge', e.id);
          }
      },
    });
  },
  setDirection: (code, model, dir) => setStateDirection(code, model, dir),
};
