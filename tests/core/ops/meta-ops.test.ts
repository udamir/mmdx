import { describe, expect, it } from 'vitest';
import type { DiagramMeta } from '../../../src/core/meta/types.js';
import { emptyMeta } from '../../../src/core/meta/types.js';
import { parse } from '../../../src/core/parse/index.js';
import {
  addLocalColor, afterCodeChange, alignItems, canSavePreset, copyStyle, deleteLocalPreset, deleteSeq, effectiveValue, fixIdClash, lockedItems,
  moveItem, moveItems, newDiagram, newLayer, normalizePresetName, pasteStyle, pinAutoNodes, presetUsers, remapSeqMeta, removeLocalColor,
  resetCurve, resetItemStyle, resetLayout, saveAsPreset, setAutonumber, setDirection, setLayer, setPage, setPagePreset, setStyle,
  startDiagram, suggestPresetName, unlockAll, updatePreset, usedIds, type StyleEnv,
} from '../../../src/core/ops/index.js';
import { baseline, colorFor, expectParses, flow, geomOf, registry, seq } from './helpers.js';

const meta = (m: Partial<DiagramMeta>): DiagramMeta => ({ ...emptyMeta(), ...m });

const FLOW = `flowchart LR
  A["Alpha"] --> B["Beta"]
  subgraph G ["Group"]
    C["Gamma"]
  end
  B --> C
`;

describe('palette, layers, lock, auto layout', () => {
  it('adds and removes a diagram colour; items keep the colour', () => {
    const m0 = meta({ nodes: { A: { fill: '@c-ff0000' } } });
    const { meta: m1, name } = addLocalColor(m0, '#FF0000');
    expect(name).toBe('c-ff0000');
    expect(m1.styles['palette']).toEqual({ 'c-ff0000': { color: '#ff0000' } });
    expect(m0.styles['palette']).toBeUndefined(); // input untouched
    const m2 = removeLocalColor(m1, name).meta;
    expect(m2.styles['palette']).toBeUndefined();
    expect(m2.nodes!['A']!.fill).toBe('#ff0000');
  });

  it('layers', () => {
    const items = [{ kind: 'node' as const, id: 'A' }];
    const { meta: m1, id } = newLayer(emptyMeta(), items);
    expect(id).toBe('L1');
    expect(m1.layers).toEqual({ L1: { name: 'Layer 1' } });
    expect(m1.nodes!['A']).toEqual({ layer: 'L1' });
    expect(newLayer(m1).id).toBe('L2');
    expect(setLayer(m1, items, 'default').meta.nodes).toEqual({});
  });

  it('unlockAll and lockedItems', () => {
    const m = meta({ nodes: { A: { locked: true }, B: { locked: true, x: 1 } }, rels: { r: { locked: true } } });
    expect(lockedItems(m)).toEqual([{ kind: 'node', id: 'A' }, { kind: 'node', id: 'B' }, { kind: 'rel', id: 'r' }]);
    const r = unlockAll(m);
    expect(r.count).toBe(3);
    expect(r.meta.nodes).toEqual({ B: { x: 1 } });
  });

  it('resetLayout forgets positions, sizes, dy, points and the page size; keeps styles', () => {
    const m = meta({
      canvas: { w: 100, h: 50, x: 1, y: 2, theme: 'clean' },
      nodes: { A: { x: 1, y: 2, w: 3, h: 4 }, B: { x: 1, fill: '#fff' } },
      groups: { G: { x: 1, y: 1, w: 9, h: 9 } },
      messages: { m1: { dy: 10 } },
      edges: { 'A->B': { points: [[1, 2]], color: '#000' } },
    });
    const r = resetLayout(m).meta;
    expect(r.canvas).toEqual({ theme: 'clean' });
    expect(r.nodes).toEqual({ B: { fill: '#fff' } });
    expect(r.groups).toEqual({});
    expect(r.messages).toEqual({});
    expect(r.edges).toEqual({ 'A->B': { color: '#000' } });
  });
});

