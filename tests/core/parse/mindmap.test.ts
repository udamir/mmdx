// @vitest-environment jsdom
// The mindmap parser (T08.1): every row of the design's syntax table (§2), Mermaid's lexer quirks, the ids, the
// diagnostics and the settings; Mermaid's own docs samples (tests/fixtures/mermaid-docs/mindmap-*.mmd) and the
// examples parse as stock Mermaid 12.2 and 11.17 parses them — a source mmdx reads without errors is one Mermaid accepts, and
// one Mermaid rejects gets an mmdx error.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { splitSource } from '../../../src/core/meta/index.js';
import type { MindmapModel, MindNode } from '../../../src/core/model.js';
import { parse } from '../../../src/core/parse/index.js';
import { parseMindmap } from '../../../src/core/parse/mindmap.js';
import { detectType } from '../../../src/core/parse/dispatch.js';
import { stockParse } from '../../helpers/mermaid.js';

const P = parseMindmap;
const ROOT = join(__dirname, '../../..');
const FIXTURES = readdirSync(join(ROOT, 'tests/fixtures/mermaid-docs')).filter((f) => f.startsWith('mindmap-')).map((f) => ({ name: f, src: readFileSync(join(ROOT, 'tests/fixtures/mermaid-docs', f), 'utf8') }));
const EXAMPLES = ['product-mindmap.mmdx', 'study-notes.mmdx'].map((f) => ({ name: f, src: splitSource(readFileSync(join(ROOT, 'examples', f), 'utf8')).doc.code }));

let mermaidParse: (code: string) => Promise<unknown>;
beforeAll(async () => {
  mermaidParse = stockParse;
});
const mermaidOk = async (code: string): Promise<boolean> => {
  try {
    await mermaidParse(code);
    return true;
  } catch {
    return false;
  }
};
const errors = (m: MindmapModel): string[] => m.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
const node = (m: MindmapModel, label: string): MindNode => [...m.nodes.values()].find((n) => n.label === label)!;
const tree = (m: MindmapModel): string[] => [...m.nodes.values()].map((n) => `${'  '.repeat(n.depth)}${n.label}`);

