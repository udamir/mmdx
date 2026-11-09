// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Viewport, type WheelMode } from '../../src/dom/viewport.js';

function setup(wheel: WheelMode): { el: HTMLElement; vp: Viewport; seen: boolean[] } {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) }) as DOMRect;
  document.body.append(el);
  const seen: boolean[] = [];
  const vp: Viewport = new Viewport(el, { wheel, onChange: () => seen.push(vp.wheeling) });
  return { el, vp, seen };
}

const wheel = (el: Element, o: WheelEventInit): WheelEvent => {
  const ev = new WheelEvent('wheel', { clientX: 100, clientY: 100, bubbles: true, cancelable: true, ...o });
  el.dispatchEvent(ev);
  return ev;
};

afterEach(() => document.body.replaceChildren());

describe('Viewport wheel modes', () => {
  it('always: the wheel pans, ⌘ / Ctrl + wheel zooms', () => {
    const { el, vp } = setup('always');
    wheel(el, { deltaY: 50 });
    expect(vp.state).toEqual({ k: 1, tx: 0, ty: -50 });
    wheel(el, { deltaY: -100, ctrlKey: true });
    expect(vp.state.k).toBeGreaterThan(1);
  });

  it('zoom: the wheel zooms at the pointer; Shift + wheel and a sideways scroll pan', () => {
    const { el, vp } = setup('zoom');
    wheel(el, { deltaY: -100 });
    const k = vp.state.k;
    expect(k).toBeGreaterThan(1);
    // the point under the pointer stays put
    expect((100 - vp.state.tx) / k).toBeCloseTo(100);
    const { tx, ty } = vp.state;
    wheel(el, { deltaY: 40, shiftKey: true });
    expect(vp.state).toEqual({ k, tx: tx - 40, ty });
    wheel(el, { deltaX: 30, deltaY: 5 });
    expect(vp.state).toEqual({ k, tx: tx - 70, ty: ty - 5 });
  });

  it('ctrl leaves the plain wheel to the page; never ignores the wheel', () => {
    const a = setup('ctrl');
    expect(wheel(a.el, { deltaY: 50 }).defaultPrevented).toBe(false);
    expect(a.vp.state).toEqual({ k: 1, tx: 0, ty: 0 });
    const b = setup('never');
    expect(wheel(b.el, { deltaY: 50, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(b.vp.state).toEqual({ k: 1, tx: 0, ty: 0 });
  });

  it('wheeling is true only while a wheel step applies', () => {
    const { el, vp, seen } = setup('always');
    wheel(el, { deltaY: 50 });
    vp.panBy(10, 0);
    expect(seen).toEqual([true, false]);
    expect(vp.wheeling).toBe(false);
  });
});