describe('positions', () => {
  const model = flow(FLOW);
  const geom = geomOf(FLOW);
  if (geom.type !== 'flowchart') throw new Error();

  it('pinAutoNodes pins every auto-placed node at its rendered position', () => {
    const r = pinAutoNodes(model, emptyMeta(), geom).meta;
    for (const [id, b] of geom.nodes) expect(r.nodes![id]).toEqual({ x: Math.round(b.x), y: Math.round(b.y) });
  });

  it('moveItem moves nodes, groups with their contents, labels, participants and messages', () => {
    const a = geom.nodes.get('A')!;
    const r = moveItem(model, emptyMeta(), geom, { kind: 'node', id: 'A' }, 10.4, -5);
    expect(r.meta.nodes!['A']).toEqual({ x: Math.round(a.x + 10.4), y: Math.round(a.y - 5) });
    const snapped = moveItem(model, emptyMeta(), geom, { kind: 'node', id: 'A' }, 7, 7, { snap: 5 }).meta.nodes!['A']!;
    expect(Number(snapped.x) % 5).toBe(0);
    const c = geom.nodes.get('C')!;
    const g = moveItem(model, emptyMeta(), geom, { kind: 'group', id: 'G' }, 20, 0).meta;
    expect(g.nodes!['C']).toEqual({ x: Math.round(c.x + 20), y: Math.round(c.y) });
    const locked = meta({ nodes: { A: { locked: true } } });
    expect(moveItem(model, locked, geom, { kind: 'node', id: 'A' }, 5, 5).meta.nodes!['A']).toMatchObject({ locked: true });
    expect(moveItem(model, locked, geom, { kind: 'node', id: 'A' }, 5, 5).meta.nodes!['A']!.x).toBe(Math.round(a.x)); // only pinned
    expect(moveItem(model, emptyMeta(), geom, { kind: 'edge', id: 'A->B' }, 3, 4, { part: 'label' }).meta.edges!['A->B']).toEqual({ labelDx: 3, labelDy: 4 });
    const S = 'sequenceDiagram\n  A->>B: hi\n';
    const sm = seq(S), sg = geomOf(S);
    expect(moveItem(sm, emptyMeta(), sg, { kind: 'message', id: 'm1' }, 0, -100).meta.messages!['m1']).toEqual({ dy: -40 });
    const px = sg.type === 'sequence' ? sg.participants.get('B')!.x : 0;
    expect(moveItem(sm, emptyMeta(), sg, { kind: 'participant', id: 'B' }, 30, 99).meta.participants!['B']).toEqual({ x: Math.round(px + 30) });
  });

  it('moveItems moves a multi-selection by one delta', () => {
    const r = moveItems(model, emptyMeta(), geom, [{ kind: 'node', id: 'A' }, { kind: 'group', id: 'G' }], 10, 10).meta;
    expect(r.nodes!['A']!.x).toBe(Math.round(geom.nodes.get('A')!.x + 10));
    expect(r.nodes!['C']!.y).toBe(Math.round(geom.nodes.get('C')!.y + 10));
  });

  it('alignItems aligns and distributes; locked items stay', () => {
    const refs = [{ kind: 'node' as const, id: 'A' }, { kind: 'node' as const, id: 'B' }, { kind: 'node' as const, id: 'C' }];
    const top = alignItems(model, emptyMeta(), geom, refs, 'top').meta;
    const tops = refs.map((r) => Number(top.nodes![r.id]!.y) - geom.nodes.get(r.id)!.h / 2);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    const g2 = geomOf(FLOW, top);
    if (g2.type !== 'flowchart') throw new Error();
    const dist = alignItems(model, top, g2, refs, 'hdist').meta;
    expect(dist.nodes).toBeDefined();
    const locked = meta({ nodes: { B: { locked: true } } });
    const r = alignItems(model, locked, geom, refs.slice(0, 2), 'left');
    expect(r.meta).toBe(locked); // fewer than two movable items: unchanged
  });
});

