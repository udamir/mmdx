// Rich text runs (T03): the markdown inline parser, the icon token hook, run-aware measuring and wrapping, the drawn
// lines (goldens: a markdown label with bold, italic and wrapping; a label with an inline icon; changed words inside
// bold text in the merged diff picture).
import { describe, expect, it } from 'vitest';
import { annotate } from '../../../src/core/diff/annotate.js';
import { svgImageUrl } from '../../../src/core/media/svg-url.js';
import { itemGroup } from '../../../src/core/render/common.js';
import { richText } from '../../../src/core/render/rich-text.js';
import type { RenderResult } from '../../../src/core/render/types.js';
import { serializeNodes } from '../../../src/core/scene/serialize.js';
import type { TextRun } from '../../../src/core/scene/types.js';
import { deleted, inserted, markStyledRuns, withoutMarks } from '../../../src/core/text/marks.js';
import { createStaticMeasurer, type FontSpec } from '../../../src/core/text/measure.js';
import { parseInline, runFont, runsLabel, runsText, runsWidth, wrapRuns, type IconResolver } from '../../../src/core/text/rich.js';
import { wrap } from '../../../src/core/text/wrap.js';

const measure = createStaticMeasurer();
const font: FontSpec = { size: 14, weight: 400, family: 'Inter, sans-serif' };
const md = (s: string): TextRun[] => parseInline(s, { markdown: true });
/** Runs as compact strings: `**b**`, `*i*`, `***bi***`, `[icon]`. */
const show = (runs: readonly TextRun[]): string[] => runs.map((r) => (r.icon ? `[${r.icon.name}]` : r.bold && r.italic ? `***${r.text}***` : r.bold ? `**${r.text}**` : r.italic ? `*${r.text}*` : r.text));

const CAR = svgImageUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 12h18"/></svg>');
const icons: IconResolver = (t) => (t === 'fa:fa-car' || t === 'tabler:car' ? { href: CAR, name: 'car' } : null);

describe('parseInline', () => {
  it('a plain label is one run; empty is none', () => {
    expect(parseInline('Hello **world**')).toEqual([{ text: 'Hello **world**', mark: null }]);
    expect(parseInline('')).toEqual([]);
  });

  it('bold, italic and both (Mermaid markdown strings)', () => {
    expect(show(md('a **bold** and *italic* or _this_ and __that__'))).toEqual(['a ', '**bold**', ' and ', '*italic*', ' or ', '*this*', ' and ', '**that**']);
    expect(show(md('***both*** and **bold *nested* bold**'))).toEqual(['***both***', ' and ', '**bold **', '***nested***', '** bold**']);
  });

  it('unpaired or flanked by spaces stays text; snake_case and escapes are text', () => {
    expect(show(md('2 * 3 * 4'))).toEqual(['2 * 3 * 4']);
    expect(show(md('**open only'))).toEqual(['**open only']);
    expect(show(md('snake_case_name'))).toEqual(['snake_case_name']);
    expect(show(md('\\*not italic\\*'))).toEqual(['*not italic*']);
    expect(show(md('*a**b*'))).toEqual(['*a**b*']);
  });

  it('underline and strike: the inline HTML Mermaid passes through (<u>, <s>, <del>, <strike>), with emphasis inside or around', () => {
    expect(md('a <u>b</u> c')).toEqual([{ text: 'a ', mark: null }, { text: 'b', mark: null, underline: true }, { text: ' c', mark: null }]);
    expect(md('**<u>a</u>** <S>b</S> <del>c</del> <strike>d</strike>')).toEqual([
      { text: 'a', mark: null, bold: true, underline: true }, { text: ' ', mark: null }, { text: 'b', mark: null, strike: true },
      { text: ' ', mark: null }, { text: 'c', mark: null, strike: true }, { text: ' ', mark: null }, { text: 'd', mark: null, strike: true },
    ]);
    // an unclosed tag lasts to the end, as in HTML; a stray end tag does nothing; other angle brackets are text
    expect(md('a <u>b')).toEqual([{ text: 'a ', mark: null }, { text: 'b', mark: null, underline: true }]);
    expect(md('a</u> b')).toEqual([{ text: 'a b', mark: null }]);
    expect(md('x < y > z <b>w</b>')).toEqual([{ text: 'x < y > z <b>w</b>', mark: null }]);
    // tags are markdown only: a plain label shows them as written
    expect(parseInline('a <u>b</u>')).toEqual([{ text: 'a <u>b</u>', mark: null }]);
  });

  it('icon tokens through the resolver; unknown tokens, URLs and times stay text', () => {
    expect(show(parseInline('fa:fa-car Car', { icons }))).toEqual(['[car]', ' Car']);
    expect(show(parseInline('to fa:fa-car, tabler:car!', { icons }))).toEqual(['to ', '[car]', ', ', '[car]', '!']);
    expect(show(parseInline('fa:fa-plane https://x.com/fa:fa-car at 10:30', { icons }))).toEqual(['fa:fa-plane https://x.com/fa:fa-car at 10:30']);
    expect(parseInline('fa:fa-car', { icons, iconSize: 20 })[0]!.icon).toEqual({ href: CAR, size: 20, name: 'car' });
    // markdown and icons together
    expect(show(parseInline('**fa:fa-car fast**', { markdown: true, icons }))).toEqual(['[car]', '** fast**']);
  });

  it('plain text and the accessible name', () => {
    const runs = parseInline('fa:fa-car **Car** park', { markdown: true, icons });
    expect(runsText(runs)).toBe(' Car park');
    expect(runsLabel(runs)).toBe('car Car park');
  });
});

