// The flowchart edit kind.
import type { FlowchartModel } from '../../core/model.js';
import { edgeText, nodeDef } from '../../core/ops/connect.js';
import { deleteFlow, groupFlow, relabelFlowEdge, relabelFlowNode, relabelGroup, ungroupFlow } from '../../core/ops/flowchart.js';
import type { FlowGeometry } from '../../core/render/types.js';
import type { Sel } from '../core.js';
import type { EditKind } from './types.js';

const one = (s: string): string => s.replace(/\n/g, ' ');

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
};
