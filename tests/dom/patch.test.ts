// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { patchChildren } from '../../src/dom/patch.js';
import { el, g, image, text, title } from '../../src/core/scene/build.js';
import type { SafeImageUrl } from '../../src/core/validate.js';
import { safeImageUrl } from '../../src/core/media/policy.js';

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
  it('draws runs of removed and added words as styled tspans, and plain lines again after them', () => {
    const root = svg();
    const runs = text({}, [{ text: 'a old new', x: 0, y: 0, runs: [{ text: 'a ', mark: null }, { text: 'old', mark: 'del' }, { text: 'new', mark: 'ins' }] }], 't');
    patchChildren(root, [runs]);
    const line = root.firstElementChild!.children[0]!;
    expect([...line.children].map((c) => [c.getAttribute('class'), c.textContent])).toEqual([['dx-del', 'old'], ['dx-ins', 'new']]);
    expect(line.textContent).toBe('a oldnew');
    patchChildren(root, [text({}, [{ text: 'family \u{1F468}\u200d\u{1F469}', x: 0, y: 0 }], 't')]);
    const plain = root.firstElementChild!.children[0]!;
    expect(plain.childElementCount).toBe(0);
    expect(plain.textContent).toBe('family \u{1F468}\u200d\u{1F469}');
  });
  it('drops non-local url() references', () => {
    const root = svg();
    patchChildren(root, [el('path', { 'marker-end': 'url(#p-mk)', fill: 'url(javascript:alert(1))' })]);
    const p = root.firstElementChild!;
    expect(p.getAttribute('marker-end')).toBe('url(#p-mk)');
    expect(p.getAttribute('fill')).toBeNull();
  });
  it('images: href only from the branded field, replaced when it changes, never from attrs', () => {
    const root = svg();
    const a = safeImageUrl('https://example.com/a.png')!, b = safeImageUrl('https://example.com/b.png')!;
    patchChildren(root, [image(a, { x: 1, y: 2, width: 30, height: 20, href: 'javascript:alert(1)', 'xlink:href': 'https://evil', preserveAspectRatio: 'xMidYMid meet' }, 'i')]);
    const img = root.firstElementChild!;
    expect(img.localName).toBe('image');
    expect(img.getAttribute('href')).toBe('https://example.com/a.png');
    expect(img.getAttributeNames().sort()).toEqual(['height', 'href', 'preserveAspectRatio', 'width', 'x', 'y']);
    patchChildren(root, [image(b, { x: 5, y: 2, width: 30, height: 20 }, 'i')]);
    expect(root.firstElementChild).toBe(img);
    expect(img.getAttribute('href')).toBe('https://example.com/b.png');
    expect(img.getAttribute('x')).toBe('5');
    expect(img.getAttribute('preserveAspectRatio')).toBeNull();
  });
  it('rich runs: bold, italic and placed chunks; a line with icons starts at its left edge', () => {
    const root = svg();
    const icon = { href: 'data:image/svg+xml,%3Csvg%2F%3E' as SafeImageUrl, size: 14, name: 'car' };
    patchChildren(root, [text({ 'text-anchor': 'middle' }, [{ text: 'a b c', x: 3, y: 0, anchor: 'start', runs: [{ text: 'a ', mark: null, bold: true }, { text: '', mark: null, icon }, { text: 'b', mark: 'ins', italic: true, x: 40 }, { text: ' c', mark: null }] }], 't')]);
    const line = root.firstElementChild!.children[0]!;
    expect(line.getAttribute('text-anchor')).toBe('start');
    expect([...line.children].map((c) => c.getAttributeNames().map((n) => `${n}=${c.getAttribute(n)}`).join(' '))).toEqual(['font-weight=700', 'class=dx-ins font-style=italic x=40']);
    expect(line.textContent).toBe('a b c');
    patchChildren(root, [text({ 'text-anchor': 'middle' }, [{ text: 'plain', x: 3, y: 0 }], 't')]);
    expect(line.getAttribute('text-anchor')).toBeNull();
    expect(line.childElementCount).toBe(0);
  });
  it('leaves a picture that did not change alone: no attribute is written, however the nodes were built', () => {
    const root = svg();
    const pic = (): ReturnType<typeof g>[] => [g({ class: 'el', 'data-id': 'A' }, [el('rect', { x: 1, fill: 'red' }), text({ 'font-size': 12 }, [{ text: 'a b', x: 0, y: 0, runs: [{ text: 'a ', mark: null }, { text: 'b', mark: 'ins' }] }])], { key: 'node:A' })];
    patchChildren(root, pic());
    const set = vi.spyOn(Element.prototype, 'setAttribute');
    const remove = vi.spyOn(Element.prototype, 'removeAttribute');
    try {
      patchChildren(root, pic());
      expect(set).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    } finally {
      set.mockRestore();
      remove.mockRestore();
    }
  });
  it('a change only in what is not an attribute still reaches the element: an image URL, a tooltip, a run\'s mark', () => {
    const root = svg();
    const a = safeImageUrl('https://example.com/a.png')!, b = safeImageUrl('https://example.com/b.png')!;
    const line = (mark: 'ins' | 'del') => [{ text: 'x', x: 0, y: 0, runs: [{ text: 'x', mark }] }];
    const pic = (u: typeof a, tip: string, mark: 'ins' | 'del') => [g({ class: 'el' }, [image(u, { x: 1, width: 5, height: 5 }, 'i'), title(tip), text({}, line(mark), 't')], { key: 'node:A' })];
    patchChildren(root, pic(a, 'one', 'ins'));
    patchChildren(root, pic(b, 'two', 'del'));
    const item = root.firstElementChild!;
    expect(item.querySelector('image')!.getAttribute('href')).toBe('https://example.com/b.png');
    expect(item.querySelector('title')!.textContent).toBe('two');
    expect(item.querySelector('text tspan tspan')!.getAttribute('class')).toBe('dx-del');
  });
  it('a raw value set to null or false drops the attribute; one rejected by the value check is never written', () => {
    const root = svg();
    patchChildren(root, [el('rect', { x: 1, fill: 'red', opacity: 0.5 }, 'r')]);
    patchChildren(root, [el('rect', { x: 1, fill: null, opacity: false }, 'r')]);
    const r = root.firstElementChild!;
    expect(r.getAttribute('fill')).toBeNull();
    expect(r.getAttribute('opacity')).toBeNull();
    patchChildren(root, [el('rect', { x: 1, fill: 'url(javascript:alert(1))' }, 'r')]);
    expect(r.getAttribute('fill')).toBeNull();
    patchChildren(root, [el('rect', { x: 1, fill: 'blue' }, 'r')]);
    expect(r.getAttribute('fill')).toBe('blue');
  });
  it('replaces an element whose tag changed under the same key', () => {
    const root = svg();
    patchChildren(root, [el('rect', {}, 'k')]);
    patchChildren(root, [el('ellipse', {}, 'k')]);
    expect(root.firstElementChild!.localName).toBe('ellipse');
  });
});
