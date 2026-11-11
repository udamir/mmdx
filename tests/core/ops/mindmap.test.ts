// @vitest-environment jsdom
// Mindmap ops (T08.6): exact outputs of each rewrite (§3.7), the metadata of positional ids carried over by
// remapMeta, and stock Mermaid 12.2 and 11.17 parsing every op output over every node of the examples.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { splitSource } from '../../../src/core/meta/index.js';
import type { DiagramMeta } from '../../../src/core/meta/types.js';
import type { MindmapModel } from '../../../src/core/model.js';
import * as OPS from '../../../src/core/ops/mindmap.js';
import { remapMeta } from '../../../src/core/ops/document.js';
import { parseMindmap } from '../../../src/core/parse/mindmap.js';
import type { ItemRef } from '../../../src/core/types.js';
import { stockParse } from '../../helpers/mermaid.js';

const P = parseMindmap;
const SRC = `mindmap
  root((Topic))
    a[Alpha]
      a1
      a2
    Beta
      b1
    c(Gamma)
`;
const lines = (code: string): string[] => code.split('\n');
const id = (m: MindmapModel, label: string): string => [...m.nodes.values()].find((n) => n.label === label)!.id;

let mermaidParse: (code: string) => Promise<unknown>;
beforeAll(async () => {
  mermaidParse = stockParse;
});

