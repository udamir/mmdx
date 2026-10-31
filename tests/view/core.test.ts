// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { h } from '../../src/ui/h.js';
import { ViewCore } from '../../src/view/core.js';
import type { ViewModule } from '../../src/view/module.js';
import { BaseScene, type CanvasArea } from '../../src/view/scene.js';

const mount = (o: Partial<ConstructorParameters<typeof ViewCore>[1]> = {}): ViewCore => {
  const host = document.createElement('div');
  document.body.append(host);
  return new ViewCore(host, { product: 'viewer', storage: memoryStorage(), css: [], root: { class: 'root', role: 'img' }, areaClass: 'stage', canvas: { interaction: 'pan-zoom' }, ...o });
};

const key = (core: ViewCore, k: string): void => {
  core.root.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true }));
};

afterEach(() => document.body.replaceChildren());

describe('ViewCore shell', () => {
  it('builds the root, the canvas area with the main canvas, and the slots', () => {
    const core = mount();
    expect(core.shadow.querySelector('.root')).toBe(core.root);
    expect(core.area.contains(core.canvas.svg)).toBe(true);
    for (const n of ['top-left', 'top-center', 'top-right', 'left-dock', 'bottom-center', 'bottom-right'] as const) expect(core.area.contains(core.slots[n])).toBe(true);
    for (const n of ['left-stack', 'right-stack', 'overlay'] as const) expect(core.root.contains(core.slots[n])).toBe(true);
    core.destroy();
    expect(core.shadow.querySelector('.root')).toBeNull();
  });
});

describe('module host', () => {
  const probe = (): { m: ViewModule<ViewCore>; calls: string[]; btn: HTMLElement } => {
    const calls: string[] = [];
    const btn = h('button', null, 'x');
    const m: ViewModule<ViewCore> = {
      id: 'probe',
      when: { stage: ['document'] },
      install(scope) {
        const core = scope.core;
        scope.slot('top-right').append(btn);
        core.on('draw', () => calls.push('draw'));
        scope.listen(btn, 'click', () => calls.push('click'));
        scope.effect(() => {
          calls.push(`mode:${core.mode()}`);
        });
        core.provide('fitView', () => calls.push('fit'));
        core.shortcuts.add({ id: 'p', keys: ['x'], label: 'x', group: 'g', run: () => void calls.push('key') });
        return () => calls.push('uninstalled');
      },
    };
    return { m, calls, btn };
  };

  it('installs, suspends (DOM detached, listeners / actions / shortcuts muted), resumes and uninstalls', () => {
    const core = mount();
    const { m, calls, btn } = probe();
    core.useModules([m]);
    expect(core.moduleIds).toEqual(['probe']);
    expect(core.slots['top-right'].contains(btn)).toBe(true);
    core.fire('draw');
    btn.click();
    core.run('fitView');
    key(core, 'x');
    expect(calls).toEqual(['mode:view', 'draw', 'click', 'fit', 'key']);
    calls.length = 0;

    core.stage.set('history');
    expect(core.moduleScope('probe')?.active).toBe(false);
    expect(core.slots['top-right'].contains(btn)).toBe(false);
    core.fire('draw');
    btn.click();
    expect(core.has('fitView')).toBe(false);
    expect(core.run('fitView')).toBeUndefined();
    key(core, 'x');
    core.mode.set('edit');
    expect(calls).toEqual([]);

    core.stage.set('document');
    expect(core.slots['top-right'].contains(btn)).toBe(true);
    expect(calls).toEqual(['mode:edit']);
    core.fire('draw');
    expect(calls).toEqual(['mode:edit', 'draw']);

    core.useModules([]);
    expect(core.moduleIds).toEqual([]);
    expect(btn.isConnected).toBe(false);
    expect(calls.at(-1)).toBe('uninstalled');
    calls.length = 0;
    core.fire('draw');
    key(core, 'x');
    expect(core.has('fitView')).toBe(false);
    expect(calls).toEqual([]);
  });

  it('keeps a suspended module\'s slot position and orders modules by `after`', () => {
    const core = mount();
    const mk = (id: string, after?: string[]): ViewModule<ViewCore> => ({
      id, ...(after ? { after } : {}), ...(id === 'b' ? { when: { mode: ['view'] as const } } : {}),
      install(scope) {
        scope.slot('bottom-right').append(h('span', { class: id }));
      },
    });
    core.useModules([mk('c', ['b']), mk('a'), mk('b', ['a'])]);
    expect(core.moduleIds).toEqual(['a', 'b', 'c']);
    const order = (): string[] => [...core.slots['bottom-right'].children].map((e) => e.className);
    expect(order()).toEqual(['a', 'b', 'c']);
    core.mode.set('edit');
    expect(order()).toEqual(['a', 'c']);
    core.mode.set('view');
    expect(order()).toEqual(['a', 'b', 'c']);
  });

  it('re-evaluates enabled() and loads a lazy part once', async () => {
    const core = mount();
    let on = false;
    const activate = vi.fn((scope) => scope.slot('overlay').append(h('i', { class: 'lazy' })));
    const m: ViewModule<ViewCore> = { id: 'opt', enabled: () => on, install: () => undefined, load: async () => ({ css: ['.lazy{}'], activate }) };
    core.useModules([m]);
    expect(core.moduleIds).toEqual([]);
    on = true;
    core.refreshModules();
    expect(core.moduleIds).toEqual(['opt']);
    await Promise.all([core.moduleScope('opt')!.load(), core.moduleScope('opt')!.load()]);
    expect(activate).toHaveBeenCalledOnce();
    expect(core.slots.overlay.querySelector('.lazy')).not.toBeNull();
    on = false;
    core.refreshModules();
    expect(core.slots.overlay.querySelector('.lazy')).toBeNull();
  });
});

