// The ER ops kind: code order, the clipboard (tables) and the direction.
import { erPresets } from '../render/er.js';
import type { Presets } from './types.js';
import { minOf } from '../geom.js';
import type { ErModel } from '../model.js';
import { cloneER, deleteER, setErDirection } from '../ops/er.js';
import type { LineSpan } from '../ops/types.js';
import type { ErGeometry } from '../render/types.js';
import type { ItemRef } from '../types.js';
import type { OpsKind } from './ops-types.js';

const one = (li: number | null | undefined): LineSpan | null => (li == null ? null : { start: li, end: li });
const byLine = (arr: { id: string; key: number | null | undefined }[], id: string): number =>
  arr.slice().sort((a, b) => (a.key ?? 1e9) - (b.key ?? 1e9)).findIndex((x) => x.id === id);

export const OPS: OpsKind<ErModel, ErGeometry> = {
  type: 'er',
  blocks: (model) => [...model.entities.values()].flatMap((e) => (e.defLine != null && e.endLine != null ? [{ start: e.defLine, end: e.endLine }] : [])),
  unit(M, { kind, id }) {
    if (kind === 'entity') {
      const e = M.entities.get(id);
      if (!e) return null;
      return e.defLine != null ? { start: e.defLine, end: e.endLine ?? e.defLine } : one(minOf(e.lines));
    }
    if (kind === 'rel') return one(M.rels.find((r) => r.id === id)?.src);
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
  idKind: () => 'entity',
  setDirection: (code, _model, dir) => setErDirection(code, dir),
  find(model, id) {
    if (model.entities.has(id)) return { kind: 'entity', id };
    if (model.rels.some((r) => r.id === id)) return { kind: 'rel', id };
    return null;
  },
  search: (model) => [
    ...[...model.entities.values()].map((e) => ({ ref: { kind: 'entity' as const, id: e.id }, texts: [e.id, e.label, ...e.attrs.map((a) => `${a.type} ${a.name} ${a.comment}`)] })),
    ...model.rels.map((r) => ({ ref: { kind: 'rel' as const, id: r.id }, texts: [r.label] })),
  ],
  exists: (model, { kind, id }) => (kind === 'entity' ? model.entities.has(id) : kind === 'rel' ? model.rels.some((r) => r.id === id) : false),
  takenIds: (model) => model.entities.keys(),
  usedIds: (model) => ({ entities: new Set(model.entities.keys()), rels: new Set(model.rels.map((r) => r.id)) }),
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
    return [...set].sort((a, b) => a - b);
  },
  isEmpty: (model) => !model.entities.size,
  presets: (theme, meta) => erPresets(theme, meta) as unknown as Record<string, Presets>,
  drawn: (g) => [
    ...[...g.entities].map(([id, box]) => ({ ref: { kind: 'entity' as const, id }, box })),
    ...[...g.rels].map(([id, r]) => ({ ref: { kind: 'rel' as const, id }, d: r.d, label: r.label })),
  ],
  edge: (g, { kind, id }) => (kind === 'rel' ? g.rels.get(id) : undefined),
  box: (g, it) => (it.kind === 'entity' ? g.entities.get(it.id) : undefined) ?? null,
};
