// Small core fixes of the codebase audit (task 1.14): B32, B33, B38, B39.
import { describe, expect, it } from 'vitest';
import { parse } from '../../src/core/parse/index.js';
import { renameClashingSubgraph } from '../../src/core/kinds/flowchart/parse.js';
import { decodeLabel } from '../../src/core/parse/label.js';
import { hexToRgb } from '../../src/core/theme/colors.js';
import { MARK } from '../../src/core/text/marks.js';
import { remapMindMeta } from '../../src/core/kinds/mindmap/ops.js';
import { emptyMeta } from '../../src/core/meta/types.js';

describe('B32: ids from the document are never plain assignments', () => {
  it('a mindmap metadata entry named __proto__ stays an own entry', () => {
    const model = parse('mindmap\n  root\n    A\n');
    const meta = { ...emptyMeta(), nodes: JSON.parse('{"__proto__": {"fill": "#f00"}}') };
    const out = remapMindMeta(meta, model as never, model as never);
    expect(Object.getPrototypeOf(out.nodes)).toBe(Object.prototype);
    expect(Object.hasOwn(out.nodes!, '__proto__')).toBe(true);
  });
});

describe('B33: renaming a clashing subgraph finds a non-ASCII id\'s metadata', () => {
  it('moves the %%@ group line of a non-ASCII id', () => {
    const code = 'flowchart LR\n  subgraph Ünit[Group]\n    A\n  end\n  A --> Ünit["n"]\n%%@ group Ünit {"fill":"#f00"}\n';
    const out = renameClashingSubgraph(code, 'Ünit');
    expect(out).toContain('%%@ group Ünit_group {"fill":"#f00"}');
  });
});

describe('B38: a label cannot fake a diff mark', () => {
  it('mark characters are taken out, written or encoded', () => {
    expect(decodeLabel(`a${MARK.DEL_OPEN}b${MARK.DEL_CLOSE}c`)).toBe('abc');
    expect(decodeLabel(`a#${0xfdd2};b`)).toBe('ab');
    const m = parse(`flowchart LR\n  A["x${MARK.INS_OPEN}y"]\n`);
    expect(m.type === 'flowchart' && m.nodes.get('A')?.label).toBe('xy');
  });
});

describe('B39: hexToRgb reads every hex form validate.ts accepts', () => {
  it('4 and 8 digits (alpha ignored)', () => {
    expect(hexToRgb('#11223344')).toEqual([0x11, 0x22, 0x33]);
    expect(hexToRgb('#1234')).toEqual([0x11, 0x22, 0x33]);
    expect(hexToRgb('#112233')).toEqual([0x11, 0x22, 0x33]);
    expect(hexToRgb('#12345')).toBeNull();
  });
});
