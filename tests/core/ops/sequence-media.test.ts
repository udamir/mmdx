// @vitest-environment jsdom
// Sequence participant types and icons as code (T10.2): Mermaid's 8 types written as Mermaid writes them (`actor` and
// `participant` as the keyword, the other six as `@{ "type": … }`, the rest of the declaration kept), a declaration
// added where an undeclared participant is first mentioned (the order Mermaid draws stays), the ids Mermaid 11.17
// cannot give a block refused, icon tokens in the alias. Every output is read by stock Mermaid 12.2 and 11.17, and the
// parser reads the type back as the participant's shape.
import { describe, expect, it } from 'vitest';
import { addParticipant, relabelSeq, setParticipantType } from '../../../src/core/ops/index.js';
import { withIconToken } from '../../../src/core/ops/icon-token.js';
import { PARTICIPANT_TYPES, typeShape, type ParticipantType } from '../../../src/core/parse/sequence.js';
import { stockParse } from '../../helpers/mermaid.js';
import { EXAMPLES, seq } from './helpers.js';

const line = (code: string, i: number): string => code.split('\n')[i] ?? '';
const shapeOf = (code: string, id: string): string => {
  const p = seq(code).participants.find((x) => x.id === id)!;
  return p.shape ?? (p.kind === 'actor' ? 'actor' : 'box');
};

describe('the type is written as Mermaid writes it', () => {
  const set = (decl: string, type: ParticipantType): string => {
    const code = `sequenceDiagram\n  ${decl}\n  B->>A: hi\n`;
    return line(setParticipantType(code, seq(code), 'A', type)!.code, 1).trim();
  };
  it.each([
    ['participant A', 'boundary', 'participant A@{ "type": "boundary" }'],
    ['participant A as Al', 'control', 'participant A@{ "type": "control" } as Al'],
    ['actor A', 'entity', 'participant A@{ "type": "entity" }'],
    ['actor A as Al', 'participant', 'participant A as Al'],
    ['participant A', 'actor', 'actor A'],
    ['participant A@{ "type": "database" }', 'queue', 'participant A@{ "type": "queue" }'],
    ['participant A@{ type: database }', 'queue', 'participant A@{ type: queue }'],
    ['participant A@{ "alias": "Al" }', 'collections', 'participant A@{ "alias": "Al", "type": "collections" }'],
    ['participant A@{ alias: Al }', 'collections', 'participant A@{ alias: Al, type: collections }'],
    ['participant A@{ "type": "database" }', 'actor', 'actor A'],
    ['participant A@{ "type": "database" } as Store', 'participant', 'participant A as Store'],
    ['participant A@{ "type": "database", "alias": "Al" }', 'participant', 'participant A@{ "alias": "Al" }'],
    ['actor A@{ "type": "queue" }', 'actor', 'actor A'],
    ['participant A as fa:fa-user Al', 'actor', 'actor A as fa:fa-user Al'],
    // the keyword's case is kept when it stays
    ['PARTICIPANT A', 'entity', 'PARTICIPANT A@{ "type": "entity" }'],
  ] as const)('%s → %s', async (decl, type, want) => {
    const got = set(decl, type);
    expect(got).toBe(want);
    const out = `sequenceDiagram\n  ${got}\n  B->>A: hi\n`;
    expect(shapeOf(out, 'A')).toBe(typeShape(type));
    await stockParse(out);
  });

  it('create keeps its place; the same type changes nothing', async () => {
    const code = 'sequenceDiagram\n  participant B\n  create participant A as Job\n  B->>A: start\n';
    const out = setParticipantType(code, seq(code), 'A', 'control')!.code;
    expect(line(out, 2)).toBe('  create participant A@{ "type": "control" } as Job');
    expect(seq(out).participants.find((p) => p.id === 'A')!.createdBy).toBe('m1');
    await stockParse(out);
    expect(setParticipantType(out, seq(out), 'A', 'control')!.code).toBe(out);
  });

  it('an id Mermaid 11.17 gives no block (a hyphen, `=`) keeps the type out of the code: null', async () => {
    const code = 'sequenceDiagram\n  participant my-svc\n  my-svc->>B: hi\n';
    expect(setParticipantType(code, seq(code), 'my-svc', 'boundary')).toBeNull();
    expect(setParticipantType(code, seq(code), 'B', 'boundary')).not.toBeNull();
    // the keyword can still write an actor
    const out = setParticipantType(code, seq(code), 'my-svc', 'actor')!.code;
    expect(line(out, 1)).toBe('  actor my-svc');
    await stockParse(out);
    const bare = 'sequenceDiagram\n  my-svc->>B: hi\n';
    expect(setParticipantType(bare, seq(bare), 'my-svc', 'queue')).toBeNull();
  });
});

