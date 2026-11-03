// The flowchart edit kind.
import type { FlowchartModel } from '../../core/model.js';
import { addFlowEdge, edgeText, nodeDef, reconnectFlow } from '../../core/ops/connect.js';
import { deleteFlow, groupFlow, relabelFlowEdge, relabelFlowNode, relabelGroup, ungroupFlow } from '../../core/ops/flowchart.js';
import type { FlowGeometry } from '../../core/render/types.js';
import type { Sel } from '../core.js';
import { cloneMeta, ensure as ensureIn } from '../../core/ops/meta-util.js';
import { addFlowNode } from '../../core/ops/flowchart.js';
import { fixIdClash } from '../../core/ops/meta-ops.js';
import { flowPresets, presetShape } from '../../core/render/flowchart.js';
import type { Point } from '../../core/types.js';
import type { EditorCore } from '../core.js';
import { focusLabel } from '../modules/shapes/drop.js';
import { applyDoc } from '../ops/doc.js';
import { shapeIcon } from './palette.js';
import type { EditKind } from './types.js';

const one = (s: string): string => s.replace(/\n/g, ' ');

/** Shapes Mermaid draws natively; the others are stored as `rect` + meta `shape`. */
const MERMAID_SHAPES: ReadonlySet<string> = new Set(['rect', 'rounded', 'stadium', 'diamond', 'parallelogram', 'cylinder', 'subroutine', 'circle', 'hexagon']);

/** The innermost visible group around a point (a dropped shape joins it). */
function groupAt(core: EditorCore, pt: Point): string | null {
  const gm = core.geom;
  if (gm.type !== 'flowchart') return null;
  let best: { id: string; a: number } | null = null;
  gm.groups.forEach((b, id) => {
    if (b.hidden) return;
    if (Math.abs(pt.x - b.x) <= b.w / 2 && Math.abs(pt.y - b.y) <= b.h / 2 && (!best || b.w * b.h < best.a)) best = { id, a: b.w * b.h };
  });
  return (best as { id: string } | null)?.id ?? null;
}


