// Every source-rewriting op over every item of the examples: no op throws, and every rewrite still parses as the same
// diagram type without new errors. (Exact outputs are covered per op in flowchart / er / sequence.test.ts.)
import { describe, expect, it } from 'vitest';
import { activationsOf } from '../../../src/core/ids.js';
import type { DiagramModel } from '../../../src/core/model.js';
import { parse } from '../../../src/core/parse/index.js';
import * as OPS from '../../../src/core/ops/index.js';
import type { ItemRef } from '../../../src/core/types.js';
import { EXAMPLES } from './helpers.js';

interface Case {
  name: string;
  run: (m: DiagramModel) => object | number | null | undefined;
}

const LABEL = 'Renamed "x"\nline two';

function flowCases(code: string, m: DiagramModel): Case[] {
  if (m.type !== 'flowchart') return [];
  const nodes = [...m.nodes.keys()], groups = [...m.groups.keys()];
  const cs: Case[] = [];
  const add = (name: string, run: Case['run']): void => void cs.push({ name, run });
  add('addFlowNode', (x) => OPS.addFlowNode(code, x as never, {}));
  add('addFlowNode cls', (x) => OPS.addFlowNode(code, x as never, { label: 'X', shape: 'diamond', cls: 'core' }));
  for (const g of groups) add(`addFlowNode in ${g}`, (x) => OPS.addFlowNode(code, x as never, { group: g }));
  add('addFlowEdge', () => OPS.addFlowEdge(code, nodes[0]!, nodes[1]!));
  for (const id of nodes) {
    const sel: ItemRef = { kind: 'node', id };
    add(`relabel node ${id}`, (x) => OPS.relabelFlowNode(code, x as never, id, LABEL));
    add(`delete node ${id}`, (x) => OPS.deleteFlow(code, x as never, [sel]));
    for (const d of [-1, 1] as const) add(`move node ${id} ${d}`, (x) => OPS.moveStatement(code, x, sel, d));
    add(`unitOf node ${id}`, (x) => OPS.unitOf(x, sel));
    add(`clone node ${id}`, (x) => OPS.cloneFlow(code, x as never, [sel]));
  }
  for (const e of m.edges) {
    const sel: ItemRef = { kind: 'edge', id: e.id };
    add(`relabel edge ${e.id}`, (x) => OPS.relabelFlowEdge(code, x as never, e.id, LABEL));
    add(`delete edge ${e.id}`, (x) => OPS.deleteFlow(code, x as never, [sel]));
    for (const d of [-1, 1] as const) add(`move edge ${e.id} ${d}`, (x) => OPS.moveStatement(code, x, sel, d));
    const other = nodes.find((n) => n !== e.from && n !== e.to)!;
    for (const w of ['a', 'b'] as const) add(`reconnect ${e.id} ${w}`, (x) => OPS.reconnectFlow(code, x as never, e.id, w, other));
  }
  for (const g of groups) {
    const sel: ItemRef = { kind: 'group', id: g };
    add(`relabel group ${g}`, (x) => OPS.relabelGroup(code, x as never, g, LABEL));
    add(`ungroup ${g}`, (x) => OPS.ungroupFlow(code, x as never, g));
    add(`delete group ${g}`, (x) => OPS.deleteFlow(code, x as never, [sel]));
    add(`rename group ${g}`, (x) => OPS.renameGroupId(code, x as never, g, `${g}_x`));
    add(`group group ${g}`, (x) => OPS.groupFlow(code, x as never, [sel], 'Outer'));
    add(`clone group ${g}`, (x) => OPS.cloneFlow(code, x as never, [sel]));
    for (const d of [-1, 1] as const) add(`move group ${g} ${d}`, (x) => OPS.moveStatement(code, x, sel, d));
    const kids = m.groups.get(g)!.children.filter((c) => m.nodes.has(c)).slice(0, 2).map((id) => ({ kind: 'node' as const, id }));
    if (kids.length) add(`group children of ${g}`, (x) => OPS.groupFlow(code, x as never, kids));
  }
  const top = nodes.filter((n) => !m.nodes.get(n)!.parent).slice(0, 2).map((id) => ({ kind: 'node' as const, id }));
  add('group top nodes', (x) => OPS.groupFlow(code, x as never, top));
  const all = nodes.map((id) => ({ kind: 'node' as const, id }));
  add('delete all nodes', (x) => OPS.deleteFlow(code, x as never, all));
  add('clone all nodes', (x) => OPS.cloneFlow(code, x as never, all));
  return cs;
}

