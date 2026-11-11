// @vitest-environment jsdom
// DiffScene on its SceneHost port (A13b): the scene needs no kernel — a host gives it the insets, the tool dock's
// width, the pen's strokes, CSS and the view / draw events. The canvas's snapshot() and preservePlacement() are what
// History's scene switches use.
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createContext } from '../../src/core/context.js';
import { DiffScene, type SceneHost } from '../../src/diff/scene.js';
import { DiffSession } from '../../src/diff/session.js';
import { DiagramCanvas } from '../../src/dom/canvas.js';
import type { StrokeStore } from '../../src/dom/pen.js';
import { createI18n } from '../../src/i18n.js';
import { signal } from '../../src/reactive/signal.js';
import type { CanvasArea } from '../../src/view/scene.js';

const sample = (name: string, side: string): string => readFileSync(`apps/studio-site/diff-samples/${name}.${side}.mmd`, 'utf8');

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function fakeHost(dock: number): SceneHost & { css: string[]; draws: number } {
  const host = {
    i18n: createI18n(),
    strokes: signal<StrokeStore | null>(null),
    css: [] as string[],
    draws: 0,
    addCss: (css: readonly string[]) => void host.css.push(...css),
    insets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
    dockWidth: () => dock,
    on: () => () => {},
    drew: () => void host.draws++,
  };
  return host;
}

function area(): CanvasArea {
  const el = document.createElement('div');
  document.body.append(el);
  const main = new DiagramCanvas(el, { interaction: 'pan-zoom' });
  return { el, main, createCanvas: (parent, o) => new DiagramCanvas(parent ?? el, { interaction: 'pan-zoom', ...o }), restoreMain: () => void el.append(main.svg) };
}

describe('DiffScene on a SceneHost', () => {
  it('paints with no kernel: CSS from the host, a draw per picture, fit clear of the host\'s tool dock', async () => {
    const host = fakeHost(40);
    const session = new DiffSession({ ctx: createContext(), t: host.i18n.t, emit: () => true, renderOptions: () => ({ theme: 'default' }), scheme: () => 'light', name: () => 'diagram' });
    const scene = new DiffScene(host, session, { reducedMotion: () => true });
    const a = area();
    scene.attach(a);
    await session.load({ before: sample('architecture', 'before'), after: sample('architecture', 'after') });
    expect(host.css.length).toBeGreaterThan(0);
    expect(host.draws).toBeGreaterThan(0);
    expect(a.el.querySelector('.dx-stage .pane.single')!.contains(a.main.svg)).toBe(true);
    expect(scene.insets(0).left).toBe(12 + 40 + 8);
    expect(new DiffScene(fakeHost(0), session, { reducedMotion: () => true }).insets(0).left).toBe(8);
    scene.detach();
    expect(a.el.querySelector('.dx-stage')).toBeNull();
    session.destroy();
  });
});

describe('DiagramCanvas snapshot() and preservePlacement()', () => {
  it('snapshot() copies the picture: the same markup, detached nodes', () => {
    const { main } = area();
    main.show({ defs: [], page: [], body: [{ t: 'rect', attrs: { width: 10, height: 10 } }], runs: [], overlay: [] });
    const snap = main.snapshot();
    expect(snap.content).not.toBe(main.content);
    expect(snap.content.outerHTML).toBe(main.content.outerHTML);
    expect(snap.content.querySelector('rect')).not.toBeNull();
  });

  it('preservePlacement() moves the view with the svg, so the picture stays where it was on screen', () => {
    const { main } = area();
    const at = (left: number, top: number) => ({ left, top, right: left + 100, bottom: top + 100, width: 100, height: 100, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    let box = at(100, 50);
    vi.spyOn(main.svg, 'getBoundingClientRect').mockImplementation(() => box);
    main.restoreView({ k: 2, tx: 10, ty: 20, auto: false });
    main.preservePlacement(() => (box = at(40, 80)));
    expect(main.saveView()).toMatchObject({ k: 2, tx: 10 + 60, ty: 20 - 30, auto: false });
  });
});
