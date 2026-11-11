// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSchemeToggle, type Scheme } from '../../../src/ui/blocks/scheme-toggle.js';
import { createI18n } from '../../../src/i18n.js';
import { signal } from '../../../src/reactive/signal.js';

const { t } = createI18n();

const key = (el: Element, k: string): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};

afterEach(() => document.body.replaceChildren());

describe('SchemeToggle', () => {
  it('renders a labelled radio group of sun and moon', () => {
    const tg = createSchemeToggle({ scheme: 'light', onChange: () => undefined, t });
    expect(tg.el.classList.contains('vp-mode')).toBe(true);
    expect(tg.el.getAttribute('role')).toBe('radiogroup');
    expect(tg.el.getAttribute('aria-label')).toBe('Appearance');
    const [light, dark] = [...tg.el.querySelectorAll<HTMLButtonElement>('[role=radio]')];
    expect(light!.getAttribute('aria-label')).toBe('Light');
    expect(light!.title).toBe('Light');
    expect(dark!.getAttribute('aria-label')).toBe('Dark');
    expect(light!.getAttribute('aria-checked')).toBe('true');
    expect(dark!.getAttribute('aria-checked')).toBe('false');
    expect(light!.tabIndex).toBe(0);
    expect(dark!.tabIndex).toBe(-1);
    expect(light!.querySelector('svg')).not.toBeNull();
  });

  it('clicks call onChange (not for the current scheme); the checked radio follows the signal', () => {
    const scheme = signal<Scheme>('light');
    const onChange = vi.fn((v: Scheme) => scheme.set(v));
    const tg = createSchemeToggle({ scheme, onChange, t });
    const [light, dark] = [...tg.el.querySelectorAll<HTMLButtonElement>('[role=radio]')];
    light!.click();
    expect(onChange).not.toHaveBeenCalled();
    dark!.click();
    expect(onChange).toHaveBeenCalledWith('dark');
    expect(dark!.getAttribute('aria-checked')).toBe('true');
    expect(light!.getAttribute('aria-checked')).toBe('false');
    expect(dark!.tabIndex).toBe(0);
    scheme.set('light');
    expect(light!.getAttribute('aria-checked')).toBe('true');
  });

  it('arrow keys switch and move the focus; they stop at the group', () => {
    const scheme = signal<Scheme>('light');
    const tg = createSchemeToggle({ scheme, onChange: (v) => scheme.set(v), t });
    const outer = vi.fn();
    document.body.addEventListener('keydown', outer);
    document.body.append(tg.el);
    const [light, dark] = [...tg.el.querySelectorAll<HTMLButtonElement>('[role=radio]')];
    light!.focus();
    expect(key(light!, 'ArrowRight').defaultPrevented).toBe(true);
    expect(scheme.peek()).toBe('dark');
    expect(document.activeElement).toBe(dark);
    key(dark!, 'ArrowLeft');
    expect(scheme.peek()).toBe('light');
    expect(document.activeElement).toBe(light);
    expect(outer).not.toHaveBeenCalled();
    document.body.removeEventListener('keydown', outer);
  });

  it('destroy removes the toggle and its listeners', () => {
    const scheme = signal<Scheme>('light');
    const onChange = vi.fn();
    const tg = createSchemeToggle({ scheme, onChange, t });
    document.body.append(tg.el);
    const el = tg.el;
    const dark = el.querySelectorAll<HTMLButtonElement>('[role=radio]')[1]!;
    tg.destroy();
    expect(el.isConnected).toBe(false);
    dark.click();
    expect(onChange).not.toHaveBeenCalled();
    scheme.set('dark');
    expect(dark.getAttribute('aria-checked')).toBe('false');
  });
});