function erCases(code: string, m: DiagramModel): Case[] {
  if (m.type !== 'er') return [];
  const ents = [...m.entities.keys()];
  const cs: Case[] = [];
  const add = (name: string, run: Case['run']): void => void cs.push({ name, run });
  add('addEntity', (x) => OPS.addEntity(code, x as never));
  add('addERRel', () => OPS.addERRel(code, ents[0]!, ents[1]!));
  for (const id of ents) {
    const sel: ItemRef = { kind: 'entity', id };
    add(`delete ${id}`, (x) => OPS.deleteER(code, x as never, [sel]));
    add(`label ${id}`, (x) => OPS.updateEntity(code, x as never, id, { label: 'Nice name' }));
    const attrs = [{ type: 'int', name: 'n', keys: ['PK', 'FK'], comment: 'say "hi"' }, { type: '', name: 'z', keys: [], comment: '' }];
    add(`attrs ${id}`, (x) => OPS.updateEntity(code, x as never, id, { attrs: attrs as never }));
    add(`clone ${id}`, (x) => OPS.cloneER(code, x as never, [sel]));
    for (const d of [-1, 1] as const) add(`move ${id} ${d}`, (x) => OPS.moveStatement(code, x, sel, d));
  }
  for (const r of m.rels) {
    const sel: ItemRef = { kind: 'rel', id: r.id };
    add(`delete ${r.id}`, (x) => OPS.deleteER(code, x as never, [sel]));
    const patch = { label: 'has many', fromCard: 'one', toCard: 'zero-many', identifying: !r.identifying } as const;
    add(`update ${r.id}`, (x) => OPS.updateRel(code, x as never, r.id, patch));
    const other = ents.find((e) => e !== r.from && e !== r.to)!;
    for (const w of ['a', 'b'] as const) add(`reconnect ${r.id} ${w}`, (x) => OPS.reconnectER(code, x as never, r.id, w, other));
    for (const d of [-1, 1] as const) add(`move ${r.id} ${d}`, (x) => OPS.moveStatement(code, x, sel, d));
  }
  const all = ents.map((id) => ({ kind: 'entity' as const, id }));
  add('clone all', (x) => OPS.cloneER(code, x as never, all));
  add('delete first two', (x) => OPS.deleteER(code, x as never, all.slice(0, 2)));
  return cs;
}

