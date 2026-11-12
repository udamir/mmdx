// Characterization of the state parser's phases (R2, BUG-003): branches the other parser tests do not reach, written
// before readState was split into prepare → statements → model → resolve over explicit StateRead / StateBuild records.
import { describe, expect, it } from 'vitest';
import { parseState } from '../../../src/core/kinds/state/parse.js';
import type { StateModel } from '../../../src/core/model.js';

const diags = (m: StateModel): [string, number | undefined][] => m.diagnostics.map((d) => [d.code, d.range?.line]);

describe('state phases', () => {
  it('text before the header is reported, the header still read; a bad style is a warning', () => {
    const m = parseState('hello\nstateDiagram-v2\n  a --> b\n  style a fill:#f00,bogus\n');
    expect(diags(m)).toEqual([['state.syntax', 0], ['state.bad-style', 3]]);
    expect(m.headerLine).toBe(1);
    expect(m.nodes.get('a')?.style).toMatchObject({ fill: '#f00' });
  });

  it('a state that becomes a composite keeps its texts and order; a second block adds to it', () => {
    const m = parseState('stateDiagram-v2\n  X : first\n  y --> X\n  state X {\n    a\n    --\n    b\n  }\n  state X {\n    c\n  }\n');
    const g = m.groups.get('X')!;
    expect(g).toMatchObject({ label: 'first', order: 0, endLine: 7, regions: 2, children: ['a', 'b', 'c'] });
    expect(g.blocks.map((b) => [b.line, b.endLine, b.dividers])).toEqual([[3, 7, [5]], [8, 10, []]]);
    expect(m.nodes.get('b')).toMatchObject({ parent: 'X', region: 1 });
    expect(m.nodes.has('X')).toBe(false);
  });

  it('links, classes and styles apply after every state is known; classes without a classDef once', () => {
    const m = parseState('stateDiagram-v2\n  class a,b hot\n  click a href "https://x.test"\n  click b "https://y.test" "tip"\n  a --> b:::hot\n  style b color:red\n');
    expect(m.nodes.get('a')).toMatchObject({ classes: ['hot'], link: 'https://x.test' });
    expect(m.nodes.get('b')).toMatchObject({ classes: ['hot', 'hot'], link: 'https://y.test', tooltip: 'tip' });
    expect(m.undefinedClasses).toEqual([{ cls: 'hot', line: 4 }]);
  });
});
