// @vitest-environment jsdom
// The editor's panel stacks are the kernel's (view/modules/panels.ts, A16): the Code panel on the left and Properties +
// Layers on the right in Edit mode; open / close through `setPanel` (remembered under `editor.panels`), the widths and
// heights under `editor.stack.<side>` (the editor's old `panes` / `layersH` keys are dropped: sizes reset once), and the
// canvas insets. In View mode the viewer's Code view and View settings show instead.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { StorageAdapter } from '../../src/ports.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import type { EditorModule } from '../../src/editor/module.js';
import { LAYOUT_MODULES } from '../../src/editor/modules/chrome/index.js';
import { PANEL_MODULES } from '../../src/editor/modules/panels/index.js';
import { codePanelModule } from '../../src/editor/modules/panels/code-panel.js';
import { rightPanelsModule } from '../../src/editor/modules/panels/right-panels.js';

const FLOW = 'flowchart LR\n  A --> B\n';

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

let ed: DiagramEditor | null = null;
afterEach(() => {
  ed?.destroy();
  ed = null;
  document.body.replaceChildren();
});
const mount = (storage: StorageAdapter, opts: { readOnly?: boolean; modules?: readonly EditorModule[] } = {}): DiagramEditor => {
  const host = document.createElement('div');
  document.body.append(host);
  ed = new DiagramEditor(host, { value: FLOW, modules: opts.modules ?? [...LAYOUT_MODULES, codePanelModule, rightPanelsModule], storage, ...(opts.readOnly ? { readOnly: true } : {}) });
  return ed;
};
const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};
const $ = <T extends HTMLElement = HTMLElement>(e: DiagramEditor, sel: string): T => {
  const el = e.core.root.querySelector<T>(sel);
  if (!el) throw new Error(`no ${sel}`);
  return el;
};
const key = (el: Element, k: string): void => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const stack = (e: DiagramEditor, side: 'left' | 'right'): HTMLElement => $(e, `.mmdx-stack[data-side=${side}]`);

describe('editor panel stacks', () => {
  it('the panels sit in the stacks; × closes one (remembered), setPanel opens it again; the insets follow', async () => {
    const storage = memoryStorage();
    const e = mount(storage);
    await flush();
    expect(stack(e, 'left').contains($(e, '.mmdx-panel.code-edit'))).toBe(true);
    const right = stack(e, 'right');
    expect([...right.querySelectorAll('.mmdx-panel')].map((p) => p.classList.contains('props') ? 'props' : 'layers')).toEqual(['props', 'layers']);
    expect(right.getAttribute('part')).toBe('panel');
    expect(right.querySelector<HTMLElement>('.mmdx-split')!.hidden).toBe(false);
    expect(e.core.stackInsets.peek()).toEqual({ left: 372, right: 312 });

    $(e, '.mmdx-panel.code-edit [data-f=panel-close]').click();
    await flush();
    expect(e.core.panels.peek().code).toBe(false);
    expect(storage.get<Record<string, boolean>>('editor.panels')?.['code']).toBe(false);
    expect($(e, '.mmdx-panel.code-edit').hidden).toBe(true);
    expect(stack(e, 'left').classList.contains('open')).toBe(false);
    expect(e.core.stackInsets.peek()?.left).toBe(0);

    $(e, '.mmdx-panel.props [data-f=panel-close]').click();
    await flush();
    expect(right.querySelector<HTMLElement>('.mmdx-split')!.hidden).toBe(true);
    expect(right.classList.contains('open')).toBe(true);

    e.core.run('setPanel', 'code', true);
    await flush();
    expect($(e, '.mmdx-panel.code-edit').hidden).toBe(false);
    expect(storage.get<Record<string, boolean>>('editor.panels')?.['code']).toBe(true);
  });

  it('keyboard resizing remembers the sizes under the kernel keys; the old editor keys are not read', async () => {
    const storage = memoryStorage({ panes: { '--left-w': 500 }, layersH: 180 });
    const e = mount(storage);
    await flush();
    // the editor's old keys are dropped (decision 2026-11-12): the default widths
    expect(stack(e, 'left').style.getPropertyValue('--mmdx-stack-w')).toBe('360px');
    key(stack(e, 'left').querySelector(':scope > .mmdx-grip')!, 'ArrowRight');
    expect(storage.get('editor.stack.left.w')).toBe(376);
    expect(stack(e, 'left').style.getPropertyValue('--mmdx-stack-w')).toBe('376px');
    key(stack(e, 'right').querySelector('.mmdx-split')!, 'ArrowUp');
    expect(storage.get<Record<string, number>>('editor.stack.right.h')).toBeTruthy();
  });

  it('View mode: the viewer\'s View settings (with the Display toggles) and Code view; no Properties, Layers or Code editor', async () => {
    const storage = memoryStorage({ 'editor.panels': { properties: true, layers: true, code: true, 'view-settings': true } });
    const e = mount(storage, { modules: [...LAYOUT_MODULES, ...PANEL_MODULES] });
    await flush();
    expect($(e, '.mmdx-panel.layers .mmdx-panel-title').textContent).toBe('Layers');
    e.setMode('view');
    await e.whenLoaded();
    await flush();
    expect($(e, '.mmdx-panel.props').hidden).toBe(true);
    expect($(e, '.mmdx-panel.code-edit').hidden).toBe(true);
    expect($(e, '.mmdx-panel.layers').hidden).toBe(true);
    const vs = $(e, '.mmdx-panel.view-settings');
    expect(vs.hidden).toBe(false);
    expect(vs.querySelector('.mmdx-panel-title')!.textContent).toBe('View settings');
    // the Display toggles show while viewing (labels, hover highlight, animated edges)
    expect(vs.querySelectorAll('[role=switch]')).toHaveLength(3);
    // the Code view is the viewer's: read-only code, opened from the dock
    e.core.run('setPanel', 'code-view', true);
    await flush();
    expect(stack(e, 'left').contains($(e, '.mmdx-panel.code-panel'))).toBe(true);
    // back to Edit mode: the editor's panels again
    e.setMode('edit');
    await flush();
    expect($(e, '.mmdx-panel.layers').hidden).toBe(false);
    expect(e.core.root.querySelector('.mmdx-panel.view-settings')).toBeNull();
  });

  it('uninstalling leaves no stack behind', async () => {
    const e = mount(memoryStorage());
    await flush();
    e.destroy();
    ed = null;
    expect(document.body.querySelector('div')!.shadowRoot!.childElementCount).toBe(0);
  });
});

describe('the issue pill', () => {
  it('shows at the top centre while the code panel is closed and the code has problems; Open code opens the panel', async () => {
    const e = mount(memoryStorage({ 'editor.panels': { code: false } }));
    await flush();
    const slot = e.core.slots['top-center'];
    expect(slot.querySelector('.mmdx-pill')).toBeNull();
    e.setSource('flowchart LR\n  A --> B\n  B -->\n');
    // the pill block loads on first use
    await vi.waitFor(() => expect(slot.querySelector('.mmdx-pill.issue')).not.toBeNull());
    const pill = slot.querySelector<HTMLElement>('.mmdx-pill.issue')!;
    expect(pill.querySelector('[role=status]')!.textContent).toMatch(/^\d+ problems? in the Mermaid code — line \d+: /);
    pill.querySelector<HTMLButtonElement>('[data-f=pill-action]')!.click();
    await flush();
    expect(e.core.panels.peek().code).toBe(true);
    expect(slot.querySelector('.mmdx-pill')).toBeNull();
  });
});
