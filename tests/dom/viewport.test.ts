// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Viewport, type WheelMode } from '../../src/dom/viewport.js';

const wheel = (el: Element, init: WheelEventInit): boolean => el.dispatchEvent(new WheelEvent('wheel', { cancelable: true, clientX: 50, clientY: 50, ...init }));

const setup = (mode: WheelMode): { el: HTMLDivElement; vp: Viewport } => {
  const el = document.createElement('div');
  document.body.append(el);
  return { el, vp: new Viewport(el, { wheel: mode }) };
};

describe('viewport wheel modes', () => {
  it('`zoom`: a plain scroll zooms at the pointer', () => {
    const { el, vp } = setup('zoom');
    expect(wheel(el, { deltaY: -100 })).toBe(false);
    expect(vp.state.k).toBeGreaterThan(1);
    wheel(el, { deltaY: 300 });
    expect(vp.state.k).toBeLessThan(1);
  });

  it('`zoom`: Shift+wheel and a sideways scroll pan', () => {
    const { el, vp } = setup('zoom');
    wheel(el, { deltaY: 40, shiftKey: true });
    expect(vp.state).toMatchObject({ k: 1, tx: -40, ty: 0 });
    wheel(el, { deltaX: 30, deltaY: 5 });
    expect(vp.state).toMatchObject({ k: 1, tx: -70, ty: -5 });
  });

  it('`always`: a plain scroll pans, Ctrl+wheel zooms', () => {
    const { el, vp } = setup('always');
    wheel(el, { deltaY: 40 });
    expect(vp.state).toMatchObject({ k: 1, ty: -40 });
    wheel(el, { deltaY: -100, ctrlKey: true });
    expect(vp.state.k).toBeGreaterThan(1);
  });

  it('`ctrl`: a plain scroll is left to the page', () => {
    const { el, vp } = setup('ctrl');
    expect(wheel(el, { deltaY: 40 })).toBe(true);
    expect(vp.state).toMatchObject({ k: 1, tx: 0, ty: 0 });
  });
});