describe('mindmap: the syntax table (§2)', () => {
  it('header (any case), frontmatter and init before it', () => {
    expect(detectType('mindmap\n  a')).toBe('mindmap');
    expect(detectType('MindMap\n  a')).toBe('mindmap');
    expect(detectType('---\ntitle: x\n---\n%%{init: {"theme": "dark"}}%%\nmindmap\n  a')).toBe('mindmap');
    expect(parse('MINDMAP\n  root').type).toBe('mindmap');
    expect(P('---\ntitle: x\n---\nmindmap\n  root').root).not.toBeNull();
  });

  it('the root is the first node; a second node at its indentation is an error, as in Mermaid', () => {
    const m = P('mindmap\n  root\n    a\n  b');
    expect(m.nodes.get(m.root!)!.label).toBe('root');
    expect(m.diagnostics.map((d) => [d.code, d.range?.line])).toEqual([['mm.second-root', 3]]);
    // still drawn (under the root) so the map does not lose it
    expect(node(m, 'b').parent).toBe(m.root);
  });

  it('hierarchy: the parent is the nearest earlier node with a smaller indentation; a tab is one character', () => {
    const m = P('mindmap\nRoot\n    A\n        B\n      C\n    D');
    expect(tree(m)).toEqual(['Root', '  A', '    B', '    C', '  D']);
    const t = P('mindmap\n\troot\n\t\ta\n  b');
    expect(node(t, 'b').parent).toBe(t.root);
    expect(node(t, 'a').indent).toBe(2);
  });

  it('id and text: id[text], or a bare line (its id is its text)', () => {
    const m = P('mindmap\n  root\n    api[The API]\n    Just text here');
    expect(node(m, 'The API')).toMatchObject({ id: 'api', written: 'api', shape: 'rect' });
    expect(node(m, 'Just text here')).toMatchObject({ written: null, shape: 'mm-default' });
  });

  it('quoted text keeps brackets; a bare quoted line keeps its quotes (Mermaid reads it as an id)', () => {
    const m = P('mindmap\n  root\n    a["text (with) brackets"]\n    "quoted"');
    expect(node(m, 'text (with) brackets')).toMatchObject({ quote: 'str', shape: 'rect' });
    expect(node(m, '"quoted"')).toMatchObject({ shape: 'mm-default' });
  });

  it('markdown strings over several lines, the indentation after a break dropped', () => {
    const m = P('mindmap\n  root\n    a["`**b** *i*\n      line`"]');
    expect(node(m, '**b** *i*\nline')).toMatchObject({ md: true, quote: 'md', line: 2, endLine: 3 });
  });

  it('the seven shapes, and the lexer quirks (`id(text(` is a cloud, `(-text-)` the default shape)', () => {
    const m = P('mindmap\n  root\n    a[s]\n    b(r)\n    c((c))\n    d))b((\n    e)k(\n    f{{h}}\n    g\n    h(x(\n    (-y-)\n    (-"z (1)"-)');
    const shapes = Object.fromEntries([...m.nodes.values()].map((n) => [n.label, n.shape]));
    expect(shapes).toEqual({ root: 'mm-default', s: 'rect', r: 'rounded', c: 'circle', b: 'bang', k: 'cloud', h: 'hexagon', g: 'mm-default', x: 'cloud', 'y-': 'mm-default', 'z (1)': 'mm-default' });
  });

  it('::icon(…) and :::classes attach to the node before them (whatever their indentation)', () => {
    const m = P('mindmap\n  root\n    a\n    ::icon(fa fa-book)\n  :::urgent large\n    b');
    expect(node(m, 'a')).toMatchObject({ icon: 'fa fa-book', classes: ['urgent', 'large'], line: 2, endLine: 4 });
    expect(m.diagnostics.map((d) => d.code)).toEqual(['mm.icon-not-drawn']);
  });

  it('fa:fa-x tokens, <br/>, emoji and %% comments', () => {
    const m = P('mindmap\n  root\n    %% a comment\n    a[fa:fa-book Book]\n    b[one<br/>two 🤓]');
    expect(node(m, 'fa:fa-book Book')).toBeTruthy();
    expect(node(m, 'one\ntwo 🤓')).toBeTruthy();
    expect(m.nodes.size).toBe(3);
  });

  it('`%%` in the middle of a node line is text, as Mermaid lexes it', () => {
    expect(node(P('mindmap\n  root %% x'), 'root %% x')).toBeTruthy();
  });

  it('config: colorBy and maxNodeWidth from the frontmatter or an init directive; layout ignored', () => {
    const fm = P('---\nconfig:\n  layout: tidy-tree\n  mindmap:\n    colorBy: depth\n    maxNodeWidth: 300\n---\nmindmap\n  root\n    a\n      b');
    expect([fm.colorBy, fm.maxNodeWidth, fm.config]).toEqual(['depth', 300, { colorBy: 'depth', maxNodeWidth: 300 }]);
    expect(node(fm, 'b').section).toBe(1);
    const init = P('%%{init: {"mindmap": {"maxNodeWidth": 120}}}%%\nmindmap\n  root');
    expect(init.maxNodeWidth).toBe(120);
    expect(P('mindmap\n  root').colorBy).toBe('branch');
  });

  it('not in Mermaid: classDef / style lines are nodes with a warning (Mermaid draws them as nodes)', () => {
    const m = P('mindmap\n  root\n    classDef hot fill:#f00\n    style a fill:#0f0');
    expect(m.nodes.size).toBe(3);
    expect(m.diagnostics.map((d) => d.code)).toEqual(['mm.classdef', 'mm.classdef']);
  });

  it('::icon or ::: before any node is an error (Mermaid fails on it)', () => {
    expect(errors(P('mindmap\n::icon(fa fa-book)\n  root'))).toEqual(['mm.dangling']);
  });

  it('lines Mermaid cannot read are errors; the rest of the map is still read', () => {
    const m = P('mindmap\n  root\n    a[x (y) z]\n    b{c}\n    c[]\n    d[t] tail\n    e');
    expect(errors(m)).toEqual(['mm.syntax', 'mm.syntax', 'mm.syntax', 'mm.syntax']);
    expect(tree(m)).toEqual(['root', '  e']);
  });
});

