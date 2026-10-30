// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createToolbar, fitPresetGrid, shapePreview, TOOLBAR_KINDS, type ToolbarApi } from '../../src/ui/style-toolbar.js';
import { createPageToolbar, type PageToolbarApi } from '../../src/ui/page-toolbar.js';

function mount(kind: string, over: Partial<ToolbarApi> = {}, opts: Parameters<typeof createToolbar>[2] = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const style: Record<string, unknown> = { fill: '#ffffff', stroke: '#333333', fontSize: 14, fontWeight: 400, color: '#111111' };
  const set = vi.fn((k: string | Readonly<Record<string, unknown>>, v?: unknown) => {
    if (typeof k === 'string') style[k] = v;
    else Object.assign(style, k);
  });
  const api: ToolbarApi = {
    selection: () => ({ kind, id: 'a' }),
    editable: () => true,
    multiCount: () => 1,
    eff: (k) => style[k],
    set,
    commit: vi.fn(),
    palette: () => [{ name: 'lime', value: '#d4e63a' }, { name: 'sky', value: '#bfe0ff' }],
    themeFont: () => "'Open Sans', sans-serif",
    themeFontName: () => 'Open Sans',
    anchorRect: () => ({ x: 10, y: 100, w: 80, h: 40 }),
    del: vi.fn(),
    toggleLock: vi.fn(),
    isLocked: () => false,
    ...over,
  };
  const tb = createToolbar(host, api, opts);
  tb.refresh();
  return { host, tb, api, set, style };
}

const controls = (el: HTMLElement): string[] => Array.from(el.querySelectorAll<HTMLElement>('.mtb-seg > [data-c]')).map((b) => b.dataset['c']!);

afterEach(() => {
  document.body.replaceChildren();
});