describe('measuring and wrapping', () => {
  it('a run measures in its own font; an icon is its size', () => {
    expect(runFont(font, { text: 'x', mark: null, bold: true, italic: true })).toEqual({ ...font, weight: 700, style: 'italic' });
    const bold = runsWidth(md('**word**'), font, measure), plain = runsWidth(md('word'), font, measure);
    expect(bold).toBeCloseTo(plain * 1.06, 5);
    expect(runsWidth(parseInline('fa:fa-car', { icons, iconSize: 18 }), font, measure)).toBe(18);
  });

  it('plain runs wrap exactly as wrap() wraps their text', () => {
    for (const s of ['A rather long label that needs several lines', '  leading  and  double  spaces ', 'one\ntwo three four five six', ''])
      for (const w of [0, 60, 120])
        expect(wrapRuns(parseInline(s), w, font, measure).map(runsText)).toEqual(wrap(s, w, font, measure));
  });

  it('a break never splits a run’s styling and drops the space at the break', () => {
    const lines = wrapRuns(md('the **quick brown** fox *jumps over* the dog'), 90, font, measure);
    expect(lines.map(show)).toEqual([['the ', '**quick**'], ['**brown**', ' fox'], ['*jumps over*'], ['the dog']]);
    for (const l of lines) expect(runsWidth(l, font, measure)).toBeLessThanOrEqual(90);
  });

  it('an icon is a word of its own: the gap around it is a break', () => {
    // the spaces around the icon are dropped at the breaks
    const lines = wrapRuns(parseInline('Parking fa:fa-car garage', { icons, iconSize: 14 }), 60, font, measure);
    expect(lines.map(show)).toEqual([['Parking'], ['[car]'], ['garage']]);
    expect(wrapRuns(parseInline('Parking fa:fa-car garage', { icons, iconSize: 14 }), 0, font, measure).map(show)).toEqual([['Parking ', '[car]', ' garage']]);
    // a token inside a word is not one
    expect(wrapRuns(parseInline('Parkingfa:fa-car', { icons }), 50, font, measure).map(show)).toEqual([['Parkingfa:fa-car']]);
    expect(wrapRuns(parseInline('a\nfa:fa-car b', { icons }), 0, font, measure).map(show)).toEqual([['a'], ['[car]', ' b']]);
  });
});

