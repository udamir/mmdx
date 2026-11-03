// The ER ops kind: code order, the clipboard (tables) and the direction.
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
};