describe('style toolbar', () => {
  it('renders the button set per kind', () => {
    const node = mount('node');
    expect(node.tb.el.hidden).toBe(false);
    expect(node.tb.el.getAttribute('role')).toBe('toolbar');
    expect(controls(node.tb.el)).toEqual(['shape', 'font', 'size', 'bold', 'align', 'link', 'textColor', 'border', 'fill', 'lock', 'more']);
    // optional api members switch their controls off (no paint / order / layer / presets here)
    const edge = mount('edge');
    expect(controls(edge.tb.el)).toEqual(['line', 'arrows', 'routing', 'font', 'size', 'bold', 'textColor', 'more']);
    const theme = mount('node', {}, { exclude: ['more', 'lock', 'link'], reset: true });
    expect(controls(theme.tb.el)).toEqual(['shape', 'font', 'size', 'bold', 'align', 'textColor', 'border', 'fill', 'reset']);
    expect(TOOLBAR_KINDS['multi']!.groups.flat()).toContain('arrange');
  });

  it('every button has an accessible name; shortcut hints use the platform keys', () => {
    const { tb } = mount('group', { ungroup: vi.fn(), editGroup: vi.fn(), groupEditing: () => null });
    for (const b of Array.from(tb.el.querySelectorAll('button'))) expect(b.getAttribute('aria-label') || b.textContent).toBeTruthy();
    expect(tb.el.querySelector('[data-c="ungroup"]')!.getAttribute('title')).toMatch(/Ungroup \((Ctrl\+Shift\+G|⇧⌘G)\)/);
  });

  it('calls the api setters', () => {
    const { tb, set } = mount('node');
    (tb.el.querySelector('[data-c="bold"]') as HTMLButtonElement).click();
    expect(set).toHaveBeenCalledWith('fontWeight', 700);
    // fill popover: a palette colour is stored as a reference
    (tb.el.querySelector('[data-c="fill"]') as HTMLButtonElement).click();
    expect(tb.isOpen()).toBe(true);
    const sw = Array.from(tb.el.querySelectorAll<HTMLButtonElement>('.mtb-pop .mtb-sw')).find((b) => b.getAttribute('aria-label') === 'lime')!;
    sw.click();
    expect(set).toHaveBeenCalledWith('fill', '@lime');
    expect(tb.isOpen()).toBe(false);
    // size field
    const num = tb.el.querySelector<HTMLInputElement>('.mtb-num')!;
    num.value = '20';
    num.dispatchEvent(new Event('change'));
    expect(set).toHaveBeenCalledWith('fontSize', 20);
    // shape picker
    (tb.el.querySelector('[data-c="shape"]') as HTMLButtonElement).click();
    tb.el.querySelector<HTMLButtonElement>('.mtb-shape[aria-label="diamond"]')!.click();
    expect(set).toHaveBeenCalledWith('shape', 'diamond');
  });

  it('text position: alignment, vertical alignment and word wrap', () => {
    const { tb, set, style } = mount('node');
    const open = (): HTMLElement => {
      (tb.el.querySelector('[data-c="align"]') as HTMLButtonElement).click();
      return tb.el.querySelector<HTMLElement>('.mtb-pop')!;
    };
    let pop = open();
    const wrap = pop.querySelector<HTMLButtonElement>('.mtb-wrap')!;
    expect(wrap.getAttribute('role')).toBe('switch');
    expect(wrap.getAttribute('aria-checked')).toBe('false');
    expect(wrap.textContent).toBe('Word wrap');
    wrap.click();
    expect(set).toHaveBeenCalledWith('wrap', true);
    expect(tb.isOpen()).toBe(false);
    expect(style['wrap']).toBe(true);
    // on: shown as on, and a second click turns it off (back to the inherited value)
    pop = open();
    const on = pop.querySelector<HTMLButtonElement>('.mtb-wrap')!;
    expect(on.getAttribute('aria-checked')).toBe('true');
    on.click();
    expect(set).toHaveBeenLastCalledWith('wrap', undefined);
  });

  it('participants: word wrap is a switch in the bar', () => {
    const { tb, set, style } = mount('participant');
    expect(controls(tb.el)).toEqual(['shape', 'font', 'size', 'bold', 'wrap', 'textColor', 'border', 'fill', 'lock', 'more']);
    const btn = (): HTMLButtonElement => tb.el.querySelector<HTMLButtonElement>('[data-c="wrap"]')!;
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    btn().click();
    expect(set).toHaveBeenCalledWith('wrap', true);
    expect(style['wrap']).toBe(true);
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    btn().click();
    expect(set).toHaveBeenLastCalledWith('wrap', undefined);
  });

  it('theme editor colours: a custom colour goes through customColor; editor colours: + adds to the diagram palette', () => {
    const custom = vi.fn((hex: string) => `@lime~+1,+0,+0#${hex}`);
    const a = mount('node', { customColor: custom });
    (a.tb.el.querySelector('[data-c="fill"]') as HTMLButtonElement).click();
    const ci = a.tb.el.querySelector<HTMLInputElement>('.mtb-custom input[type=color]')!;
    ci.value = '#123456';
    ci.dispatchEvent(new Event('change'));
    expect(custom).toHaveBeenCalledWith('#123456');
    expect(a.set).toHaveBeenCalledWith('fill', '@lime~+1,+0,+0##123456');

    const remove = vi.fn();
    const b = mount('node', { localPalette: () => [{ name: 'c-112233', value: '#112233' }], addLocalColor: () => 'c-abcdef', removeLocalColor: remove });
    (b.tb.el.querySelector('[data-c="fill"]') as HTMLButtonElement).click();
    const add = b.tb.el.querySelector<HTMLInputElement>('.mtb-add input')!;
    add.value = '#abcdef';
    add.dispatchEvent(new Event('change'));
    expect(b.set).toHaveBeenCalledWith('fill', '@c-abcdef');
    (b.tb.el.querySelector('[data-c="fill"]') as HTMLButtonElement).click();
    const local = b.tb.el.querySelectorAll<HTMLButtonElement>('.mtb-pop .mtb-colors')[1]!.querySelector('.mtb-sw')!;
    local.dispatchEvent(new MouseEvent('click', { altKey: true, bubbles: true }));
    expect(remove).toHaveBeenCalledWith('c-112233');
  });

  it('the ⋮ menu follows the menu pattern and runs its actions', () => {
    const del = vi.fn();
    const { tb } = mount('node', { del, copy: vi.fn(), canCopy: () => true, inspect: vi.fn(), reset: vi.fn() });
    (tb.el.querySelector('[data-c="more"]') as HTMLButtonElement).click();
    const menu = tb.el.querySelector('.mtb-pop')!;
    expect(menu.getAttribute('role')).toBe('menu');
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role=menuitem]'));
    expect(items.map((i) => i.querySelector('span')!.textContent)).toEqual(['Copy', 'Duplicate', 'Delete', 'Save as preset', 'Reset style', 'All properties…']);
    items[2]!.click();
    expect(del).toHaveBeenCalled();
  });

  it('Esc and outside clicks close the popover; destroy removes listeners and the bar', () => {
    const { tb, host } = mount('node');
    (tb.el.querySelector('[data-c="border"]') as HTMLButtonElement).click();
    expect(tb.isOpen()).toBe(true);
    expect(tb.el.querySelector('[data-c="border"]')!.getAttribute('aria-expanded')).toBe('true');
    tb.el.querySelector('.mtb-pop')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(tb.isOpen()).toBe(false);
    (tb.el.querySelector('[data-c="border"]') as HTMLButtonElement).click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(tb.isOpen()).toBe(false);
    tb.destroy();
    expect(host.querySelector('.mtb')).toBeNull();
  });

  it('a multi-selection starts with its counter; the type filter takes kinds out and puts them back', () => {
    const types = [{ kind: 'node', count: 3, selected: true }, { kind: 'edge', count: 2, selected: true }];
    const setTypeSelected = vi.fn((kind: string, on: boolean) => {
      types.find((x) => x.kind === kind)!.selected = on;
    });
    const { tb } = mount('node', { multiCount: () => types.filter((x) => x.selected).reduce((n, x) => n + x.count, 0), selectionTypes: () => types, setTypeSelected });
    expect(controls(tb.el)[0]).toBe('selection');
    expect(tb.el.querySelector('[data-c="selection"]')!.textContent).toBe('5');
    expect(controls(tb.el)).not.toContain('shape'); // mixed kinds: the multi-selection set
    (tb.el.querySelector('[data-c="selection"]') as HTMLButtonElement).click();
    const boxes = (): HTMLInputElement[] => Array.from(tb.el.querySelectorAll<HTMLInputElement>('.mtb-pop input[type=checkbox]'));
    expect(boxes().map((b) => [b.dataset['kind'], b.checked])).toEqual([['node', true], ['edge', true]]);
    expect(tb.el.querySelector('.mtb-pop')!.textContent).toMatch(/Nodes3Connectors2/);
    boxes()[1]!.checked = false;
    boxes()[1]!.dispatchEvent(new Event('change'));
    expect(setTypeSelected).toHaveBeenCalledWith('edge', false);
    tb.refresh(); // the host re-selects, the bar rebuilds and keeps the popover open
    expect(tb.isOpen()).toBe(true);
    expect(tb.el.querySelector('[data-c="selection"]')!.textContent).toBe('3');
    // the kind left is the last one: it cannot be unticked; the other can be ticked again
    expect(boxes().map((b) => [b.checked, b.disabled])).toEqual([[true, true], [false, false]]);
  });

  it('several items of one kind get that kind\'s controls, applied to all of them', () => {
    const one = [{ kind: 'node', count: 3, selected: true }];
    const node = mount('node', { multiCount: () => 3, selectionTypes: () => one, ungroup: vi.fn(), group: vi.fn(), arrange: vi.fn(), order: () => null });
    expect(controls(node.tb.el)).toEqual(['selection', 'shape', 'font', 'size', 'bold', 'align', 'link', 'textColor', 'border', 'fill', 'arrange', 'group', 'lock', 'more']);
    (node.tb.el.querySelector('[data-c="bold"]') as HTMLButtonElement).click();
    expect(node.set).toHaveBeenCalledWith('fontWeight', 700);
    // a group's bar without its single-group actions
    const group = mount('group', { multiCount: () => 2, selectionTypes: () => [{ kind: 'group', count: 2, selected: true }], ungroup: vi.fn(), editGroup: vi.fn(), groupEditing: () => null, order: () => null });
    expect(controls(group.tb.el)).not.toContain('ungroup');
    expect(controls(group.tb.el)).not.toContain('editGroup');
    expect(controls(group.tb.el)).not.toContain('order');
    // tables: the size sets the title one larger on every table, as for one
    const ent = mount('entity', { multiCount: () => 2, selectionTypes: () => [{ kind: 'entity', count: 2, selected: true }] });
    const num = ent.tb.el.querySelector<HTMLInputElement>('.mtb-num')!;
    num.value = '15';
    num.dispatchEvent(new Event('change'));
    expect(ent.set).toHaveBeenCalledWith({ attrSize: 15, titleSize: 16 });
    // connectors: their own controls, nothing to align or group
    const edge = mount('edge', { multiCount: () => 2, selectionTypes: () => [{ kind: 'edge', count: 2, selected: true }], arrange: vi.fn(), group: vi.fn() });
    expect(controls(edge.tb.el)).toEqual(['selection', 'line', 'arrows', 'routing', 'font', 'size', 'bold', 'textColor', 'more']);
    // without selectionTypes (the theme editor) nothing changes
    expect(controls(mount('node', { multiCount: () => 2 }).tb.el)[0]).toBe('font');
  });

  it('a table has a table style button: layout and which attribute parts show', () => {
    const { tb, set, style } = mount('entity');
    style['mode'] = 'compact';
    style['showTypes'] = false;
    style['showComments'] = true;
    tb.refresh();
    expect(controls(tb.el).slice(0, 2)).toEqual(['shape', 'tableStyle']);
    (tb.el.querySelector('[data-c="tableStyle"]') as HTMLButtonElement).click();
    const pop = (): HTMLElement => tb.el.querySelector('.mtb-pop')!;
    const layouts = Array.from(pop().querySelectorAll<HTMLButtonElement>('.mtb-layout'));
    expect(layouts.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Compact', 'true'], ['Table', 'false']]);
    layouts[1]!.click();
    expect(set).toHaveBeenCalledWith('mode', 'table');
    // the popover stays open and shows the change
    expect(pop().querySelector('.mtb-layout.on')!.textContent).toBe('Table');
    const switches = (): HTMLButtonElement[] => Array.from(pop().querySelectorAll<HTMLButtonElement>('[role=switch]'));
    expect(switches().map((b) => [b.textContent!.replace('✓', ''), b.getAttribute('aria-checked')])).toEqual([
      ['Show types', 'false'], ['Show comments', 'true'], ['Underline primary keys', 'false'],
    ]);
    switches()[0]!.click();
    expect(set).toHaveBeenCalledWith('showTypes', true);
    switches()[1]!.click();
    expect(set).toHaveBeenCalledWith('showComments', false);
    switches()[2]!.click();
    expect(set).toHaveBeenCalledWith('pkUnderline', true);
  });

  it('hides when nothing is selected or not editable', () => {
    const { tb } = mount('node', { editable: () => false });
    expect(tb.el.hidden).toBe(true);
  });

  it('fitPresetGrid sizes the preset submenu; shapePreview draws an svg', () => {
    const sub = document.createElement('div');
    for (let i = 0; i < 7; i++) sub.append(Object.assign(document.createElement('div'), { className: 'pp-item' }));
    const size = fitPresetGrid(sub, 600, 600);
    expect(sub.style.getPropertyValue('--cols')).toBe('3');
    expect(size.w).toBeGreaterThan(0);
    expect(shapePreview('diamond').querySelector('path')).not.toBeNull();
  });
});

