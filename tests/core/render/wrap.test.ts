import { describe, expect, it } from 'vitest';
import { createContext } from '../../../src/core/context.js';
import { renderSource } from '../../../src/core/pipeline.js';
import { checkMetaLine } from '../../../src/core/meta/index.js';

const LABEL = 'A rather long label that needs several lines';
const render = (meta: string) => {
  const r = renderSource(`flowchart LR\n  a["${LABEL}"]\n${meta}`, createContext());
  if (r.result.geom.type !== 'flowchart') throw new Error('not a flowchart');
  const box = r.result.geom.nodes.get('a')!;
  const tspans = (JSON.stringify(r.result.body).match(/"text":"[^"]*"/g) ?? []).length;
  return { box, tspans };
};

describe('word wrap', () => {
  it('off: one line, the shape grows wide', () => {
    const { box, tspans } = render('');
    expect(tspans).toBe(1);
    expect(box.w).toBeGreaterThan(300);
  });

  it('on with a set width: lines fit the width and the shape grows taller', () => {
    const plain = render('%%@ node a {"w":140,"h":56}');
    const wrapped = render('%%@ node a {"w":140,"h":56,"wrap":true}');
    expect(plain.tspans).toBe(1);
    expect(wrapped.tspans).toBeGreaterThanOrEqual(3);
    expect(wrapped.box.w).toBe(140);
    expect(wrapped.box.h).toBeGreaterThan(56);
  });

  it('on without a width: wraps to 200 and the shape fits the text', () => {
    const { box, tspans } = render('%%@ node a {"wrap":true}');
    expect(tspans).toBeGreaterThanOrEqual(2);
    expect(box.w).toBeLessThanOrEqual(200 + 1);
  });

  it('explicit line breaks are kept', () => {
    const r = renderSource('flowchart LR\n  a["one<br>two"]\n%%@ node a {"w":300,"wrap":true}', createContext());
    expect((JSON.stringify(r.result.body).match(/"text":"(one|two)"/g) ?? []).length).toBe(2);
  });

  it('a non-boolean wrap value is dropped by the metadata validator', () => {
    const c = checkMetaLine('%%@ node a {"wrap":"yes"}');
    expect(c && 'data' in c ? (c.data as Record<string, unknown>)['wrap'] : 'gone').toBeUndefined();
  });

  it('participants: lines fit the width and the head grows taller to fit them', () => {
    const seq = (meta: string) => {
      const r = renderSource(`sequenceDiagram\n  participant A as ${LABEL}\n  participant B\n  A->>B: hi\n${meta}`, createContext());
      if (r.result.geom.type !== 'sequence') throw new Error('not a sequence diagram');
      const part = r.result.body.find((n) => n.t === 'g' && n.attrs?.['data-id'] === 'A');
      const tspans = (JSON.stringify(part).match(/"text":"[^"]*"/g) ?? []).length;
      return { box: r.result.geom.participants.get('A')!, tspans };
    };
    const plain = seq('%%@ participant A {"w":140,"h":40}');
    const wrapped = seq('%%@ participant A {"w":140,"h":40,"wrap":true}');
    expect(plain.tspans).toBe(1);
    expect(wrapped.tspans).toBeGreaterThanOrEqual(3);
    expect(wrapped.box.w).toBe(140);
    expect(wrapped.box.h).toBeGreaterThan(40);
  });
});
