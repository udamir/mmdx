// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { parseMermaidSvg } from '../../src/editor/modules/chrome/document.js';

// Mermaid's output: labels are HTML inside <foreignObject>, with void tags such as <br> (not valid XML)
const LABEL_WITH_BREAK =
  '<svg xmlns="http://www.w3.org/2000/svg" id="m1" viewBox="0 0 100 50"><g><foreignObject width="80" height="40">' +
  '<div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">one<br>two</span></div></foreignObject></g></svg>';

describe('Plain Mermaid: parsing Mermaid’s SVG', () => {
  test('a label with a <br> line break parses (it is not valid XML)', () => {
    expect(new DOMParser().parseFromString(LABEL_WITH_BREAK, 'image/svg+xml').querySelector('parsererror')).not.toBeNull();
    const svg = parseMermaidSvg(LABEL_WITH_BREAK);
    expect(svg).not.toBeNull();
    expect(svg!.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 100 50');
    expect(svg!.querySelector('br')).not.toBeNull();
    expect(svg!.textContent).toContain('one');
  });

  test('scripts and on* handlers are dropped', () => {
    const svg = parseMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect onclick="x()" width="5" height="5"/></svg>');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('onload')).toBeNull();
    expect(svg!.querySelector('script')).toBeNull();
    expect(svg!.querySelector('rect')!.getAttribute('onclick')).toBeNull();
    expect(svg!.querySelector('rect')!.getAttribute('width')).toBe('5');
  });

  test('no SVG in the output gives null', () => {
    expect(parseMermaidSvg('<div>Syntax error</div>')).toBeNull();
    expect(parseMermaidSvg('')).toBeNull();
  });
});
