// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachMenu, createMenu, openMenu } from '../../../src/ui/blocks/menu.js';
import { h } from '../../../src/ui/kit/h.js';
import { PopoverManager } from '../../../src/ui/kit/popover.js';

const shadow = () => {
  const host = h('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const opener = h('button', null, 'Export');
  root.append(opener);
  return { host, root, opener, pops: new PopoverManager(root) };
};

afterEach(() => document.body.replaceChildren());

describe('Menu', () => {
  it('renders sections, separators and radio items; picking runs the item; a part', () => {
    const run = vi.fn(), onPick = vi.fn();
    const m = createMenu({ label: 'Theme', part: 'menu', onPick, entries: [{ section: 'Light' }, { label: 'A', checked: true, run }, 'sep', { label: 'B', checked: false, run: () => undefined, disabled: true }] });
    expect(m.el.getAttribute('role')).toBe('menu');
    expect(m.el.getAttribute('aria-label')).toBe('Theme');
    expect(m.el.getAttribute('part')).toBe('menu');
    expect(m.el.querySelector('.mmdx-sect')?.textContent).toBe('Light');
    expect(m.el.querySelector('hr')?.getAttribute('role')).toBe('separator');
    const items = m.el.querySelectorAll('[role=menuitemradio]');
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute('aria-checked')).toBe('true');
    expect(items[0]!.querySelector('.mmdx-check')!.textContent).toBe('✓');
    expect((items[1] as HTMLButtonElement).disabled).toBe(true);
    (items[0] as HTMLElement).click();
    expect(run).toHaveBeenCalledOnce();
    expect(onPick).toHaveBeenCalledOnce();
  });

  it('plain items are menuitems without ticks; update() replaces the entries; destroy stops the items', () => {
    const run = vi.fn();
    const m = createMenu({ label: 'More', entries: [{ label: 'Copy', run }] });
    expect(m.el.querySelector('[role=menuitem]')).not.toBeNull();
    expect(m.el.querySelector('.mmdx-check')).toBeNull();
    m.update({ entries: [{ label: 'Paste', run }, { label: 'Cut', run }] });
    const items = m.el.querySelectorAll<HTMLElement>('[role=menuitem]');
    expect([...items].map((i) => i.textContent)).toEqual(['Paste', 'Cut']);
    m.destroy();
    items[0]!.click();
    expect(run).not.toHaveBeenCalled();
  });

  it('openMenu opens through the popover manager, positioned in the host, and closes on pick', () => {
    const { host, root, opener, pops } = shadow();
    const run = vi.fn();
    openMenu({ popovers: pops, opener, label: 'Export', entries: [{ label: 'SVG', run }], within: host, align: 'left', placement: 'above' });
    expect(pops.isOpen).toBe(true);
    expect(opener.getAttribute('aria-expanded')).toBe('true');
    const menu = root.querySelector<HTMLElement>('[role=menu]')!;
    expect(menu.style.left).not.toBe('');
    expect(menu.style.bottom).not.toBe('');
    (root.querySelector('[role=menuitem]') as HTMLElement).click();
    expect(run).toHaveBeenCalledOnce();
    expect(pops.isOpen).toBe(false);
  });

  it('attachMenu wires the button (haspopup, expanded), builds the entries on open, and its cleanup unwires it', () => {
    const { root, opener, pops } = shadow();
    const entries = vi.fn(() => [{ label: 'PNG', run: () => undefined }]);
    const off = attachMenu({ button: opener as HTMLButtonElement, popovers: pops, label: 'Export', entries });
    expect(opener.getAttribute('aria-haspopup')).toBe('menu');
    expect(opener.getAttribute('aria-expanded')).toBe('false');
    opener.click();
    expect(entries).toHaveBeenCalledOnce();
    expect(root.querySelector('[role=menu]')).not.toBeNull();
    opener.click(); // toggles closed
    expect(pops.isOpen).toBe(false);
    off();
    opener.click();
    expect(entries).toHaveBeenCalledOnce();
  });

  it('items show their shortcut (kbd, aria-keyshortcuts)', () => {
    const m = createMenu({ label: 'Board', entries: [{ label: 'Paste', keys: 'mod+v', run: () => undefined }, { label: 'Nothing to paste', disabled: true, run: () => undefined }] });
    const [paste, none] = [...m.el.querySelectorAll<HTMLElement>('[role=menuitem]')];
    expect(paste!.querySelector('kbd')?.textContent).toMatch(/V$/i);
    expect(paste!.getAttribute('aria-keyshortcuts')).toMatch(/^(Meta|Control)\+v$/);
    expect(none!.querySelector('kbd')).toBeNull();
    expect(none!.hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('openMenu at a point: no opener, placed inside the container, onClose after a pick', () => {
    const { root, pops } = shadow();
    const area = h('div');
    root.append(area);
    const run = vi.fn(), onClose = vi.fn();
    openMenu({ popovers: pops, opener: null, label: 'Board', entries: [{ label: 'Paste', run }], within: area, at: { clientX: 40, clientY: 30 }, onClose });
    const menu = area.querySelector<HTMLElement>('[role=menu]')!;
    expect(menu.getAttribute('aria-label')).toBe('Board');
    expect(menu.style.left).toBe('0px'); // clamped into the (zero-sized) container
    expect(menu.style.top).toBe('0px');
    menu.querySelector<HTMLElement>('[role=menuitem]')!.click();
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(menu.isConnected).toBe(false);
  });
});