export const EDIT: EditKind<FlowchartModel, FlowGeometry> = {
  type: 'flowchart',
  describe(M, { kind, id }) {
    if (kind === 'node') {
      const n = M.nodes.get(id);
      if (n) return { title: one(n.label), sub: `node · id ${id} · ${n.shape}${n.classes.length ? ' · :::' + n.classes.join(',') : ''}` };
    } else if (kind === 'group') {
      const g = M.groups.get(id);
      return { title: one(g?.label || id) || id, sub: `subgraph · id ${id}` };
    } else if (kind === 'edge') {
      const e = M.edges.find((x) => x.id === id);
      if (e) return { title: e.label || `${e.from} → ${e.to}`, sub: `edge · ${e.from} → ${e.to} · ${e.line}` };
    }
    return null;
  },
  text(M, { kind, id }) {
    if (kind === 'node') return { value: M.nodes.get(id)?.label ?? '', multi: true, title: 'props.text', write: (code, v) => relabelFlowNode(code, M, id, v) };
    if (kind === 'group') return { value: M.groups.get(id)?.label ?? '', multi: false, title: 'props.titleText', write: (code, v) => relabelGroup(code, M, id, v) };
    if (kind === 'edge') return { value: M.edges.find((e) => e.id === id)?.label ?? '', multi: false, title: 'props.label', write: (code, v) => relabelFlowEdge(code, M, id, v) };
    return null;
  },
  remove: deleteFlow,
  canGroup: (_M, sel) => (sel.some((x) => x.kind === 'node' || x.kind === 'group') ? { ok: true, reason: '' } : { ok: false, reason: 'group.selectBoxes' }),
  group: (code, M, sel, title) => groupFlow(code, M, sel.filter((x) => x.kind === 'node' || x.kind === 'group'), title),
  ungroup(code, M, it) {
    if (it.kind !== 'group') return null;
    const members: Sel[] = (M.groups.get(it.id)?.children ?? []).map((c) => ({ kind: M.groups.has(c) ? 'group' : 'node', id: c }));
    return { code: ungroupFlow(code, M, it.id).code, members };
  },
  renameContainer: (code, M, it, name) => (it.kind === 'group' ? relabelGroup(code, M, it.id, name) : null),
  fragment(model, _code, refs) {
    const out = [`flowchart ${model.direction}`];
    const ids = new Set<string>();
    const emitNode = (id: string, ind: string): void => {
      const n = model.nodes.get(id);
      if (!n || ids.has(id)) return;
      ids.add(id);
      out.push(ind + nodeDef(n));
    };
    const emitGroup = (gid: string, ind: string, guard: number): void => {
      const g = model.groups.get(gid);
      if (!g || ids.has(gid) || guard > 64) return;
      ids.add(gid);
      out.push(`${ind}subgraph ${gid}["${g.label.replace(/"/g, '#quot;')}"]`);
      for (const c of g.children) {
        if (model.groups.has(c)) emitGroup(c, `${ind}  `, guard + 1);
        else emitNode(c, `${ind}  `);
      }
      out.push(`${ind}end`);
    };
    for (const r of refs) {
      if (r.kind === 'group') emitGroup(r.id, '  ', 0);
      else if (r.kind === 'node') emitNode(r.id, '  ');
    }
    for (const e of model.edges) if (ids.has(e.from) && ids.has(e.to)) out.push(`  ${edgeText(e, e.from, e.to)}`);
    return `${out.join('\n')}\n`;
  },
  altCopy: true,
  connectable: ['node', 'group'],
  connect: addFlowEdge,
  added(M, from, to) {
    const e = [...M.edges].reverse().find((x) => x.from === from && x.to === to);
    return e ? { ref: { kind: 'edge', id: e.id }, ports: true } : null;
  },
  reconnect: (code, M, ref, which, target) => (ref.kind === 'edge' ? reconnectFlow(code, M, ref.id, which, target) : null),
  reconnected: (M, r) => (M.edges.find((e) => e.src === r.line && e.from === r.from && e.to === r.to) ?? [...M.edges].reverse().find((e) => e.from === r.from && e.to === r.to))?.id,
  palette: {
    mode: 'menu',
    title: 'Shapes',
    items: ([
      ['rect', 'Process'], ['rounded', 'Step'], ['stadium', 'Start / End'], ['diamond', 'Decision'], ['parallelogram', 'Input / Output'],
      ['cylinder', 'Database'], ['hcyl', 'Queue'], ['document', 'Document'], ['subroutine', 'Subprocess'], ['circle', 'Event'], ['hexagon', 'Preparation'],
    ] as const).map(([key, label]) => ({ key, label, icon: shapeIcon(key) })),
    presets: (item) => ({ kind: 'node', shape: item.key, fits: (p) => presetShape(p) === item.key }),
  },
  drop(core, M, item, pt) {
    const native = MERMAID_SHAPES.has(item.key);
    const res = addFlowNode(core.code, M, { label: item.label.split(' /')[0]!, shape: native ? item.key : 'rect', group: groupAt(core, pt) });
    const meta = cloneMeta(core.meta);
    const m = ensureIn(meta, 'node', res.select.id);
    Object.assign(m, { x: pt.x, y: pt.y }, native ? {} : { shape: item.key }, item.preset ? { preset: item.preset } : {});
    const ok = core.applyCode({ code: res.code, meta }, 'Add shape', { select: [res.select] });
    if (ok) focusLabel(core, res.select);
    return ok;
  },
  direction: (M) => M.direction,
  fixOf(core, M, d) {
    if (d.code !== 'flow.id-clash') return null;
    const t = core.i18n.t;
    const id = String(d.params?.['id'] ?? ''), nid = String(d.params?.['newId'] ?? '');
    return {
      label: t('problems.fixRename', { id, newId: nid }),
      run: () => {
        const res = fixIdClash(core.code, core.meta, M, id);
        if (applyDoc(core, t('problems.fixLabel'), res, res.selection ?? null)) core.toast(t('problems.renamed', { id: nid }));
      },
    };
  },
  problems(core, M) {
    if (!M.undefinedClasses.length) return [];
    // a class is fine when it names a classDef or a node / subgraph preset
    const P = flowPresets(core.result.theme, core.meta);
    const out: { line: number; msg: string }[] = [];
    for (const { cls, line } of M.undefinedClasses)
      if (!Object.hasOwn(P.node, cls) && !Object.hasOwn(P.group, cls)) out.push({ line: line + 1, msg: core.i18n.t('problems.undefinedClass', { cls }) });
    return out;
  },
};
