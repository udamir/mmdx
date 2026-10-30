// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { ensureBuiltinThemes, getShared } from '../../src/config.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { viewParamsModule } from '../../src/editor/modules/chrome/view-params.js';

let host: HTMLElement;
let ed: DiagramEditor;
beforeAll(async () => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
  await ensureBuiltinThemes();
});
afterEach(() => {
  ed?.destroy();
  host?.remove();
});
const mount = (value: string): DiagramEditor => {
  host = document.createElement('div');
  document.body.append(host);
  ed = new DiagramEditor(host, { value, modules: [viewParamsModule], storage: memoryStorage(), ui: 'light' });
  return ed;
};
const click = (sel: string): void => {
  const b = host.shadowRoot!.querySelector<HTMLButtonElement>(sel);
  if (!b) throw new Error(`no ${sel}`);
  b.click();
};

describe('light / dark switch', () => {
  test('the dark UI shows the diagram in the dark counterpart of its theme, without changing the file', () => {
    const e = mount('flowchart LR\n  a --> b\n');
    expect(e.core.result.themeId).toBe('default-light');
    const before = e.getSource();
    click('.vp-mode [data-ui="dark"]');
    expect(e.core.scheme.peek()).toBe('dark');
    expect(e.core.result.themeId).toBe('default-dark');
    expect(e.getSource()).toBe(before);
    expect(e.dirty).toBe(false);
    click('.vp-mode [data-ui="light"]');
    expect(e.core.result.themeId).toBe('default-light');
  });

  test('a linked theme switches to its counterpart; an unlinked one to the house theme', () => {
    const reg = getShared().themes;
    reg.register({ id: 'gh-light', name: 'GH light', extends: 'default-light', appearance: 'light', counterpart: 'gh-dark' });
    reg.register({ id: 'gh-dark', name: 'GH dark', extends: 'default-light', appearance: 'dark', counterpart: 'gh-light' });
    reg.register({ id: 'solo', name: 'Solo', extends: 'default-light', appearance: 'light' });
    const e = mount('flowchart LR\n  a --> b\n%%@ canvas {"theme":"gh-light"}\n');
    click('.vp-mode [data-ui="dark"]');
    expect(e.core.result.themeId).toBe('gh-dark');
    expect(e.core.documentTheme()).toBe('gh-light');
    e.setSource('flowchart LR\n  a --> b\n%%@ canvas {"theme":"solo"}\n');
    expect(e.core.result.themeId).toBe('default-dark');
  });

  test('choosing a theme of the other appearance switches the UI along', () => {
    const e = mount('flowchart LR\n  a --> b\n');
    e.core.run('setTheme', 'default-dark');
    expect(e.core.scheme.peek()).toBe('dark');
    expect(e.core.result.themeId).toBe('default-dark');
    expect(e.core.meta.canvas.theme).toBe('default-dark');
    // back to light: the dark theme's light counterpart
    click('.vp-mode [data-ui="light"]');
    expect(e.core.result.themeId).toBe('default-light');
  });

  test('the remembered UI choice also sets the diagram theme on start', () => {
    host = document.createElement('div');
    document.body.append(host);
    ed = new DiagramEditor(host, { value: 'flowchart LR\n  a --> b\n', modules: [viewParamsModule], storage: memoryStorage({ ui: 'dark' }) });
    expect(host.getAttribute('data-ui')).toBe('dark');
    expect(ed.core.scheme.peek()).toBe('dark');
    expect(ed.core.result.themeId).toBe('default-dark');
  });
});
