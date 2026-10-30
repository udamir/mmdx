// Property test: random sequences of ops on random small flowcharts never throw and always produce code that
// parses as a flowchart without new errors. Hand-rolled seeded generator (no dependencies).
import { describe, expect, it } from 'vitest';
import type { FlowchartModel } from '../../../src/core/model.js';
import { parse } from '../../../src/core/parse/index.js';
import {
  addFlowEdge, addFlowNode, cloneFlow, deleteFlow, groupFlow, moveStatement, reconnectFlow, relabelFlowEdge, relabelFlowNode, relabelGroup,
  renameGroupId, ungroupFlow,
} from '../../../src/core/ops/index.js';
import type { ItemRef } from '../../../src/core/types.js';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHAPES = ['[', '(', '([', '[[', '[(', '((', '{', '{{', '[/', '>'];
const CLOSE: Record<string, string> = { '[': ']', '(': ')', '([': '])', '[[': ']]', '[(': ')]', '((': '))', '{': '}', '{{': '}}', '[/': '/]', '>': ']' };
const ARROWS = ['-->', '---', '-.->', '==>', '--x', '--o', '<-->', '-->|"lbl"|'];
const LABELS = ['plain', 'two\nlines', 'say "hi"', 'a & b', '#35; hash', 'x <br> y', '`tick`', 'ünï'];

function randomFlowchart(r: () => number): string {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const n = 2 + Math.floor(r() * 6);
  const ids = Array.from({ length: n }, (_, i) => `n${i}`);
  const L = [`flowchart ${pick(['TB', 'LR', 'BT', 'RL'])}`];
  const def = (id: string): string => {
    const o = pick(SHAPES);
    return r() < 0.6 ? `${id}${o}"${pick(['A', 'Box', 'Two words'])}"${CLOSE[o]}` : id;
  };
  const inGroup = r() < 0.5 ? ids.slice(0, 1 + Math.floor(r() * 2)) : [];
  if (inGroup.length) {
    L.push('  subgraph g0 ["Group"]');
    for (const id of inGroup) L.push(`    ${def(id)}`);
    if (inGroup.length > 1) L.push(`    ${inGroup[0]} --> ${inGroup[1]}`);
    L.push('  end');
  }
  for (let i = 0; i < n; i++) {
    const a = pick(ids), b = pick(ids);
    L.push(r() < 0.3 ? `  ${def(a)} ${pick(ARROWS)} ${def(b)} --> ${pick(ids)}` : `  ${def(a)} ${pick(ARROWS)} ${def(b)}`);
  }
  if (r() < 0.4) L.push(`  class ${ids.slice(0, 2).join(',')} hot`);
  if (r() < 0.3) L.push(`  style ${ids[0]} fill:#f00`);
  return L.join('\n') + '\n';
}

type Op = (code: string, m: FlowchartModel, r: () => number) => string;

const pickRef = (m: FlowchartModel, r: () => number): ItemRef | null => {
  const all: ItemRef[] = [
    ...[...m.nodes.keys()].map((id) => ({ kind: 'node' as const, id })),
    ...[...m.groups.keys()].map((id) => ({ kind: 'group' as const, id })),
    ...m.edges.map((e) => ({ kind: 'edge' as const, id: e.id })),
  ];
  return all.length ? all[Math.floor(r() * all.length)]! : null;
};
const pickNode = (m: FlowchartModel, r: () => number): string | null => {
  const ids = [...m.nodes.keys()];
  return ids.length ? ids[Math.floor(r() * ids.length)]! : null;
};
const label = (r: () => number): string => LABELS[Math.floor(r() * LABELS.length)]!;

const OPS: Record<string, Op> = {
  add: (c, m, r) => addFlowNode(c, m, { label: label(r), group: r() < 0.5 ? [...m.groups.keys()][0] ?? null : null }).code,
  delete: (c, m, r) => {
    const ref = pickRef(m, r);
    return ref ? deleteFlow(c, m, [ref]).code : c;
  },
  relabelNode: (c, m, r) => {
    const id = pickNode(m, r);
    return id ? relabelFlowNode(c, m, id, label(r)).code : c;
  },
  relabelEdge: (c, m, r) => (m.edges.length ? relabelFlowEdge(c, m, m.edges[Math.floor(r() * m.edges.length)]!.id, label(r)).code : c),
  relabelGroup: (c, m, r) => {
    const g = [...m.groups.keys()][0];
    return g ? relabelGroup(c, m, g, label(r)).code : c;
  },
  group: (c, m, r) => {
    const refs = [pickRef(m, r), pickRef(m, r)].filter((x): x is ItemRef => !!x && x.kind !== 'edge');
    return groupFlow(c, m, refs, label(r)).code;
  },
  ungroup: (c, m) => {
    const g = [...m.groups.keys()][0];
    return g ? ungroupFlow(c, m, g).code : c;
  },
  renameGroup: (c, m, r) => {
    const g = [...m.groups.keys()][0];
    return g ? renameGroupId(c, m, g, `grp${Math.floor(r() * 1000)}`).code : c;
  },
  clone: (c, m, r) => {
    const ref = pickRef(m, r);
    return ref ? cloneFlow(c, m, [ref]).code : c;
  },
  reconnect: (c, m, r) => {
    const e = m.edges[Math.floor(r() * m.edges.length)];
    const to = pickNode(m, r);
    return e && to ? reconnectFlow(c, m, e.id, r() < 0.5 ? 'a' : 'b', to).code : c;
  },
  connect: (c, m, r) => {
    const a = pickNode(m, r), b = pickNode(m, r);
    return a && b ? addFlowEdge(c, a, b).code : c;
  },
  move: (c, m, r) => {
    const ref = pickRef(m, r);
    return ref ? moveStatement(c, m, ref, r() < 0.5 ? -1 : 1).code : c;
  },
};
const NAMES = Object.keys(OPS);

const errors = (code: string): Set<string> => new Set(parse(code).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code));

describe('random op sequences on random flowcharts', () => {
  it('never throw and always parse without new errors', () => {
    let steps = 0;
    for (let seed = 1; seed <= 250; seed++) {
      const r = rng(seed);
      let code = randomFlowchart(r);
      const trail: string[] = [];
      for (let i = 0; i < 12; i++) {
        const m = parse(code);
        expect(m.type, `seed ${seed}`).toBe('flowchart');
        if (m.type !== 'flowchart') break;
        const name = NAMES[Math.floor(r() * NAMES.length)]!;
        trail.push(name);
        const before = errors(code);
        let next: string;
        try {
          next = OPS[name]!(code, m, r);
        } catch (e) {
          throw new Error(`seed ${seed}, ops ${trail.join(' → ')}: ${String(e)}\n${code}`);
        }
        const added = [...errors(next)].filter((c) => !before.has(c));
        expect(added, `seed ${seed}, ops ${trail.join(' → ')}\n--- before\n${code}--- after\n${next}`).toEqual([]);
        expect(parse(next).type).toBe('flowchart');
        code = next;
        steps++;
      }
    }
    expect(steps).toBe(250 * 12);
  });
});
