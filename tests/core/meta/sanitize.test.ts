import { describe, expect, it } from 'vitest';
import { splitSource } from '../../../src/core/meta/index.js';
import { cleanStyleValue, sanitizeMeta, sanitizeStyleObject } from '../../../src/core/meta/sanitize.js';

const line = (json: string): ReturnType<typeof splitSource> => splitSource(`graph TD\n  A\n%%@ node A ${json}`);

describe('XSS values in metadata are dropped', () => {
  const cases: [string, string][] = [
    ['{"fill":"red\\" onload=\\"x"}', 'fill'],
    ['{"stroke":"url(javascript:x)"}', 'stroke'],
    ['{"fontFamily":"x;}</style><script>"}', 'fontFamily'],
    ['{"text":"expression(alert(1))"}', 'text'],
    ['{"dash":"4 4\\" onmouseover=\\"x"}', 'dash'],
    ['{"strokeWidth":"1\\" onload=\\"x"}', 'strokeWidth'],
    ['{"shape":"rect\\"><script>"}', 'shape'],
    ['{"arrow":"x\\" y=\\""}', 'arrow'],
    ['{"fromSide":"top"}', 'fromSide'],
    ['{"points":[[1,2],[3,"<"]]}', 'points'],
  ];
  for (const [json, key] of cases) {
    it(`${key}: ${json}`, () => {
      const r = line(json);
      expect(r.doc.meta.nodes?.['A']).toEqual({});
      expect(r.diagnostics).toMatchObject([{ code: 'meta.bad-value', source: 'meta', range: { line: 2 }, params: { key } }]);
    });
  }

  it('ER attribute colours and the diagram palette', () => {
    const r = splitSource('erDiagram\n%%@ entity E {"attrs":{"id":{"color":"red;x","bold":true}}}\n%%@ style.palette brand {"color":"url(#x)"}\n%%@ style.palette ok {"color":"#123"}');
    expect(r.doc.meta.entities?.['E']).toEqual({ attrs: { id: { bold: true } } });
    expect(r.doc.meta.styles['palette']).toEqual({ brand: {}, ok: { color: '#123' } });
    expect(r.diagnostics.map((d) => d.params?.['key'])).toEqual(['attrs.id.color', 'color']);
  });

  it('canvas colours', () => {
    const r = splitSource('graph TD\n%%@ canvas {"background":"#fff\\"/><script>","grid":"rgba(0,0,0,.1)","border":"none"}');
    expect(r.doc.meta.canvas).toEqual({ grid: 'rgba(0,0,0,.1)', border: 'none' });
  });
});

describe('valid values are kept as written', () => {
  it('keeps every A.10 key with a good value', () => {
    const v = {
      preset: 'client', layer: 'L1', locked: true, link: 'https://x.y', fill: '@lime~+5,-2,+3', stroke: '#abc',
      strokeWidth: 1.5, text: 'white', fontSize: 14, fontWeight: 'bold', titleWeight: 600, fontFamily: "'Inter', sans-serif",
      radius: 8, stack: 2, dash: '6,4', shape: 'hcyl', fillOpacity: 0.5, strokeOpacity: 1, align: 'left', valign: 'top',
      x: -10, y: 20.5, w: 100, h: 40, color: 'rgb(1, 2, 3)', width: 2, arrow: 'filled', startArrow: 'none',
      endArrow: 'circle', labelColor: null, labelSize: 12, curve: 1, routing: 'orthogonal', fromSide: 't', toSide: 'r',
      fromAt: 0.5, toAt: 1, labelAt: 0.2, labelDx: 3, labelDy: -4, points: [[1, 2], [3, 4]], dy: 10, labelOnLine: true,
      showTag: false, mode: 'table', showTypes: true, showComments: false, pkUnderline: true, attrSize: 12,
      attrColor: '@ink', titleSize: 14, titleColor: 'transparent', titleAlign: 'center', pad: 4, padTop: 30,
      attrs: { id: { color: '#d0312d', bold: true, underline: false }, __title: { color: '@red' } },
      futureKey: { anything: '<script>' },
    };
    expect(sanitizeStyleObject(v)).toEqual({ value: v, dropped: [] });
  });

  it('keeps canvas keys', () => {
    const c = { v: 1, theme: 'studio', preset: 'whiteboard', w: 2000, h: 1424, x: 0, y: 0, ratio: '16:9', routing: 'curved', background: '@paper', border: 'none', grid: 'rgba(0,0,0,0.05)', pad: 16, gap: 90, rowH: 52, mirror: true, blockSpan: 'touched', margin: 26 };
    expect(sanitizeStyleObject(c).dropped).toEqual([]);
  });

  it('strips control characters from links and names', () => {
    expect(sanitizeStyleObject({ link: 'java\tscript:x', name: 'a\u0000b' }).value).toEqual({ link: 'javascript:x', name: 'ab' });
  });

  it('bounds numbers', () => {
    expect(sanitizeStyleObject({ x: 1e9, w: -1, fillOpacity: 2, fontSize: Infinity, stack: 99 }).dropped).toEqual(['x', 'w', 'fillOpacity', 'fontSize', 'stack']);
    expect(sanitizeStyleObject({ points: Array.from({ length: 201 }, () => [0, 0]) }).dropped).toEqual(['points']);
  });

  it('cleanStyleValue checks one value', () => {
    expect(cleanStyleValue('fill', 'red')).toBe('red');
    expect(cleanStyleValue('fill', 'red;')).toBeUndefined();
    expect(cleanStyleValue('unknownKey', { a: 1 })).toEqual({ a: 1 });
  });
});

describe('sanitizeMeta', () => {
  it('validates every part and reports paths', () => {
    const r = sanitizeMeta({ canvas: { background: 'x"' }, styles: { node: { p: { fill: 'bad(' } } }, nodes: { A: { x: 'no' } }, unknown: ['%%@ a b {}', 5, 'x\ny'] });
    expect(r.meta).toEqual({ canvas: {}, styles: { node: { p: {} } }, nodes: { A: {} }, unknown: ['%%@ a b {}'] });
    expect(r.diagnostics.map((d) => d.params?.['key'])).toEqual(['canvas.background', 'style.node.p.fill', 'nodes.A.x']);
  });
});
