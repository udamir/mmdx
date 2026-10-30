// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { patchChildren } from '../../src/dom/patch.js';
import { el, g, text } from '../../src/core/scene/build.js';

const svg = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg');

describe('patchChildren', () => {
  it('creates elements with allowed attributes only', () => {
    const root = svg();
    patchChildren(root, [el('rect', { x: 1, y: 2.25, width: 10, height: 5, fill: 'red', onclick: 'alert(1)', 'data-id': 'A' })]);
    const r = root.firstElementChild!;
    expect(r.localName).toBe('rect');
    expect(r.getAttribute('y')).toBe('2.3');
    expect(r.getAttribute('onclick')).toBeNull();
    expect(r.getAttribute('data-id')).toBe('A');
  });
  it('reuses keyed elements and only touches changed attributes', () => {
    const root = svg();
    patchChildren(root, [g({ class: 'el' }, [el('rect', { x: 0 })], { key: 'node:A' }), g({ class: 'el' }, [], { key: 'node:B' })]);
    const a = root.children[0]!, b = root.children[1]!;
    const rect = a.firstElementChild!;
    patchChildren(root, [g({ class: 'el' }, [], { key: 'node:B' }), g({ class: 'el' }, [el('rect', { x: 5 })], { key: 'node:A' })]);
    expect(root.children[0]).toBe(b);
    expect(root.children[1]).toBe(a);
    expect(a.firstElementChild).toBe(rect);
    expect(rect.getAttribute('x')).toBe('5');
  });
  it('removes elements that are gone and attributes that are dropped', () => {
    const root = svg();
    patchChildren(root, [el('rect', { x: 1, fill: 'red' }, 'r'), el('circle', { r: 2 }, 'c')]);
    patchChildren(root, [el('rect', { x: 1 }, 'r')]);
    expect(root.children.length).toBe(1);
    expect(root.firstElementChild!.getAttribute('fill')).toBeNull();
  });
  it('writes text through textContent, never markup', () => {
    const root = svg();
    patchChildren(root, [text({ 'font-size': 12 }, [{ text: '<img src=x onerror=alert(1)>', x: 0, y: 0 }, { text: '', x: 0, y: 10 }])]);
    const t = root.firstElementChild!;
    expect(t.querySelector('img')).toBeNull();
    expect(t.children[0]!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(t.children[1]!.textContent).toBe(' ');
  });
  it('drops non-local url() references', () => {
    const root = svg();
    patchChildren(root, [el('path', { 'marker-end': 'url(#p-mk)', fill: 'url(javascript:alert(1))' })]);
    const p = root.firstElementChild!;
    expect(p.getAttribute('marker-end')).toBe('url(#p-mk)');
    expect(p.getAttribute('fill')).toBeNull();
  });
  it('replaces an element whose tag changed under the same key', () => {
    const root = svg();
    patchChildren(root, [el('rect', {}, 'k')]);
    patchChildren(root, [el('ellipse', {}, 'k')]);
    expect(root.firstElementChild!.localName).toBe('ellipse');
  });
});
