// @vitest-environment jsdom
// The component shell (A8): one shadow root, storage that can be swapped, the scheme remembered per product, dialogs
// made on first use, events that stop with the component.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { ComponentShell } from '../../src/view/component-shell.js';

afterEach(() => document.body.replaceChildren());

describe('ComponentShell', () => {
  it('remembers the picked scheme per product, in the storage set last', () => {
    const host = document.createElement('div');
    const a = memoryStorage(), b = memoryStorage({ 'editor.ui': 'dark' });
    const shell = new ComponentShell(host, { product: 'editor', storage: a });
    expect(host.shadowRoot).toBe(shell.shadow);
    shell.chooseScheme('dark');
    expect(a.get('editor.ui')).toBe('dark');
    expect(shell.scheme.peek()).toBe('dark');
    // `ui` set by the host wins over the remembered pick
    shell.setUi('light');
    expect(shell.scheme.peek()).toBe('light');
    shell.destroy();
    // auto: the pick remembered in the storage set last
    const other = new ComponentShell(document.createElement('div'), { product: 'editor', storage: memoryStorage(), ui: 'auto' });
    expect(other.scheme.peek()).toBe('light');
    other.setStorage(b);
    expect(other.scheme.peek()).toBe('dark');
    other.destroy();
  });

  it('emits nothing once destroyed', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shell = new ComponentShell(host, { product: 'viewer', storage: memoryStorage(), schemeKey: 'ui' });
    const seen = vi.fn();
    host.addEventListener('mmdx-test', seen);
    expect(shell.emit('mmdx-test', { a: 1 })).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    shell.destroy();
    shell.emit('mmdx-test', { a: 2 });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