describe('page toolbar', () => {
  it('shows the page properties of a sequence diagram and calls the api', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const setSeq = vi.fn(), set = vi.fn();
    const api: PageToolbarApi = {
      visible: () => true,
      types: () => [['flowchart', 'Flowchart'], ['sequence', 'Sequence diagram']],
      diagramType: () => 'sequence',
      direction: () => null,
      directions: () => [],
      presets: () => [['compact', 'Compact']],
      preset: () => undefined,
      sizeMode: () => 'fit',
      ratio: () => null,
      ratioLabel: () => '',
      ratios: () => [['16:9', '16:9']],
      get: () => null,
      getRaw: () => null,
      hasRouting: () => false,
      routing: () => 'curved',
      seq: () => ({ gap: 100, rowH: 40, blockSpan: 'full', mirror: false, autonumber: false }),
      setSeq, set,
      setType: vi.fn(), setDirection: vi.fn(), setPreset: vi.fn(), setSizeMode: vi.fn(), setRatio: vi.fn(), setRouting: vi.fn(),
      palette: () => [{ name: 'paper', value: '#ffffff' }],
      rect: () => ({ x: 0, y: 100, w: 400, h: 300 }),
    };
    const pt = createPageToolbar(host, api);
    pt.refresh();
    expect(controls(pt.el)).toEqual(['type', 'preset', 'background', 'border', 'size', 'ratio', 'gap', 'rowH', 'blockSpan', 'mirror', 'autonumber']);
    (pt.el.querySelector('[data-c="mirror"]') as HTMLButtonElement).click();
    expect(setSeq).toHaveBeenCalledWith('mirror', true);
    (pt.el.querySelector('[data-c="background"]') as HTMLButtonElement).click();
    pt.el.querySelector<HTMLButtonElement>('.mtb-pop .mtb-sw[aria-label="paper"]')!.click();
    expect(set).toHaveBeenCalledWith({ background: '@paper' });
    pt.destroy();
    expect(host.childElementCount).toBe(0);
  });
});
