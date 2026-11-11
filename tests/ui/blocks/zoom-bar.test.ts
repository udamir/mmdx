// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createZoomBar } from '../../../src/ui/blocks/zoom-bar.js';
import { createI18n } from '../../../src/ui/i18n.js';
import { signal } from '../../../src/reactive/signal.js';

const { t } = createI18n();
const fmt = (k: string): string => k.toUpperCase();

afterEach(() => document.body.replaceChildren());

describe('ZoomBar', () => {
  it('renders − % + Fit with names, the percentage following the view', () => {
    const view = signal({ k: 1 });
    const onZoom = vi.fn(), onFit = vi.fn();
    const bar = createZoomBar({ view, onZoom, onFit, t, formatKeys: fmt });
    expect(bar.el.classList.contains('bottom-bar')).toBe(true);
    const zoom = bar.el.querySelector('.zoom')!;
    expect(zoom.getAttribute('role')).toBe('toolbar');
    expect(zoom.getAttribute('part')).toBe('zoom-bar');
    expect(zoom.getAttribute('aria-label')).toBe('Zoom');
    const out = zoom.querySelector('output')!;
    expect(out.textContent).toBe('100%');
    expect(out.getAttribute('aria-label')).toBe('Zoom level');
    view.set({ k: 1.256 });
    expect(out.textContent).toBe('126%');
    const [minus, plus, fit] = [...zoom.querySelectorAll<HTMLButtonElement>('button')];
    expect(minus!.getAttribute('aria-label')).toBe('Zoom out');
    expect(plus!.getAttribute('aria-label')).toBe('Zoom in');
    expect(fit!.textContent).toBe('Fit');
    expect(fit!.title).toBe('Fit to view (F)');
    expect(fit!.getAttribute('aria-keyshortcuts')).toBe('f');
    minus!.click();
    plus!.click();
    fit!.click();
    expect(onZoom.mock.calls.map((c) => c[0])).toEqual([1 / 1.2, 1.2]);
    expect(onFit).toHaveBeenCalledOnce();
    expect(bar.helpButton).toBeNull();
    expect(zoom.querySelector('.fs-btn')).toBeNull();
  });

  it('the help button toggles and follows the open state', () => {
    const open = signal(false);
    const onToggle = vi.fn(() => open.set(!open.peek()));
    const bar = createZoomBar({ view: signal({ k: 1 }), onZoom: () => undefined, onFit: () => undefined, help: { onToggle, open }, t });
    const help = bar.helpButton!;
    expect(help.classList.contains('help-btn')).toBe(true);
    expect(help.getAttribute('aria-haspopup')).toBe('dialog');
    expect(help.getAttribute('aria-label')).toBe('Shortcuts and hints');
    expect(help.getAttribute('aria-keyshortcuts')).toBe('?');
    expect(help.getAttribute('aria-expanded')).toBe('false');
    help.click();
    expect(onToggle).toHaveBeenCalledOnce();
    expect(help.getAttribute('aria-expanded')).toBe('true');
  });

  it('full screen: icon and label follow the state (no pressed state as well); hidden when not available', () => {
    const active = signal(false);
    const onToggle = vi.fn();
    const bar = createZoomBar({ view: signal({ k: 1 }), onZoom: () => undefined, onFit: () => undefined, fullscreen: { active, available: true, onToggle }, t });
    const fs = bar.el.querySelector<HTMLButtonElement>('.fs-btn')!;
    expect(fs.hidden).toBe(false);
    expect(fs.getAttribute('aria-label')).toBe('Full screen');
    expect(fs.hasAttribute('aria-pressed')).toBe(false);
    const icon = fs.innerHTML;
    active.set(true);
    expect(fs.getAttribute('aria-label')).toBe('Close full screen');
    expect(fs.title).toBe('Close full screen');
    expect(fs.hasAttribute('aria-pressed')).toBe(false);
    expect(fs.classList.contains('on')).toBe(true);
    expect(fs.innerHTML).not.toBe(icon);
    fs.click();
    expect(onToggle).toHaveBeenCalledOnce();
    bar.update({ fullscreen: { active, available: false, onToggle } });
    expect(bar.el.querySelector<HTMLButtonElement>('.fs-btn')!.hidden).toBe(true);
  });

  it('compact: the class follows the signal and Fit becomes an icon', () => {
    const compact = signal(false);
    const bar = createZoomBar({ view: signal({ k: 0.5 }), onZoom: () => undefined, onFit: () => undefined, compact, t });
    const fit = bar.el.querySelector<HTMLButtonElement>('.fit-btn')!;
    expect(fit.querySelector('svg')).toBeNull();
    compact.set(true);
    expect(bar.el.classList.contains('compact')).toBe(true);
    expect(fit.querySelector('svg')).not.toBeNull();
    expect(fit.getAttribute('aria-label')).toBe('Fit to view');
    expect(bar.el.querySelector('output')!.textContent).toBe('50%');
  });

  it('keeps the focus when re-rendered', () => {
    const bar = createZoomBar({ view: signal({ k: 1 }), onZoom: () => undefined, onFit: () => undefined, t });
    document.body.append(bar.el);
    bar.el.querySelector<HTMLButtonElement>('.fit-btn')!.focus();
    bar.update({ help: { onToggle: () => undefined, open: false } });
    expect(document.activeElement?.classList.contains('fit-btn')).toBe(true);
    expect(bar.helpButton).not.toBeNull();
  });

  it('destroy removes the bar and stops following signals', () => {
    const view = signal({ k: 1 });
    const onFit = vi.fn();
    const bar = createZoomBar({ view, onZoom: () => undefined, onFit, t });
    document.body.append(bar.el);
    const el = bar.el;
    const fit = el.querySelector<HTMLButtonElement>('.fit-btn')!;
    bar.destroy();
    expect(el.isConnected).toBe(false);
    view.set({ k: 2 });
    expect(el.querySelector('output')!.textContent).toBe('100%');
    fit.click();
    expect(onFit).not.toHaveBeenCalled();
  });
});