describe('mindmap ops', () => {
  const M = P(SRC);

  it('text: in its delimiters, quoted only when it needs it; markdown; a default node that needs quotes', () => {
    expect(lines(OPS.relabelMind(SRC, M, 'a', 'First').code)[2]).toBe('    a[First]');
    expect(lines(OPS.relabelMind(SRC, M, 'a', 'One (1)').code)[2]).toBe('    a["One (1)"]');
    expect(lines(OPS.relabelMind(SRC, M, 'a', '**bold**\nnext', true).code)[2]).toBe('    a["`**bold**<br/>next`"]');
    expect(lines(OPS.relabelMind(SRC, M, id(M, 'Beta'), 'Plain words').code)[5]).toBe('    Plain words');
    expect(lines(OPS.relabelMind(SRC, M, id(M, 'Beta'), 'Has (brackets)').code)[5]).toBe('    (-"Has (brackets)"-)');
    // a quoted text stays quoted
    const q = 'mindmap\n  root\n    x["Quoted"]';
    expect(lines(OPS.relabelMind(q, P(q), 'x', 'Still').code)[2]).toBe('    x["Still"]');
  });

  it('shapes: the seven delimiters; others are refused (metadata)', () => {
    const shape = (s: string): string | undefined => {
      const r = OPS.setMindShape(SRC, M, 'a', s);
      return r ? lines(r.code)[2] : undefined;
    };
    expect(['rect', 'rounded', 'circle', 'bang', 'cloud', 'hexagon', 'mm-default'].map(shape)).toEqual([
      '    a[Alpha]', '    a(Alpha)', '    a((Alpha))', '    a))Alpha((', '    a)Alpha(', '    a{{Alpha}}', '    a(-"Alpha"-)',
    ]);
    expect(shape('diamond')).toBeUndefined();
    expect(lines(OPS.setMindShape(SRC, M, id(M, 'Beta'), 'circle')!.code)[5]).toBe('    ((Beta))');
  });

  it('Tab adds a last child (one step deeper), Enter a sibling after the subtree; on the root a child', () => {
    const child = OPS.addMindChild(SRC, M, 'a');
    expect(lines(child.code).slice(2, 6)).toEqual(['    a[Alpha]', '      a1', '      a2', '      New idea']);
    expect(child.line).toBe(5);
    const leaf = OPS.addMindChild(SRC, M, id(M, 'b1'));
    expect(lines(leaf.code)[7]).toBe('        New idea');
    const sib = OPS.addMindSibling(SRC, M, 'a');
    expect(lines(sib.code)[5]).toBe('    New idea');
    expect(lines(OPS.addMindSibling(SRC, M, 'root').code).at(-2)).toBe('    New idea');
  });

  it('the root of an empty map', () => {
    const r = OPS.addMindRoot('mindmap\n', P('mindmap\n'));
    expect(r.code).toBe('mindmap\n  ((Topic))\n');
    expect(P(r.code).root).not.toBeNull();
  });

  it('⌥↑ / ⌥↓ trade places with a sibling (with the subtrees); refused at the ends', () => {
    const down = OPS.moveMind(SRC, M, 'a', 1);
    expect(lines(down.code).slice(2, 7)).toEqual(['    Beta', '      b1', '    a[Alpha]', '      a1', '      a2']);
    expect(down.line).toBe(4);
    expect(OPS.moveMind(SRC, M, 'a', -1).reason).toBeTruthy();
  });

  it('indent under the node above, outdent after the parent (later siblings stay)', () => {
    const ind = OPS.indentMind(SRC, M, id(M, 'Beta'));
    expect(lines(ind.code).slice(2, 7)).toEqual(['    a[Alpha]', '      a1', '      a2', '      Beta', '        b1']);
    const out = OPS.outdentMind(SRC, M, id(M, 'a1'));
    expect(lines(out.code).slice(2, 6)).toEqual(['    a[Alpha]', '      a2', '    a1', '    Beta']);
    expect(OPS.indentMind(SRC, M, 'a').reason).toBeTruthy();
    expect(OPS.outdentMind(SRC, M, 'a').reason).toBeTruthy();
  });

  it('re-parent and reorder by dragging; not into its own branch; ⌥-drag copies', () => {
    const r = OPS.reparentMind(SRC, M, 'a', 'c', 0);
    expect(lines(r.code).slice(2)).toEqual(['    Beta', '      b1', '    c(Gamma)', '      a[Alpha]', '        a1', '        a2', '']);
    expect(OPS.reparentMind(SRC, M, 'a', id(M, 'a1'), 0).reason).toBeTruthy();
    const copy = OPS.reparentMind(SRC, M, 'a', 'c', 0, true);
    expect(lines(copy.code).slice(8, 11)).toEqual(['      a_2[Alpha]', '        a1', '        a2']);
    const order = OPS.reparentMind(SRC, M, 'c', 'root', 0);
    expect(lines(order.code)[2]).toBe('    c(Gamma)');
  });

  it('Del deletes subtrees; Shift+Del lifts the children; the root only when it has one child', () => {
    expect(lines(OPS.deleteMind(SRC, M, [{ kind: 'node', id: 'a' }, { kind: 'node', id: id(M, 'a1') }]).code).slice(2)).toEqual(['    Beta', '      b1', '    c(Gamma)', '']);
    expect(lines(OPS.liftMind(SRC, M, 'a').code).slice(2, 5)).toEqual(['    a1', '    a2', '    Beta']);
    expect(OPS.liftMind(SRC, M, 'root').reason).toBeTruthy();
    const one = 'mindmap\n  root\n    only\n      x';
    expect(OPS.liftMind(one, P(one), P(one).root!).code).toBe('mindmap\n  only\n    x');
  });

  it('copies: next to the original with unique written ids; the fragment; pasted text', () => {
    const c = OPS.cloneMind(SRC, M, [{ kind: 'node', id: 'a' }]);
    expect(lines(c.code).slice(5, 8)).toEqual(['    a_2[Alpha]', '      a1', '      a2']);
    expect(c.map!['a']).toBe('a_2');
    expect(OPS.mindFragment(M, SRC, [{ kind: 'node', id: 'a' }])).toBe('mindmap\n  a[Alpha]\n    a1\n    a2\n');
    const t = OPS.pasteMindText(SRC, M, 'c', '- One\n  - Two (2)\n- Three');
    expect(lines(t.code).slice(8)).toEqual(['      One', '        (-"Two (2)"-)', '      Three', '']);
    const mm = OPS.pasteMindText(SRC, M, 'c', OPS.mindFragment(M, SRC, [{ kind: 'node', id: 'a' }]));
    expect(lines(mm.code).slice(8, 11)).toEqual(['      a_2[Alpha]', '        a1', '        a2']);
  });

  it('colorBy in the frontmatter: depth written, branch (the default) removed with what it leaves empty', () => {
    const d = OPS.setMindColorBy(SRC, 'depth').code;
    expect(d.startsWith('---\nconfig:\n  mindmap:\n    colorBy: depth\n---\nmindmap\n')).toBe(true);
    expect(P(d).colorBy).toBe('depth');
    expect(OPS.setMindColorBy(d, 'branch').code).toBe(SRC);
    const fm = '---\ntitle: T\nconfig:\n  theme: dark\n---\nmindmap\n  r';
    const d2 = OPS.setMindColorBy(fm, 'depth').code;
    expect(d2).toBe('---\ntitle: T\nconfig:\n  mindmap:\n    colorBy: depth\n  theme: dark\n---\nmindmap\n  r');
    expect(OPS.setMindColorBy(d2, 'branch').code).toBe(fm);
  });

  it('metadata of positional ids follows the nodes after a code change (remapMeta)', () => {
    const meta: DiagramMeta = { canvas: {}, styles: {}, nodes: { [id(M, 'Beta')]: { side: 'l' }, [id(M, 'b1')]: { collapsed: true }, a: { fill: '#f00' } } };
    const ins = OPS.addMindChild(SRC, M, 'a');
    const N = P(ins.code);
    const out = remapMeta(M, SRC, N, ins.code, meta);
    expect(out.nodes?.[id(N, 'Beta')]).toEqual({ side: 'l' });
    expect(out.nodes?.[id(N, 'b1')]).toEqual({ collapsed: true });
    expect(out.nodes?.['a']).toEqual({ fill: '#f00' });
    // a moved node keeps its metadata (matched by its label)
    const mv = OPS.reparentMind(SRC, M, id(M, 'b1'), 'c', 0);
    const N2 = P(mv.code);
    expect(remapMeta(M, SRC, N2, mv.code, meta).nodes?.[id(N2, 'b1')]).toEqual({ collapsed: true });
  });
});