describe('mindmap: ids, sections, the indentation step', () => {
  it('a unique written id is the id; bare lines and repeated ids are mm<k> by their place in the code', () => {
    const m = P('mindmap\n  root((Topic))\n    a[One]\n    a[Two]\n    Notes\n    b[Three]');
    expect([...m.nodes.keys()]).toEqual(['root', 'mm2', 'mm3', 'mm4', 'b']);
    // an mm<k> written as an id keeps its own id; the positional one steps aside
    const c = P('mindmap\n  mm2[Written]\n    Bare');
    expect([...c.nodes.keys()]).toEqual(['mm2', 'mm2_2']);
  });

  it("sections: each first-level branch starts one (i % 11, Mermaid's), its subtree follows; by depth with colorBy", () => {
    const src = `mindmap\n  root\n${Array.from({ length: 12 }, (_, i) => `    n${i}\n      k${i}`).join('\n')}`;
    const m = P(src);
    expect(node(m, 'n0').section).toBe(0);
    expect(node(m, 'k3').section).toBe(3);
    expect(node(m, 'n11').section).toBe(0);
    expect(m.nodes.get(m.root!)!.section).toBe(-1);
  });

  it('the indentation step is the one the file uses', () => {
    expect(P('mindmap\n  root\n    a').indentUnit).toBe('  ');
    expect(P('mindmap\nroot\n    a\n        b').indentUnit).toBe('    ');
    expect(P('mindmap\n\troot\n\t\ta').indentUnit).toBe('\t');
  });
});

describe('mindmap: agreement with stock Mermaid 12.2 and 11.17', () => {
  const corpus: { name: string; src: string }[] = [
    ...FIXTURES,
    ...EXAMPLES,
    { name: 'shapes and quirks', src: 'mindmap\n  root\n    a[s]\n    b(r)\n    c((c))\n    d))b((\n    e)c(\n    f{{h}}\n    g\n    h(x(\n    (-y-)\n    (-"z (1)"-)\n    i(-"q"-)' },
    { name: 'markdown', src: 'mindmap\n  root\n    a["`**b** *i*\n      line`"]' },
    { name: 'quoted', src: 'mindmap\n  root\n    a["x (y) z"]\n    "quoted"' },
    { name: 'tabs', src: 'mindmap\n\troot\n\t\ta\n  b' },
    { name: 'one line', src: 'mindmap root' },
    { name: 'second root', src: 'mindmap\n  root\n  c' },
    { name: 'dangling icon', src: 'mindmap\n::icon(fa fa-book)\n  root' },
    { name: 'brackets in text', src: 'mindmap\n  root\n    a[x (y) z]' },
    { name: 'lone brace', src: 'mindmap\n  root\n    a{b}' },
    { name: 'empty brackets', src: 'mindmap\n  root\n    a[]' },
    { name: 'text after brackets', src: 'mindmap\n  root\n    a[t] tail' },
    { name: 'quote in quotes', src: 'mindmap\n  root\n    a["x"y"]' },
    { name: 'classDef line', src: 'mindmap\n  root\n    classDef x fill:#f00' },
    { name: 'frontmatter', src: '---\nconfig:\n  mindmap:\n    colorBy: depth\n---\nmindmap\n  root\n    a' },
  ];
  for (const c of corpus)
    it(c.name, async () => {
      const ok = await mermaidOk(c.src);
      expect(errors(P(c.src)).length === 0, `mermaid ${ok ? 'accepts' : 'rejects'}: ${c.src}`).toBe(ok);
    });

  it("the docs samples read as Mermaid's docs describe them", () => {
    const basic = P(FIXTURES.find((f) => f.name === 'mindmap-basic.mmd')!.src);
    expect(node(basic, 'Long history').icon).toBe('fa fa-book');
    expect(node(basic, 'Creative techniques').depth).toBe(4);
    expect(node(basic, 'On effectiveness\nand features')).toBeTruthy();
    const unclear = P(FIXTURES.find((f) => f.name === 'mindmap-unclear-indentation.mmd')!.src);
    expect(tree(unclear)).toEqual(['Root', '  A', '    B', '    C']);
    const md = P(FIXTURES.find((f) => f.name === 'mindmap-markdown.mmd')!.src);
    expect(md.nodes.get('id1')).toMatchObject({ md: true, label: '**Root** with\na second line\nUnicode works too: 🤓' });
  });
});
