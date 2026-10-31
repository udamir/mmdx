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

  it('tools: icon buttons between the text and the action, hidden by a signal', () => {
    const onClick = vi.fn();
    const hidden = signal(false);
    const pill = createPill({ text: 'a → b', tools: [{ id: 'swap', icon: 'M0 0h1', label: 'Swap Before and After', keys: 'x', hidden, onClick }], action: { label: 'Back', onClick: () => undefined }, t });
    const b = pill.el.querySelector<HTMLButtonElement>('.mmdx-pill-tool')!;
    expect(b.getAttribute('aria-label')).toBe('Swap Before and After');
    expect(b.title).toBe('Swap Before and After (X)');
    expect(b.compareDocumentPosition(pill.el.querySelector('.mmdx-pill-btn')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    b.click();
    expect(onClick).toHaveBeenCalledOnce();
    hidden.set(true);
    expect(b.hidden).toBe(true);
  });

  it('content replaces the text visually (the text stays for screen readers); an icon action is round and named', () => {
    const content = document.createElement('span');
    content.textContent = 'chips';
    const pill = createPill({ text: 'a → b', content, action: { label: 'Back', keys: 'escape', icon: 'M6 6l12 12', onClick: () => undefined }, t, formatKeys: fmt });
    expect(pill.el.classList.contains('has-content')).toBe(true);
    expect(pill.el.querySelector('.mmdx-pill-text')!.classList.contains('mmdx-sr')).toBe(true);
    expect(pill.el.querySelector('.mmdx-pill-content')!.textContent).toBe('chips');
    const btn = pill.el.querySelector<HTMLButtonElement>('.mmdx-pill-btn')!;
    expect(btn.classList.contains('icon-only')).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('Back');
    expect(btn.textContent).toBe('');
    expect(btn.title).toBe('Back (Esc)');
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

  it('text tools, a plain action without the back chevron, and an extra class', () => {
    const reload = vi.fn(), keep = vi.fn();
    const pill = createPill({ text: 'Changed by someone else', label: 'Remote change', class: 'remote', tools: [{ id: 'reload', label: 'Reload', onClick: reload }], action: { label: 'Keep mine', plain: true, onClick: keep }, t });
    expect(pill.el.className).toBe('mmdx-pill remote');
    expect(pill.el.getAttribute('aria-label')).toBe('Remote change');
    const tool = pill.el.querySelector<HTMLButtonElement>('[data-tool=reload]')!;
    expect(tool.textContent).toBe('Reload');
    expect(tool.querySelector('svg')).toBeNull();
    tool.click();
    expect(reload).toHaveBeenCalledOnce();
    const btn = pill.el.querySelector<HTMLButtonElement>('[data-f=pill-action]')!;
    expect(btn.textContent).toBe('Keep mine');
    expect(btn.querySelector('svg')).toBeNull();
    expect(btn.classList.contains('plain')).toBe(true);
    btn.click();
    expect(keep).toHaveBeenCalledOnce();
    pill.update({ class: 'issue' });
    expect(pill.el.className).toBe('mmdx-pill issue');
  });
});