describe('style', () => {
  it('setStyle maps keys per kind in a multi-selection', () => {
    const r = setStyle(emptyMeta(), [{ kind: 'group', id: 'G' }, { kind: 'entity', id: 'E' }], { text: '#f00', fontSize: 14 }, { multi: true }).meta;
    expect(r.groups!['G']).toEqual({ titleColor: '#f00', titleSize: 14 });
    expect(r.entities!['E']).toEqual({ text: '#f00', attrSize: 14, titleSize: 15 });
    expect(setStyle(r, [{ kind: 'group', id: 'G' }], { titleColor: null, titleSize: undefined }).meta.groups).toEqual({});
  });

  it('resetItemStyle keeps layout; resetCurve drops points and curve', () => {
    const m = meta({ edges: { e: { x: 1, color: '#f00', points: [[1, 1]], curve: 0.5, fromSide: 't' } } });
    expect(resetItemStyle(m, { kind: 'edge', id: 'e' }).meta.edges!['e']).toEqual({ x: 1, fromSide: 't' });
    expect(resetCurve(m, { kind: 'edge', id: 'e' }).meta.edges!['e']).toEqual({ x: 1, color: '#f00', fromSide: 't' });
  });

  const model = flow(FLOW);
  const env = (m: DiagramMeta): StyleEnv => ({ model, meta: m, theme: baseline, rawTheme: registry.merged('default-light'), color: colorFor(m) });

  it('effectiveValue: own value, else preset / theme', () => {
    const e = env(meta({ nodes: { A: { fill: '#123456' } } }));
    expect(effectiveValue(e, { kind: 'node', id: 'A' }, 'fill')).toBe('#123456');
    expect(effectiveValue(e, { kind: 'node', id: 'B' }, 'fill')).toBe(baseline.palette['paper']);
    expect(effectiveValue(e, { kind: 'edge', id: 'A->B' }, 'routing')).toBe('curved');
    expect(effectiveValue(e, { kind: 'node', id: 'B' }, 'shape')).toBe('rect');
  });

  it('copy / paste style: same kind exact, other kind partial, other family refused', () => {
    const e = env(meta({ nodes: { A: { fill: '#ff0000', preset: 'core', x: 5 } } }));
    const clip = copyStyle(e, { kind: 'node', id: 'A' })!;
    expect(clip.own).toEqual({ preset: 'core', fill: '#ff0000' });
    const same = pasteStyle(e, clip, { kind: 'node', id: 'B' }).meta;
    expect(same.nodes!['B']).toMatchObject({ preset: 'core', fill: '#ff0000' });
    expect(same.nodes!['B']!.x).toBeUndefined();
    const other = pasteStyle(e, clip, { kind: 'group', id: 'G' }).meta;
    expect(other.groups!['G']!.fill).toBe('#ff0000');
    expect(other.groups!['G']!.titleColor).toBeDefined();
    expect(pasteStyle(e, clip, { kind: 'edge', id: 'A->B' }).reason).toMatch(/similar item/);
    expect(pasteStyle(e, clip, { kind: 'node', id: 'A' }).meta).toBe(e.meta);
    expect(copyStyle(e, { kind: 'box', id: 'x' })).toBeNull();
  });

  it('presets: save, update, delete', () => {
    const e = env(meta({ nodes: { A: { fill: '@lime', preset: 'core' } } }));
    expect(canSavePreset(e, { kind: 'node', id: 'A' })).toBe(true);
    expect(suggestPresetName(e, { kind: 'node', id: 'A' })).toBe('core-2');
    expect(normalizePresetName('  My Style!! ')).toBe('my-style');
    expect(saveAsPreset(e, { kind: 'node', id: 'A' }, 'core').reason).toBe('There already is a preset "core"');
    expect(saveAsPreset(e, { kind: 'node', id: 'A' }, '  ').reason).toBeDefined();
    const s = saveAsPreset(e, { kind: 'node', id: 'A' }, 'Mine');
    expect(s.name).toBe('mine');
    const raw = registry.merged('default-light')!.flowchart!.nodePresets!['core']!;
    expect(s.meta.styles['node']!['mine']).toEqual({ ...raw, fill: '@lime', for: 'rect' });
    expect(s.meta.nodes!['A']).toEqual({ preset: 'mine' });
    const e2 = env(setStyle(s.meta, [{ kind: 'node', id: 'A' }], { stroke: '#000' }).meta);
    const u = updatePreset(e2, { kind: 'node', id: 'A' });
    expect(u.meta.styles['node']!['mine']!.stroke).toBe('#000');
    expect(u.meta.nodes!['A']).toEqual({ preset: 'mine' });
    expect(updatePreset(e, { kind: 'node', id: 'A' }).reason).toBeDefined(); // theme preset
    expect(presetUsers(u.meta, 'node', 'mine')).toEqual(['A']);
    const d = deleteLocalPreset(u.meta, 'node', 'mine');
    expect(d.users).toBe(1);
    expect(d.meta.styles['node']).toBeUndefined();
    expect(d.meta.nodes).toEqual({});
  });
});