describe('mindmap ops: stock Mermaid 12.2 and 11.17 parses every output over the examples', () => {
  for (const file of ['product-mindmap.mmdx', 'study-notes.mmdx']) {
    it(file, async () => {
      const code = splitSource(readFileSync(join(__dirname, '../../../examples', file), 'utf8')).doc.code;
      const m = P(code);
      const outs = new Map<string, string>();
      const add = (name: string, r: { code: string } | null | undefined): void => void (r && r.code !== code && outs.set(name, r.code));
      for (const n of m.nodes.values()) {
        const ref: ItemRef = { kind: 'node', id: n.id };
        add(`relabel ${n.id}`, OPS.relabelMind(code, m, n.id, 'Renamed "x" (y)\nline two'));
        add(`relabel md ${n.id}`, OPS.relabelMind(code, m, n.id, '**b** (x)', true));
        for (const s of ['mm-default', 'rect', 'rounded', 'circle', 'bang', 'cloud', 'hexagon']) add(`shape ${n.id} ${s}`, OPS.setMindShape(code, m, n.id, s));
        add(`child ${n.id}`, OPS.addMindChild(code, m, n.id));
        add(`sibling ${n.id}`, OPS.addMindSibling(code, m, n.id));
        add(`indent ${n.id}`, OPS.indentMind(code, m, n.id));
        add(`outdent ${n.id}`, OPS.outdentMind(code, m, n.id));
        add(`up ${n.id}`, OPS.moveMind(code, m, n.id, -1));
        add(`down ${n.id}`, OPS.moveMind(code, m, n.id, 1));
        add(`delete ${n.id}`, OPS.deleteMind(code, m, [ref]));
        add(`lift ${n.id}`, OPS.liftMind(code, m, n.id));
        add(`clone ${n.id}`, OPS.cloneMind(code, m, [ref]));
        add(`paste ${n.id}`, OPS.pasteMindText(code, m, n.id, '- a\n  - b (c)\n- "d"'));
        if (m.root) add(`to root ${n.id}`, OPS.reparentMind(code, m, n.id, m.root, 0));
      }
      add('colorBy depth', OPS.setMindColorBy(code, 'depth'));
      add('colorBy branch', OPS.setMindColorBy(code, 'branch'));
      const failed: string[] = [];
      for (const [name, out] of outs) {
        try {
          await mermaidParse(out);
        } catch (e) {
          failed.push(`${name}: ${String(e).split('\n')[0]}`);
        }
        const errs = P(out).diagnostics.filter((d) => d.severity === 'error');
        if (errs.length) failed.push(`${name}: mmdx ${errs.map((d) => d.code).join(',')}`);
      }
      expect(outs.size).toBeGreaterThan(100);
      expect(failed).toEqual([]);
    }, 120_000);
  }
});
