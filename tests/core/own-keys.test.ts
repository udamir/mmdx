// Names from documents as record keys (core/own.ts): Mermaid accepts ids such as `__proto__`, `constructor` or
// `toString`, and `%%@` lines may name a preset kind, an id or a JSON key that way. None of them may write through
// Object.prototype (or a shared built-in), and each stays an ordinary entry of its record.
import { afterEach, describe, expect, it } from 'vitest';
import { createContext } from '../../src/core/context.js';
import { joinSource, normalizeMeta, splitSource } from '../../src/core/meta/index.js';
import { emptyMeta } from '../../src/core/meta/types.js';
import type { DiagramMeta } from '../../src/core/meta/types.js';
import { resetItemStyle, setStyle } from '../../src/core/ops/index.js';
import { ensure, getM } from '../../src/core/ops/meta-util.js';
import { swapParticipantX } from '../../src/core/ops/order.js';
import { own, ownOr, setOwn } from '../../src/core/own.js';
import { renderSource } from '../../src/core/pipeline.js';

const NAMES = ['__proto__', 'constructor', 'toString'] as const;
const PROTO_KEYS = Object.getOwnPropertyNames(Object.prototype);

afterEach(() => {
  // nothing leaked into the objects every page shares
  expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(PROTO_KEYS);
  const probe = {} as Record<string, unknown>;
  for (const k of ['polluted', 'x', 'fill', 'a', 'mine']) expect(probe[k], `Object.prototype.${k}`).toBeUndefined();
  expect(Object.hasOwn(Object, 'x')).toBe(false);
  expect(Object.hasOwn(Object.prototype.toString, 'x')).toBe(false);
});

const ownKeys = (o: object | undefined): string[] => Object.keys(o ?? {});

describe('own.ts helpers', () => {
  it('reads own entries only and writes __proto__ as a plain key', () => {
    const rec: Record<string, { v: number }> = {};
    for (const k of NAMES) expect(own(rec, k)).toBeUndefined();
    setOwn(rec, '__proto__', { v: 1 });
    expect(Object.getPrototypeOf(rec)).toBe(Object.prototype);
    expect(own(rec, '__proto__')).toEqual({ v: 1 });
    expect(ownOr(rec, 'toString', () => ({ v: 2 }))).toEqual({ v: 2 });
    expect(ownOr(rec, 'toString', () => ({ v: 3 }))).toEqual({ v: 2 });
    expect(JSON.parse(JSON.stringify(rec))).toEqual(rec);
    expect(ownKeys(rec)).toEqual(['__proto__', 'toString']);
  });
});

