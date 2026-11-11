// @vitest-environment jsdom
// The editor's panel stacks (chrome/panes.ts): the Code panel on the left and Properties + Layers on the right as
// SidePanels in PanelStacks; open / close through `setPanel` (remembered under `panels`), the stacks' widths and the
// Layers height kept under the editor's keys (`panes`, `layersH`), keyboard resizing, the View mode's narrower right
// stack, and the canvas insets.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { StorageAdapter } from '../../src/ports.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { panesModule } from '../../src/editor/modules/chrome/panes.js';
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
const mount = (storage: StorageAdapter, opts: { readOnly?: boolean } = {}): DiagramEditor => {
  const host = document.createElement('div');
  document.body.append(host);
  ed = new DiagramEditor(host, { value: FLOW, modules: [panesModule, codePanelModule, rightPanelsModule], storage, ...opts });
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
    expect(e.core.stackInsets.peek()).toEqual({ left: 372, right: 352 });

    $(e, '.mmdx-panel.code-edit [data-f=panel-close]').click();
    await flush();
    expect(e.core.panels.peek().code).toBe(false);
    expect(storage.get<Record<string, boolean>>('panels')?.['code']).toBe(false);
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
    expect(storage.get<Record<string, boolean>>('panels')?.['code']).toBe(true);
  });

  it('keyboard resizing writes the editor keys: widths in `panes`, the Layers height in `layersH`', async () => {
    const storage = memoryStorage();
    const e = mount(storage);
    await flush();
    key(stack(e, 'left').querySelector(':scope > .mmdx-grip')!, 'ArrowRight');
    key(stack(e, 'right').querySelector(':scope > .mmdx-grip')!, 'ArrowLeft');
    expect(storage.get('panes')).toEqual({ '--left-w': 376, '--right-w': 356 });
    expect(stack(e, 'left').style.getPropertyValue('--mmdx-stack-w')).toBe('376px');
    key(stack(e, 'right').querySelector('.mmdx-split')!, 'ArrowUp');
    expect(storage.get('layersH')).toBe(216);
    expect($(e, '.mmdx-panel.layers').style.flex).toBe('0 0 216px');
    // double-click resets
    stack(e, 'right').querySelector('.mmdx-split')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(storage.get('layersH')).toBeUndefined();
  });

  it('remembered sizes are restored (clamped); View mode has its own right width and only the View settings card', async () => {
    const storage = memoryStorage({ panes: { '--left-w': 500, '--right-w': 9999, '--right-vw': 280 }, layersH: 180, panels: { properties: true, layers: true, code: true } });
    const e = mount(storage);
    await flush();
    expect(stack(e, 'left').style.getPropertyValue('--mmdx-stack-w')).toBe('500px');
    expect(stack(e, 'right').style.getPropertyValue('--mmdx-stack-w')).toBe('640px');
    expect($(e, '.mmdx-panel.layers').style.flex).toBe('0 0 180px');
    expect($(e, '.mmdx-panel.layers .mmdx-panel-title').textContent).toBe('Layers');

    e.setMode('view');
    await flush();
    expect(stack(e, 'right').style.getPropertyValue('--mmdx-stack-w')).toBe('280px');
    expect($(e, '.mmdx-panel.props').hidden).toBe(true);
    expect($(e, '.mmdx-panel.code-edit').hidden).toBe(true);
    expect(stack(e, 'left').classList.contains('open')).toBe(false);
    expect($(e, '.mmdx-panel.layers .mmdx-panel-title').textContent).toBe('View settings');
    expect($(e, '.mmdx-panel.layers [data-f=panel-close]').getAttribute('aria-label')).toBe('Close View settings');
    expect(e.core.stackInsets.peek()).toEqual({ left: 0, right: 292 });
    // the Display toggles show while viewing (labels, hover highlight, animated edges)
    expect(e.core.root.querySelectorAll('.mmdx-panel.layers [role=switch]')).toHaveLength(3);
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
    const e = mount(memoryStorage({ panels: { code: false } }));
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
