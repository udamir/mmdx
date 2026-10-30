import { describe, it, expect } from 'vitest';
import { parse } from '../../../src/core/parse/index.js';
import type { DiagramModel } from '../../../src/core/model.js';

const dump = (m: DiagramModel): string =>
  JSON.stringify(m, (_k, v: unknown) => (v instanceof Map ? [...v.entries()] : v instanceof Set ? [...v] : v));

describe('style values that inject markup are dropped (§12)', () => {
  it.each([
    ['flowchart LR\n  A\n  style A fill:x" onmouseover="alert(1)"', 'onmouseover'],
    ['flowchart LR\n  A:::c\n  classDef c fill:url(javascript:alert(1))', 'javascript'],
    ['flowchart LR\n  A --> B\n  linkStyle 0 stroke:red"/><script>alert(1)</script>', 'script'],
    ['flowchart LR\n  A\n  style A stroke-width:2" onload="x', 'onload'],
    ['flowchart LR\n  A\n  style A stroke-dasharray:1 expression(alert(1))', 'expression'],
    ['flowchart LR\n  A\n  style A font-size:12px" style="x', 'style='],
    ['flowchart LR\n  subgraph G\n  end\n  style G color:</style><b>', '</style>'],
  ])('%s', (code, needle) => {
    const m = parse(code);
    expect(dump({ ...m, diagnostics: [] } as DiagramModel)).not.toContain(needle);
    expect(m.diagnostics.some((d) => d.code === 'flow.bad-style' && d.severity === 'warning')).toBe(true);
  });

  it('rect <script> keeps no colour', () => {
    const m = parse('sequenceDiagram\n  rect <script>alert(1)</script>\n  A->>B: x\n  end');
    expect(dump({ ...m, diagnostics: [] } as DiagramModel)).not.toContain('script');
    expect(m.type === 'sequence' && m.items[0]?.kind === 'blockStart' && m.items[0].color).toBeNull();
    expect(m.diagnostics.map((d) => d.code)).toEqual(['seq.bad-color']);
  });

  it('box rgb(1,2,3"onload=x) keeps no colour', () => {
    const m = parse('sequenceDiagram\n  box rgb(1,2,3"onload=x)\n  participant A\n  end');
    expect(m.type === 'sequence' && m.boxes[0]?.color).toBeNull();
    expect(dump({ ...m, diagnostics: [] } as DiagramModel)).not.toContain('onload');
    expect(m.diagnostics.map((d) => d.code)).toEqual(['seq.bad-color']);
  });

  it('click links stay raw but lose control characters', () => {
    const m = parse('flowchart LR\n  A\n  click A "jav\u0001a\u007fscript:alert(1)"');
    expect(m.type === 'flowchart' && m.nodes.get('A')?.link).toBe('javascript:alert(1)');
  });
});
