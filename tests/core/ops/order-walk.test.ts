// The order slider without a parse per step (BUG-007, P2, X11): opening it parses nothing and showing a position
// parses once, and the positions are the ones the walk with a parse per step finds. That walk (the implementation the
// OrderSims replaced) is `walkWithParses` here: it runs against the new one on seeded random documents of every type
// with an OrderSim, and it wrote the snapshot of every item of every example (and of more random documents) the new
// one is checked against.
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const parses = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../../src/core/parse/dispatch.js', async (orig) => {
  const m = await orig<typeof import('../../../src/core/parse/dispatch.js')>();
  return { ...m, reparse: (code: string) => (parses.n++, m.reparse(code)), parseWith: (code: string, kinds: Parameters<typeof m.parseWith>[1]) => (parses.n++, m.parseWith(code, kinds)) };
});

const { parse } = await import('../../../src/core/parse/index.js');
const { applyOrderState, loadOrderSim, orderPositions, orderRank, orderStep } = await import('../../../src/core/ops/order.js');
const { withKind, withOps } = await import('../../../src/core/kinds/registry.js');
const { emptyMeta } = await import('../../../src/core/meta/types.js');
const { EXAMPLES, loadOrderSims } = await import('./helpers.js');
const { randomEr, randomFlowchart, randomSequence, randomState } = await import('../../fixtures/order-docs.js');
type OrderState = import('../../../src/core/ops/order.js').OrderState;
type DiagramModel = import('../../../src/core/model.js').DiagramModel;
type ItemRef = import('../../../src/core/types.js').ItemRef;

/** Every reachable position with a parse per step (the walk before the OrderSims; at most 400 steps each way). */
function walkWithParses(code: string, model: DiagramModel, sel: ItemRef): { states: OrderState[]; index: number; labels: [string, string] } {
  const base: OrderState = { code, model, sel, others: [] };
  const walk = (dir: -1 | 1): OrderState[] => {
    const out: OrderState[] = [];
    let cur = base;
    for (let i = 0; i < 400; i++) {
      const nx = orderStep(cur.code, cur.model, cur.sel, dir);
      if (!nx || 'reason' in nx) break;
      const st: OrderState = { code: nx.code, model: nx.model, sel: nx.sel, others: nx.other !== undefined ? [...cur.others, nx.other] : cur.others };
      out.push(st);
      cur = st;
    }
    return out;
  };
  const distinct = (list: OrderState[]): OrderState[] => {
    let last = orderRank(base.model, sel);
    return list.filter((st) => {
      const r = orderRank(st.model, st.sel);
      if (r == null || r !== last) {
        last = r;
        return true;
      }
      return false;
    });
  };
  const before = distinct(walk(-1)).reverse(), after = distinct(walk(1));
  return { states: [...before, base, ...after], index: before.length, labels: withOps(model, (k) => k.orderLabels?.(sel)) ?? ['back', 'front'] };
}

const itemsOf = (m: DiagramModel): ItemRef[] => withKind(m, (k, mm) => k.items(mm)) ?? [];
type Positions = ReturnType<typeof walkWithParses>;
/** The positions in one line: index / count, the end labels and a hash of every position's code, ref and neighbours. */
const summary = (o: Positions): string =>
  `${o.index}/${o.states.length} ${o.labels.join('|')} ${createHash('sha1').update(JSON.stringify(o.states.map((s) => [s.code, s.sel, s.others]))).digest('hex').slice(0, 12)}`;
const RANDOM = [['flowchart', randomFlowchart], ['er', randomEr], ['sequence', randomSequence], ['state', randomState]] as const;

describe('the OrderSims on demand', () => {
  it('before its type\'s OrderSim loads, the walk parses each step and finds the same positions; loadOrderSim loads it once', async () => {
    const code = 'flowchart LR\n  A --> B\n  B --> C\n  C --> D', m = parse(code), sel: ItemRef = { kind: 'edge', id: 'B->C' };
    parses.n = 0;
    const before = orderPositions(code, m, sel);
    expect(parses.n).toBeGreaterThan(0);
    const wait = loadOrderSim(m);
    expect(wait).toBeInstanceOf(Promise);
    expect(loadOrderSim(m)).toBe(wait);
    await wait;
    expect(loadOrderSim(m)).toBeNull();
    parses.n = 0;
    expect(summary(orderPositions(code, m, sel))).toBe(summary(before));
    expect(parses.n).toBe(0);
  });
});