describe('%%@ lines', () => {
  it('a style kind named __proto__ or constructor stays an entry of meta.styles', () => {
    const src = 'flowchart LR\n  A --> B\n%%@ style.__proto__ polluted {"fill":"red"}\n%%@ style.constructor x {"fill":"blue"}\n';
    const { doc, diagnostics } = splitSource(src);
    expect(diagnostics).toEqual([]);
    expect(Object.getPrototypeOf(doc.meta.styles)).toBe(Object.prototype);
    expect(own(doc.meta.styles, '__proto__')).toEqual({ polluted: { fill: 'red' } });
    expect(own(doc.meta.styles, 'constructor')).toEqual({ x: { fill: 'blue' } });
    // and the lines survive a round-trip
    const out = joinSource(doc);
    expect(out).toContain('%%@ style.__proto__ polluted {"fill":"red"}');
    expect(out).toContain('%%@ style.constructor x {"fill":"blue"}');
  });

  it('an item id named __proto__, constructor or toString is an own entry of its collection', () => {
    const src = 'flowchart LR\n  A\n%%@ node __proto__ {"x":5}\n%%@ node constructor {"x":6}\n%%@ node toString {"x":7}\n';
    const { doc } = splitSource(src);
    const nodes = doc.meta.nodes!;
    expect(Object.getPrototypeOf(nodes)).toBe(Object.prototype);
    expect(ownKeys(nodes)).toEqual(['__proto__', 'constructor', 'toString']);
    expect(own(nodes, '__proto__')).toEqual({ x: 5 });
    expect((nodes as Record<string, unknown>)['x']).toBeUndefined();
    expect(joinSource(doc)).toContain('%%@ node __proto__ {"x":5}');
  });

  it('a __proto__ key inside the JSON is dropped with a diagnostic', () => {
    const src = 'flowchart LR\n  A\n%%@ node A {"__proto__":{"fill":"red"},"x":1,"attrs":{"__proto__":{"bold":true},"id":{"__proto__":{"a":1},"bold":true}}}\n';
    const { doc, diagnostics } = splitSource(src);
    const a = own(doc.meta.nodes, 'A')!;
    expect(Object.getPrototypeOf(a)).toBe(Object.prototype);
    expect(a.fill).toBeUndefined();
    expect(a.x).toBe(1);
    expect(own(a.attrs, '__proto__')).toEqual({ bold: true });
    expect(a.attrs?.['id']).toEqual({ bold: true });
    expect(diagnostics.map((d) => d.params?.['key'])).toEqual(['__proto__', 'attrs.id.__proto__']);
  });

  it('normalizeMeta keeps such names as plain entries', () => {
    const m = normalizeMeta(JSON.parse('{"styles":{"__proto__":{"a":{"fill":"red"}}},"nodes":{"__proto__":{"x":1},"toString":{"x":2}}}'));
    expect(Object.getPrototypeOf(m.styles)).toBe(Object.prototype);
    expect(own(m.styles, '__proto__')).toEqual({ a: { fill: 'red' } });
    expect(ownKeys(m.nodes)).toEqual(['__proto__', 'toString']);
  });
});

describe('metadata ops on items with such ids', () => {
  const refs = NAMES.map((id) => ({ kind: 'node' as const, id }));

  it('getM / ensure see own entries only', () => {
    const meta = emptyMeta();
    for (const r of refs) expect(getM(meta, r.kind, r.id)).toEqual({});
    for (const r of refs) ensure(meta, r.kind, r.id).x = 1;
    expect(ownKeys(meta.nodes)).toEqual([...NAMES]);
    for (const r of refs) expect(own(meta.nodes, r.id)).toEqual({ x: 1 });
  });

  it('setStyle and resetItemStyle write the item, not a shared object', () => {
    let meta: DiagramMeta = setStyle(emptyMeta(), refs, { fill: '#ff0000', x: 10 }).meta;
    for (const r of refs) expect(own(meta.nodes, r.id)).toEqual({ fill: '#ff0000', x: 10 });
    for (const r of refs) meta = resetItemStyle(meta, r).meta;
    for (const r of refs) expect(own(meta.nodes, r.id)).toEqual({ x: 10 });
  });

  it('participants trade places', () => {
    const meta = emptyMeta();
    swapParticipantX(meta, '__proto__', 'toString', new Map([['__proto__', { x: 10 }], ['toString', { x: 90 }]]));
    expect(meta.participants).toEqual({});
    meta.participants = {};
    setOwn(meta.participants, '__proto__', { x: 10 });
    swapParticipantX(meta, '__proto__', 'toString', new Map([['toString', { x: 90 }]]));
    expect(own(meta.participants, '__proto__')).toEqual({ x: 90 });
    expect(own(meta.participants, 'toString')).toEqual({ x: 10 });
  });
});

describe('rendering', () => {
  it('places items with such ids where their metadata says', () => {
    const src = [
      'flowchart LR',
      '  __proto__["P"] --> constructor["C"] --> toString["T"]',
      '%%@ node __proto__ {"x":100,"y":100}',
      '%%@ node constructor {"x":300,"y":100}',
      '%%@ node toString {"x":500,"y":100}',
    ].join('\n');
    const r = renderSource(src, createContext());
    const g = r.result.geom;
    expect(g.type).toBe('flowchart');
    if (g.type !== 'flowchart') return;
    expect(NAMES.map((id) => [g.nodes.get(id)?.x, g.nodes.get(id)?.y])).toEqual([[100, 100], [300, 100], [500, 100]]);
  });
});
