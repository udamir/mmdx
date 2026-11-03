// The ER edit kind.
import type { ErModel } from '../../core/model.js';
import { addERRel, reconnectER, relText } from '../../core/ops/connect.js';
import { deleteER, updateEntity, updateRel } from '../../core/ops/er.js';
import type { ErGeometry } from '../../core/render/types.js';
import { addEntity } from '../../core/ops/er.js';
import { cloneMeta, ensure as ensureIn } from '../../core/ops/meta-util.js';
import { focusLabel } from '../modules/shapes/drop.js';
import { tableIcon } from './palette.js';
import type { EditKind } from './types.js';

export const EDIT: EditKind<ErModel, ErGeometry> = {
  type: 'er',
  describe(M, { kind, id }) {
    if (kind === 'entity') {
      const e = M.entities.get(id);
      if (e) return { title: e.label, sub: `entity · ${e.attrs.length} attributes` };
    } else if (kind === 'rel') {
      const r = M.rels.find((x) => x.id === id);
      if (r) return { title: r.label || id, sub: `relationship · ${r.from} (${r.fromCard}) → ${r.to} (${r.toCard})` };
    }
    return null;
  },
  text(M, { kind, id }) {
    if (kind === 'rel') return { value: M.rels.find((r) => r.id === id)?.label ?? '', multi: false, title: 'props.label', write: (code, v) => updateRel(code, M, id, { label: v }) };
    if (kind === 'entity') return { value: M.entities.get(id)?.label ?? '', multi: false, title: 'props.name', write: (code, v) => updateEntity(code, M, id, { label: v }) };
    return null;
  },
  remove: deleteER,
  canGroup: () => ({ ok: false, reason: 'group.noEr' }),
  fragment(model, code, refs) {
    const L = code.split('\n');
    const out = ['erDiagram'];
    const ids = new Set<string>();
    for (const r of refs) {
      const e = r.kind === 'entity' ? model.entities.get(r.id) : undefined;
      if (!e || ids.has(e.id)) continue;
      ids.add(e.id);
      if (e.defLine !== undefined && e.endLine !== undefined && e.endLine >= e.defLine) out.push(...L.slice(e.defLine, e.endLine + 1));
      else out.push(`  ${e.id}`);
    }
    for (const r of model.rels) if (ids.has(r.from) && ids.has(r.to)) out.push(`  ${relText(r, r.from, r.to)}`);
    return `${out.join('\n')}\n`;
  },
  altCopy: true,
  connectable: ['entity'],
  connect: addERRel,
  added(M, from, to) {
    const rel = [...M.rels].reverse().find((x) => x.from === from && x.to === to);
    return rel ? { ref: { kind: 'rel', id: rel.id }, ports: true } : null;
  },
  reconnect: (code, M, ref, which, target) => (ref.kind === 'rel' ? reconnectER(code, M, ref.id, which, target) : null),
  reconnected: (M, r) => (M.rels.find((e) => e.src === r.line && e.from === r.from && e.to === r.to) ?? [...M.rels].reverse().find((e) => e.from === r.from && e.to === r.to))?.id,
  palette: {
    mode: 'grid',
    title: 'Table presets — click to add, or drag onto the canvas',
    items: [{ key: 'entity', label: 'Entity (table)', icon: tableIcon }],
    presets: () => ({ kind: 'entity' }),
  },
  drop(core, M, item, pt) {
    const res = addEntity(core.code, M);
    const meta = cloneMeta(core.meta);
    Object.assign(ensureIn(meta, 'entity', res.select.id), { x: pt.x, y: pt.y }, item.preset ? { preset: item.preset } : {});
    const ok = core.applyCode({ code: res.code, meta }, 'Add table', { select: [res.select] });
    if (ok) focusLabel(core, res.select);
    return ok;
  },
};
