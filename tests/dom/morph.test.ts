// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Morph, type MorphState } from '../../src/dom/morph.js';
import { TRANSITION_MS } from '../../src/dom/motion.js';
import { Viewport } from '../../src/dom/viewport.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number> = {}): Element => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** A state with one body layer of items: key → x of its rect. */
function state(items: Record<string, number>): MorphState {
  const content = svg('g');
  const body = svg('g', { class: 'body-layer' });
  for (const [key, x] of Object.entries(items)) {
    const it = svg('g', { 'data-ck': key });
    it.append(svg('rect', { x, y: 0, width: 10, height: 10 }));
    body.append(it);
  }
  content.append(body);
  return { defs: [], content };
}

// animation frames run by hand, at chosen times (an animation's clock starts at its first frame)
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
const run = (at: number): void => {
  const fs = [...frames.values()];
  frames = new Map();
  for (const f of fs) f(at);
};

beforeEach(() => {
  frames = new Map();
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => {
    frames.set(nextFrame, f);
    return nextFrame++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const rectOf = (root: Element, key: string): Element | null => root.querySelector(`[data-ck="${key}"] rect`);
const opacity = (e: Element | null): string => (e as SVGElement | null)?.style.opacity ?? '';

describe('Morph.replace (switching to another version)', () => {
  it('moves the items both versions have, fades the new ones in and the gone ones out', () => {
    const defs = svg('defs'), content = svg('g');
    const m = new Morph(defs, content, [state({ 'node:a': 0, 'node:b': 50 })], 0);
    m.replace([state({ 'node:a': 100, 'node:c': 200 })], 0, true);
    // the start: the kept item where it was, the new one invisible, the gone one still shown (a ghost)
    expect(rectOf(content, 'node:a')!.getAttribute('x')).toBe('0');
    expect(opacity(content.querySelector('[data-ck="node:c"]'))).toBe('0');
    const ghost = content.querySelector('[data-ck="node:b"]');
    expect(ghost).not.toBeNull();
    expect(opacity(ghost)).toBe('1');
    run(1000);
    expect(rectOf(content, 'node:a')!.getAttribute('x')).toBe('0');
    // half way
    run(1000 + TRANSITION_MS / 2);
    expect(Number(rectOf(content, 'node:a')!.getAttribute('x'))).toBeCloseTo(50);
    expect(Number(opacity(content.querySelector('[data-ck="node:c"]')))).toBeCloseTo(0.5);
    expect(Number(opacity(ghost))).toBeCloseTo(0.5);
    // the end: the new version as it is, no ghost left
    run(1000 + TRANSITION_MS);
    expect(rectOf(content, 'node:a')!.getAttribute('x')).toBe('100');
    expect(opacity(content.querySelector('[data-ck="node:c"]'))).toBe('');
    expect(content.querySelector('[data-ck="node:b"]')).toBeNull();
  });

  it('without animate (or with reduced motion) the new states show at once', () => {
    const content = svg('g');
    const m = new Morph(svg('defs'), content, [state({ 'node:a': 0 })], 0, () => true);
    m.replace([state({ 'node:a': 100 })], 0, true);
    expect(frames.size).toBe(0);
    expect(rectOf(content, 'node:a')!.getAttribute('x')).toBe('100');
    m.replace([state({ 'node:a': 30 })], 0, false);
    expect(rectOf(content, 'node:a')!.getAttribute('x')).toBe('30');
  });

  it('a second switch while one runs finishes the first', () => {
    const content = svg('g');
    const m = new Morph(svg('defs'), content, [state({ 'node:a': 0, 'node:b': 0 })], 0);
    m.replace([state({ 'node:a': 100 })], 0, true);
    m.replace([state({ 'node:a': 200 })], 0, true);
    // the first transition's ghost of node:b is gone; the second starts from node:a at 100
    expect(content.querySelectorAll('[data-ck="node:b"]')).toHaveLength(0);
    expect(rectOf(content, 'node:a')!.getAttribute('x')).toBe('100');
    run(1000);
    run(1000 + TRANSITION_MS);
    expect(rectOf(content, 'node:a')!.getAttribute('x')).toBe('200');
  });
});

describe('Morph: images', () => {
  const withImage = (href: string, x: number): MorphState => {
    const content = svg('g');
    const it = svg('g', { 'data-ck': 'node:a' });
    it.append(svg('image', { href, x, y: 0, width: 10, height: 10 }));
    content.append(it);
    return { defs: [], content };
  };
  const images = (root: Element): Element[] => [...root.querySelectorAll('image')];

  it('an image moves like a rect; another picture cross-fades', () => {
    const content = svg('g');
    const m = new Morph(svg('defs'), content, [withImage('https://example.com/a.png', 0)], 0);
    m.replace([withImage('https://example.com/a.png', 100)], 0, true);
    expect(images(content)).toHaveLength(1);
    run(1000);
    run(1000 + TRANSITION_MS / 2);
    expect(Number(images(content)[0]!.getAttribute('x'))).toBeCloseTo(50);
    run(1000 + TRANSITION_MS);

    m.replace([withImage('https://example.com/b.png', 0)], 0, true);
    const [old, now] = images(content);
    expect(old!.getAttribute('href')).toBe('https://example.com/a.png');
    expect(now!.getAttribute('href')).toBe('https://example.com/b.png');
    run(2000);
    run(2000 + TRANSITION_MS / 2);
    expect(Number(opacity(old!))).toBeCloseTo(0.5);
    expect(Number(opacity(now!))).toBeCloseTo(0.5);
    expect(Number(now!.getAttribute('x'))).toBeCloseTo(50);
    run(2000 + TRANSITION_MS);
    expect(images(content).map((i) => i.getAttribute('href'))).toEqual(['https://example.com/b.png']);
  });
});

describe('Viewport: an animated fit glides', () => {
  const sized = (): HTMLElement => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, toJSON: () => ({}) }) as DOMRect;
    return el;
  };

  it('moves to the new fit over the transition; a pan stops it', () => {
    const vp = new Viewport(sized(), { pad: 0 });
    vp.setBounds({ x: 0, y: 0, w: 400, h: 300 });
    expect(vp.state).toEqual({ k: 1, tx: 0, ty: 0 });
    vp.setBounds({ x: 0, y: 0, w: 800, h: 600 }, { fit: true, animate: true });
    expect(vp.state.k).toBe(1);
    run(1000);
    run(1000 + TRANSITION_MS / 2);
    expect(vp.state.k).toBeCloseTo(0.75);
    run(1000 + TRANSITION_MS);
    expect(vp.state.k).toBeCloseTo(0.5);
    // a new glide, then the user pans: the glide stops where the pan put the view
    vp.setBounds({ x: 0, y: 0, w: 400, h: 300 }, { fit: true, animate: true });
    run(1000);
    vp.panBy(10, 0);
    const k = vp.state.k;
    run(1000 + TRANSITION_MS);
    expect(vp.state.k).toBe(k);
    vp.destroy();
  });
});
