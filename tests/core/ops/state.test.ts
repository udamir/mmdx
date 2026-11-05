// @vitest-environment jsdom
// Every state op over every item of the examples writes code stock Mermaid 12.2 and 11.17 read (T09.5). Transitions
// are connected between one state of each scope (and its pseudo-state) and each composite, and reconnected to one state
// of each scope: whether Mermaid accepts one depends on the scopes of its ends (core/ops/state.ts), so these ends cover
// the rules without parsing every pair.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { splitSource } from '../../../src/core/meta/index.js';
import * as ST from '../../../src/core/ops/state.js';
import { parseState } from '../../../src/core/parse/state.js';
import type { ItemRef } from '../../../src/core/types.js';
import { stockParse } from '../../helpers/mermaid.js';

const P = parseState;
const LABEL = 'Renamed "x"\nline two';
for (const file of ['order-lifecycle.mmdx', 'traffic-light.mmdx']) {
  /** Every op's output over the example, by name (only the ones that change the code). */
  const outputs = (): Map<string, string> => {
    const code = splitSource(readFileSync(join(__dirname, '../../../examples', file), 'utf8')).doc.code;
    const m = P(code);
    const outs = new Map<string, string>();
    const add = (name: string, r: { code: string } | null | undefined): void => void (r && r.code !== code && outs.set(name, r.code));
    const nodes = [...m.nodes.keys()], groups = [...m.groups.keys()];
    const scopes: ST.StateScope[] = [{ g: null, r: 0 }, ...groups.flatMap((g) => Array.from({ length: m.groups.get(g)!.regions }, (_, r) => ({ g, r })))];
    // one state of each scope (a pseudo-state where the scope has one), and every composite
    const perScope = scopes.flatMap((s) => {
      const inScope = nodes.filter((id) => { const t = ST.scopeOf(m, id); return t.g === s.g && t.r === s.r; });
      return [...new Set([inScope.find((id) => !id.includes('[*]')), inScope.find((id) => id.includes('[*]'))])].filter((x): x is string => !!x);
    });
    const targets = [...perScope, ...groups];
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
    }
    for (const from of targets) for (const to of targets) add(`connect ${from} ${to}`, ST.connectState(code, m, from, to, 'go: now'));
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
      for (const to of perScope.filter((x) => !x.includes('[*]'))) for (const w of ['a', 'b'] as const) add(`reconnect ${e.id} ${w} ${to}`, ST.reconnectState(code, m, e.id, w, to));
    }
    for (const n of m.notes) {
      add(`note text ${n.id}`, ST.relabelNote(code, m, n.id, 'one\ntwo: three'));
      add(`note side ${n.id}`, ST.setNoteSide(code, m, n.id, n.side === 'left' ? 'right' : 'left'));
      add(`delete ${n.id}`, ST.deleteState(code, m, [{ kind: 'note', id: n.id }]));
    }
    add('direction', ST.setStateDirection(code, m, 'LR'));
    add('fragment', { code: ST.stateFragment(m, [...nodes, ...groups].map((id) => ({ kind: m.groups.has(id) ? 'group' as const : 'node' as const, id }))) });
    return outs;
  };
  const outs = outputs();
  // the op families as separate tests: each output is parsed by both Mermaid versions (about 0.1 s a pair on this size)
  const FAMILIES: [string, RegExp][] = [
    ['add, kinds and direction', /^(add |start |kind |direction|dir |no dir |region )/],
    ['texts and notes', /^(relabel |rows |no rows |label |no label |note )/],
    ['delete, group and copies', /^(delete |group |ungroup |clone |fragment)/],
    ['transitions and links', /^(connect |reconnect |end after |link )/],
  ];
  it(`${file}: every output is named by one family`, () => {
    expect([...outs.keys()].filter((n) => !FAMILIES.some(([, re]) => re.test(n)))).toEqual([]);
  });
  for (const [family, re] of FAMILIES)
    it(`${file}: ${family}`, async () => {
      const failed: string[] = [];
      const seen = new Set<string>();
      for (const [name, out] of outs) {
        if (!re.test(name) || seen.has(out)) continue;
        seen.add(out);
        try {
          await stockParse(out);
        } catch (e) {
          failed.push(`${name}: ${String(e).split('\n').slice(0, 4).join(' | ')}`);
        }
      }
      expect(seen.size).toBeGreaterThan(0);
      expect(failed).toEqual([]);
    }, 90_000);
}