describe('order walk', () => {
  beforeAll(loadOrderSims);

  it('opening parses nothing; a position parses once, when it is shown', () => {
    const cases: [string, ItemRef][] = [
      ['flowchart LR\n  A["Alpha"] --> B\n  subgraph G\n    C --> D\n  end\n  B --> C\n  B -->|x| C', { kind: 'node', id: 'B' }],
      ['flowchart LR\n  A["Alpha"] --> B\n  subgraph G\n    C --> D\n  end\n  B --> C\n  B -->|x| C', { kind: 'edge', id: 'B->C#2' }],
      ['flowchart LR\n  A["Alpha"] --> B\n  subgraph G\n    C --> D\n  end\n  B --> C', { kind: 'group', id: 'G' }],
      ['erDiagram\n  A {\n    int id\n  }\n  A ||--o{ B : has\n  B {\n    int id\n  }\n  B ||--|| C : x', { kind: 'entity', id: 'B' }],
      ['erDiagram\n  A ||--o{ B : has\n  B ||--|| C : x\n  A ||--o{ B : again', { kind: 'rel', id: 'A--B#2' }],
      ['sequenceDiagram\n  A->>B: one\n  loop l\n    B->>A: two\n  end\n  A->>B: three', { kind: 'message', id: 'm3' }],
      ['stateDiagram-v2\n  [*] --> a\n  a --> b : go\n  note left of b : n\n  b --> [*]', { kind: 'edge', id: 'a->b' }],
    ];
    for (const [code, sel] of cases) {
      const m = parse(code);
      parses.n = 0;
      const o = orderPositions(code, m, sel);
      expect(parses.n, `${sel.kind} ${sel.id}: opening`).toBe(0);
      expect(o.states.length, `${sel.kind} ${sel.id}`).toBeGreaterThan(1);
      const i = o.index === 0 ? o.states.length - 1 : 0;
      parses.n = 0;
      const doc = applyOrderState({ code, model: m, meta: emptyMeta() }, o.states[i]!);
      expect(parses.n, `${sel.kind} ${sel.id}: showing ${i}`).toBe(1);
      applyOrderState({ code, model: m, meta: emptyMeta() }, o.states[i]!);
      expect(parses.n, `${sel.kind} ${sel.id}: showing it again`).toBe(1);
      expect(summary(o)).toBe(summary(walkWithParses(code, m, sel)));
      expect(doc.code).toBe(o.states[i]!.code);
    }
  });

  it('a 1000-edge flowchart opens without a parse (it took 801 parses, 4.6 s, for the middle edge)', () => {
    const code = ['flowchart LR', ...Array.from({ length: 1000 }, (_, i) => `  n${i} --> n${i + 1}`)].join('\n');
    const m = parse(code);
    parses.n = 0;
    const o = orderPositions(code, m, { kind: 'edge', id: 'n500->n501' });
    expect(parses.n).toBe(0);
    expect([o.index, o.states.length]).toEqual([400, 801]);
    expect(o.states[0]!.code.split('\n')[101]).toBe('  n500 --> n501');
  });

  it('random documents: the positions of every item are the walk with a parse per step', () => {
    for (const [type, gen] of RANDOM)
      for (let seed = 1; seed <= 12; seed++) {
        const code = gen(seed), m = parse(code);
        for (const sel of itemsOf(m)) expect(summary(orderPositions(code, m, sel)), `${type} #${seed} ${sel.kind}:${sel.id}\n${code}`).toBe(summary(walkWithParses(code, m, sel)));
      }
  }, 60_000);

  it('every item of every example, and more random documents: the positions the walk with a parse per step found', () => {
    const lines: string[] = [];
    for (const ex of EXAMPLES) {
      const m = parse(ex.code);
      for (const sel of itemsOf(m)) lines.push(`${ex.name} ${sel.kind}:${sel.id} ${summary(orderPositions(ex.code, m, sel))}`);
    }
    for (const [type, gen] of RANDOM)
      for (let seed = 100; seed < 160; seed++) {
        const code = gen(seed), m = parse(code);
        const all = itemsOf(m).map((sel) => `${sel.kind}:${sel.id} ${summary(orderPositions(code, m, sel))}`);
        lines.push(`${type} #${seed} ${all.length} ${createHash('sha1').update(all.join('\n')).digest('hex').slice(0, 12)}`);
      }
    expect(lines).toMatchSnapshot();
  }, 120_000);
});
