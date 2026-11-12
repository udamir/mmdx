// The sequence diff and its merged picture, characterized (BUG-011, task 4.6): the item changes and the merged items (ids, texts, the removed ones in place), metadata and status of the samples and of small cases — a removed item at the start, after a changed one, several in a row, notes between messages, a removed participant — pinned so that moving the diff and the merge onto the kit (diffAligned, keepRemoved, placeRemoved) changes nothing.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diffModels, mergeDiagrams } from '../../../src/core/diff/index.js';
import { splitSource } from '../../../src/core/meta/index.js';
import type { SequenceModel, SupportedModel } from '../../../src/core/model.js';
import { parse } from '../../../src/core/parse/index.js';

function run(before: string, after: string) {
  const [a, b] = [before, after].map((s) => splitSource(s).doc);
  const ma = parse(a!.code) as SupportedModel, mb = parse(b!.code) as SupportedModel;
  const diff = diffModels(ma, mb, a!.meta, b!.meta);
  const m = mergeDiagrams(diff, ma, mb, a!.meta, b!.meta)!;
  const s = m.model as SequenceModel;
  return {
    changes: diff.items.map((c) => `${c.status} ${c.kind}:${c.id}${c.beforeId ? ` <- ${c.beforeId}` : ''} ${c.label} [${c.fields.map((f) => f.field).join(',')}]`),
    participants: s.participants.map((p) => `${p.id} ${p.label}`),
    items: s.items.map((x) => `${x.kind}${'id' in x ? ` ${x.id}` : ''}${x.kind === 'message' || x.kind === 'note' ? ` ${x.text}` : ''}${x.kind === 'blockStart' ? ` ${x.label}` : ''}`),
    meta: m.meta,
    status: [...m.status].map(([k, c]) => `${k} ${c.status}`).sort(),
  };
}

const sample = (name: string): [string, string] => ['before', 'after'].map((s) => readFileSync(`apps/studio-site/diff-samples/${name}.${s}.mmd`, 'utf8')) as [string, string];

describe('sequence diff and merge (characterized)', () => {
  for (const name of ['sequence', 'seq-medium', 'seq-many']) it(`sample ${name}`, () => expect(run(...sample(name))).toMatchSnapshot());

  it('small cases', () => {
    const A = 'sequenceDiagram\n  participant A\n  participant B\n  participant C\n  A->>B: one\n  Note over A: n1\n  B->>C: two\n  C->>A: three\n  loop every day\n    A->>C: four\n  end\n  Note right of C: n2\n  A->>B: five\n';
    const cases: [string, string][] = [
      // the first message removed (no earlier item both have)
      [A, A.replace('  A->>B: one\n', '')],
      // removed after a changed message, and two in a row
      [A, A.replace('two', 'TWO').replace('  C->>A: three\n', '').replace('    A->>C: four\n', '')],
      // a note removed, a note and a message added, a block relabelled
      [A, A.replace('  Note over A: n1\n', '').replace('every day', 'every week').replace('  A->>B: five\n', '  Note left of A: n3\n  A->>B: five\n  B->>A: six\n')],
      // a participant removed with its messages, metadata carried
      [`${A}%%@ message ${'m3'} {"color":"#f00"}\n`, A.replace('  participant C\n', '').replace(/.*C.*\n/g, '')],
      // everything replaced
      [A, 'sequenceDiagram\n  X->>Y: other\n'],
    ];
    expect(cases.map(([a, b]) => run(a, b))).toMatchSnapshot();
  });
});
