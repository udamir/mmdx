// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Dialogs } from '../../src/ui/dialog.js';
import { createI18n } from '../../src/ui/i18n.js';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const setup = (t?: Parameters<typeof createI18n>[1]) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  return { root, dialogs: new Dialogs(root, t ? createI18n('de', t).t : undefined) };
};
const buttons = (root: ShadowRoot): HTMLButtonElement[] => [...root.querySelectorAll<HTMLButtonElement>('.mmdx-dialog button')];
const key = (el: Element, k: string, shift = false): void => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));

afterEach(() => document.body.replaceChildren());

describe('Dialogs', () => {
  it('confirm: modal with a title, a message, Cancel and OK in English by default', async () => {
    const { root, dialogs } = setup();
    const answer = dialogs.confirm('Delete?', 'The item goes.');
    const box = root.querySelector('.mmdx-dialog')!;
    expect(box.getAttribute('role')).toBe('dialog');
    expect(box.getAttribute('aria-modal')).toBe('true');
    expect(root.getElementById(box.getAttribute('aria-labelledby')!)!.textContent).toBe('Delete?');
    expect(box.querySelector('p')!.textContent).toBe('The item goes.');
    expect(buttons(root).map((b) => b.textContent)).toEqual(['Cancel', 'OK']);
    await tick();
    expect(root.activeElement).toBe(buttons(root)[1]); // the primary button
    buttons(root)[1]!.click();
    expect(await answer).toBe(true);
    expect(root.querySelector('.mmdx-dialog')).toBeNull();
  });

  it('button labels come through the host t; danger confirms; Esc and the backdrop cancel', async () => {
    const { root, dialogs } = setup({ 'dialog.ok': 'Gut', 'dialog.cancel': 'Abbrechen' });
    const a = dialogs.confirm('x', 'y', { danger: true });
    expect(buttons(root).map((b) => b.textContent)).toEqual(['Abbrechen', 'Gut']);
    expect(buttons(root)[1]!.className).toBe('danger');
    key(root.querySelector('.mmdx-dialog')!, 'Escape');
    expect(await a).toBe(false);
    const b = dialogs.confirm('x', 'y', { ok: 'Remove', cancel: 'Keep' });
    expect(buttons(root).map((x) => x.textContent)).toEqual(['Keep', 'Remove']);
    root.querySelector('.mmdx-dialog-back')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(await b).toBe(false);
  });

  it('Tab stays inside the dialog', async () => {
    const { root, dialogs } = setup();
    void dialogs.confirm('x', 'y');
    await tick();
    const [cancel, ok] = buttons(root);
    key(ok!, 'Tab');
    expect(root.activeElement).toBe(cancel);
    key(cancel!, 'Tab', true);
    expect(root.activeElement).toBe(ok);
  });

  it('prompt: validates (an empty name keeps it open with a message), Enter accepts, the cancel label can be set', async () => {
    const { root, dialogs } = setup();
    const answer = dialogs.prompt('Name', { label: 'Layer name', value: 'a', cancel: 'Back', validate: (v) => (v === 'taken' ? 'Already used' : null) });
    await tick();
    const input = root.querySelector<HTMLInputElement>('.mmdx-dialog input')!;
    expect(input.getAttribute('aria-label')).toBe('Layer name');
    expect(buttons(root).map((b) => b.textContent)).toEqual(['Back', 'OK']);
    input.value = 'taken';
    buttons(root)[1]!.click();
    expect(root.querySelector('.err')!.textContent).toBe('Already used');
    expect(root.querySelector('.mmdx-dialog')).not.toBeNull();
    input.value = '  ';
    key(input, 'Enter');
    expect(root.querySelector('.err')!.textContent).toBe('Enter a name');
    input.value = ' New ';
    key(input, 'Enter');
    expect(await answer).toBe('New');
  });

  it('prompt resolves null when cancelled', async () => {
    const { root, dialogs } = setup();
    const answer = dialogs.prompt('Name');
    await tick();
    buttons(root)[0]!.click();
    expect(await answer).toBeNull();
  });

  it('destroy closes every open dialog and resolves each with its cancel value', async () => {
    const { root, dialogs } = setup();
    const a = dialogs.confirm('A', 'a');
    const b = dialogs.prompt('B');
    const c = dialogs.choose({ title: 'C', cancel: 'stay', buttons: [{ label: 'Go', value: 'go' }] });
    expect(root.querySelectorAll('.mmdx-dialog')).toHaveLength(3);
    dialogs.destroy();
    expect(root.querySelector('.mmdx-dialog-back')).toBeNull();
    expect(await Promise.all([a, b, c])).toEqual([false, null, 'stay']);
    dialogs.destroy(); // nothing left: no-op
  });
});
