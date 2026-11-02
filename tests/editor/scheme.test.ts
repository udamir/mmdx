// @vitest-environment jsdom
// The editor's chrome scheme and diagram theme (component architecture §7.5): the theme is the component's state,
// never the document's; the light / dark chrome and the theme are independent; an unpicked theme follows the chrome.
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { ensureBuiltinThemes, getShared } from '../../src/config.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import type { EditorModule } from '../../src/editor/module.js';
import { editorParamsModule } from '../../src/editor/modules/chrome/view-params.js';
import { viewParamsModule } from '../../src/view/modules/view-params.js';

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
const MODULES = [viewParamsModule as unknown as EditorModule, editorParamsModule];
const mount = (value: string, o: ConstructorParameters<typeof DiagramEditor>[1] = {}): DiagramEditor => {
  host = document.createElement('div');
  document.body.append(host);
  ed = new DiagramEditor(host, { value, modules: MODULES, storage: memoryStorage(), ui: 'light', ...o });
  return ed;
};
const click = (sel: string): void => {
  const b = host.shadowRoot!.querySelector<HTMLButtonElement>(sel);
  if (!b) throw new Error(`no ${sel}`);
  b.click();
};

describe('light / dark switch', () => {
  test('with nothing picked, the diagram follows the chrome: Default Light / Default Dark; the file never changes', () => {
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

  test('a theme named in the file is ignored (canvas.theme left the format) and dropped on save', () => {
    getShared().themes.register({ id: 'gh-light', name: 'GH light', extends: 'default-light', appearance: 'light', counterpart: 'gh-dark' });
    const e = mount('flowchart LR\n  a --> b\n%%@ canvas {"theme":"gh-light"}\n');
    expect(e.core.result.themeId).toBe('default-light');
    expect(e.getSource()).not.toContain('gh-light');
  });

  test('a picked theme stays when the chrome switches, never writes the document, and does not flip the chrome', () => {
    const e = mount('flowchart LR\n  a --> b\n');
    e.core.run('setTheme', 'default-dark');
    expect(e.core.scheme.peek()).toBe('light');
    expect(e.core.result.themeId).toBe('default-dark');
    expect(e.core.meta.canvas['theme']).toBeUndefined();
    expect(e.dirty).toBe(false);
    click('.vp-mode [data-ui="dark"]');
    expect(e.core.result.themeId).toBe('default-dark');
    click('.vp-mode [data-ui="light"]');
    expect(e.core.result.themeId).toBe('default-dark');
    // Follow light / dark drops the pick
    e.core.themes.follow();
    expect(e.core.result.themeId).toBe('default-light');
  });

  test('the theme menu: Follow light / dark first, then the themes; a pick is remembered per product', () => {
    const storage = memoryStorage();
    const e = mount('flowchart LR\n  a --> b\n', { storage });
    click('.view-params .mmdx-theme-btn');
    const items = [...host.shadowRoot!.querySelectorAll<HTMLElement>('[role=menu] [role=menuitemradio]')];
    expect(items[0]!.textContent).toContain('Follow light / dark');
    expect(items[0]!.getAttribute('aria-checked')).toBe('true');
    items.find((b) => b.textContent?.includes('Default Dark'))!.click();
    expect(e.core.result.themeId).toBe('default-dark');
    expect(storage.get('editor.theme')).toBe('default-dark');
    expect(storage.get('viewer.theme')).toBeUndefined();
  });

  test('the remembered chrome choice applies on start, and the unpicked diagram follows it', () => {
    host = document.createElement('div');
    document.body.append(host);
    ed = new DiagramEditor(host, { value: 'flowchart LR\n  a --> b\n', modules: MODULES, storage: memoryStorage({ 'editor.ui': 'dark' }) });
    expect(host.getAttribute('data-ui')).toBe('dark');
    expect(ed.core.scheme.peek()).toBe('dark');
    expect(ed.core.result.themeId).toBe('default-dark');
  });

  test('the host sets the theme (theme / theme-dark) and the compact preset', () => {
    const e = mount('flowchart LR\n  a --> b\n', { theme: 'default-dark', compact: true });
    expect(e.core.result.themeId).toBe('default-dark');
    expect(e.core.root.classList.contains('compact')).toBe(true);
    expect(host.shadowRoot!.querySelector('.view-params .vp-export-btn.compact')).not.toBeNull();
    e.core.themes.attr.set('default-light');
    expect(e.core.result.themeId).toBe('default-light');
  });
});

describe('schemeToggle feature', () => {
  test('on by default: the view bar has the light / dark toggle', () => {
    mount('flowchart LR\n  a --> b\n');
    expect(host.shadowRoot!.querySelector('.view-params .vp-mode')).not.toBeNull();
  });

  test('off: no toggle, the theme menu stays, and the host still sets the scheme through ui', () => {
    const e = mount('flowchart LR\n  a --> b\n', { features: { schemeToggle: false }, ui: 'dark' });
    expect(host.shadowRoot!.querySelector('.view-params .vp-mode')).toBeNull();
    expect(host.shadowRoot!.querySelector('.view-params .mmdx-theme-btn')).not.toBeNull();
    expect(e.core.scheme.peek()).toBe('dark');
    expect(e.core.result.themeId).toBe('default-dark');
  });
});
