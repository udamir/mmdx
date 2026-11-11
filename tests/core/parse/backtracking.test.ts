// Long runs of one character (spaces above all) in a line: the parsers and the ops that read code line by line stay
// linear. The regexes these replace took seconds to minutes on such lines: `A-->` + 800 spaces + `B` ran 84 s in the
// activation check, a note line with 80 000 spaces 3.8 s in the parser. The bounds are generous; the scans take ~1 ms.
import { describe, expect, it } from 'vitest';
import { activationsBalanced } from '../../../src/core/ops/activations.js';
import { toggleActivation } from '../../../src/core/ops/index.js';
import { parseAttrLine, splitAttrComment } from '../../../src/core/kinds/er/parse.js';
import { parse } from '../../../src/core/parse/index.js';
import { lexDecl, lexMessage } from '../../../src/core/kinds/sequence/parse.js';
import { stripMermaidStyles } from '../../../src/core/strip-styles.js';

const SPACES = ' '.repeat(50_000);
const BOUND_MS = 500;
const fast = (f: () => unknown): void => {
  const t = performance.now();
  f();
  expect(performance.now() - t).toBeLessThan(BOUND_MS);
};

describe('linear on long runs of spaces', () => {
  it('the activation check', () => {
    fast(() => activationsBalanced(`sequenceDiagram\n  A-->${SPACES}B`));
    fast(() => activationsBalanced(`sequenceDiagram\n  A${SPACES}->>+B: x`));
  });

  it('a note line', () => fast(() => parse(`sequenceDiagram\n  Note over${SPACES}x`)));

  it('the + / - markers of a message', () => {
    const code = `sequenceDiagram\n  A${SPACES}->>B: call\n  B-->>A: reply\n`;
    const m = parse(code);
    if (m.type !== 'sequence') throw new Error('not a sequence diagram');
    const [a, b] = m.items.filter((x) => x.kind === 'message').map((x) => (x as { id: string }).id);
    let r: ReturnType<typeof toggleActivation> | undefined;
    fast(() => (r = toggleActivation(code, m, a!, b!)));
    expect(r?.code.split('\n').slice(1, 3)).toEqual([`  A${SPACES}->>+B: call`, '  B-->>-A: reply']);
  });

  it('an ER attribute typed in the editor', () => {
    fast(() => splitAttrComment(`int a${SPACES}b`));
    fast(() => parseAttrLine(`int a${SPACES}b`));
  });

  it('trailing spaces of the code', () => fast(() => stripMermaidStyles(`flowchart LR\n  A${SPACES}B${SPACES}`)));

  // T11 (S16): the sequence lexer's new tokens — half arrows, central connections, hyphenated ids, `@{…}`, `as`
  it.each(['-', '--', '/', '\\', '|', '()', '-|', '/|', '\\|-', '@{', ' as ', 'x', '-x', ' '])('runs of %j in a message and a declaration', (unit) => {
    const run = unit.repeat(Math.ceil(30_000 / unit.length));
    for (const line of [`A${run}->>B: x`, `A->>${run}B: x`, `A${run}`, `A-${run}`, `${run}->>B: x`, `A()${run}()B: x`]) {
      fast(() => lexMessage(line));
      fast(() => parse(`sequenceDiagram\n  ${line}`));
    }
    for (const line of [`participant A${run}`, `participant A${run}@{ "type": "queue" }`, `participant A@{${run}} as B`, `participant ${run} as B`, `create actor A${run}`]) {
      fast(() => lexDecl(line));
      fast(() => parse(`sequenceDiagram\n  ${line}`));
    }
  });

  it('random lines of the sequence tokens\' characters', () => {
    // a seeded generator: the same lines every run
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const ALPHABET = ['-', '>', '<', '/', '\\', '|', '(', ')', 'x', ')', ' ', 'A', ':', '+', '@', '{', '}', '"', 'as', ','];
    for (let k = 0; k < 40; k++) {
      let line = '';
      while (line.length < 4000) line += ALPHABET[Math.floor(rnd() * ALPHABET.length)];
      fast(() => lexMessage(line));
      fast(() => lexDecl(`participant ${line}`));
      fast(() => parse(`sequenceDiagram\n  ${line}\n  participant ${line}\n  link ${line}`));
    }
  });
});

describe('what the old regexes read stays the same', () => {
  it.each([
    ['int id (the key)', { head: 'int id', comment: 'the key' }],
    ['int id "the key"', { head: 'int id', comment: 'the key' }],
    ['INT(11) id', { head: 'INT(11) id', comment: '' }],
    ['a  (b) (c)', { head: 'a', comment: 'b) (c' }],
    ['"only quoted"', { head: '"only quoted"', comment: '' }],
    ['a "b" "c"', { head: 'a "b"', comment: 'c' }],
  ])('splitAttrComment(%j)', (text, want) => expect(splitAttrComment(text)).toEqual(want));

  it('the activation check reads messages like the parser', () => {
    expect(activationsBalanced('sequenceDiagram\n  A->>+B: x\n  B-->>-A: y')).toBe(true);
    expect(activationsBalanced('sequenceDiagram\n  B-->>-A: y')).toBe(false);
    expect(activationsBalanced('sequenceDiagram\n  activate A\n  deactivate A\n  deactivate A')).toBe(false);
    // `-->>` is one arrow: no target, so not a message (the old regex took `-->` with the target `>`)
    expect(activationsBalanced('sequenceDiagram\n  A-->>:-x')).toBe(true);
  });

  it('a note needs a target', () => {
    const m = parse('sequenceDiagram\n  A->>B: hi\n  note over   : text');
    expect(m.type === 'sequence' && m.participants.map((p) => p.id)).toEqual(['A', 'B']);
    expect(m.diagnostics.map((d) => d.code)).toEqual(['seq.cannot-parse']);
  });
});