describe('a participant without a declaration gets one where it is first mentioned', () => {
  it('the participants mentioned before it on that line are declared too: the order stays', async () => {
    const code = 'sequenceDiagram\n  autonumber\n  A->>B: hi\n  B->>C: on\n';
    const b = setParticipantType(code, seq(code), 'B', 'database')!.code;
    expect(b).toBe('sequenceDiagram\n  autonumber\n  participant A\n  participant B@{ "type": "database" }\n  A->>B: hi\n  B->>C: on\n');
    const c = setParticipantType(code, seq(code), 'C', 'actor')!.code;
    // B is mentioned before that line: it stays as it is
    expect(c).toBe('sequenceDiagram\n  autonumber\n  A->>B: hi\n  actor C\n  B->>C: on\n');
    for (const out of [b, c]) {
      expect(seq(out).participants.map((p) => p.id)).toEqual(['A', 'B', 'C']);
      await stockParse(out);
    }
    // the box needs no declaration
    expect(setParticipantType(code, seq(code), 'A', 'participant')!.code).toBe(code);
  });

  it('inside a block, indented as the line', async () => {
    const code = 'sequenceDiagram\n  participant A\n  loop every minute\n    A->>B: ping\n  end\n';
    const out = setParticipantType(code, seq(code), 'B', 'queue')!.code;
    expect(line(out, 3)).toBe('    participant B@{ "type": "queue" }');
    await stockParse(out);
  });

  it('a rename too (it used to go after the last declaration, ahead of the participants before it)', async () => {
    const code = 'sequenceDiagram\n  A->>B: hi\n';
    const out = relabelSeq(code, seq(code), { kind: 'participant', id: 'B' }, 'Bob').code;
    expect(out).toBe('sequenceDiagram\n  participant A\n  participant B as Bob\n  A->>B: hi\n');
    expect(seq(out).participants.map((p) => p.label)).toEqual(['A', 'Bob']);
    await stockParse(out);
  });
});

describe('icons are tokens at the start of the name', () => {
  const icon = (decl: string, name: string | null): string => {
    const code = `sequenceDiagram\n  ${decl}\n  B->>A: hi\n`;
    const M = seq(code);
    const p = M.participants.find((x) => x.id === 'A')!;
    return line(relabelSeq(code, M, { kind: 'participant', id: 'A' }, withIconToken(p.label, name)).code, 1).trim();
  };
  it.each([
    ['participant A', 'fa:user', 'participant A as fa:fa-user A'],
    ['participant A as Alice', 'fa:user', 'participant A as fa:fa-user Alice'],
    ['participant A as fa:fa-user Alice', 'fa:car', 'participant A as fa:fa-car Alice'],
    ['participant A as fa:fa-user Alice', null, 'participant A as Alice'],
    ['participant A as fa:fa-user A', null, 'participant A'],
    ['participant A@{ "alias": "Alice" }', 'fa:user', 'participant A@{ "alias": "fa:fa-user Alice" }'],
    ['actor A@{ "type": "boundary" }', 'tabler:user', 'actor A@{ "type": "boundary" } as tabler:user A'],
  ] as const)('%s + %s → %s', async (decl, name, want) => {
    const got = icon(decl, name);
    expect(got).toBe(want);
    await stockParse(`sequenceDiagram\n  ${got}\n  B->>A: hi\n`);
  });
});

describe('adding a participant of a type', () => {
  it('the palette\'s database is code', async () => {
    const code = 'sequenceDiagram\n  participant A\n  A->>A: hi\n';
    const r = addParticipant(code, seq(code), { type: 'database' });
    expect(r.code).toContain('participant P1@{ "type": "database" }');
    expect(shapeOf(r.code, 'P1')).toBe('database');
    await stockParse(r.code);
  });
});

describe('every type on every participant of the examples', () => {
  for (const ex of EXAMPLES.filter((x) => /^\s*sequenceDiagram/m.test(x.code)))
    it(ex.name, async () => {
      const M = seq(ex.code);
      for (const p of M.participants)
        for (const type of PARTICIPANT_TYPES) {
          const r = setParticipantType(ex.code, M, p.id, type);
          if (!r) continue;
          const N = seq(r.code);
          expect(shapeOf(r.code, p.id), `${p.id} ${type}`).toBe(typeShape(type));
          expect(N.participants.map((x) => x.id)).toEqual(M.participants.map((x) => x.id));
          await stockParse(r.code);
        }
    });
});