describe('document-level ops', () => {
  it('fixIdClash renames the subgraph and moves its metadata', () => {
    const code = 'flowchart LR\n  G["Node G"] --> X\n  subgraph G ["Title"]\n    X\n  end\n';
    const m = flow(code);
    const r = fixIdClash(code, meta({ groups: { G: { fill: '#fff' } } }), m, 'G');
    expect(r.selection).toEqual([{ kind: 'group', id: 'G_group' }]);
    expect(r.meta.groups).toEqual({ G_group: { fill: '#fff' } });
    const after = flow(r.code);
    expect(after.idClashes).toEqual([]);
    expect(after.groups.get('G_group')!.label).toBe('Title');
  });

  it('direction, autonumber, new diagram', () => {
    expect(setDirection('flowchart\n  A', flow('flowchart\n  A'), 'RL').code).toBe('flowchart RL\n  A');
    expect(setDirection('graph TD\n  A', flow('graph TD\n  A'), 'LR').code).toBe('graph LR\n  A');
    const E = 'erDiagram\n  A ||--o{ B : x\n';
    const e1 = setDirection(E, parse(E), 'LR').code;
    expect(e1).toBe('erDiagram\n  direction LR\n  A ||--o{ B : x\n');
    expect(setDirection(e1, parse(e1), 'TB').code).toBe('erDiagram\n  direction TB\n  A ||--o{ B : x\n');
    expectParses(E, e1);
    const S = 'sequenceDiagram\n  A->>B: x';
    expect(setAutonumber(S, true).code).toBe('sequenceDiagram\n  autonumber\n  A->>B: x');
    expect(setAutonumber(setAutonumber(S, true).code, false).code).toBe(S);
    expect(setAutonumber(S, false).code).toBe(S);
    expect(newDiagram('er')).toEqual({ code: 'erDiagram\n', meta: { canvas: {}, styles: {} } });
    expect(startDiagram('\n\n  A --> B', 'flowchart').code).toBe('flowchart TB\nA --> B');
  });

  it('page settings: values equal to the preset are not stored', () => {
    const preset = Object.keys(baseline.flowchart.pagePresets)[0]!;
    const m = setPagePreset(emptyMeta(), preset).meta;
    expect(m.canvas.preset).toBe(preset);
    const pv = (baseline.flowchart.pagePresets[preset] as Record<string, unknown>)['background'];
    expect(setPage(m, baseline, 'flowchart', 'background', pv).meta.canvas['background']).toBeUndefined();
    expect(setPage(m, baseline, 'flowchart', 'background', '#123456').meta.canvas['background']).toBe('#123456');
    expect(setPage(emptyMeta(), baseline, 'flowchart', 'routing', 'curved', 'curved').meta.canvas).toEqual({});
    expect(setPagePreset(m, null).meta.canvas).toEqual({});
  });

  it('sequence metadata follows positional ids', () => {
    const S = 'sequenceDiagram\n  A->>B: one\n  A->>B: two\n  Note over A: n\n  A->>+B: three\n  B-->>-A: back\n';
    const m0 = seq(S);
    const md = meta({ messages: { m1: { color: '#111' }, m2: { color: '#222' } }, activations: { 'B:1': { fill: '#333' } } });
    const del = deleteSeq(S, m0, [{ kind: 'message', id: 'm1' }]).code;
    const r = afterCodeChange(m0, S, del, md);
    expect(r.meta.messages).toEqual({ m1: { color: '#222' } });
    expect(r.meta.activations).toEqual({ 'B:1': { fill: '#333' } });
    expect(remapSeqMeta(m0, S, m0, S, md)).toEqual(md);
    expect(usedIds(r.model).messages).toEqual(new Set(['m1', 'm2', 'm3']));
  });
});