describe('scenes', () => {
  class Probe extends BaseScene {
    readonly id: string;
    paints: string[] = [];
    constructor(id: string) {
      super();
      this.id = id;
    }
    protected paint(full: boolean): void {
      this.paints.push(full ? 'full' : 'update');
      (this.area as CanvasArea).main.setOverlay([]);
    }
  }

  it('only the attached scene paints; a popped scene\'s owner repaints in full', () => {
    const core = mount();
    const doc = new Probe('doc'), hist = new Probe('hist');
    core.pushScene(doc);
    expect(core.scene).toBe(doc);
    core.invalidate();
    expect(doc.paints).toEqual(['full', 'update']);
    core.pushScene(hist);
    doc.invalidate();
    expect(doc.paints).toEqual(['full', 'update']);
    expect(hist.paints).toEqual(['full']);
    core.popScene();
    expect(core.scene).toBe(doc);
    expect(doc.paints).toEqual(['full', 'update', 'full']);
  });
});

describe('theme', () => {
  it('follows the scheme while nothing is picked; a pick stays across scheme changes; follow clears it', () => {
    const storage = memoryStorage();
    const core = mount({ storage, ui: 'light' });
    expect(core.shownTheme()).toBe('default-light');
    core.setUi('dark');
    expect(core.shownTheme()).toBe('default-dark');
    core.themes.choose('default-light');
    expect(core.shownTheme()).toBe('default-light');
    expect(storage.get('viewer.theme')).toBe('default-light');
    core.setUi('light');
    expect(core.shownTheme()).toBe('default-light');
    core.themes.follow();
    expect(core.shownTheme()).toBe('default-light');
    core.setUi('dark');
    expect(core.shownTheme()).toBe('default-dark');
  });

  it('the host attribute wins over a remembered pick; a pick made in the session wins over the attribute; theme-dark applies while dark', () => {
    const storage = memoryStorage({ 'viewer.theme': 'stored' });
    const core = mount({ storage, ui: 'light', theme: 'forced', themeDark: 'night' });
    expect(core.shownTheme()).toBe('forced');
    core.setUi('dark');
    expect(core.shownTheme()).toBe('night');
    core.themes.choose('mine');
    expect(core.shownTheme()).toBe('mine');
    const other = mount({ storage: memoryStorage({ 'viewer.theme': 'stored' }), ui: 'light' });
    expect(other.shownTheme()).toBe('stored');
  });

  it('the scheme toggle is remembered per product and does not touch the theme', () => {
    const storage = memoryStorage();
    const core = mount({ storage });
    const seen = vi.fn();
    core.host.addEventListener('mmdx-ui', seen);
    core.themes.choose('default-light');
    core.chooseScheme('dark');
    expect(core.scheme.peek()).toBe('dark');
    expect(core.host.getAttribute('data-ui')).toBe('dark');
    expect(storage.get('viewer.ui')).toBe('dark');
    expect(core.shownTheme()).toBe('default-light');
    expect(seen).toHaveBeenCalledOnce();
    expect(mount({ storage }).scheme.peek()).toBe('dark');
  });
});
