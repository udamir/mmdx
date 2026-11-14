// A host's editor module (A10a): typed with EditorModuleApi, it installs among the editor's own modules and reaches
// the document, the selection and the kernel through it.
// @vitest-environment jsdom
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { EditorModule as HostModule, EditorModuleApi } from '../../src/editor/api.js';
import type { EditorOptions } from '../../src/editor/editor.js';
import { DEFAULT_MODULES } from '../../src/editor/modules/index.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { GESTURE, PAINT } from '../../src/editor/lib/priorities.js';

describe('EditorModuleApi', () => {
  it('a host module goes in the modules list and sees the document through the API', () => {
    const seen: string[] = [];
    const mine: HostModule = {
      id: 'host-counter',
      install(scope) {
        expectTypeOf(scope.core).toEqualTypeOf<EditorModuleApi>();
        scope.on('model', () => void seen.push(scope.core.code));
        scope.provide('documentName', () => 'from-host');
      },
    };
    const modules: EditorOptions['modules'] = [...DEFAULT_MODULES, mine];
    const host = document.createElement('div');
    document.body.append(host);
    const e = new DiagramEditor(host, { value: 'flowchart LR\n  a --> b', storage: memoryStorage(), modules });
    e.setSource('flowchart LR\n  a --> c');
    expect(seen.at(-1)).toContain('a --> c');
    expect(e.core.run('documentName')).toBe('from-host');
    e.destroy();
  });

  it('scope.gesture and scope.painter register by named priority, muted while suspended and gone on uninstall (A10h)', () => {
    let on = true;
    const down = vi.fn(() => ({ move: () => undefined }));
    const paint = vi.fn(() => []);
    const mine: HostModule = {
      id: 'host-gestures',
      enabled: () => on,
      when: { mode: ['edit'] },
      install(scope) {
        // above the editor's handles: asked first
        scope.gesture({ id: 'mine', priority: GESTURE.handle + 1, down });
        scope.painter({ id: 'mine', order: PAINT.kind + 1, paint });
      },
    };
    const host = document.createElement('div');
    document.body.append(host);
    const e = new DiagramEditor(host, { value: 'flowchart LR\n  a --> b', storage: memoryStorage(), modules: [...DEFAULT_MODULES, mine] });
    const core = e.core;
    const press = (): unknown => core.startGesture(new MouseEvent('pointerdown') as PointerEvent, core.hitTest({ target: null, clientX: 0, clientY: 0 }));
    expect(press()).not.toBeNull();
    expect(down).toHaveBeenCalledTimes(1);
    core.drawOverlay();
    expect(paint).toHaveBeenCalled();
    // suspended (view mode): not asked
    core.setMode('view');
    press();
    expect(down).toHaveBeenCalledTimes(1);
    core.setMode('edit');
    press();
    expect(down).toHaveBeenCalledTimes(2);
    // uninstalled: gone
    on = false;
    core.refreshModules();
    paint.mockClear();
    press();
    core.drawOverlay();
    expect(down).toHaveBeenCalledTimes(2);
    expect(paint).not.toHaveBeenCalled();
    e.destroy();
  });

  it('the guide\'s examples (docs/guide/editor-modules.md) install and run', () => {
    const wordCount: HostModule = {
      id: 'host-word-count',
      install(scope) {
        const core = scope.core;
        const badge = document.createElement('span');
        scope.slot('bottom-right').append(badge);
        const update = (): void => {
          badge.textContent = `${core.code.split(/\s+/).filter(Boolean).length} words`;
        };
        scope.on('model', update);
        update();
      },
    };
    const ring: HostModule = {
      id: 'host-ring',
      install(scope) {
        const core = scope.core;
        scope.painter({
          id: 'host-ring',
          order: 90,
          paint(k) {
            const s = core.primary(), g = core.geom;
            const b = s?.kind === 'node' && g.type === 'flowchart' ? g.nodes.get(s.id) : undefined;
            if (!b) return [];
            return [{ t: 'circle', attrs: { class: 'host-ring', cx: b.x, cy: b.y, r: Math.max(b.w, b.h) / 2 + 8 / k, 'stroke-width': 1.5 / k } }];
          },
        });
        scope.gesture({
          id: 'host-stamp',
          priority: 55,
          down(ev, hit) {
            if (core.mode.peek() !== 'edit' || !ev.altKey || !hit.item) return null;
            return { move() {}, click: () => core.toast(`${hit.item!.kind} ${hit.item!.id}`) };
          },
        });
      },
    };
    const host = document.createElement('div');
    document.body.append(host);
    const e = new DiagramEditor(host, { value: 'flowchart LR\n  a --> b', storage: memoryStorage(), modules: [...DEFAULT_MODULES, wordCount, ring] });
    expect(e.core.root.textContent).toContain('5 words');
    e.core.select([{ kind: 'node', id: 'a' }]);
    e.core.drawOverlay();
    expect(e.core.dom.overlay.querySelector('.host-ring')).toBeTruthy();
    e.destroy();
  });
});


describe('kind modules (A11d): installed only for their diagram type', () => {
  it('the ER table and the sequence gestures install with an ER or a sequence document, and go when it changes type', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const e = new DiagramEditor(host, { value: 'flowchart LR\n  a --> b', storage: memoryStorage() });
    await e.whenLoaded();
    expect(e.core.moduleIds).not.toContain('er-table');
    expect(e.core.moduleIds).not.toContain('sequence');
    e.setSource('erDiagram\n  A ||--o{ B : has\n');
    await e.whenLoaded();
    expect(e.core.moduleIds).toContain('er-table');
    expect(e.core.moduleIds).not.toContain('sequence');
    e.setSource('sequenceDiagram\n  A->>B: hi\n');
    await e.whenLoaded();
    expect(e.core.moduleIds).toContain('sequence');
    expect(e.core.moduleIds).not.toContain('er-table');
    e.destroy();
  });
});
