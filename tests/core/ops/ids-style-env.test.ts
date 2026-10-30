import { describe, expect, it } from 'vitest';
import type { DiagramMeta } from '../../../src/core/meta/types.js';
import { emptyMeta } from '../../../src/core/meta/types.js';
import { parse } from '../../../src/core/parse/index.js';
import {
  baseStyleOf, blocksOf, copyIds, currentPreset, defaultsFor, edgeEndsOf, elementExists, groupDescendants, isLocalPreset, nodeShapeOf, ownLook,
  participantShapeOf, presetOfItem, presetsFor, styleFamily, themePresetsOf, uniqueId, usedIds, type StyleEnv,
} from '../../../src/core/ops/index.js';
import { baseline, colorFor, flow, registry, seq } from './helpers.js';

const FLOW = 'flowchart LR\n  n1[(DB)] --> n2{Q}\n  n2 -.-> n3\n  subgraph g ["G"]\n    subgraph h\n      n3\n    end\n    n4\n  end\n';

describe('ids', () => {
  it('uniqueId, copyIds', () => {
    const m = flow(FLOW);
    expect(uniqueId(m, 'n')).toBe('n5');
    expect(uniqueId(m, 'group')).toBe('group1');
    expect(uniqueId(seq('sequenceDiagram\n  P1->>P2: x'), 'P')).toBe('P3');
    const map = copyIds(m, ['n1', 'n1_2', '__proto__']);
    expect(Object.entries(map)).toEqual([['n1', 'n1_2'], ['n1_2', 'n1_3'], ['__proto__', '__proto___2']]);
  });

  it('usedIds and elementExists per diagram type', () => {
    const m = flow(FLOW);
    expect(usedIds(m).edges).toEqual(new Set(['n1->n2', 'n2->n3']));
    expect(elementExists(m, { kind: 'group', id: 'h' })).toBe(true);
    expect(elementExists(m, { kind: 'entity', id: 'h' })).toBe(false);
    const s = seq('sequenceDiagram\n  box Grp\n    participant A\n  end\n  A->>+B: x\n  loop l\n    B-->>-A: y\n  end\n  Note over A: z\n');
    expect(usedIds(s)).toMatchObject({ messages: new Set(['m1', 'm2']), blocks: new Set(['b1']), notes: new Set(['n1']), boxes: new Set(['box1']), activations: new Set(['B:1']) });
    for (const r of [{ kind: 'activation', id: 'B:1' }, { kind: 'block', id: 'b1' }, { kind: 'box', id: 'box1' }, { kind: 'note', id: 'n1' }] as const) expect(elementExists(s, r)).toBe(true);
    expect(blocksOf(s)).toEqual([{ start: 1, end: 3 }, { start: 5, end: 7 }]);
    const e = parse('erDiagram\n  A ||--o{ B : x\n');
    expect(usedIds(e).entities).toEqual(new Set(['A', 'B']));
    expect(usedIds(parse('gantt'))).toEqual({});
  });

  it('groupDescendants walks nested subgraphs in order', () => {
    expect(groupDescendants(flow(FLOW), 'g')).toEqual({ nodes: ['n3', 'n4'], groups: ['h'] });
  });
});

describe('style env', () => {
  const model = flow(FLOW);
  const env = (meta: DiagramMeta = emptyMeta()): StyleEnv => ({ model, meta, theme: baseline, rawTheme: registry.merged('default-light'), color: colorFor(meta) });

  it('presets derived from the Mermaid syntax', () => {
    const e = env();
    expect(currentPreset(e, { kind: 'node', id: 'n1' })).toBe('db');
    expect(currentPreset(e, { kind: 'node', id: 'n2' })).toBe('decision');
    expect(currentPreset(e, { kind: 'edge', id: 'n2->n3' })).toBe('sync');
    expect(currentPreset(e, { kind: 'group', id: 'g' })).toBe('box');
    expect(presetOfItem(env({ ...emptyMeta(), nodes: { n1: { preset: 'core' } } }), { kind: 'node', id: 'n1' })).toBe('core');
    expect(Object.keys(presetsFor(e, 'node')!)).toContain('core');
    expect(presetsFor(e, 'participant')).toBeUndefined();
    expect(themePresetsOf(e, 'edge', true)['sync']).toBeDefined();
    const local = env({ ...emptyMeta(), styles: { node: { mine: { fill: '#fff' }, core: { fill: '#000' } } } });
    expect(isLocalPreset(local, 'node', 'mine')).toBe(true);
    expect(isLocalPreset(local, 'node', 'core')).toBe(false);
  });

  it('shapes, base style and arrow ends', () => {
    const e = env();
    expect(nodeShapeOf(e, 'n1')).toBe('cylinder');
    expect(nodeShapeOf(env({ ...emptyMeta(), nodes: { n1: { shape: 'card' } } }), 'n1')).toBe('card');
    expect(defaultsFor(baseline, 'node')).toBe(baseline.flowchart.node);
    const b = baseStyleOf(e, 'node', 'n4');
    expect(b.fill).toBe(baseline.palette['paper']); // colour references resolved
    expect(edgeEndsOf(e, 'n1->n2')).toEqual({ start: 'none', end: baseStyleOf(e, 'edge', 'n1->n2').arrow });
    const s = seq('sequenceDiagram\n  actor U\n  participant D@{ "type": "database" }\n  participant X\n');
    const se: StyleEnv = { model: s, meta: { ...emptyMeta(), participants: { X: { shape: 'stadium' } } }, theme: baseline };
    expect(['U', 'D', 'X'].map((id) => participantShapeOf(se, id))).toEqual(['actor', 'database', 'stadium']);
  });

  it('style families and own look', () => {
    expect(['node', 'participant', 'edge', 'message', 'box', 'activation'].map((k) => styleFamily(k as never))).toEqual(['shape', 'shape', 'line', 'line', '', '']);
    expect(ownLook({ ...emptyMeta(), nodes: { a: { x: 1, fill: '#fff', preset: 'p' } } }, { kind: 'node', id: 'a' })).toEqual({ fill: '#fff' });
  });
});