describe('drawn runs (goldens)', () => {
  const opts = { size: 14, family: 'Inter, sans-serif', color: '#111', measure };

  it('a markdown label with bold, italic and wrapping', () => {
    const lines = wrapRuns(md('Deploy **to production** _after_ the ***final*** review'), 110, font, measure);
    const svg = serializeNodes(richText(lines, 100, 50, opts));
    expect(svg).toMatchSnapshot();
    expect(svg).toContain('<tspan font-weight="700">');
    expect(svg).toContain('<tspan font-style="italic">after</tspan>');
    expect(svg).not.toContain('<image');
  });

  it('underlined and struck words are drawn with their text-decoration', () => {
    const svg = serializeNodes(richText([md('<u>a</u> <s>b</s> <u><s>c</s></u>')], 0, 0, opts));
    expect(svg).toContain('<tspan text-decoration="underline">a</tspan>');
    expect(svg).toContain('<tspan text-decoration="line-through">b</tspan>');
    expect(svg).toContain('<tspan text-decoration="underline line-through">c</tspan>');
  });

  it('a plain label draws as textBlock draws it', () => {
    expect(serializeNodes(richText([[{ text: 'Plain', mark: null }]], 10, 20, opts))).toBe(
      '<text text-anchor="middle" dominant-baseline="central" font-family="Inter, sans-serif" font-size="14" font-weight="400" fill="#111"><tspan x="10" y="20">Plain</tspan></text>',
    );
  });

  it('a label with an inline icon: the text placed around the icon’s gap, the image beside the text', () => {
    const runs = parseInline('fa:fa-car Car park **fa:fa-car** here', { markdown: true, icons, iconSize: 14 });
    const nodes = richText(wrapRuns(runs, 0, font, measure), 100, 50, opts);
    const svg = serializeNodes(nodes);
    expect(svg).toMatchSnapshot();
    expect(nodes.map((n) => n.t)).toEqual(['text', 'image', 'image']);
    expect(svg).toContain('text-anchor="start"');
    expect(svg).toContain('aria-hidden="true"');
    // centred: the line starts half its width left of x
    const w = runsWidth(runs, font, measure);
    expect(svg).toContain(`<tspan x="${Math.round((100 - w / 2) * 10) / 10}" y="50" text-anchor="start">`);
  });

  it('changed words inside bold text keep the bold (merged diff picture)', () => {
    const m = withoutMarks(measure);
    const label = `Ship **${deleted('old')}${inserted('new')} release** fa:fa-car ${inserted('now')}`;
    const lines = wrapRuns(parseInline(label, { markdown: true, icons, iconSize: 14 }), 0, font, m);
    const body = [itemGroup('node', 'A', 'node', richText(lines, 100, 50, { ...opts, measure: m }))];
    const result: RenderResult = {
      defs: [], body, bounds: { x: 0, y: 0, w: 200, h: 100 }, contentBounds: { x: 0, y: 0, w: 200, h: 100 },
      page: { background: 'transparent', grid: undefined, border: null }, pageSettings: {}, geom: { type: null }, presetsUsed: {},
    };
    const a = annotate({ view: 'merged', result, before: result, changes: [], measure: m });
    const svg = serializeNodes(a.body);
    expect(svg).toMatchSnapshot();
    expect(svg).toContain('<tspan class="dx-del" font-weight="700">old</tspan><tspan class="dx-ins" font-weight="700">new</tspan><tspan font-weight="700"> release</tspan>');
    // the inserted word after the icon is a placed chunk (after the space, which would collapse at a chunk's start)
    expect(svg).toMatch(/<tspan class="dx-ins" x="[\d.]+">now<\/tspan>/);
    expect(svg).not.toMatch(/[﷐-﷓]/);
    // highlighter rectangles behind each changed piece
    expect(a.runs.map((n) => (n.t === 'rect' ? n.attrs['class'] : ''))).toEqual(['run-del', 'run-ins', 'run-ins']);
  });

  it('markStyledRuns carries a mark across runs and lines and keeps a run’s place on its first piece', () => {
    const lines = markStyledRuns([[{ text: `a${inserted('b')}`, mark: null, bold: true, x: 5 }], [{ text: `${deleted('c d')}`, mark: null, italic: true }]]);
    expect(lines).toEqual([[{ text: 'a', mark: null, bold: true, x: 5 }, { text: 'b', mark: 'ins', bold: true }], [{ text: 'c d', mark: 'del', italic: true }]]);
  });
});
