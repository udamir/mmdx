// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, it, expect } from 'vitest';
import { splitSource } from '../../../src/core/meta/index.js';
import * as ST from '../../../src/core/ops/state.js';
import { parseState } from '../../../src/core/parse/state.js';
import type { ItemRef } from '../../../src/core/types.js';
import { stockParse } from '../../helpers/mermaid.js';

const P = parseState;
let mermaidParse: (code: string) => Promise<unknown>;
beforeAll(async () => {
  mermaidParse = stockParse;
});
const LABEL = 'Renamed "x"\nline two';
for (const file of ['order-lifecycle.mmdx', 'traffic-light.mmdx']) {
  it(file, async () => {
    const code = splitSource(readFileSync(join(__dirname, '../../../examples', file), 'utf8')).doc.code;
    const m = P(code);
    const outs = new Map<string, string>();
    const add = (name: string, r: { code: string } | null | undefined): void => void (r && r.code !== code && outs.set(name, r.code));
    const nodes = [...m.nodes.keys()], groups = [...m.groups.keys()];
    const scopes: ST.StateScope[] = [{ g: null, r: 0 }, ...groups.flatMap((g) => Array.from({ length: m.groups.get(g)!.regions }, (_, r) => ({ g, r })))];
    for (const s of scopes) {
      for (const k of ['state', 'choice', 'fork', 'join'] as const) add(`add ${k} in ${s.g}/${s.r}`, ST.addState(code, m, { kind: k, scope: s }));
      add(`start in ${s.g}/${s.r}`, ST.addStart(code, m, s, null));
    }
    for (const id of [...nodes, ...groups]) {
      const sel: ItemRef = { kind: m.groups.has(id) ? 'group' : 'node', id };
      add(`relabel ${id}`, ST.relabelState(code, m, id, LABEL));
      add(`rows ${id}`, ST.setDescriptions(code, m, id, ['one: two', 'x; y']));
      add(`no rows ${id}`, ST.setDescriptions(code, m, id, []));
      for (const k of ['state', 'choice', 'fork', 'join'] as const) add(`kind ${id} ${k}`, ST.setStateKind(code, m, id, k));
      add(`delete ${id}`, ST.deleteState(code, m, [sel]));
      add(`delete keep ${id}`, ST.deleteState(code, m, [sel], true));
      add(`note ${id}`, ST.addNote(code, m, id, 'left', 'a: b; c'));
      add(`end after ${id}`, ST.addEnd(code, m, id));
      add(`clone ${id}`, ST.cloneState(code, m, [sel]));
      add(`group ${id}`, ST.makeComposite(code, m, [sel], 'New group'));
      add(`link ${id}`, ST.setStateLink(code, m, id, 'https://example.com/a'));
      for (const to of [...nodes, ...groups].slice(0, 12)) add(`connect ${id} ${to}`, ST.connectState(code, m, id, to, 'go: now'));
    }
    for (const g of groups) {
      add(`ungroup ${g}`, ST.ungroupState(code, m, g));
      add(`ungroup no rewire ${g}`, ST.ungroupState(code, m, g, false));
      add(`region ${g}`, ST.addRegion(code, m, g));
      add(`dir ${g}`, ST.setCompositeDirection(code, m, g, 'LR'));
      add(`no dir ${g}`, ST.setCompositeDirection(code, m, g, null));
    }
    for (const e of m.edges) {
      add(`label ${e.id}`, ST.relabelTransition(code, m, e.id, LABEL));
      add(`no label ${e.id}`, ST.relabelTransition(code, m, e.id, ''));
      add(`delete ${e.id}`, ST.deleteState(code, m, [{ kind: 'edge', id: e.id }]));
      for (const to of nodes.slice(0, 8)) for (const w of ['a', 'b'] as const) add(`reconnect ${e.id} ${w} ${to}`, ST.reconnectState(code, m, e.id, w, to));
    }
    for (const n of m.notes) {
      add(`note text ${n.id}`, ST.relabelNote(code, m, n.id, 'one\ntwo: three'));
      add(`note side ${n.id}`, ST.setNoteSide(code, m, n.id, n.side === 'left' ? 'right' : 'left'));
      add(`delete ${n.id}`, ST.deleteState(code, m, [{ kind: 'note', id: n.id }]));
    }
    add('direction', ST.setStateDirection(code, m, 'LR'));
    add('fragment', { code: ST.stateFragment(m, [...nodes, ...groups].map((id) => ({ kind: m.groups.has(id) ? 'group' as const : 'node' as const, id }))) });
    const failed: string[] = [];
    const t0 = Date.now();
    const seen = new Set<string>();
    let bad = 0;
    for (const bogus of ['stateDiagram-v2\n  a --> \n', 'stateDiagram-v2\n  state a {\n  click a href "x"\n  }\n', 'stateDiagram-v2\n  a --> b : x;y\n']) { try { await mermaidParse(bogus); } catch { bad++; } }
    console.log('bogus rejected', bad);
    for (const [name, out] of outs) {
      if (seen.has(out)) continue;
      seen.add(out);
      try {
        await mermaidParse(out);
      } catch (e) {
        failed.push(`${name}: ${String(e).split('\n').slice(0, 4).join(' | ')}`);
      }
    }
    console.log(file, outs.size, seen.size, Date.now() - t0, 'ms');
    expect(failed).toEqual([]);
  }, 120_000);
}
