// The state diagram ops kind (T09.5): presets and geometry, the clipboard (states and composites with what they hold),
// auto-placed states, composite contents, the direction, and the metadata of notes (numbered in code order).
import type { StateModel } from '../model.js';
import { isPseudo } from '../parse/state.js';
import { cloneState, deleteState, remapStateNotes, setStateDirection, stateDescendants } from '../ops/state.js';
import { ensure, getM, tidy } from '../ops/meta-util.js';
import { stateEdgePreset, stateGroupPreset, stateNodePreset, statePresets } from '../render/state-presets.js';
import type { StateGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import type { OpsKind } from '../kind/ops-types.js';
import type { Presets } from '../kind/types.js';
import { minOf } from '../geom.js';

export const OPS: OpsKind<StateModel, StateGeometry> = {
  type: 'state',
  theme: { slots: { node: 'state.node', group: 'state.composite', edge: 'state.transition', note: 'state.note' } },
  presets: (theme, meta) => statePresets(theme, meta) as unknown as Record<string, Presets>,
  box: (g, it) => (it.kind === 'node' ? g.nodes.get(it.id) : it.kind === 'group' ? g.groups.get(it.id) : it.kind === 'note' ? g.notes.get(it.id) : undefined) ?? null,
  edge: (g, { kind, id }) => (kind === 'edge' ? g.edges.get(id) : undefined),
  drawn: (g) => [
    ...[...g.nodes].map(([id, box]) => ({ ref: { kind: 'node' as const, id }, box })),
    ...[...g.groups].map(([id, box]) => ({ ref: { kind: 'group' as const, id }, box })),
    ...[...g.notes].map(([id, box]) => ({ ref: { kind: 'note' as const, id }, box })),
    ...[...g.edges].map(([id, e]) => ({ ref: { kind: 'edge' as const, id }, d: e.d, label: e.label })),
  ],
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
  find(model, id) {
    if (model.nodes.has(id)) return { kind: 'node', id };
    if (model.groups.has(id)) return { kind: 'group', id };
    if (model.edges.some((e) => e.id === id)) return { kind: 'edge', id };
    if (model.notes.some((n) => n.id === id)) return { kind: 'note', id };
    return null;
  },
  search: (model) => [
    ...[...model.nodes.values()].map((n) => ({ ref: { kind: 'node' as const, id: n.id }, texts: [isPseudo(n.id) ? n.kind : n.id, n.label, ...n.descriptions, ...n.classes] })),
    ...[...model.groups.values()].map((g) => ({ ref: { kind: 'group' as const, id: g.id }, texts: [g.id, g.label, ...g.classes] })),
    ...model.edges.map((e) => ({ ref: { kind: 'edge' as const, id: e.id }, texts: [e.label] })),
    ...model.notes.map((n) => ({ ref: { kind: 'note' as const, id: n.id }, texts: [n.text] })),
  ],
  exists: (model, { kind, id }) =>
    kind === 'node' ? model.nodes.has(id) : kind === 'group' ? model.groups.has(id) : kind === 'edge' ? model.edges.some((e) => e.id === id) : kind === 'note' ? model.notes.some((n) => n.id === id) : false,
  takenIds: (model) => [...model.nodes.keys(), ...model.groups.keys()],
  usedIds: (model) => ({ nodes: new Set(model.nodes.keys()), groups: new Set(model.groups.keys()), edges: new Set(model.edges.map((e) => e.id)), notes: new Set(model.notes.map((n) => n.id)) }),
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
  pinAuto(meta, _model, geom) {
    // auto-placed states are laid out below hand-placed ones: pinned where they are before the first manual placement
    if (geom?.type !== 'state') return meta;
    let pinned = false;
    for (const [id, b] of geom.nodes)
      if (b.auto && Number.isFinite(b.x)) {
        const m = ensure(meta, 'node', id);
        if (m.x == null || m.y == null) {
          m.x = Math.round(b.x);
          m.y = Math.round(b.y);
          pinned = true;
        }
      }
    if (pinned)
      for (const [id, m] of Object.entries(meta.groups ?? {}))
        if (m.w == null && m.h == null && (m.x != null || m.y != null)) {
          delete m.x;
          delete m.y;
          tidy(meta, 'group', id);
        }
    return meta;
  },
  descendants: stateDescendants,
  resetScope(meta, model, geom, gid) {
    if (!model.groups.has(gid)) return meta;
    const inside = stateDescendants(model, gid);
    for (const id of inside.nodes) {
      const m = getM(meta, 'node', id);
      delete m.x;
      delete m.y;
      tidy(meta, 'node', id);
    }
    for (const id of inside.groups) {
      const m = getM(meta, 'group', id);
      delete m.x;
      delete m.y;
      delete m.w;
      delete m.h;
      tidy(meta, 'group', id);
    }
    const within = new Set([gid, ...inside.nodes, ...inside.groups]);
    for (const e of model.edges)
      if (within.has(e.from) && within.has(e.to) && meta.edges?.[e.id]?.points) {
        delete meta.edges[e.id]!.points;
        tidy(meta, 'edge', e.id);
      }
    const gm = getM(meta, 'group', gid);
    if (!(gm.x != null && gm.y != null && gm.w != null && gm.h != null)) {
      delete gm.x;
      delete gm.y;
      delete gm.w;
      delete gm.h;
      // as the flowchart's (B22): a hand-placed state or composite outside this one keeps it in place
      const placedOutside = (coll: 'nodes' | 'groups'): boolean =>
        Object.entries(meta[coll] ?? {}).some(([id, m]) => !within.has(id) && typeof m.x === 'number' && typeof m.y === 'number');
      const placed = placedOutside('nodes') || placedOutside('groups');
      const box = geom?.type === 'state' ? geom.groups.get(gid) : undefined;
      if (box && placed) {
        const m = ensure(meta, 'group', gid);
        m.x = Math.round(box.x - box.w / 2);
        m.y = Math.round(box.y - box.h / 2);
      }
      tidy(meta, 'group', gid);
    }
    return meta;
  },
  setDirection: (code, model, dir) => setStateDirection(code, model, dir),
};
