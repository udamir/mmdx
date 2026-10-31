// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DiagramCanvas } from '../../src/dom/canvas.js';
import { StrokeStore } from '../../src/dom/pen.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { SceneNode } from '../../src/core/scene/types.js';

const rect = (key: string, x = 0): SceneNode => ({ t: 'rect', key, attrs: { x, y: 0, width: 10, height: 10 } });
const item = (kind: string, id: string): SceneNode => ({ t: 'g', key: `${kind}:${id}`, attrs: { class: 'el', 'data-kind': kind, 'data-id': id }, children: [rect(`${id}-r`)] });

function sized(el: Element, w = 400, h = 300): void {
  (el as HTMLElement).getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: w, height: h, right: w, bottom: h, toJSON: () => ({}) }) as DOMRect;
}

const ptr = (type: string, x: number, y: number, target: Element): void => {
  const ev = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }) as unknown as PointerEvent;
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  target.dispatchEvent(ev);
};

afterEach(() => document.body.replaceChildren());

describe('DiagramCanvas', () => {
  it('builds the layers and patches a picture by key', () => {
    const c = new DiagramCanvas(null, { interaction: 'pan-zoom', svgClass: 'canvas', part: 'canvas' });
    expect(c.svg.getAttribute('class')).toBe('canvas');
    expect(c.svg.getAttribute('part')).toBe('canvas');
    expect([...c.vp.children].map((e) => e.getAttribute('class'))).toEqual(['content', 'ink']);
    expect([...c.content.children].map((e) => e.getAttribute('class'))).toEqual(['page-layer', 'body-layer', 'dx-runs', 'overlay']);
    c.show({ defs: [], page: [], body: [item('node', 'a'), item('node', 'b')] });
    const a = c.body.firstElementChild;
    c.show({ defs: [], page: [], body: [item('node', 'a')] });
    expect(c.body.children).toHaveLength(1);
    expect(c.body.firstElementChild).toBe(a);
    c.setOverlay([rect('h')]);
    expect(c.overlay.children).toHaveLength(1);
    c.clear();
    expect(c.body.children).toHaveLength(0);
    c.destroy();
  });

  it('hit tests items', () => {
    const c = new DiagramCanvas(null, { interaction: 'pan-zoom' });
    c.show({ defs: [], page: [], body: [item('edge', 'e1')] });
    const r = c.body.querySelector('rect')!;
    expect(c.itemAt(r)).toEqual({ key: 'edge:e1', kind: 'edge', id: 'e1' });
    expect(c.itemAt(c.svg)).toBeNull();
  });

  it('switches between a viewport and a static fit through the viewBox', () => {
    const c = new DiagramCanvas(null, { interaction: 'static' });
    expect(c.viewport).toBeNull();
    c.setBounds({ x: 10, y: 20, w: 100, h: 50 });
    expect(c.svg.getAttribute('viewBox')).toBe('10 20 100 50');
    c.setInteraction('pan-zoom');
    expect(c.viewport).not.toBeNull();
    expect(c.svg.hasAttribute('viewBox')).toBe(false);
    c.setInteraction('static');
    expect(c.viewport).toBeNull();
    expect(c.svg.getAttribute('viewBox')).toBe('10 20 100 50');
  });

  it('applies the view, saves and restores it, and links two canvases', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const a = new DiagramCanvas(host, { interaction: 'pan-zoom' });
    const b = new DiagramCanvas(host, { interaction: 'pan-zoom' });
    sized(a.svg);
    sized(b.svg);
    a.link(b);
    a.setBounds({ x: 0, y: 0, w: 200, h: 100 }, { fit: true });
    const v = a.view.peek();
    expect(v.k).toBeGreaterThan(0);
    expect(a.vp.getAttribute('transform')).toContain('scale(');
    expect(b.view.peek()).toEqual(v);
    const snap = a.saveView();
    a.zoomBy(2);
    expect(a.view.peek().k).toBeCloseTo(v.k * 2);
    expect(b.view.peek().k).toBeCloseTo(v.k * 2);
    a.restoreView(snap);
    expect(a.view.peek().k).toBeCloseTo(v.k);
  });

  it('a destroyed linked canvas is unlinked from the other one; onDestroy hooks run once', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const a = new DiagramCanvas(host, { interaction: 'pan-zoom' });
    const b = new DiagramCanvas(host, { interaction: 'pan-zoom' });
    sized(a.svg);
    sized(b.svg);
    a.link(b);
    let hooks = 0;
    b.onDestroy(() => hooks++);
    b.destroy();
    b.destroy();
    expect(hooks).toBe(1);
    expect((a as unknown as { links: Set<unknown>; unlinks: Set<unknown> }).links.size).toBe(0);
    expect((a as unknown as { unlinks: Set<unknown> }).unlinks.size).toBe(0);
    const off = a.link(new DiagramCanvas(host, { interaction: 'pan-zoom' }));
    off();
    expect((a as unknown as { unlinks: Set<unknown> }).unlinks.size).toBe(0);
  });

  it('paints one stroke store into every attached canvas; drawing needs the pen to be active', () => {
    const store = new StrokeStore(memoryStorage());
    const a = new DiagramCanvas(null, { interaction: 'pan-zoom' });
    const b = new DiagramCanvas(null, { interaction: 'pan-zoom' });
    sized(a.svg);
    a.attachInk(store);
    const detachB = b.attachInk(store);
    ptr('pointerdown', 10, 10, a.svg);
    ptr('pointerup', 10, 10, a.svg);
    expect(store.hasStrokes()).toBe(false);
    store.setActive(true);
    expect(a.svg.classList.contains('pen-on')).toBe(true);
    ptr('pointerdown', 10, 10, a.svg);
    ptr('pointermove', 40, 40, a.svg);
    ptr('pointerup', 40, 40, a.svg);
    expect(store.hasStrokes()).toBe(true);
    expect(a.ink.querySelectorAll('path')).toHaveLength(1);
    expect(b.ink.querySelectorAll('path')).toHaveLength(1);
    expect(store.undo()).toBe(true);
    expect(b.ink.querySelectorAll('path')).toHaveLength(0);
    detachB();
    store.setActive(false);
    expect(a.svg.classList.contains('pen-on')).toBe(false);
  });
});
