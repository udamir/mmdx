// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { h } from '../../src/ui/h.js';
import { ViewCore } from '../../src/view/core.js';
import { lazyModule, orderModules, type ViewModule } from '../../src/view/module.js';
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

describe('module scope', () => {
  it('scope.on / provide / computed / mount (also after install) are muted while suspended and gone after uninstall', () => {
    const core = mount();
    const calls: string[] = [];
    const late = h('i', { class: 'late' });
    let s!: Parameters<ViewModule<ViewCore>['install']>[0];
    const m: ViewModule<ViewCore> = {
      id: 'scoped', when: { stage: ['document'] },
      install(scope) {
        s = scope;
        scope.on('draw', () => calls.push('draw'));
        scope.provide('fitView', () => calls.push('fit'));
        const dbl = scope.computed(() => core.tool() === 'pen');
        scope.effect(() => void calls.push(`pen:${dbl()}`));
      },
    };
    core.useModules([m]);
    s.mount(core.slots.overlay, late);
    expect(late.isConnected).toBe(true);
    core.fire('draw');
    core.run('fitView');
    core.tool.set('pen');
    expect(calls).toEqual(['pen:false', 'draw', 'fit', 'pen:true']);
    calls.length = 0;
    core.stage.set('history');
    expect(late.isConnected).toBe(false);
    core.fire('draw');
    expect(core.has('fitView')).toBe(false);
    core.stage.set('document');
    expect(late.isConnected).toBe(true);
    const again = h('b');
    const unmount = s.mount(core.slots.overlay, again);
    core.stage.set('history');
    unmount();
    core.stage.set('document');
    expect(again.isConnected).toBe(false);
    expect(core.slots.overlay.childNodes.length).toBe(1);
    core.useModules([]);
    expect(late.isConnected).toBe(false);
    calls.length = 0;
    core.fire('draw');
    core.tool.set('hand');
    expect(core.has('fitView')).toBe(false);
    expect(calls).toEqual([]);
  });

  it('warns when module code registers on the core after install (not removed with the module)', () => {
    const core = mount();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const btn = h('button');
    core.useModules([{ id: 'leaky', install: (scope) => scope.listen(btn, 'click', () => void core.on('draw', () => undefined)) }]);
    btn.click();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toContain('leaky');
    warn.mockRestore();
  });

  it('a lazy part\'s DOM placed straight into the root is the module\'s (detached while suspended, removed on uninstall)', async () => {
    const core = mount();
    const el = h('div', { class: 'direct' });
    const m: ViewModule<ViewCore> = { id: 'lazy', when: { stage: ['document'] }, install: (scope) => void scope.load(), load: async () => ({ activate: (scope) => void scope.core.root.append(el) }) };
    core.useModules([m]);
    await core.moduleScope('lazy')!.load();
    expect(el.parentNode).toBe(core.root);
    core.stage.set('history');
    expect(el.isConnected).toBe(false);
    core.stage.set('document');
    expect(el.parentNode).toBe(core.root);
    core.useModules([]);
    expect(el.isConnected).toBe(false);
  });

  it('a module that read a feature while installing is installed again when the feature changes', () => {
    const features = new Set(['help']);
    const core = mount({ feature: (n) => features.has(n) });
    let installs = 0;
    core.useModules([{ id: 'bar', install: (scope) => void (installs++, scope.core.feature('help')) }]);
    core.refreshModules();
    expect(installs).toBe(1);
    features.add('other');
    core.refreshModules();
    expect(installs).toBe(1);
    features.delete('help');
    core.refreshModules();
    expect(installs).toBe(2);
  });

  it('a refresh asked for while one runs (a module changing the stage) runs after it, with the new stage', () => {
    const core = mount();
    const seen: string[] = [];
    core.useModules([
      { id: 'switch', install: () => void core.stage.set('history') },
      { id: 'doc-only', when: { stage: ['document'] }, install: (scope) => scope.effect(() => void seen.push('active')) },
    ]);
    expect(core.stage.peek()).toBe('history');
    expect(core.moduleScope('doc-only')?.active).toBe(false);
    expect(seen).toEqual([]);
  });

  it('orderModules reports a cycle and an unknown `after`', () => {
    const warn = vi.fn();
    const out = orderModules([{ id: 'a', after: ['b'] }, { id: 'b', after: ['a'] }, { id: 'c', after: ['zz'] }], warn);
    expect(out.map((m) => m.id)).toEqual(['b', 'a', 'c']);
    expect(warn.mock.calls.map((c) => c[0])).toEqual(['a: "after" cycle', 'c: "after" zz missing']);
  });

  it('lazyModule applies the real module\'s own enabled() once loaded', async () => {
    let realOn = true;
    const m = lazyModule<ViewCore>({ id: 'lz' }, async () => ({ id: 'lz', enabled: () => realOn, install: () => undefined }));
    const core = mount();
    core.useModules([m]);
    await core.moduleScope('lz')!.load();
    realOn = false;
    core.refreshModules();
    expect(core.moduleIds).toEqual([]);
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

  it('the menu ticks the pick the shown theme comes from: none while the host attribute overrides a remembered pick', () => {
    const core = mount({ storage: memoryStorage({ 'viewer.theme': 'stored' }), ui: 'light', theme: 'forced' });
    expect(core.shownTheme()).toBe('forced');
    expect(core.themes.picked()).toBeNull();
    core.themes.choose('mine');
    expect(core.themes.picked()).toBe('mine');
    expect(mount({ storage: memoryStorage({ 'viewer.theme': 'stored' }), ui: 'light' }).themes.picked()).toBe('stored');
  });

  it('ui "auto" follows the remembered toggle, else the page', () => {
    const storage = memoryStorage({ 'viewer.ui': 'dark' });
    const core = mount({ storage, ui: 'light' });
    expect(core.scheme.peek()).toBe('light');
    core.setUi('auto');
    expect(core.scheme.peek()).toBe('dark');
  });

  it('a scheme flip that keeps the theme repaints nothing', () => {
    const core = mount({ storage: memoryStorage(), ui: 'light' });
    core.themes.choose('default-light');
    const theme = vi.fn();
    core.on('theme', theme);
    core.setUi('dark');
    expect(theme).not.toHaveBeenCalled();
    core.themes.follow();
    expect(theme).toHaveBeenCalledOnce();
  });
});