function seqCases(code: string, m: DiagramModel): Case[] {
  if (m.type !== 'sequence') return [];
  const cs: Case[] = [];
  const add = (name: string, run: Case['run']): void => void cs.push({ name, run });
  const ps = m.participants.map((p) => p.id);
  const msgs = m.items.filter((x) => x.kind === 'message');
  add('addParticipant', (x) => OPS.addParticipant(code, x as never, {}));
  add('addParticipant actor before', (x) => OPS.addParticipant(code, x as never, { kind: 'actor', label: 'The user', beforeId: ps[1] ?? null }));
  add('addSeqMessage', () => OPS.addSeqMessage(code, ps[0]!, ps[1]!));
  add('addSeqMessageAt null', (x) => OPS.addSeqMessageAt(code, x as never, ps[0]!, ps[1]!, null));
  add('seqInsertAfter', (x) => OPS.seqInsertAfter(x as never, code));
  add('addNote', (x) => OPS.addNote(code, x as never, { over: ps[0]! }));
  add('box first two', (x) => OPS.boxParticipants(code, x as never, ps.slice(1, 3), 'Backend'));
  for (const id of ps) {
    const sel: ItemRef = { kind: 'participant', id };
    add(`delete ${id}`, (x) => OPS.deleteSeq(code, x as never, [sel]));
    add(`relabel ${id}`, (x) => OPS.relabelSeq(code, x as never, sel, 'Long name'));
    for (const d of [-1, 1] as const) {
      add(`swap ${id} ${d}`, (x) => OPS.swapParticipant(code, x as never, id, d));
      add(`move ${id} ${d}`, (x) => OPS.moveStatement(code, x, sel, d));
    }
  }
  msgs.forEach((mm, i) => {
    const sel: ItemRef = { kind: 'message', id: mm.id };
    add(`delete ${mm.id}`, (x) => OPS.deleteSeq(code, x as never, [sel]));
    add(`relabel ${mm.id}`, (x) => OPS.relabelSeq(code, x as never, sel, 'new text'));
    add(`message after ${mm.id}`, (x) => OPS.addSeqMessageAt(code, x as never, ps[0]!, ps[2]!, mm.src));
    for (const d of [-1, 1] as const) add(`move ${mm.id} ${d}`, (x) => OPS.moveStatement(code, x, sel, d));
    const next = msgs[i + 1], far = msgs[i + 3];
    if (next) add(`toggle ${mm.id}+${next.id}`, (x) => OPS.toggleActivation(code, x as never, mm.id, next.id));
    if (far) add(`toggle ${mm.id}+${far.id} on`, (x) => OPS.toggleActivation(code, x as never, mm.id, far.id, mm.from));
    if (far) add(`addActivation ${mm.id}`, (x) => OPS.addActivation(code, x as never, mm.to, mm.src, far.src));
    if (far) add(`wrap ${mm.id}`, (x) => OPS.wrapBlock(code, x as never, { block: 'alt', fromLine: mm.src, toLine: far.src }));
  });
  add('addActivation null', (x) => OPS.addActivation(code, x as never, ps[1]!, null, msgs[2]!.src));
  for (const it of m.items) {
    if (it.kind === 'note') {
      const sel: ItemRef = { kind: 'note', id: it.id };
      add(`note span ${it.id}`, (x) => OPS.setNoteSpan(code, x as never, it.id, ps[0]!, ps[2]!));
      add(`delete ${it.id}`, (x) => OPS.deleteSeq(code, x as never, [sel]));
    }
    if (it.kind === 'blockStart') {
      const sel: ItemRef = { kind: 'block', id: it.id };
      add(`delete ${it.id}`, (x) => OPS.deleteSeq(code, x as never, [sel]));
      add(`relabel ${it.id}`, (x) => OPS.relabelSeq(code, x as never, sel, 'cond'));
      for (const edge of ['top', 'bottom'] as const)
        for (const grow of [true, false])
          add(`resize ${it.id} ${edge} ${grow}`, (x) => OPS.resizeBlockStep(code, x as never, it.id, edge, grow));
      for (const d of [-1, 1] as const) add(`move ${it.id} ${d}`, (x) => OPS.moveStatement(code, x, sel, d));
    }
  }
  for (const b of m.boxes) {
    add(`unbox ${b.id}`, (x) => OPS.unboxParticipants(code, x as never, b.id));
    add(`relabel ${b.id}`, (x) => OPS.relabelBox(code, x as never, b.id, 'T'));
  }
  for (const a of activationsOf(m)) {
    add(`remove ${a.id}`, (x) => OPS.removeActivation(code, x as never, a.id));
    for (const mm of msgs.slice(0, 12))
      for (const edge of ['top', 'bottom'] as const)
        add(`moveEdge ${a.id} ${edge} ${mm.id}`, (x) => OPS.moveActivationEdge(code, x as never, a.id, edge, mm.id));
  }
  return cs;
}

describe('ops on the examples', () => {
  for (const ex of EXAMPLES) {
    const m = parse(ex.code);
    const cases = [...flowCases(ex.code, m), ...erCases(ex.code, m), ...seqCases(ex.code, m)];
    it(`${ex.name}: ${cases.length} cases`, () => {
      expect(cases.length).toBeGreaterThan(5);
      // every rewrite still parses, as the same type, without new errors
      const had = new Set(m.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code));
      const broken: string[] = [];
      for (const c of cases) {
        const r = c.run(m);
        if (!r || typeof r !== 'object' || !('code' in r) || typeof r.code !== 'string' || r.code === ex.code) continue;
        const after = parse(r.code);
        const added = after.diagnostics.filter((d) => d.severity === 'error' && !had.has(d.code)).map((d) => d.code);
        if (after.type !== m.type || added.length) broken.push(`${c.name}: ${added.join(',')}`);
      }
      expect(broken).toEqual([]);
    });
  }
});
