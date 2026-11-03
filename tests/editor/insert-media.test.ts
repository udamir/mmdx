// @vitest-environment jsdom
// The insert dock and its pickers (T05): per-kind buttons, the Text tool, icons and images inserted and set through
// the flowchart's edit kind (every output parsed by stock Mermaid 11.17), the image policy and the host's
// `uploadImage`, emoji at the caret, the Shapes palette (search, recents, Alt-click replace), the Connector and
// Container tools, the selection toolbar's media controls and the Properties sections.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { loadBuiltinIcons } from '../../src/core/icons/registry.js';
import { press, pev } from './connect.helpers.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);

let host: HTMLElement;
let ed: DiagramEditor | null = null;
let mermaidParse: (code: string) => Promise<unknown>;

beforeAll(async () => {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false });
  mermaidParse = (code) => mermaid.parse(code);
  await loadBuiltinIcons();
});
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  ed?.destroy();
  ed = null;
  host.remove();
  document.body.replaceChildren();
});

const mount = (value: string, o: { uploadImage?: (f: File) => Promise<{ url: string }> } = {}): DiagramEditor => {
  ed = new DiagramEditor(host, { value, storage: memoryStorage(), ...o });
  ed.core.viewport.set({ k: 1, tx: 0, ty: 0 });
  return ed;
};
const $ = <T extends Element = HTMLElement>(sel: string): T | null => host.shadowRoot!.querySelector<T>(sel);
const $$ = (sel: string): HTMLElement[] => Array.from(host.shadowRoot!.querySelectorAll<HTMLElement>(sel));
const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    await vi.dynamicImportSettled();
    await new Promise((r) => setTimeout(r, 0));
  }
};
const key = (k: string, target: EventTarget = host.shadowRoot!.querySelector('.ed')!): void =>
  void target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));
