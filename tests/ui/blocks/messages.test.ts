// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBanner } from '../../../src/ui/blocks/messages.js';
import { signal } from '../../../src/reactive/signal.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('Banner', () => {
  it('a status line hidden while empty, following its text signal and tone', () => {
    const text = signal('');
    const b = createBanner({ text });
    expect(b.el.getAttribute('role')).toBe('status');
    expect(b.el.hidden).toBe(true);
    expect(b.el.classList.contains('tone-warn')).toBe(true);
    text.set('The diagram type changed');
    expect(b.el.hidden).toBe(false);
    expect(b.el.textContent).toBe('The diagram type changed');
    b.update({ tone: 'error' });
    expect(b.el.className).toBe('mmdx-banner tone-error');
    expect(b.el.textContent).toBe('The diagram type changed');
    b.destroy();
    text.set('');
    expect(b.el.hidden).toBe(false);
  });

  it('takes a plain string', () => {
    expect(createBanner({ text: 'x', tone: 'info' }).el.hidden).toBe(false);
  });
});
