// The ER edit kind: tables, relationships and subgraphs (11.17+, T11.6) — ⌘G wraps tables (and subgraphs) of one
// subgraph or of the top level in a new `subgraph`, Ungroup and Delete remove the frame and keep what is in it, a
// table dropped on a subgraph is written into it, Properties set a subgraph's direction.
import type { Direction, ErModel } from '../../../core/model.js';
import {
  addERRel, addEntity, canGroupER, deleteER, erFragment, groupER, reconnectER, relabelErGroup, setErGroupDirection, ungroupER, updateEntity, updateRel,
} from '../../../core/kinds/er/ops.js';
import type { ErGeometry } from '../../../core/render/types.js';
import type { Point } from '../../../core/types.js';
import type { EditorCore, Sel } from '../../core.js';
import { placeNew } from '../../ops/insert.js';
import { attrEditor, relEditor } from './props.js';
import { tableIcon } from '../palette.js';
import type { EditKind, PropControl } from '../types.js';
import { innermostAt, newestBetween, oneLine } from '../util.js';

/** The innermost visible subgraph around a point (a dropped table joins it). */
const groupAt = (core: EditorCore, pt: Point): string | null => (core.geom.type === 'er' ? innermostAt(core.geom.groups, pt) : null);

export const EDIT: EditKind<ErModel, ErGeometry> = {
  type: 'er',
  describe(M, { kind, id }) {
    if (kind === 'entity') {
      const e = M.entities.get(id);
      if (e) return { title: oneLine(e.label), sub: `entity · ${e.attrs.length} attributes${e.parent ? ` · in ${e.parent}` : ''}${e.classes.length ? ' · :::' + e.classes.join(',') : ''}` };
    } else if (kind === 'rel') {
      const r = M.rels.find((x) => x.id === id);
      if (r) return { title: r.label || id, sub: `relationship · ${r.from} (${r.fromCard}) → ${r.to} (${r.toCard})` };
    } else if (kind === 'group') {
      const g = M.groups.get(id);
      if (g) return { title: oneLine(g.label) || id, sub: `subgraph · id ${id} · ${g.children.length} items${g.parent ? ` · in ${g.parent}` : ''}` };
    }
    return null;
  },
  text(M, { kind, id }) {
    if (kind === 'rel') return { value: M.rels.find((r) => r.id === id)?.label ?? '', multi: false, title: 'props.label', write: (code, v) => updateRel(code, M, id, { label: v }) };
    if (kind === 'entity') return { value: M.entities.get(id)?.label ?? '', multi: false, title: 'props.name', write: (code, v) => updateEntity(code, M, id, { label: v }) };
    if (kind === 'group') return { value: M.groups.get(id)?.label ?? '', multi: false, title: 'props.titleText', write: (code, v) => relabelErGroup(code, M, id, v) };
    return null;
  },
  remove: deleteER,
  canGroup: (M, sel) => {
    const why = canGroupER(M, sel);
    return why ? { ok: false, reason: why } : { ok: true, reason: '' };
  },
  group: (code, M, sel, title) => groupER(code, M, sel, title),
  ungroup(code, M, ref) {
    if (ref.kind !== 'group' || !M.groups.has(ref.id)) return null;
    const r = ungroupER(code, M, ref.id);
    return { code: r.code, members: r.members.map((id): Sel => ({ kind: M.groups.has(id) ? 'group' : 'entity', id })) };
  },
  renameContainer: (code, M, ref, name) => (ref.kind === 'group' ? relabelErGroup(code, M, ref.id, name) : null),
  fragment: (M, code, refs) => erFragment(M, code, refs),
  altCopy: true,
  connectable: ['entity', 'group'],
  connect: addERRel,
  added(M, from, to) {
    const rel = newestBetween(M.rels, from, to);
    return rel ? { ref: { kind: 'rel', id: rel.id }, ports: true } : null;
  },
  reconnect: (code, M, ref, which, target) => (ref.kind === 'rel' ? reconnectER(code, M, ref.id, which, target) : null),
  reconnected: (M, r) => (M.rels.find((e) => e.src === r.line && e.from === r.from && e.to === r.to) ?? newestBetween(M.rels, r.from, r.to))?.id,
  palette: {
    mode: 'grid',
    title: 'Table presets — click to add, or drag onto the canvas',
    items: [{ key: 'entity', label: 'Entity (table)', icon: tableIcon }],
    presets: () => ({ kind: 'entity' }),
  },
  drop(core, M, item, pt) {
    const res = addEntity(core.code, M, groupAt(core, pt));
    return placeNew(core, { code: res.code, meta: core.meta }, res.select, 'Add table', { patch: { x: pt.x, y: pt.y, ...(item.preset ? { preset: item.preset } : {}) } });
  },
  inspector(p, host, ref) {
    if (ref.kind === 'entity') attrEditor(p, host, ref.id);
    else if (ref.kind === 'rel') relEditor(p, host, ref.id);
  },
  direction: (M) => M.direction,
  properties(core, M, ref): PropControl[] {
    const g = ref.kind === 'group' ? M.groups.get(ref.id) : undefined;
    if (!g) return [];
    const t = core.i18n.t;
    return [{
      type: 'select', label: t('state.direction'), value: g.dir ?? '',
      options: [['', t('er.dirDefault')], ['TB', 'TB'], ['BT', 'BT'], ['LR', 'LR'], ['RL', 'RL']],
      set: (v) => {
        const code = setErGroupDirection(core.code, M, g.id, v ? (v as Direction) : null).code;
        if (code !== core.code) core.applyCode({ code, meta: core.meta }, t('state.direction'), { select: [ref] });
      },
    }];
  },
  problems(core, M) {
    const t = core.i18n.t;
    const P = (core.result.theme.er.entityPresets ?? {}) as Record<string, unknown>;
    const G = (core.result.theme.flowchart.groupPresets ?? {}) as Record<string, unknown>;
    return M.undefinedClasses.filter(({ cls }) => !Object.hasOwn(P, cls) && !Object.hasOwn(G, cls)).map(({ cls, line }) => ({ line: line + 1, msg: t('problems.undefinedClass', { cls }) }));
  },
  shapesLabel: 'tools.table',
};

// the type's view and ops kinds: the editor loads all three in one chunk (editor/kinds/loader.ts)
export { VIEW } from '../../../core/kinds/er/view.js';
export { OPS } from '../../../core/kinds/er/ops-kind.js';
export { EXTRAS } from '../../../core/kinds/er/extras.js';
