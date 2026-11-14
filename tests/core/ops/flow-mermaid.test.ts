// @vitest-environment jsdom
// Agreement with stock Mermaid (T02): random op sequences on random flowcharts written in Mermaid's own syntax — node
// data with shapes and unknown keys, chains, `&` groups, edge lengths, classes — never turn code stock Mermaid 12.2 and 11.17
// reads into code it rejects. Seeded, so a failure names its seed and its ops.
import { beforeAll, describe, expect, it } from 'vitest';
import type { FlowchartModel } from '../../../src/core/model.js';
import { reconnectFlow } from '../../../src/core/ops/connect.js';
import { addFlowNode, cloneFlow, deleteFlow, groupFlow, relabelFlowEdge, relabelFlowNode, setFlowShape } from '../../../src/core/kinds/flowchart/ops.js';
import { parseFlowchart } from '../../../src/core/kinds/flowchart/parse.js';
import { pickerShapes } from '../../../src/core/shapes/catalog.js';
import type { ItemRef } from '../../../src/core/types.js';
import { stockOk } from '../../helpers/mermaid.js';

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

const BRACKETS: readonly (readonly [string, string])[] = [['[', ']'], ['(', ')'], ['([', '])'], ['{', '}'], ['{{', '}}'], ['[(', ')]'], ['((', '))'], ['[/', '/]'], ['>', ']']];
const ARROWS = ['-->', '---', '-.->', '==>', '--x', '--o', '<-->', '---->', '-->|"lbl"|', '-- txt -->', '-. dots .->'];
const NAMES = ['doc', 'lin-cyl', 'tri', 'cloud', 'sm-circ', 'tag-rect', 'bow-rect', 'datastore'];
const LABELS = ['plain', 'two\nlines', 'say "hi"', 'a & b', 'x (y) [z]', 'ünï', 'a}b, c'];

function randomFlowchart(r: () => number): string {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const n = 2 + Math.floor(r() * 5);
  const ids = Array.from({ length: n }, (_, i) => `n${i}`);
  const L = [`flowchart ${pick(['TB', 'LR'])}`];
  const mention = (id: string): string => {
    const x = r();
    if (x < 0.35) {
      const [o, c] = pick(BRACKETS);
      return `${id}${o}"${pick(['A', 'Box', 'Two words'])}"${c}`;
    }
    if (x < 0.5) return `${id}@{ shape: ${pick(NAMES)}, label: "${pick(['L', 'Data'])}" }`;
    if (x < 0.6) return `${id}:::hot`;
    return id;
  };
  const group = (): string => (r() < 0.25 ? `${mention(pick(ids))} & ${mention(pick(ids))}` : mention(pick(ids)));
  if (r() < 0.5) {
    L.push('  subgraph g0 ["Group"]', `    ${mention(ids[0]!)}`, '  end');
  }
  for (let i = 0; i < n; i++) L.push(r() < 0.3 ? `  ${group()} ${pick(ARROWS)} ${group()} ${pick(ARROWS)} ${group()}` : `  ${group()} ${pick(ARROWS)} ${group()}`);
  if (r() < 0.5) L.push(`  ${pick(ids)}@{ shape: ${pick(NAMES)}, custom: "kept" }`);
  if (r() < 0.4) L.push('  classDef hot fill:#f96');
  return L.join('\n') + '\n';
}

type Op = (code: string, m: FlowchartModel, r: () => number) => string;
const nodeOf = (m: FlowchartModel, r: () => number): string | null => {
  const ids = [...m.nodes.keys()];
  return ids.length ? ids[Math.floor(r() * ids.length)]! : null;
};
const edgeOf = (m: FlowchartModel, r: () => number): string | null => m.edges[Math.floor(r() * m.edges.length)]?.id ?? null;
const label = (r: () => number): string => LABELS[Math.floor(r() * LABELS.length)]!;
const SHAPE_IDS = pickerShapes().filter((s) => s.mermaid).map((s) => s.id);

const OPS: Record<string, Op> = {
  add: (c, m, r) => addFlowNode(c, m, { label: label(r), shape: SHAPE_IDS[Math.floor(r() * SHAPE_IDS.length)]! }).code,
  deleteNode: (c, m, r) => {
    const id = nodeOf(m, r);
    return id ? deleteFlow(c, m, [{ kind: 'node', id }]).code : c;
  },
  deleteEdge: (c, m, r) => {
    const id = edgeOf(m, r);
    return id ? deleteFlow(c, m, [{ kind: 'edge', id }]).code : c;
  },
  relabelNode: (c, m, r) => {
    const id = nodeOf(m, r);
    return id ? relabelFlowNode(c, m, id, label(r)).code : c;
  },
  relabelEdge: (c, m, r) => {
    const id = edgeOf(m, r);
    return id ? relabelFlowEdge(c, m, id, r() < 0.2 ? '' : label(r)).code : c;
  },
  reconnect: (c, m, r) => {
    const e = edgeOf(m, r), to = nodeOf(m, r);
    return e && to ? reconnectFlow(c, m, e, r() < 0.5 ? 'a' : 'b', to).code : c;
  },
  setShape: (c, m, r) => {
    const id = nodeOf(m, r);
    return id ? setFlowShape(c, m, id, SHAPE_IDS[Math.floor(r() * SHAPE_IDS.length)]!)?.code ?? c : c;
  },
  clone: (c, m, r) => {
    const id = nodeOf(m, r);
    return id ? cloneFlow(c, m, [{ kind: 'node', id }]).code : c;
  },
  group: (c, m, r) => {
    const refs = [nodeOf(m, r), nodeOf(m, r)].filter((x): x is string => !!x).map((id): ItemRef => ({ kind: 'node', id }));
    return groupFlow(c, m, refs, 'G').code;
  },
};
const OP_NAMES = Object.keys(OPS);

describe('op outputs stay valid for stock Mermaid', () => {
  let parse: (code: string) => Promise<boolean>;
  beforeAll(async () => {
    parse = stockOk;
  });

  it('random sequences', async () => {
    let checked = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = rng(seed);
      let code = randomFlowchart(r);
      if (!(await parse(code))) continue; // a generated input Mermaid rejects says nothing about the ops
      const trail: string[] = [];
      for (let i = 0; i < 8; i++) {
        const m = parseFlowchart(code);
        const name = OP_NAMES[Math.floor(r() * OP_NAMES.length)]!;
        trail.push(name);
        const next = OPS[name]!(code, m, r);
        expect(await parse(next), `seed ${seed}, ops ${trail.join(' → ')}\n--- before\n${code}\n--- after\n${next}`).toBe(true);
        checked++;
        code = next;
      }
    }
    expect(checked).toBeGreaterThan(500);
  }, 120_000);
});
