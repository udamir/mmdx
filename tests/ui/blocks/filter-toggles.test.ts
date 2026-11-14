// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFilterToggles, FILTER_ICONS, type FilterToggle } from '../../../src/ui/blocks/filter-toggles.js';
import { createToolbar } from '../../../src/ui/blocks/toolbar.js';
import { createI18n } from '../../../src/i18n.js';

const t = createI18n().t;
const filters = (on: Partial<Record<string, boolean>> = {}): FilterToggle[] =>
  (['added', 'removed', 'content', 'layout', 'style'] as const).map((id, i) => ({ id, label: id[0]!.toUpperCase() + id.slice(1), icon: FILTER_ICONS[id], on: on[id] ?? true, count: i }));
const dim = (on: boolean): { on: boolean; label: string; icon: string } => ({ on, label: 'Dim unchanged items', icon: FILTER_ICONS.dim });

afterEach(() => document.body.replaceChildren());

describe('FilterToggles', () => {
  it('renders one coloured toggle per kind with counts, tooltips and accessible names, then Dim', () => {
    const ft = createFilterToggles({ filters: filters({ layout: false }), dim: dim(false), onToggle: () => undefined, t });
    expect(ft.el.tagName).toBe('SPAN');
    expect(ft.el.classList.contains('mmdx-filters')).toBe(true);
    expect(ft.el.getAttribute('role')).toBe('group');
    expect(ft.el.getAttribute('aria-label')).toBe('Change filters');
    const flt = ft.el.querySelectorAll<HTMLButtonElement>('.flt');
    expect(flt).toHaveLength(5);
    const added = ft.el.querySelector<HTMLButtonElement>('.flt-added')!;
    expect(added.className).toBe('flt flt-added on');
    expect(added.getAttribute('aria-pressed')).toBe('true');
    expect(added.getAttribute('aria-label')).toBe('Added (0)');
    expect(added.querySelector('.cnt')).toBeNull(); // no badge for zero
    expect(added.querySelector('svg')).not.toBeNull();
    const layout = ft.el.querySelector<HTMLButtonElement>('.flt-layout')!;
    expect(layout.className).toBe('flt flt-layout off');
    expect(layout.getAttribute('aria-pressed')).toBe('false');
    expect(layout.dataset['tip']).toBe('Layout · 3 — click to show');
    expect(layout.dataset['f']).toBe('flt-layout');
    expect(layout.querySelector('.cnt')!.textContent).toBe('3');
    expect(layout.querySelector('.cnt')!.getAttribute('aria-hidden')).toBe('true');
    expect(ft.el.querySelector<HTMLButtonElement>('.flt-removed')!.dataset['tip']).toBe('Removed · 1 — click to hide');
    expect(ft.el.querySelector('[role=separator]')).not.toBeNull();
    const d = ft.el.querySelector<HTMLButtonElement>('[data-f=dim]')!;
    expect(d.getAttribute('aria-label')).toBe('Dim unchanged items');
    expect(d.dataset['tip']).toBe('Dim unchanged items');
    expect(d.getAttribute('aria-pressed')).toBe('false');
    expect(d.classList.contains('on')).toBe(false);
  });

  it('calls onToggle and onDim; no Dim button without dim', () => {
    const onToggle = vi.fn(), onDim = vi.fn();
    const ft = createFilterToggles({ filters: filters(), dim: dim(true), onToggle, onDim, t });
    ft.el.querySelector<HTMLButtonElement>('.flt-style')!.click();
    expect(onToggle).toHaveBeenCalledWith('style');
    ft.el.querySelector<HTMLButtonElement>('[data-f=dim]')!.click();
    expect(onDim).toHaveBeenCalledOnce();
    ft.update({ dim: null });
    expect(ft.el.querySelector('[data-f=dim]')).toBeNull();
    expect(ft.el.querySelector('[role=separator]')).toBeNull();
  });

  it('sits in a toolbar flow: arrow keys reach its buttons, focus is kept on update', () => {
    const ft = createFilterToggles({ filters: filters(), dim: dim(false), onToggle: () => undefined, t });
    const tb = createToolbar({ label: 'Diff', orientation: 'horizontal', items: [ft.el] });
    document.body.append(tb.el);
    const first = tb.el.querySelector<HTMLButtonElement>('.flt-added')!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect((document.activeElement as HTMLElement).dataset['f']).toBe('flt-removed');
    const before = document.activeElement;
    ft.update({ filters: filters({ removed: false }) });
    expect(document.activeElement).not.toBe(before);
    expect((document.activeElement as HTMLElement).dataset['f']).toBe('flt-removed');
    expect((document.activeElement as HTMLElement).getAttribute('aria-pressed')).toBe('false');
  });

  it('destroy() removes the element and its listeners', () => {
    const onToggle = vi.fn();
    const ft = createFilterToggles({ filters: filters(), onToggle, t });
    document.body.append(ft.el);
    const b = ft.el.querySelector<HTMLButtonElement>('.flt-added')!;
    ft.destroy();
    expect(ft.el.isConnected).toBe(false);
    b.click();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
