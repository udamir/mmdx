// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPill } from '../../../src/ui/blocks/pill.js';
import { createI18n } from '../../../src/ui/i18n.js';
import { signal } from '../../../src/ui/signal.js';

const { t } = createI18n();
const fmt = (k: string): string => (k === 'escape' ? 'Esc' : k);

afterEach(() => document.body.replaceChildren());

describe('Pill', () => {
  it('renders the text as a status and the action button with its shortcut hint', () => {
    const onClick = vi.fn();
    const pill = createPill({ text: 'History · v3 → Working copy', action: { label: 'Back', keys: 'escape', onClick }, t, formatKeys: fmt });
    expect(pill.el.classList.contains('mmdx-pill')).toBe(true);
    expect(pill.el.getAttribute('role')).toBe('group');
    expect(pill.el.getAttribute('aria-label')).toBe('History');
    const text = pill.el.querySelector('.mmdx-pill-text')!;
    expect(text.getAttribute('role')).toBe('status');
    expect(text.textContent).toBe('History · v3 → Working copy');
    const btn = pill.el.querySelector<HTMLButtonElement>('.mmdx-pill-btn')!;
    expect(btn.textContent).toBe('Back');
    expect(btn.title).toBe('Back (Esc)');
    expect(btn.getAttribute('aria-keyshortcuts')).toBe('Escape');
    expect(btn.querySelector('svg')).not.toBeNull();
    btn.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('follows a text signal; update replaces the action and label', () => {
    const text = signal('History · v3');
    const pill = createPill({ text, action: { label: 'Back', onClick: () => undefined }, t });
    const btn = pill.el.querySelector<HTMLButtonElement>('.mmdx-pill-btn')!;
    expect(btn.title).toBe('Back');
    expect(btn.hasAttribute('aria-keyshortcuts')).toBe(false);
    text.set('History · v4');
    expect(pill.el.querySelector('.mmdx-pill-text')!.textContent).toBe('History · v4');
    const onClick = vi.fn();
    pill.update({ action: { label: 'Close', onClick }, label: 'Compare' });
    expect(btn.textContent).toBe('Close');
    expect(pill.el.getAttribute('aria-label')).toBe('Compare');
    btn.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('destroy removes the pill and its listeners', () => {
    const text = signal('a');
    const onClick = vi.fn();
    const pill = createPill({ text, action: { label: 'Back', onClick }, t });
    document.body.append(pill.el);
    const el = pill.el;
    pill.destroy();
    expect(el.isConnected).toBe(false);
    text.set('b');
    expect(el.querySelector('.mmdx-pill-text')!.textContent).toBe('a');
    el.querySelector<HTMLButtonElement>('.mmdx-pill-btn')!.click();
    expect(onClick).not.toHaveBeenCalled();
  });
});
