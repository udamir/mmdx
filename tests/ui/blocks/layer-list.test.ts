// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLayerList, type LayerRow } from '../../../src/ui/blocks/layer-list.js';
import { createI18n } from '../../../src/ui/i18n.js';
import { signal } from '../../../src/ui/signal.js';

const t = createI18n().t;
const LAYERS: LayerRow[] = [
  { id: 'default', name: 'Default', visible: true, count: 7 },
  { id: 'L1', name: 'Infra', visible: false, locked: true, count: 3 },
];
const key = (el: Element, k: string): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};

afterEach(() => document.body.replaceChildren());

describe('LayerList', () => {
  it('view rows: eye toggles with names and counts, no rename or lock', () => {
    const onToggle = vi.fn();
    const list = createLayerList({ layers: LAYERS, editable: false, onToggle, onLock: vi.fn(), onRename: vi.fn(), t });
    const heading = list.el.querySelector('.mmdx-sect')!;
    expect(heading.textContent).toBe('Layers');
    expect(heading.getAttribute('role')).toBe('heading');
    const rows = [...list.el.querySelectorAll<HTMLElement>('[role=listitem]')];
    expect(rows).toHaveLength(2);
    expect(rows[1]!.classList.contains('off')).toBe(true);
    const eyes = rows.map((r) => r.querySelector<HTMLButtonElement>('.eye')!);
    expect(eyes[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(eyes[0]!.getAttribute('aria-label')).toBe('Hide layer: Default');
    expect(eyes[1]!.getAttribute('aria-label')).toBe('Show layer: Infra');
    expect(rows[0]!.querySelector('.layer-name')?.tagName).toBe('SPAN');
    expect(rows[1]!.querySelector('.count')?.textContent).toBe('3');
    expect(rows[1]!.querySelector('.count')?.getAttribute('aria-label')).toBe('3 items');
    expect(list.el.querySelector('input, .lock')).toBeNull();
    eyes[1]!.click();
    expect(onToggle).toHaveBeenCalledWith('L1', true);
  });

  it('editable rows: lock toggle and rename (Enter commits, Escape restores); focus kept on update', () => {
    const onLock = vi.fn(), onRename = vi.fn();
    const list = createLayerList({ layers: LAYERS, editable: true, onToggle: vi.fn(), onLock, onRename, t });
    document.body.append(list.el);
    const lock = list.el.querySelector<HTMLButtonElement>('[data-layer=L1] .lock')!;
    expect(lock.getAttribute('aria-pressed')).toBe('true');
    expect(lock.getAttribute('aria-label')).toBe('Unlock layer: Infra');
    lock.click();
    expect(onLock).toHaveBeenCalledWith('L1', false);
    const input = list.el.querySelector<HTMLInputElement>('[data-layer=L1] input')!;
    expect(input.getAttribute('aria-label')).toBe('Layer name');
    input.focus();
    input.value = 'Network';
    key(input, 'Enter');
    input.dispatchEvent(new Event('change'));
    expect(onRename).toHaveBeenCalledWith('L1', 'Network');
    input.value = 'oops';
    const esc = key(input, 'Escape');
    expect(input.value).toBe('Infra');
    expect(esc.defaultPrevented).toBe(false);
    input.value = '  ';
    input.dispatchEvent(new Event('change'));
    expect(input.value).toBe('Infra');
    expect(onRename).toHaveBeenCalledOnce();
    // a re-render keeps the focus (and a rename in progress)
    const eye = list.el.querySelector<HTMLButtonElement>('[data-layer=L1] .eye')!;
    eye.focus();
    list.update({ layers: [LAYERS[0]!, { ...LAYERS[1]!, visible: true }] });
    expect((document.activeElement as HTMLElement).dataset['f']).toBe('eye-L1');
    expect(document.activeElement).not.toBe(eye);
    const name = list.el.querySelector<HTMLInputElement>('[data-layer=L1] input')!;
    name.focus();
    name.value = 'Typing';
    list.update({ layers: [...LAYERS] });
    expect((document.activeElement as HTMLInputElement).value).toBe('Typing');
    list.focusName('default');
    expect((document.activeElement as HTMLInputElement).value).toBe('Default');
  });

  it('display toggles are switches following their signals; no Layers section without layers', () => {
    const labels = signal(true);
    const onChange = vi.fn((v: boolean) => labels.set(v));
    const list = createLayerList({ layers: [], editable: false, onToggle: vi.fn(), t, display: [{ id: 'labels', label: 'Connector labels', value: labels, onChange }, { id: 'hover', label: 'Hover highlight', value: false, onChange: vi.fn() }] });
    const sects = [...list.el.querySelectorAll('.mmdx-sect')].map((s) => s.textContent);
    expect(sects).toEqual(['Display']);
    const sw = list.el.querySelectorAll<HTMLButtonElement>('[role=switch]');
    expect(sw).toHaveLength(2);
    expect(sw[0]!.classList.contains('mmdx-toggle')).toBe(true);
    expect(sw[0]!.getAttribute('aria-label')).toBe('Connector labels');
    expect(sw[0]!.getAttribute('aria-checked')).toBe('true');
    expect(sw[1]!.getAttribute('aria-checked')).toBe('false');
    sw[0]!.click();
    expect(onChange).toHaveBeenCalledWith(false);
    expect(sw[0]!.getAttribute('aria-checked')).toBe('false');
    labels.set(true);
    expect(sw[0]!.getAttribute('aria-checked')).toBe('true');
  });

  it('destroy() releases listeners and effects', () => {
    const labels = signal(true);
    const onToggle = vi.fn(), onChange = vi.fn();
    const list = createLayerList({ layers: LAYERS, editable: false, onToggle, t, display: [{ id: 'labels', label: 'Labels', value: labels, onChange }] });
    document.body.append(list.el);
    const eye = list.el.querySelector<HTMLButtonElement>('.eye')!;
    const sw = list.el.querySelector<HTMLButtonElement>('[role=switch]')!;
    list.destroy();
    expect(list.el.isConnected).toBe(false);
    eye.click();
    sw.click();
    labels.set(false);
    expect(onToggle).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('editing: a delete button on every row but the fixed one; the count selects (a button) and highlights while hovered or focused', () => {
    const onDelete = vi.fn(), onCountClick = vi.fn(), onCountHover = vi.fn();
    const rows: LayerRow[] = [{ ...LAYERS[0]!, fixed: true }, LAYERS[1]!];
    const list = createLayerList({ layers: rows, editable: true, onToggle: () => undefined, onRename: () => undefined, onDelete, onCountClick, onCountHover, t });
    document.body.append(list.el);
    const dels = list.el.querySelectorAll<HTMLButtonElement>('.del');
    expect(dels).toHaveLength(2);
    expect(dels[0]!.hidden).toBe(true);
    expect(dels[1]!.hidden).toBe(false);
    expect(dels[1]!.getAttribute('aria-label')).toBe('Delete layer (its items move to Default): Infra');
    dels[1]!.click();
    expect(onDelete).toHaveBeenCalledWith('L1');
    const count = list.el.querySelector<HTMLButtonElement>('[data-layer="L1"] button.count')!;
    expect(count.getAttribute('aria-label')).toBe('Select the 3 items on Infra');
    count.click();
    expect(onCountClick).toHaveBeenCalledWith('L1');
    count.dispatchEvent(new Event('pointerenter'));
    expect(onCountHover).toHaveBeenLastCalledWith('L1');
    count.dispatchEvent(new Event('pointerleave'));
    expect(onCountHover).toHaveBeenLastCalledWith(null);
    count.dispatchEvent(new Event('focus'));
    expect(onCountHover).toHaveBeenLastCalledWith('L1');
    count.dispatchEvent(new Event('blur'));
    expect(onCountHover).toHaveBeenLastCalledWith(null);
  });

  it('a hover-only count is a focusable badge; no delete while viewing', () => {
    const onCountHover = vi.fn();
    const list = createLayerList({ layers: LAYERS, editable: false, onToggle: () => undefined, onDelete: () => undefined, onCountHover, t });
    expect(list.el.querySelector('.del')).toBeNull();
    const count = list.el.querySelector<HTMLElement>('span.count')!;
    expect(count.tabIndex).toBe(0);
    expect(count.title).toBe('Highlight the items on this layer');
    count.dispatchEvent(new Event('focus'));
    expect(onCountHover).toHaveBeenCalledWith('default');
  });
});
