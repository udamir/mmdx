// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBanner, createEmptyState, createErrorCard } from '../../../src/ui/blocks/messages.js';
import { createI18n } from '../../../src/ui/i18n.js';
import { signal } from '../../../src/ui/signal.js';

const t = createI18n().t;

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

describe('ErrorCard', () => {
  it('title, diagnostics, numbered source with the bad lines, Copy source', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const source = 'flowchart LR\n  a --> \n  b';
    const card = createErrorCard({ title: t('error.title'), diagnostics: ['line 2: missing target', 'x'], source, badLines: [1], t });
    expect(card.el.getAttribute('role')).toBe('alert');
    expect(card.el.querySelector('h2')?.textContent).toBe('This diagram cannot be shown');
    expect([...card.el.querySelectorAll('li')].map((l) => l.textContent)).toEqual(['line 2: missing target', 'x']);
    const lines = [...card.el.querySelectorAll('pre span')];
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.className)).toEqual(['', 'bad', '']);
    const copy = card.el.querySelector<HTMLButtonElement>('.actions button')!;
    expect(copy.textContent).toBe('Copy source');
    copy.click();
    expect(writeText).toHaveBeenCalledWith(source);
    await Promise.resolve();
    await Promise.resolve();
    expect(copy.textContent).toBe('Copied');
  });

  it('no source block or copy without a source; caps the diagnostics; destroy() releases the copy button', () => {
    const card = createErrorCard({ title: 'Too large', diagnostics: Array.from({ length: 30 }, (_, i) => `d${i}`), t });
    expect(card.el.querySelector('pre')).toBeNull();
    expect(card.el.querySelector('button')).toBeNull();
    expect(card.el.querySelectorAll('li')).toHaveLength(20);
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    card.update({ source: 'a' });
    const copy = card.el.querySelector<HTMLButtonElement>('button')!;
    card.destroy();
    copy.click();
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('EmptyState', () => {
  it('text (signal) and an optional action', () => {
    const text = signal('Nothing to compare');
    const onClick = vi.fn();
    const e = createEmptyState({ text, action: { label: 'Open history', onClick } });
    expect(e.el.querySelector('p')?.textContent).toBe('Nothing to compare');
    text.set('No changes');
    expect(e.el.querySelector('p')?.textContent).toBe('No changes');
    const btn = e.el.querySelector('button')!;
    expect(btn.textContent).toBe('Open history');
    btn.click();
    expect(onClick).toHaveBeenCalledOnce();
    e.update({ action: undefined as unknown as { label: string; onClick: () => void } });
    expect(e.el.querySelector('button')).toBeNull();
    e.destroy();
    text.set('gone');
    expect(e.el.querySelector('p')?.textContent).toBe('No changes');
    btn.click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
