// The shared line helpers of the source rewrites (X8, BUG-012): one indentation step is two spaces or a tab in every type's ungroup, a moved block keeps its inner indentation, and the direction lines of ER and state diagrams are written by one pair of helpers.
import { describe, expect, it } from 'vitest';
import { appendLine, blockDirection, outdentBlock, outdentLine, reindentBlock, setDirectionLine } from '../../../src/core/ops/lines.js';
import { ungroupFlow } from '../../../src/core/kinds/flowchart/ops.js';
import { parseFlowchart } from '../../../src/core/kinds/flowchart/parse.js';
import { unboxParticipants } from '../../../src/core/kinds/sequence/ops.js';
import { parseSequence } from '../../../src/core/kinds/sequence/parse.js';
import { setErGroupDirection, ungroupER } from '../../../src/core/kinds/er/ops.js';
import { parseER } from '../../../src/core/kinds/er/parse.js';
import { setCompositeDirection, ungroupState } from '../../../src/core/kinds/state/ops.js';
import { parseState } from '../../../src/core/kinds/state/parse.js';

describe('the helpers', () => {
  it('outdent: two spaces or a tab, once', () => {
    expect(outdentBlock(['    a', '\t\tb', ' c', 'd', ''])).toEqual(['  a', '\tb', ' c', 'd', '']);
    expect(outdentLine('\t  x')).toBe('  x');
  });

  it('reindent: the block\'s own indentation replaced, deeper lines keep the rest, blank lines blank', () => {
    expect(reindentBlock(['  subgraph A', '    x', '', '  end'], '  ', '      ')).toEqual(['      subgraph A', '        x', '', '      end']);
    expect(reindentBlock(['\tA', '\t\tB', 'C'], '\t', '  ')).toEqual(['  A', '  \tB', '  C']);
    // a first line cut after its indentation (a statement's text)
    expect(reindentBlock(['T {', '      a int', '    }'], '    ', '  ')).toEqual(['  T {', '    a int', '  }']);
  });

  it('appendLine: after the last non-blank line, with its number', () => {
    expect(appendLine('flowchart LR\n  A\n\n', '  B')).toEqual({ code: 'flowchart LR\n  A\n  B\n', line: 2 });
  });

  it('direction lines: rewritten in place (the rest of the line kept), added, removed', () => {
    expect(setDirectionLine('erDiagram\n  direction TB\n  A', 1, 0, 'LR')).toBe('erDiagram\n  direction LR\n  A');
    expect(setDirectionLine('erDiagram\n  A', undefined, 0, 'LR')).toBe('erDiagram\n  direction LR\n  A');
    expect(setDirectionLine('A', undefined, -1, 'LR')).toBe('A');
    const L = ['state X {', '    direction TB %% c', '    a', '}'];
    expect(blockDirection(L, [1], 1, '  ', 'LR')).toEqual([{ at: 1, del: 1, ins: ['    direction LR %% c'] }]);
    expect(blockDirection(L, [1], 1, '  ', null)).toEqual([{ at: 1, del: 1, ins: [] }]);
    expect(blockDirection(L, [], 1, '    ', 'RL')).toEqual([{ at: 1, del: 0, ins: ['    direction RL'] }]);
    expect(blockDirection(L, [], 1, '    ', null)).toEqual([]);
  });
});

describe('ungroup in every type: a tab-indented block moves one step left', () => {
  it('flowchart', () => {
    const code = 'flowchart LR\n\tsubgraph G\n\t\tA --> B\n\tend';
    expect(ungroupFlow(code, parseFlowchart(code), 'G').code).toBe('flowchart LR\n\tA --> B');
  });

  it('sequence', () => {
    const code = 'sequenceDiagram\n\tbox Team\n\t\tparticipant A\n\tend\n\tA->>A: hi';
    expect(unboxParticipants(code, parseSequence(code), 'box1').code).toBe('sequenceDiagram\n\tparticipant A\n\tA->>A: hi');
  });

  it('ER', () => {
    const code = 'erDiagram\n\tsubgraph G\n\t\tA\n\tend';
    expect(ungroupER(code, parseER(code), 'G').code).toBe('erDiagram\n\tA\n');
  });

  it('state', () => {
    const code = 'stateDiagram-v2\n\tstate X {\n\t\ta --> b\n\t}';
    expect(ungroupState(code, parseState(code), 'X').code).toBe('stateDiagram-v2\n\ta --> b');
  });
});

describe('a block\'s direction (ER subgraph, state composite)', () => {
  it('ER: every own direction line rewritten, none of an inner subgraph\'s; added; removed', () => {
    const code = 'erDiagram\n  subgraph G\n    direction TB\n    subgraph H\n      direction BT\n      A\n    end\n  end';
    const m = parseER(code);
    expect(setErGroupDirection(code, m, 'G', 'LR').code).toBe(code.replace('direction TB', 'direction LR'));
    expect(setErGroupDirection(code, m, 'G', null).code).toBe(code.replace('    direction TB\n', ''));
    const bare = 'erDiagram\n  subgraph G\n    A\n  end';
    expect(setErGroupDirection(bare, parseER(bare), 'G', 'RL').code).toBe('erDiagram\n  subgraph G\n    direction RL\n    A\n  end');
  });

  it('state: the composite\'s line rewritten, added, removed', () => {
    const code = 'stateDiagram-v2\n  state X {\n    direction TB\n    a --> b\n  }';
    const m = parseState(code);
    expect(setCompositeDirection(code, m, 'X', 'LR').code).toBe(code.replace('direction TB', 'direction LR'));
    expect(setCompositeDirection(code, m, 'X', null).code).toBe(code.replace('    direction TB\n', ''));
    const bare = 'stateDiagram-v2\n  state X {\n    a --> b\n  }';
    expect(setCompositeDirection(bare, parseState(bare), 'X', 'RL').code).toBe('stateDiagram-v2\n  state X {\n    direction RL\n    a --> b\n  }');
  });
});
