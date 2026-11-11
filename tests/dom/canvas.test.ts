// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('changing auto erase reschedules the strokes already counting down (B21)', () => {
    vi.useFakeTimers();
    try {
      const store = new StrokeStore(memoryStorage(), () => true);
      store.setFade(5000);
      const a = new DiagramCanvas(null, { interaction: 'pan-zoom' });
      sized(a.svg);
      a.attachInk(store);
      store.setActive(true);
      ptr('pointerdown', 10, 10, a.svg);
      ptr('pointermove', 40, 40, a.svg);
      ptr('pointerup', 40, 40, a.svg);
      // off: the stroke stays
      store.setFade(0);
      vi.advanceTimersByTime(6000);
      expect(store.hasStrokes()).toBe(true);
      // 10 s from now, not 5 s and again at 10 s
      store.setFade(10000);
      vi.advanceTimersByTime(6000);
      expect(store.hasStrokes()).toBe(true);
      vi.advanceTimersByTime(5000);
      expect(store.hasStrokes()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('a gesture is shown by CSS and written when it rests', () => {
    // a browser's box of an element includes its CSS transform: the svg's box at 400 × 300, scaled by its transform
    const box = function (this: Element): DOMRect {
      const m = /scale\(([\d.]+)\)/.exec((this as HTMLElement).style?.transform ?? '');
      const s = m ? Number(m[1]) : 1;
      return { x: 0, y: 0, left: 0, top: 0, width: 400 * s, height: 300 * s, right: 400 * s, bottom: 300 * s, toJSON: () => ({}) } as DOMRect;
    };
    const wheel = (el: Element, o: WheelEventInit): void => void el.dispatchEvent(new WheelEvent('wheel', { clientX: 100, clientY: 100, bubbles: true, cancelable: true, ...o }));
    const setup = (): DiagramCanvas => {
      const host = document.createElement('div');
      document.body.append(host);
      const c = new DiagramCanvas(host, { interaction: 'pan-zoom', wheel: 'always' });
      c.setBounds({ x: 0, y: 0, w: 200, h: 100 }, { fit: true });
      return c;
    };
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('a wheel zoom burst: a CSS scale meanwhile (the box reads unscaled), the scene transform once, after it rests', () => {
      vi.useFakeTimers();
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(box);
      const c = setup();
      const before = c.vp.getAttribute('transform');
      wheel(c.svg, { deltaY: -100, ctrlKey: true });
      wheel(c.svg, { deltaY: -100, ctrlKey: true });
      const v = c.view.peek();
      expect(c.vp.getAttribute('transform')).toBe(before);
      expect(c.svg.style.transform).toMatch(/scale\(/);
      expect(c.svg.getBoundingClientRect().width).toBe(400);
      // pointer math follows the view state: the point under the pointer is where the view puts it
      const p = c.toDiagram(100, 100);
      expect(c.toScreen(p).x).toBeCloseTo(100);
      vi.advanceTimersByTime(299);
      expect(c.vp.getAttribute('transform')).toBe(before);
      vi.advanceTimersByTime(1);
      expect(c.vp.getAttribute('transform')).toBe(`translate(${v.tx},${v.ty}) scale(${v.k})`);
      expect(c.svg.style.transform).toBe('');
      expect(c.svg.style.willChange).toBe('');
      c.destroy();
    });

    it('a single change (a button, a fit) is written at once and ends a CSS-shown gesture', () => {
      vi.useFakeTimers();
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(box);
      const c = setup();
      wheel(c.svg, { deltaY: 40 });
      expect(c.svg.style.transform).toMatch(/translate\(/);
      c.zoomBy(2);
      const v = c.view.peek();
      expect(c.vp.getAttribute('transform')).toBe(`translate(${v.tx},${v.ty}) scale(${v.k})`);
      expect(c.svg.style.transform).toBe('');
      c.destroy();
    });

    it('a drag pan: a CSS translate, written when it rests, or on the way once it passed a quarter of the canvas', () => {
      vi.useFakeTimers();
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(box);
      const c = setup();
      const before = c.vp.getAttribute('transform');
      ptr('pointerdown', 100, 100, c.svg);
      ptr('pointermove', 130, 100, c.svg);
      expect(c.vp.getAttribute('transform')).toBe(before);
      expect(c.svg.style.transform).toBe('translate(30px, 0px) scale(1)');
      ptr('pointermove', 260, 100, c.svg);
      const v = c.view.peek();
      expect(c.vp.getAttribute('transform')).toBe(`translate(${v.tx},${v.ty}) scale(${v.k})`);
      expect(c.svg.style.transform).toBe('');
      ptr('pointermove', 270, 100, c.svg);
      ptr('pointerup', 270, 100, c.svg);
      vi.advanceTimersByTime(150);
      const w = c.view.peek();
      expect(c.vp.getAttribute('transform')).toBe(`translate(${w.tx},${w.ty}) scale(${w.k})`);
      c.destroy();
    });

    it('a linked canvas follows a gesture the same way', () => {
      vi.useFakeTimers();
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(box);
      const a = setup(), b = setup();
      a.link(b);
      const before = b.vp.getAttribute('transform');
      wheel(a.svg, { deltaY: -100, ctrlKey: true });
      expect(b.vp.getAttribute('transform')).toBe(before);
      expect(b.svg.style.transform).toMatch(/scale\(/);
      vi.advanceTimersByTime(300);
      expect(b.svg.style.transform).toBe('');
      expect(b.vp.getAttribute('transform')).not.toBe(before);
    });
  });

  it('--dx-inv is on the svg only while the picture may have diff badges (badges drawn, or a morph shown)', () => {
    const c = new DiagramCanvas(null, { interaction: 'pan-zoom' });
    sized(c.svg);
    c.setBounds({ x: 0, y: 0, w: 200, h: 100 }, { fit: true });
    c.show({ defs: [], page: [], body: [item('node', 'a')] });
    c.zoomBy(2);
    expect(c.svg.style.getPropertyValue('--dx-inv')).toBe('');
    c.setOverlay([{ t: 'g', key: 'b', attrs: { class: 'dx-badge' }, children: [] }]);
    expect(Number(c.svg.style.getPropertyValue('--dx-inv'))).toBeCloseTo(1 / c.view.peek().k);
    c.zoomBy(2);
    expect(Number(c.svg.style.getPropertyValue('--dx-inv'))).toBeCloseTo(1 / c.view.peek().k);
    c.setOverlay([]);
    expect(c.svg.style.getPropertyValue('--dx-inv')).toBe('');
    c.setMorph({ dispose: () => undefined });
    expect(c.svg.style.getPropertyValue('--dx-inv')).not.toBe('');
    c.show({ defs: [], page: [], body: [] });
    expect(c.svg.style.getPropertyValue('--dx-inv')).toBe('');
  });
});

