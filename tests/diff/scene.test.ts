// @vitest-environment jsdom
// DiffScene (component architecture §7.3, §8.1): paints a DiffSession onto the kernel's canvas area only while it is
// attached, and gives the canvas back on detach (no stage, no second canvas, no morph, the main canvas in place).
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { changeKey } from '../../src/core/diff/merge.js';
import { DiffScene } from '../../src/diff/scene.js';
import { DiffSession } from '../../src/diff/session.js';
import { DiagramCanvas } from '../../src/dom/canvas.js';
import { Morph } from '../../src/dom/morph.js';
import { StrokeStore } from '../../src/dom/pen.js';
import { ViewCore } from '../../src/view/core.js';
import { BaseScene } from '../../src/view/scene.js';

const sample = (name: string, side: string): string => readFileSync(`apps/studio-site/diff-samples/${name}.${side}.mmd`, 'utf8');

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** Another scene to push over the diff (History's Back pops it again). */
class Blank extends BaseScene {
  readonly id = 'blank';
  paints = 0;
  protected paint(): void {
    this.paints++;
  }
}

function mount(): { core: ViewCore; session: DiffSession; scene: DiffScene } {
  const host = document.createElement('div');
  document.body.append(host);
  const core = new ViewCore(host, { product: 'diff', storage: memoryStorage(), css: [], root: { class: 'root', role: 'group' }, areaClass: 'area', canvas: { interaction: 'pan-zoom' } });
  const session = new DiffSession({
    ctx: core.ctx, t: core.i18n.t, emit: (type, detail, cancelable) => core.emit(type, detail, cancelable),
    renderOptions: () => ({ theme: core.shownTheme() }), scheme: () => 'light', name: () => 'diagram',
  });
  const scene = new DiffScene(core, session, { reducedMotion: () => true });
  return { core, session, scene };
}

const svgs = (core: ViewCore): SVGSVGElement[] => [...core.area.querySelectorAll('svg')];

describe('DiffScene', () => {
  it('paints only while attached, repaints in full on attach, and gives the canvas back on detach', async () => {
    const { core, session, scene } = mount();
    await session.load({ before: sample('architecture', 'before'), after: sample('architecture', 'after') });
    // not attached: nothing painted
    expect(core.area.querySelector('.dx-stage')).toBeNull();
    expect(core.canvas.body.childElementCount).toBe(0);

    core.pushScene(scene);
    expect(scene.attached).toBe(true);
    const stage = core.area.querySelector('.dx-stage')!;
    expect(stage.querySelector('.pane.single')!.contains(core.canvas.svg)).toBe(true);
    // the merged state of the morph: highlights, kept removed items
    expect(core.canvas.content.querySelectorAll('.dx-hl').length).toBeGreaterThan(0);
    expect(scene.bounds.peek()).toEqual(session.rendered.peek()!.bounds);

    // side by side: a second canvas, linked to the main one
    session.setView('side');
    expect(stage.querySelectorAll('.pane > svg')).toHaveLength(2);
    expect(stage.querySelector('.pane.before')!.contains(core.canvas.svg)).toBe(true);
    expect(stage.querySelector('.pane.after .pane-title b')!.textContent).toBe(core.i18n.t('diff.view.after'));

    // another scene takes the canvas: the stage, the second canvas and the morph go, the main canvas is back
    const blank = new Blank();
    core.pushScene(blank);
    expect(scene.attached).toBe(false);
    expect(core.area.querySelector('.dx-stage')).toBeNull();
    expect(svgs(core)).toEqual([core.canvas.svg]);
    expect(core.canvas.svg.parentNode).toBe(core.area);
    expect([...core.canvas.content.children]).toEqual([core.canvas.page, core.canvas.body, core.canvas.runs, core.canvas.overlay]);
    expect(core.canvas.body.childElementCount).toBe(0);

    // changes while detached paint nothing
    session.setView('before');
    session.next();
    expect(core.area.querySelector('.dx-stage')).toBeNull();
    expect(core.canvas.content.querySelector('.dx-hl')).toBeNull();

    // back on top: painted in full with the current state
    core.popScene();
    expect(scene.attached).toBe(true);
    expect(core.area.querySelectorAll('.dx-stage .pane > svg')).toHaveLength(1);
    expect(core.canvas.content.querySelector('.dx-hl.dx-selected')!.getAttribute('data-key')).toBe(session.selected.peek());
    core.destroy();
    session.destroy();
  });

  it('marks the selection in every canvas and paints the pen strokes into the second canvas', async () => {
    const { core, session, scene } = mount();
    const store = new StrokeStore(memoryStorage());
    core.strokes.set(store);
    const attachInk = vi.spyOn(DiagramCanvas.prototype, 'attachInk');
    core.pushScene(scene);
    await session.load({ before: sample('architecture', 'before'), after: sample('architecture', 'after') });
    session.setView('side');
    const [main, second] = scene.canvases();
    expect(second).toBeDefined();
    expect(attachInk).toHaveBeenCalledTimes(1);
    expect(attachInk.mock.contexts[0]).toBe(second);
    const ch = session.rendered.peek()!.changes.find((c) => c.status === 'changed')!;
    session.select(changeKey(ch));
    for (const c of [main!, second!]) expect(c.content.querySelector(`.dx-selected[data-key="${changeKey(ch)}"]`)).not.toBeNull();
    // single view again: the second canvas is gone
    session.setView('merged');
    expect(scene.canvases()).toHaveLength(1);
    core.destroy();
    session.destroy();
  });

  it('History mode: the viewed version as it is, with its id in the pane title', async () => {
    const versions = JSON.parse(readFileSync('examples/history/docker-deploy-sequence.json', 'utf8')).versions;
    const { core, session, scene } = mount();
    core.pushScene(scene);
    await session.load({ history: versions });
    session.setVersionsShown(true);
    session.viewVersion(versions[2].id);
    await session.refresh();
    expect(core.area.querySelector('.pane-title b')!.textContent).toBe(versions[2].id);
    expect(core.canvas.content.querySelector('.dx-hl')).toBeNull();
    expect(core.canvas.content.querySelector(':scope > .body-layer')!.childElementCount).toBeGreaterThan(0);
    core.destroy();
    session.destroy();
  });

  it('animates a switch to another version or pair; a repaint of the same one (a filter change) does not', async () => {
    const versions = JSON.parse(readFileSync('examples/history/docker-deploy-sequence.json', 'utf8')).versions;
    const { core, session, scene } = mount();
    const replace = vi.spyOn(Morph.prototype, 'replace');
    const animated = (): boolean | undefined => replace.mock.calls.at(-1)?.[2];
    core.pushScene(scene);
    await session.load({ history: versions });
    await session.refresh();
    expect(core.canvas.content.querySelector('.dx-layer')).not.toBeNull();
    // the first picture has nothing to move from
    expect(replace).not.toHaveBeenCalled();
    session.setVersionsShown(true);
    session.viewVersion(versions[2].id);
    await session.refresh();
    expect(animated()).toBe(true);
    session.viewVersion(versions[3].id);
    await session.refresh();
    expect(animated()).toBe(true);
    expect(core.area.querySelector('.pane-title b')!.textContent).toBe(versions[3].id);
    // back to a comparison: it animates; the same pair repainted does not
    session.setPair(versions[1].id, versions[0].id);
    await session.refresh();
    expect(animated()).toBe(true);
    const calls = replace.mock.calls.length;
    session.setDim(!session.dim.peek());
    await session.refresh();
    expect(replace.mock.calls.length).toBe(calls + 1);
    expect(animated()).toBe(false);
    core.destroy();
    session.destroy();
  });
});
