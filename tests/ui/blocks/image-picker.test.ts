// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImagePicker } from '../../../src/ui/blocks/image-picker.js';
import { createI18n } from '../../../src/i18n.js';

afterEach(() => document.body.replaceChildren());
const t = createI18n().t;
const check = (u: string): string | null => (u.startsWith('https://') ? null : 'Only https images are allowed here');
const typeUrl = (el: HTMLElement, v: string): void => {
  const i = el.querySelector<HTMLInputElement>('.imp-url')!;
  i.value = v;
  i.dispatchEvent(new Event('input'));
};
const png = new File(['x'], 'a.png', { type: 'image/png' });

describe('ImagePicker', () => {
  it('the URL is checked while typing; a valid one is submitted', () => {
    const onSubmit = vi.fn();
    const p = createImagePicker({ t, check, onSubmit });
    const add = p.el.querySelector<HTMLButtonElement>('.imp-row button')!;
    expect(add.disabled).toBe(true);
    typeUrl(p.el, 'http://x/a.png');
    expect(p.el.querySelector('.imp-error')!.textContent).toBe('Only https images are allowed here');
    expect(p.el.querySelector('.imp-url')!.getAttribute('aria-invalid')).toBe('true');
    typeUrl(p.el, 'https://x/a.png');
    add.click();
    expect(onSubmit).toHaveBeenCalledWith('https://x/a.png');
    // without an upload there is no drop zone, and a file is refused
    expect(p.el.querySelector<HTMLElement>('.imp-drop')!.hidden).toBe(true);
  });

  it('without upload a file is refused; with it the file is uploaded and its URL submitted', async () => {
    const onRefused = vi.fn();
    const none = createImagePicker({ t, check, onSubmit: () => undefined, onRefused });
    await none.takeFile(png);
    expect(onRefused).toHaveBeenCalledWith('Images can be added by URL; uploading is not configured here');
    const onSubmit = vi.fn();
    const p = createImagePicker({ t, check, onSubmit, upload: async (f) => `https://cdn/${f.name}` });
    expect(p.el.querySelector<HTMLElement>('.imp-drop')!.hidden).toBe(false);
    await p.takeFile(png);
    expect(onSubmit).toHaveBeenCalledWith('https://cdn/a.png');
    await p.takeFile(new File(['x'], 'a.txt', { type: 'text/plain' }));
    const failing = createImagePicker({ t, check, onSubmit, upload: async () => Promise.reject(new Error('quota')) });
    await failing.takeFile(png);
    expect(failing.el.querySelector('.imp-status')!.textContent).toBe('Upload failed: quota');
  });

  it('a big picture is offered a reduction before the upload', async () => {
    const upload = vi.fn(async (f: File) => `https://cdn/${f.name}`);
    const reduce = vi.fn(async () => new File(['y'], 'a.webp', { type: 'image/webp' }));
    const p = createImagePicker({ t, check, onSubmit: () => undefined, upload, measure: async () => ({ w: 4000, h: 3000 }), reduce });
    await p.takeFile(png);
    expect(p.el.querySelector('.imp-offer span')!.textContent).toBe('a.png is 4000 × 3000 px.');
    expect(upload).not.toHaveBeenCalled();
    p.el.querySelector<HTMLButtonElement>('.imp-offer button')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(reduce).toHaveBeenCalledWith(png, 1600);
    expect(upload.mock.calls[0]![0].name).toBe('a.webp');
  });

  it('a pasted picture goes the same way; Remove image in selection mode', async () => {
    const upload = vi.fn(async () => 'https://cdn/p.png');
    const onRemove = vi.fn();
    const p = createImagePicker({ t, check, onSubmit: () => undefined, upload, value: 'https://x/old.png', onRemove, submitLabel: 'Replace image' });
    expect(p.url).toBe('https://x/old.png');
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: { files: [png] } });
    p.el.dispatchEvent(ev);
    await new Promise((r) => setTimeout(r, 0));
    expect(upload).toHaveBeenCalled();
    p.el.querySelector<HTMLButtonElement>('.imp-foot button')!.click();
    expect(onRemove).toHaveBeenCalled();
  });
});