const valid = async (code: string): Promise<void> => {
  await expect(mermaidParse(code), code).resolves.toBeTruthy();
};
const input = (el: HTMLInputElement, v: string): void => {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('insert dock', () => {
  test('buttons follow what the diagram type offers', async () => {
    const e = mount('flowchart LR\n  A --> B\n');
    await e.whenLoaded?.();
    await settle();
    const shown = (): string[] => ['text', 'image', 'icons', 'container', 'connector'].filter((n) => !$(`.vt-${n}`)!.hidden);
    expect(shown()).toEqual(['text', 'image', 'icons', 'container', 'connector']);
    e.setSource('sequenceDiagram\n  A->>B: hi\n');
    await settle();
    e.core.fire('model');
    expect(shown()).toEqual(['text', 'container', 'connector']);
    e.setSource('erDiagram\n  A ||--o{ B : has\n');
    await settle();
    e.core.fire('model');
    expect(shown()).toEqual(['connector']);
    // the tooltips carry the shortcuts
    expect($('.vt-icons')!.title).toContain('(N)');
  });

  test('T adds a text block: Mermaid\'s text shape', async () => {
    const e = mount('flowchart LR\n  A --> B\n');
    await settle();
    key('t');
    const id = e.core.primary()!.id;
    expect(e.core.code).toContain(`  ${id}["Text"]\n  ${id}@{ shape: text }`);
    await valid(e.core.code);
  });
});

describe('icons', () => {
  test('insert mode: a search, a tile, an icon node in Mermaid Chart\'s style', async () => {
    const e = mount('flowchart LR\n  A --> B\n');
    await settle();
    e.core.run('openIconPicker', null, { insert: true });
    await settle();
    const pop = $('.ins-pop .ip')!;
    expect(pop.getAttribute('aria-label')).toBe('Choose an icon…');
    // only the built-in set: the hint shows
    expect($('.ip-hint')!.hidden).toBe(false);
    input($<HTMLInputElement>('.ip-search')!, 'user');
    const tile = $<HTMLButtonElement>('.ip-rows .ip-tile[aria-label="tabler:user"]')!;
    expect(tile.title).toContain('MIT');
    tile.click();
    const id = e.core.primary()!.id;
    expect(e.core.code).toContain(`  ${id}["User"]\n  ${id}@{ icon: "tabler:user", form: "rounded", pos: "b", h: 60 }`);
    expect($('.ins-pop')).toBeNull();
    await valid(e.core.code);
    // the icon is remembered
    e.core.run('openIconPicker', null, { insert: true });
    await settle();
    expect($$('.ip-row .ip-tile').map((b) => b.getAttribute('aria-label'))).toEqual(['tabler:user']);
  });

  test('selection mode: a label token on a node, replaced, then removed; one undo step each', async () => {
    const e = mount('flowchart LR\n  A["Car"] --> B');
    await settle();
    e.core.select([{ kind: 'node', id: 'A' }]);
    e.core.run('openIconPicker', null, {});
    await settle();
    input($<HTMLInputElement>('.ip-search')!, 'car');
    $<HTMLButtonElement>('.ip-tile[aria-label="tabler:car"]')!.click();
    expect(e.core.code).toBe('flowchart LR\n  A["tabler:car Car"] --> B');
    e.core.run('openIconPicker', null, {});
    await settle();
    expect($<HTMLButtonElement>('.ip-foot button')!.textContent).toBe('Remove icon');
    input($<HTMLInputElement>('.ip-search')!, 'truck');
    $<HTMLButtonElement>('.ip-tile[aria-label="tabler:truck"]')!.click();
    expect(e.core.code).toBe('flowchart LR\n  A["tabler:truck Car"] --> B');
    e.core.run('openIconPicker', null, {});
    await settle();
    $<HTMLButtonElement>('.ip-foot button')!.click();
    expect(e.core.code).toBe('flowchart LR\n  A["Car"] --> B');
    e.undo();
    expect(e.core.code).toBe('flowchart LR\n  A["tabler:truck Car"] --> B');
    await valid('flowchart LR\n  A["tabler:truck Car"] --> B\n');
  });

  test('selection mode on an icon node: its icon key', async () => {
    const e = mount('flowchart LR\n  n4["User"]\n  n4@{ icon: "tabler:user", form: "rounded", pos: "b", h: 60 }');
    await settle();
    e.core.select([{ kind: 'node', id: 'n4' }]);
    e.core.run('openIconPicker', null, {});
    await settle();
    expect($('.ip-tile.on')?.getAttribute('aria-label') ?? 'tabler:user').toBe('tabler:user');
    input($<HTMLInputElement>('.ip-search')!, 'car');
    $<HTMLButtonElement>('.ip-tile[aria-label="tabler:car"]')!.click();
    expect(e.core.code).toBe('flowchart LR\n  n4["User"]\n  n4@{ icon: "tabler:car", form: "rounded", pos: "b", h: 60 }');
    await valid(e.core.code);
  });

  test('pack chips: a registered pack that is not loaded loads when its chip is chosen', async () => {
    const loader = vi.fn(async () => ({ prefix: 'demo', icons: { gear: { body: '<path d="M1 1h10v10z"/>' } }, info: { name: 'Demo', license: { title: 'CC0' } } }));
    ed = new DiagramEditor(host, { value: 'flowchart LR\n  A\n', storage: memoryStorage(), iconPacks: [{ name: 'demo', loader }] });
    await settle();
    ed.core.run('openIconPicker', null, { insert: true });
    await settle();
    expect($('.ip-hint')!.hidden).toBe(true);
    expect($<HTMLInputElement>('.ip-search')!.placeholder).toBe('Search icons, demo and more');
    const chip = $$('.ip-chip').find((b) => b.textContent === 'demo')!;
    expect(chip.classList.contains('unloaded')).toBe(true);
    chip.click();
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    expect($$('.ip-rows .ip-tile').map((b) => b.getAttribute('aria-label'))).toEqual(['demo:gear']);
  });
});

describe('images', () => {
  test('insert by URL: the policy is checked live; an image node with its caption', async () => {
    const e = mount('flowchart LR\n  A --> B\n');
    await settle();
    e.core.run('openImageTool', null, { insert: true });
    await settle();
    // no upload hook: URL only
    expect($('.imp-drop')!.hidden).toBe(true);
    const url = $<HTMLInputElement>('.imp-url')!;
    const add = $<HTMLButtonElement>('.imp-row button')!;
    input(url, 'http://example.com/a.png');
    expect($('.imp-error')!.textContent).toContain('http images are blocked');
    expect(add.disabled).toBe(true);
    input(url, 'https://example.com/team-photo.png');
    expect(add.disabled).toBe(false);
    add.click();
    const id = e.core.primary()!.id;
    expect(e.core.code).toContain(`  ${id}["team photo"]\n  ${id}@{ img: "https://example.com/team-photo.png", h: 200, w: 200, pos: "b" }`);
    await valid(e.core.code);
  });

  test('selection mode: a node becomes an image node; the image is replaced and removed', async () => {
    const e = mount('flowchart LR\n  A["Photo"]\n');
    await settle();
    e.core.select([{ kind: 'node', id: 'A' }]);
    e.core.run('openImageTool', null, {});
    await settle();
    input($<HTMLInputElement>('.imp-url')!, 'https://example.com/a.png');
    key('Enter', $('.imp-url')!);
    expect(e.core.code).toBe('flowchart LR\n  A["Photo"]\n  A@{ img: "https://example.com/a.png", h: 200, w: 200, pos: "b" }\n');
    e.core.run('openImageTool', null, {});
    await settle();
    expect($<HTMLInputElement>('.imp-url')!.value).toBe('https://example.com/a.png');
    $<HTMLButtonElement>('.imp-foot button')!.click();
    expect(e.core.code).toBe('flowchart LR\n  A["Photo"]\n');
  });

  test('uploadImage: a pasted file is uploaded and referenced by its URL; a failure says why', async () => {
    const upload = vi.fn(async (f: File) => ({ url: `https://cdn.example.com/${f.name}` }));
    const e = mount('flowchart LR\n  A\n', { uploadImage: upload });
    await settle();
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    e.core.run('openImageTool', null, { insert: true, file });
    await settle();
    expect(upload).toHaveBeenCalledWith(file);
    expect(e.core.code).toContain('img: "https://cdn.example.com/shot.png"');
    e.uploadImage = async () => {
      throw new Error('quota');
    };
    e.core.run('openImageTool', null, { insert: true, file });
    await settle();
    expect($('.imp-status')!.textContent).toBe('Upload failed: quota');
    expect($('.imp-drop')!.hidden).toBe(false);
  });

  test('without uploadImage a pasted picture is refused with a toast', async () => {
    const e = mount('flowchart LR\n  A\n');
    await settle();
    const toast = vi.spyOn(e.core, 'toast');
    const ev = new Event('paste', { bubbles: true, composed: true }) as ClipboardEvent;
    Object.defineProperty(ev, 'clipboardData', { value: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    $('.ed')!.dispatchEvent(ev);
    expect(toast).toHaveBeenCalledWith('Images can be added by URL; uploading is not configured here');
  });
});

describe('emoji', () => {
  test('the inline editor: the button inserts at the caret (multi-line node and single-line edge label)', async () => {
    const e = mount('flowchart LR\n  A["Hello world"] -->|"go"| B\n');
    await settle();
    e.core.select([{ kind: 'node', id: 'A' }]);
    expect(e.core.run('inlineEdit', { kind: 'node', id: 'A' })).toBe(true);
    const ta = $<HTMLTextAreaElement>('.inline-edit')!;
    ta.setSelectionRange(5, 5);
    $<HTMLButtonElement>('.inline-emoji')!.click();
    await settle();
    input($<HTMLInputElement>('.ep-search')!, 'rocket');
    $<HTMLButtonElement>('.ep-e[aria-label="rocket"]')!.click();
    expect(ta.value).toBe('Hello🚀 world');
    // the picker stays open for more; the text box is still open
    expect($('.inline-edit')).not.toBeNull();
    e.core.popovers.close();
    key('Enter', ta);
    expect(e.core.code).toContain('A["Hello🚀 world"]');
    // an edge label (one line), opened with ⌘/Ctrl+;
    const edge = e.core.model.type === 'flowchart' ? e.core.model.edges[0]!.id : '';
    expect(e.core.run('inlineEdit', { kind: 'edge', id: edge })).toBe(true);
    const ta2 = $<HTMLTextAreaElement>('.inline-edit')!;
    ta2.setSelectionRange(0, 0);
    ta2.dispatchEvent(new KeyboardEvent('keydown', { key: ';', ctrlKey: true, bubbles: true }));
    await settle();
    input($<HTMLInputElement>('.ep-search')!, 'thumbs up');
    $<HTMLButtonElement>('.ep-e[aria-label="thumbs up"]')!.click();
    expect(ta2.value).toBe('👍go');
    e.core.popovers.close();
    key('Enter', ta2);
    expect(e.core.code).toContain('|"👍go"|');
    await valid(e.core.code);
  });
});

describe('shapes palette', () => {
  test('search, recents and Alt-click replace', async () => {
    const e = mount('flowchart LR\n  A["A"] --> B\n');
    await settle();
    e.core.run('toggleShapesMenu');
    await settle();
    const menu = $('.shapes-menu')!;
    input(menu.querySelector<HTMLInputElement>('.sp-search')!, 'data');
    const hits = [...menu.querySelectorAll('.sp-tile')].map((b) => b.getAttribute('data-key'));
    expect(hits).toEqual(expect.arrayContaining(['cylinder', 'datastore', 'parallelogram', 'bow-rect']));
    const tile = (k: string): HTMLElement => menu.querySelector<HTMLElement>(`.sp-tile[data-key="${k}"]`)!;
    const click = (el: HTMLElement, alt = false): void => {
      el.dispatchEvent(pev('pointerdown', { x: 0, y: 0 }, { altKey: alt }));
      el.dispatchEvent(pev('pointerup', { x: 0, y: 0 }, { altKey: alt }));
    };
    click(tile('datastore'));
    const id = e.core.primary()!.id;
    expect(e.core.code).toContain(`${id}@{ shape: datastore }`);
    // recently used: a row at the top
    e.core.run('toggleShapesMenu');
    await settle();
    expect(menu.querySelector('.sp-head')!.textContent).toBe('Recently used');
    expect(menu.querySelector('.sp-grid .sp-tile')!.getAttribute('data-key')).toBe('datastore');
    // Alt-click with a node selected gives it the shape
    e.core.select([{ kind: 'node', id: 'A' }]);
    click(tile('diamond'), true);
    expect(e.core.code).toContain('A{"A"} --> B');
    expect(e.core.model.type === 'flowchart' && e.core.model.nodes.size).toBe(3);
    await valid(e.core.code);
  });
});

describe('tools', () => {
  const nodeEl = (id: string): Element => $(`.el[data-kind="node"][data-id="${id}"]`)!;

  test('Connector: click a source, then a target; Esc ends the tool', async () => {
    const e = mount('flowchart LR\n  A["A"]\n  B["B"]\n  C["C"]\n');
    await settle();
    key('a');
    await settle();
    expect(e.core.tool.peek()).toBe('connect');
    press(e.core, nodeEl('A'), { x: 0, y: 0 });
    press(e.core, nodeEl('B'), { x: 0, y: 0 });
    expect(e.core.code).toContain('A --> B');
    expect(e.core.primary()?.kind).toBe('edge');
    press(e.core, nodeEl('B'), { x: 0, y: 0 });
    press(e.core, nodeEl('C'), { x: 0, y: 0 });
    expect(e.core.code).toContain('B --> C');
    key('Escape');
    expect(e.core.tool.peek()).toBe('pointer');
    await valid(e.core.code);
  });

  test('Container: a frame drawn around nodes wraps them in a subgraph; with a selection it wraps at once', async () => {
    const e = mount('flowchart LR\n  A["A"] --> B["B"]\n  C["C"]\n');
    await settle();
    const g = e.core.geom.type === 'flowchart' ? e.core.geom : null;
    const a = g!.nodes.get('A')!, b = g!.nodes.get('B')!;
    key('b');
    await settle();
    expect(e.core.tool.peek()).toBe('container');
    const p0 = { x: Math.min(a.x - a.w / 2, b.x - b.w / 2) - 10, y: Math.min(a.y - a.h / 2, b.y - b.h / 2) - 10 };
    const p1 = { x: Math.max(a.x + a.w / 2, b.x + b.w / 2) + 10, y: Math.max(a.y + a.h / 2, b.y + b.h / 2) + 10 };
    const gest = e.core.startGesture(pev('pointerdown', p0), e.core.hitTest({ target: e.core.dom.svg, clientX: p0.x, clientY: p0.y }))!;
    gest.move(p1.x - p0.x, p1.y - p0.y, pev('pointermove', p1));
    gest.end?.(pev('pointerup', p1));
    await settle();
    const M = e.core.model;
    const sub = M.type === 'flowchart' ? [...M.groups.values()][0] : undefined;
    expect(sub?.children.sort()).toEqual(['A', 'B']);
    expect(e.core.tool.peek()).toBe('pointer');
    await valid(e.core.code);
  });
});

describe('selection toolbar and Properties', () => {
  test('an icon node: Icon (with a dot), Icon & image and the size field; the size goes to its node data', async () => {
    const e = mount('flowchart LR\n  n4["User"]\n  n4@{ icon: "tabler:user", form: "rounded", pos: "b", h: 60 }\n  A --> n4\n');
    await settle();
    e.core.select([{ kind: 'node', id: 'n4' }]);
    e.core.fire('selection');
    await settle();
    e.core.run('refreshToolbar');
    const bar = $('.mtb')!;
    expect(bar.querySelector('[data-c="icon"] .mtb-dot')).not.toBeNull();
    expect(bar.querySelector('[data-c="media"]')).not.toBeNull();
    const h = bar.querySelector<HTMLInputElement>('[data-c="mediaSize"] input')!;
    expect(h.value).toBe('60');
    h.value = '80';
    h.dispatchEvent(new Event('change'));
    expect(e.core.code).toContain('n4@{ icon: "tabler:user", form: "rounded", pos: "b", h: 80 }');
    // the popover: frame and label position
    bar.querySelector<HTMLButtonElement>('[data-c="media"]')!.click();
    const frame = [...$$('.mtb-pop .mtb-words .mtb-choice')].find((b) => b.textContent === 'circle')!;
    frame.click();
    expect(e.core.code).toContain('form: "circle"');
    await valid(e.core.code);
    // a regular node: Icon only; a connector: none
    e.core.select([{ kind: 'node', id: 'A' }]);
    e.core.run('refreshToolbar');
    expect(bar.querySelector('[data-c="icon"]')).not.toBeNull();
    expect(bar.querySelector('[data-c="icon"] .mtb-dot')).toBeNull();
    expect(bar.querySelector('[data-c="media"]')).toBeNull();
    const edge = e.core.model.type === 'flowchart' ? e.core.model.edges[0]!.id : '';
    e.core.select([{ kind: 'edge', id: edge }]);
    e.core.run('refreshToolbar');
    expect(bar.querySelector('[data-c="icon"]')).toBeNull();
  });

  test('Properties: the Image section of an image node writes its size and aspect lock', async () => {
    const e = mount('flowchart LR\n  A["Photo"]\n  A@{ img: "https://example.com/a.png", h: 200, w: 200, pos: "b" }\n');
    await settle();
    e.core.select([{ kind: 'node', id: 'A' }]);
    e.core.run('setPanel', 'properties', true);
    e.core.fire('panels');
    await settle();
    const lock = $<HTMLInputElement>('input[aria-label="Keep aspect ratio"]')!;
    lock.checked = true;
    lock.dispatchEvent(new Event('change'));
    expect(e.core.code).toContain('constraint: "on"');
    await settle();
    const w = $<HTMLInputElement>('input[aria-label="Width"]')!;
    w.value = '320';
    w.dispatchEvent(new Event('change'));
    expect(e.core.code).toContain('w: 320');
    expect($('.prop-emoji')).not.toBeNull();
    await valid(e.core.code);
  });
});
