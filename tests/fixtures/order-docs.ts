// Seeded random documents for the order walk tests (no dependency): the statements the walk moves past and the ones
// that make it parse (subgraphs and blocks, statements and descriptions over several lines, edge ids and their data,
// `;` lines, class / style / click lines, `[*]` and `--`, unbalanced ends), in every order.

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);
}

const pick = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;

type Form = (ind: string) => string;

/** `n` statements from `forms` with nested blocks (`open` / `mid` / `close` lines), most of them closed at the end. */
function doc(seed: number, header: string, forms: readonly Form[], open: readonly string[], mid: readonly string[], close: string): string {
  const r = rng(seed);
  const out = [header];
  let depth = 0;
  const n = 4 + Math.floor(r() * 14);
  for (let i = 0, g = 0; i < n; i++) {
    const ind = '  '.repeat(depth + 1), k = r();
    if (k < 0.08 && depth < 2) {
      out.push(ind + pick(r, open).replace('#', String(g++)));
      depth++;
    } else if (k < 0.11 && depth > 0 && mid.length) out.push('  '.repeat(depth) + pick(r, mid));
    else if (k < 0.15 && depth > 0) {
      out.push('  '.repeat(depth) + close);
      depth--;
    } else out.push(ind + pick(r, forms)(ind));
  }
  if (r() < 0.85) while (depth-- > 0) out.push('  '.repeat(depth + 1) + close);
  return out.join('\n') + (r() < 0.5 ? '\n' : '');
}

const ids = (r: () => number, list: readonly string[]) => (): string => pick(r, list);

export function randomFlowchart(seed: number): string {
  const id = ids(rng(seed * 31 + 1), ['A', 'B', 'C', 'D', 'E', 'F']);
  const forms: Form[] = [
    () => `${id()} --> ${id()}`, () => `${id()}[${id()}x] --> ${id()}`, () => `${id()} & ${id()} --> ${id()}`, () => `${id()} -->|l| ${id()}`, () => id(),
    () => `${id()}("r")`, () => `class ${id()},${id()} hot`, () => `style ${id()} fill:#f00`, () => 'classDef hot fill:#0f0', () => `click ${id()} "https://x.test"`,
    () => '%% note', () => '', () => `${id()} --> ${id()}; ${id()} --> ${id()}`, () => `${id()}:::hot --- ${id()} --> ${id()}`, () => 'direction LR',
    () => 'linkStyle 0 stroke:red', () => `${id()}@{ shape: rect }`, () => `${id()} --> ${id()}; class ${id()} hot`, (ind) => `accDescr {\n${ind}  about\n${ind}}`,
    (ind) => `${id()}@{ shape: rect,\n${ind}  label: "x" }`, () => `${id()} e${seed % 2 + 1}@--> ${id()}`, () => `e${seed % 3 + 1}@{ animate: true }`,
    (ind) => `${id()}["\`one\n${ind}two\`"] --> ${id()}`,
  ];
  return doc(seed, ['flowchart TB', 'flowchart LR', 'graph TD'][seed % 3]!, forms, ['subgraph S#', 'subgraph S# [T]'], [], 'end');
}

export function randomEr(seed: number): string {
  const id = ids(rng(seed * 37 + 2), ['A', 'B', 'C', 'D', 'E']);
  const forms: Form[] = [
    () => `${id()} ||--o{ ${id()} : has`, () => `${id()} }|..|{ ${id()} : uses`, () => id(), () => `${id()}[Alias]`, () => `class ${id()} hot`, () => `style ${id()} fill:red`,
    () => '%% c', () => '', () => `${id()} ||--|| ${id()} : x ${id()} ||--|| ${id()} : y`, () => `${id()} ||--o{ ${id()}`, () => 'direction LR', () => `${id()} { int x }`,
    (ind) => `${id()} {\n${ind}  int id PK\n${ind}  string name\n${ind}}`, (ind) => `accDescr {\n${ind}  about\n${ind}}`, (ind) => `${id()} ||--o{ ${id()} : "two\n${ind}lines"`,
  ];
  return doc(seed, 'erDiagram', forms, ['subgraph G#'], [], 'end');
}

export function randomSequence(seed: number): string {
  const id = ids(rng(seed * 41 + 3), ['A', 'B', 'C', 'D']);
  const forms: Form[] = [
    () => `${id()}->>${id()}: hi`, () => `${id()}-->>${id()}: back`, () => `${id()}->>+${id()}: on`, () => `${id()}-->>-${id()}: off`, () => `note over ${id()}: n`,
    () => `note right of ${id()}: r`, () => `activate ${id()}`, () => `deactivate ${id()}`, () => '%% c', () => '', () => `participant ${id()}`, () => `actor ${id()}`,
    () => 'autonumber', (ind) => `accDescr {\n${ind}  about\n${ind}}`, (ind) => `box Aqua Team\n${ind}  participant ${id()}\n${ind}end`,
  ];
  return doc(seed, 'sequenceDiagram', forms, ['loop every #', 'alt ok', 'opt maybe', 'par a', 'rect rgb(1,2,3)', 'critical c'], ['else no', 'and b', 'option o'], 'end');
}

export function randomState(seed: number): string {
  const id = ids(rng(seed * 43 + 4), ['a', 'b', 'c', 'd', '[*]']);
  const st = (): string => id().replace('[*]', 'a');
  const forms: Form[] = [
    () => `${id()} --> ${id()}`, () => `${id()} --> ${id()} : go`, () => `${st()} : text`, () => `note left of ${st()} : n`, (ind) => `note right of ${st()}\n${ind}  two\n${ind}end note`,
    () => '%% c', () => '', () => 'state x <<choice>>', () => `state "T" as ${st()}`, () => 'classDef hot fill:red', () => 'class a hot', (ind) => `accDescr {\n${ind}  d\n${ind}}`,
    (ind) => `${st()} -->\n${ind}${st()}`, (ind) => `${st()}\n${ind}: split`, (ind) => `state ${st()}\n${ind}{\n${ind}}`,
  ];
  return doc(seed, 'stateDiagram-v2', forms, ['state C# {'], ['--'], '}');
}
