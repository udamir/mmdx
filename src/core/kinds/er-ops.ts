// The ER ops kind: code order, the clipboard (tables), the direction, presets from Mermaid classes, and subgraphs
// (11.17+, T11.6): their contents, auto-placed tables pinned before a manual placement, "Reset positions in this group".
import { entityPreset, erGroupPreset, erPresets, relPreset } from '../render/er-presets.js';
import type { Presets } from '../kind/types.js';
import { minOf } from '../geom.js';
import type { ErModel } from '../model.js';
import { cloneER, deleteER, erDescendants, setErDirection } from '../ops/er.js';
import { ensure, getM, tidy } from '../ops/meta-util.js';
import type { LineSpan } from '../ops/types.js';
import type { ErGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import type { OpsKind } from '../kind/ops-types.js';

const one = (li: number | null | undefined): LineSpan | null => (li == null ? null : { start: li, end: li });
const byLine = (arr: { id: string; key: number | null | undefined }[], id: string): number =>
  arr.slice().sort((a, b) => (a.key ?? 1e9) - (b.key ?? 1e9)).findIndex((x) => x.id === id);

export const OPS: OpsKind<ErModel, ErGeometry> = {
  type: 'er',
  blocks: (model) => [
    ...[...model.entities.values()].flatMap((e) => (e.defLine != null && e.endLine != null ? [{ start: e.defLine, end: e.endLine }] : [])),
    ...[...model.groups.values()].flatMap((g) => (g.endLine !== undefined ? [{ start: g.line, end: g.endLine }] : [])),
  ],
  unit(M, { kind, id }) {
    if (kind === 'entity') {
      const e = M.entities.get(id);
      if (!e) return null;
      return e.defLine != null ? { start: e.defLine, end: e.endLine ?? e.defLine } : one(minOf(e.lines));
    }
    if (kind === 'rel') return one(M.rels.find((r) => r.id === id)?.src);
    if (kind === 'group') {
      const g = M.groups.get(id);
      return g ? { start: g.line, end: g.endLine ?? g.line } : null;
    }
    return null;
  },
  relocate: (M, sel, line) => (sel.kind === 'rel' ? M.rels.find((x) => x.src === line)?.id : undefined),
  orderRank(M, sel) {
    if (sel.kind === 'entity') return byLine([...M.entities.values()].map((e) => ({ id: e.id, key: e.defLine })), sel.id);
    if (sel.kind === 'rel') return byLine(M.rels.map((r) => ({ id: r.id, key: r.src })), sel.id);
    return null;
  },
  copyable: (_model, it) => it.kind === 'entity',
  copySet(model, items) {
    const keep = new Set(items.map((it) => it.id));
    const rest: ItemRef[] = [...model.entities.keys()].filter((id) => !keep.has(id)).map((id) => ({ kind: 'entity' as const, id }));
    return { ends: keep, rest };
  },
  remove: deleteER,
  clone: cloneER,
  idKind: (model, id) => (model.groups.has(id) ? 'group' : 'entity'),
  setDirection: (code, model, dir) => setErDirection(code, model, dir),
  find(model, id) {
    if (model.entities.has(id)) return { kind: 'entity', id };
    if (model.groups.has(id)) return { kind: 'group', id };
    if (model.rels.some((r) => r.id === id)) return { kind: 'rel', id };
    return null;
  },
  search: (model) => [
    ...[...model.entities.values()].map((e) => ({ ref: { kind: 'entity' as const, id: e.id }, texts: [e.id, e.label, ...e.classes, ...e.attrs.map((a) => `${a.type} ${a.name} ${a.comment}`)] })),
    ...[...model.groups.values()].map((g) => ({ ref: { kind: 'group' as const, id: g.id }, texts: [g.id, g.label, ...g.classes] })),
    ...model.rels.map((r) => ({ ref: { kind: 'rel' as const, id: r.id }, texts: [r.label] })),
  ],
  exists: (model, { kind, id }) =>
    kind === 'entity' ? model.entities.has(id) : kind === 'group' ? model.groups.has(id) : kind === 'rel' ? model.rels.some((r) => r.id === id) : false,
  takenIds: (model) => [...model.entities.keys(), ...model.groups.keys()],
  usedIds: (model) => ({ entities: new Set(model.entities.keys()), rels: new Set(model.rels.map((r) => r.id)), groups: new Set(model.groups.keys()) }),
  lines(M, { kind, id }) {
    const set = new Set<number>();
    const add = (x: number | null | undefined): void => {
      if (x != null) set.add(x);
    };
    if (kind === 'entity') {
      const e = M.entities.get(id);
      if (e?.defLine != null) for (let i = e.defLine; i <= (e.endLine ?? e.defLine); i++) set.add(i);
      for (const r of M.rels) if (r.from === id || r.to === id) add(r.src);
      if (e?.defLine == null) e?.lines.forEach(add);
    } else if (kind === 'rel') add(M.rels.find((r) => r.id === id)?.src);
    else if (kind === 'group') {
      const g = M.groups.get(id);
      g?.lines.forEach(add);
      for (const r of M.rels) if (r.from === id || r.to === id) add(r.src);
    }
    return [...set].sort((a, b) => a - b);
  },
  isEmpty: (model) => !model.entities.size && !model.groups.size,
  theme: { slots: { entity: 'er.entity', rel: 'er.rel', group: 'flowchart.group' } },
  presets: (theme, meta) => erPresets(theme, meta) as unknown as Record<string, Presets>,
  codePreset(model, meta, theme, { kind, id }) {
    const P = erPresets(theme, meta);
    if (kind === 'entity') {
      const e = model.entities.get(id);
      return e ? entityPreset(e, meta, P) : '';
    }
    if (kind === 'group') {
      const g = model.groups.get(id);
      return g ? erGroupPreset(g, meta, P) : '';
    }
    if (kind === 'rel') {
      const r = model.rels.find((x) => x.id === id);
      return r ? relPreset(r, meta) : '';
    }
    return undefined;
  },
  drawn: (g) => [
    ...[...g.entities].map(([id, box]) => ({ ref: { kind: 'entity' as const, id }, box })),
    ...[...g.groups].map(([id, box]) => ({ ref: { kind: 'group' as const, id }, box })),
    ...[...g.rels].map(([id, r]) => ({ ref: { kind: 'rel' as const, id }, d: r.d, label: r.label })),
  ],
  edge: (g, { kind, id }) => (kind === 'rel' ? g.rels.get(id) : undefined),
  box: (g, it) => (it.kind === 'entity' ? g.entities.get(it.id) : it.kind === 'group' ? g.groups.get(it.id) : undefined) ?? null,
  descendants: erDescendants,
  pinAuto(meta, model, geom) {
    // with subgraphs, auto-placed tables are laid out below hand-placed ones: pinned where they are before the first
    // manual placement (without subgraphs the layered layout keeps its own rule)
    if (geom?.type !== 'er' || !model.groups.size) return meta;
    let pinned = false;
    for (const [id, b] of geom.entities)
      if (b.auto && Number.isFinite(b.x)) {
        const m = ensure(meta, 'entity', id);
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
  resetScope(meta, model, geom, gid) {
    if (!model.groups.has(gid)) return meta;
    const inside = erDescendants(model, gid);
    for (const id of inside.nodes) {
      const m = getM(meta, 'entity', id);
      delete m.x;
      delete m.y;
      tidy(meta, 'entity', id);
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
    for (const r of model.rels)
      if (within.has(r.from) && within.has(r.to) && meta.rels?.[r.id]?.points) {
        delete meta.rels[r.id]!.points;
        tidy(meta, 'rel', r.id);
      }
    const gm = getM(meta, 'group', gid);
    if (!(gm.x != null && gm.y != null && gm.w != null && gm.h != null)) {
      delete gm.x;
      delete gm.y;
      delete gm.w;
      delete gm.h;
      // as the flowchart's (B22): a hand-placed table or subgraph outside this one keeps it in place
      const placedOutside = (coll: 'entities' | 'groups'): boolean =>
        Object.entries(meta[coll] ?? {}).some(([id, m]) => !within.has(id) && typeof m.x === 'number' && typeof m.y === 'number');
      const placed = placedOutside('entities') || placedOutside('groups');
      const box = geom?.type === 'er' ? geom.groups.get(gid) : undefined;
      if (box && placed) {
        const m = ensure(meta, 'group', gid);
        m.x = Math.round(box.x - box.w / 2);
        m.y = Math.round(box.y - box.h / 2);
      }
      tidy(meta, 'group', gid);
    }
    return meta;
  },
};
