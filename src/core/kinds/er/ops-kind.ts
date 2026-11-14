// The ER ops kind: code order, the clipboard (tables), the direction, presets from Mermaid classes, and subgraphs
// (11.17+, T11.6): their contents, auto-placed tables pinned before a manual placement, "Reset positions in this group".
import { entityPreset, erGroupPreset, erPresets, relPreset } from './presets.js';
import { minOf } from '../../geom.js';
import type { ErModel } from '../../model.js';
import { cloneER, deleteER, erDescendants, setErDirection } from './ops.js';
import { tidy } from '../../ops/meta-util.js';
import type { ErGeometry } from '../../render/types.js';
import type { ItemRef } from '../../types.js';
import type { OpsKind } from '../../kind/ops-types.js';
import { asPresets, collectionOps, lineSpan, pinAutoPlaced, rankByLine, resetGroupScope } from '../ops-kit.js';


export const OPS: OpsKind<ErModel, ErGeometry> = {
  type: 'er',
  ...collectionOps<ErModel, ErGeometry>([
    {
      kind: 'entity', ids: (m) => m.entities.keys(), has: (m, id) => m.entities.has(id), taken: true, boxes: (g) => g.entities,
      texts: (m) => [...m.entities.values()].map((e) => [e.id, [e.id, e.label, ...e.classes, ...e.attrs.map((a) => `${a.type} ${a.name} ${a.comment}`)]] as const),
    },
    { kind: 'group', ids: (m) => m.groups.keys(), has: (m, id) => m.groups.has(id), taken: true, boxes: (g) => g.groups, texts: (m) => [...m.groups.values()].map((g) => [g.id, [g.id, g.label, ...g.classes]] as const) },
    { kind: 'rel', ids: (m) => m.rels.map((r) => r.id), lines: (g) => g.rels, texts: (m) => m.rels.map((r) => [r.id, [r.label]] as const) },
  ]),
  blocks: (model) => [
    ...[...model.entities.values()].flatMap((e) => (e.defLine != null && e.endLine != null ? [{ start: e.defLine, end: e.endLine }] : [])),
    ...[...model.groups.values()].flatMap((g) => (g.endLine !== undefined ? [{ start: g.line, end: g.endLine }] : [])),
  ],
  unit(M, { kind, id }) {
    if (kind === 'entity') {
      const e = M.entities.get(id);
      if (!e) return null;
      return e.defLine != null ? { start: e.defLine, end: e.endLine ?? e.defLine } : lineSpan(minOf(e.lines));
    }
    if (kind === 'rel') return lineSpan(M.rels.find((r) => r.id === id)?.src);
    if (kind === 'group') {
      const g = M.groups.get(id);
      return g ? { start: g.line, end: g.endLine ?? g.line } : null;
    }
    return null;
  },
  relocate: (M, sel, line) => (sel.kind === 'rel' ? M.rels.find((x) => x.src === line)?.id : undefined),
  orderRank(M, sel) {
    if (sel.kind === 'entity') return rankByLine([...M.entities.values()].map((e) => ({ id: e.id, key: e.defLine })), sel.id);
    if (sel.kind === 'rel') return rankByLine(M.rels.map((r) => ({ id: r.id, key: r.src })), sel.id);
    return null;
  },
  orderSim: () => import('./order.js'),
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
  presets: (theme, meta) => asPresets(erPresets(theme, meta)),
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
  descendants: erDescendants,
  pinAuto(meta, model, geom) {
    // with subgraphs, auto-placed tables are laid out below hand-placed ones (without them the layered layout keeps
    // its own rule)
    return geom?.type === 'er' && model.groups.size ? pinAutoPlaced(meta, geom.entities, 'entity') : meta;
  },
  resetScope(meta, model, geom, gid) {
    if (!model.groups.has(gid)) return meta;
    return resetGroupScope(meta, gid, {
      leaf: 'entity', inside: erDescendants(model, gid), box: geom?.type === 'er' ? geom.groups.get(gid) : undefined,
      clearLines: (within) => {
        for (const r of model.rels)
          if (within(r.from) && within(r.to) && meta.rels?.[r.id]?.points) {
            delete meta.rels[r.id]!.points;
            tidy(meta, 'rel', r.id);
          }
      },
    });
  },
};
