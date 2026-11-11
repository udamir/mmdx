// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExportMenu, exportMenuEntries, type ExportEntry } from '../../../src/ui/blocks/export-menu.js';
import { h } from '../../../src/ui/h.js';
import { createI18n } from '../../../src/ui/i18n.js';
import { PopoverManager } from '../../../src/ui/popover.js';
import { signal } from '../../../src/ui/signal.js';

const t = createI18n().t;

const shadowHost = (): { host: HTMLElement; root: ShadowRoot; pops: PopoverManager } => {
  const host = h('div');
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  return { host, root, pops: new PopoverManager(root) };
};

// the diff's entries: images, versions, reports
const DIFF: ExportEntry[] = [
  { id: 'png', label: 'PNG image', section: 'image', run: vi.fn() },
  { id: 'svg', label: 'SVG image', section: 'image', run: vi.fn() },
  { id: 'before', label: 'Before (.mmdx)', section: 'source', run: vi.fn() },
  { id: 'after', label: 'After (.mmdx)', section: 'source', run: vi.fn() },
  { id: 'patch', label: 'Patch', section: 'report', run: vi.fn() },
];

afterEach(() => document.body.replaceChildren());

describe('exportMenuEntries', () => {
  it('inserts separators where the section changes', () => {
    const e = exportMenuEntries(DIFF);
    expect(e.map((x) => (x === 'sep' ? '—' : 'label' in x ? x.label : x.section))).toEqual(['PNG image', 'SVG image', '—', 'Before (.mmdx)', 'After (.mmdx)', '—', 'Patch']);
  });

  it('or section headers, and no separator without sections', () => {
    const e = exportMenuEntries(DIFF, { sections: 'header' });
    expect(e.filter((x) => x !== 'sep' && 'section' in x)).toEqual([{ section: 'image' }, { section: 'source' }, { section: 'report' }]);
    expect(exportMenuEntries([{ id: 'svg', label: 'SVG', run: vi.fn() }, { id: 'png', label: 'PNG', run: vi.fn() }])).toHaveLength(2);
  });
});

describe('createExportMenu', () => {
  it('a labelled primary button opening the menu; picking runs the entry', () => {
    const { host, root, pops } = shadowHost();
    const m = createExportMenu({ entries: DIFF, popovers: pops, within: () => host, t });
    root.append(m.el);
    expect(m.el.classList.contains('primary')).toBe(true);
    expect(m.el.classList.contains('vp-export-btn')).toBe(true);
    expect(m.el.textContent).toBe('Export');
    expect(m.el.getAttribute('aria-label')).toBe('Export');
    expect(m.el.title).toBe('Export the diagram');
    expect(m.el.getAttribute('aria-haspopup')).toBe('menu');
    m.el.click();
    const menu = root.querySelector('[role=menu]')!;
    expect(menu.getAttribute('aria-label')).toBe('Export');
    expect(menu.querySelectorAll('[role=menuitem]')).toHaveLength(5);
    expect(menu.querySelectorAll('hr')).toHaveLength(2);
    menu.querySelector<HTMLElement>('.exp-svg')!.click();
    expect(DIFF[1]!.run).toHaveBeenCalledOnce();
    expect(pops.isOpen).toBe(false);
  });

  it('icon-only while compact (signal)', () => {
    const { root, pops } = shadowHost();
    const compact = signal(false);
    const m = createExportMenu({ entries: DIFF, popovers: pops, compact, t });
    root.append(m.el);
    expect(m.el.querySelector('svg')).toBeNull();
    compact.set(true);
    expect(m.el.classList.contains('compact')).toBe(true);
    expect(m.el.querySelector('svg')).not.toBeNull();
    expect(m.el.textContent).toBe('');
    expect(m.el.getAttribute('aria-label')).toBe('Export');
    compact.set(false);
    expect(m.el.textContent).toBe('Export');
  });

  it('reports sync and async failures through onError', async () => {
    const { root, pops } = shadowHost();
    const onError = vi.fn();
    const m = createExportMenu({
      entries: [
        { id: 'a', label: 'A', run: () => Promise.reject(new Error('async')) },
        { id: 'b', label: 'B', run: () => { throw new Error('sync'); } },
      ],
      popovers: pops, onError, t,
    });
    root.append(m.el);
    m.el.click();
    root.querySelector<HTMLElement>('.exp-a')!.click();
    m.el.click();
    root.querySelector<HTMLElement>('.exp-b')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(onError.mock.calls.map((c) => (c[0] as Error).message).sort()).toEqual(['async', 'sync']);
  });

  it('update() replaces the entries; disabled without entries; destroy() detaches', () => {
    const { root, pops } = shadowHost();
    const m = createExportMenu({ entries: [], popovers: pops, t });
    root.append(m.el);
    expect(m.el.disabled).toBe(true);
    m.update({ entries: [{ id: 'svg', label: 'SVG', run: vi.fn() }] });
    expect(m.el.disabled).toBe(false);
    m.el.click();
    expect(root.querySelectorAll('[role=menuitem]')).toHaveLength(1);
    pops.close();
    const el = m.el;
    m.destroy();
    el.click();
    expect(pops.isOpen).toBe(false);
  });
});

describe('menus read their label and popovers when they open (B36)', () => {
  it('update({ popovers }) applies to the next opening', () => {
    const a = shadowHost(), b = shadowHost();
    const m = createExportMenu({ entries: DIFF, popovers: a.pops, within: () => a.host, t });
    b.root.append(m.el);
    m.update({ popovers: b.pops, within: () => b.host });
    m.el.click();
    expect(b.root.querySelector('[role=menu]')).not.toBeNull();
    expect(a.root.querySelector('[role=menu]')).toBeNull();
  });
});
