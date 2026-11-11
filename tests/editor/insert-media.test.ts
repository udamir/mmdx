// @vitest-environment jsdom
// The insert dock and its pickers (T05): the Image button per kind (no Text, Icons, Container or Connector tools: those
// are made inline), icons set and images inserted and set through the flowchart's edit kind (every output parsed by
// stock Mermaid 12.2 and 11.17), the image policy and the host's `uploadImage`, emoji at the caret, the Shapes palette
// (Alt-click replace), the selection toolbar's media controls and the Properties sections.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { memoryImageStore, type ImageStore } from '../../src/adapters/images.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { loadBuiltinIcons } from '../../src/core/icons/registry.js';
import { pev } from './connect.helpers.js';
import { stockParse } from '../helpers/mermaid.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);

let host: HTMLElement;
let ed: DiagramEditor | null = null;
let mermaidParse: (code: string) => Promise<unknown>;

beforeAll(async () => {
  mermaidParse = stockParse;
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

const mount = (value: string, o: { uploadImage?: (f: File) => Promise<{ url: string }>; images?: ImageStore } = {}): DiagramEditor => {
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
  test('the dock offers Image only; text, icons, containers and connectors are made inline', async () => {
    const e = mount('flowchart LR\n  A --> B\n');
    await e.whenLoaded?.();
    await settle();
    expect($('.vt-image')!.hidden).toBe(false);
    for (const n of ['text', 'icons', 'container', 'connector']) expect($(`.vt-${n}`)).toBeNull();
    // the tooltip carries the shortcut
    expect($('.vt-image')!.title).toContain('(G)');
    // a type without images (ER entities, T10 §6 Q2) hides the button; sequence participants take images since T10.2
    e.setSource('erDiagram\n  A ||--o{ B : has\n');
    await settle();
    e.core.fire('model');
    expect($('.vt-image')!.hidden).toBe(true);
    // T, N, B and A no longer insert anything
    const before = e.core.code;
    for (const k of ['t', 'n', 'b', 'a']) key(k);
    await settle();
    expect(e.core.code).toBe(before);
    expect(e.core.tool.peek()).toBe('pointer');
  });
});

describe('icons', () => {
  test('without a selection the picker does not open: a toast asks for one', async () => {
    const e = mount('flowchart LR\n  A --> B\n');
    await settle();
    e.core.run('openIconPicker', null);
    await settle();
    expect($('.ins-pop')).toBeNull();
    expect(host.shadowRoot!.textContent).toContain('Select an item to give it an icon');
  });

  test('an icon is an image node\'s source: a plain node takes none; a picture gives way to the chosen icon', async () => {
    const e = mount('flowchart LR\n  A["Car"] --> B\n  n5["Photo"]\n  n5@{ img: "https://example.com/a.png", h: 200, w: 200, pos: "b", constraint: "on" }\n');
    await settle();
    const before = e.core.code;
    e.core.select([{ kind: 'node', id: 'A' }]);
    e.core.run('openIconPicker', null);
    await settle();
    expect($('.ip')).toBeNull();
    expect(e.core.code).toBe(before);
    e.core.select([{ kind: 'node', id: 'n5' }]);
    e.core.run('openIconPicker', null);
    await settle();
    input($<HTMLInputElement>('.ip-search')!, 'car');
    $<HTMLButtonElement>('.ip-tile[aria-label="tabler:car"]')!.click();
    expect(e.core.code).toContain('n5@{ h: 60, pos: "b", icon: "tabler:car", form: "square" }');
    expect(e.core.code).not.toContain('img:');
    e.undo();
    expect(e.core.code).toBe(before);
    e.redo();
    await valid(e.core.code);
  });

  test('selection mode on an icon node: its icon key', async () => {
    const e = mount('flowchart LR\n  n4["User"]\n  n4@{ icon: "tabler:user", form: "rounded", pos: "b", h: 60 }');
    await settle();
    e.core.select([{ kind: 'node', id: 'n4' }]);
    e.core.run('openIconPicker', null);
    await settle();
    expect($('.ip-tile.on')?.getAttribute('aria-label') ?? 'tabler:user').toBe('tabler:user');
    input($<HTMLInputElement>('.ip-search')!, 'car');
    $<HTMLButtonElement>('.ip-tile[aria-label="tabler:car"]')!.click();
    expect(e.core.code).toBe('flowchart LR\n  n4["User"]\n  n4@{ icon: "tabler:car", form: "rounded", pos: "b", h: 60 }');
    await valid(e.core.code);
  });

  test('pack chips: a registered pack that is not loaded loads when its chip is chosen', async () => {
    const loader = vi.fn(async () => ({ prefix: 'demo', icons: { gear: { body: '<path d="M1 1h10v10z"/>' } }, info: { name: 'Demo', license: { title: 'CC0' } } }));
    ed = new DiagramEditor(host, { value: 'flowchart LR\n  A["A"]\n  A@{ icon: "tabler:user" }\n', storage: memoryStorage(), iconPacks: [{ name: 'demo', loader }] });
    await settle();
    ed.core.select([{ kind: 'node', id: 'A' }]);
    ed.core.run('openIconPicker', null);
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
    expect(e.core.code).toContain(`  ${id}["team photo"]\n  ${id}@{ img: "https://example.com/team-photo.png", h: 200, w: 200, pos: "b", constraint: "on" }`);
    await valid(e.core.code);
  });

  test('the Image button adds an image node with the placeholder (click, Enter or drag); its URL is chosen afterwards', async () => {
    const e = mount('flowchart LR\n  A --> B\n');
    await e.whenLoaded?.();
    await settle();
    const btn = $('.vt-image')!;
    btn.dispatchEvent(pev('pointerdown', { x: 0, y: 0 }));
    btn.dispatchEvent(pev('pointerup', { x: 0, y: 0 }));
    await settle();
    const id = e.core.primary()!.id;
    expect(e.core.code).toContain(`  ${id}["Image"]\n  ${id}@{ img: "", h: 200, w: 200, pos: "b", constraint: "on" }`);
    // no popover, no label editing: the node is selected
    expect($('.ins-pop')).toBeNull();
    expect(e.core.model.type === 'flowchart' && e.core.model.nodes.get(id)?.shape).toBe('image');
    // drawn as the placeholder, without a warning
    const node = $(`.el[data-kind="node"][data-id="${id}"]`)!;
    expect(node.querySelector('[aria-label="Image placeholder"]')).not.toBeNull();
    expect(e.core.result.diagnostics.some((d) => d.code === 'image.blocked')).toBe(false);
    await valid(e.core.code);
    // the URL from the selection's image tool
    e.core.run('openImageTool', null, {});
    await settle();
    expect($<HTMLInputElement>('.imp-url')!.value).toBe('');
    input($<HTMLInputElement>('.imp-url')!, 'https://example.com/a.png');
    key('Enter', $('.imp-url')!);
    expect(e.core.code).toContain(`  ${id}@{ img: "https://example.com/a.png", h: 200, w: 200, pos: "b", constraint: "on" }`);
    // the G key adds another one in the middle
    key('g');
    await settle();
    expect(e.core.primary()!.id).not.toBe(id);
    expect(e.core.code.match(/img: ""/g)).toHaveLength(1);
  });

  test('selection mode: a node becomes an image node; the image is replaced and removed', async () => {
    const e = mount('flowchart LR\n  A["Photo"]\n');
    await settle();
    e.core.select([{ kind: 'node', id: 'A' }]);
    e.core.run('openImageTool', null, {});
    await settle();
    input($<HTMLInputElement>('.imp-url')!, 'https://example.com/a.png');
    key('Enter', $('.imp-url')!);
    expect(e.core.code).toBe('flowchart LR\n  A["Photo"]\n  A@{ img: "https://example.com/a.png", h: 200, w: 200, pos: "b", constraint: "on" }\n');
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
  test('the inline editor: ⌘/Ctrl+; opens the picker, which inserts at the caret (multi-line node and single-line edge label); no button over the text', async () => {
    const e = mount('flowchart LR\n  A["Hello world"] -->|"go"| B\n');
    await settle();
    e.core.select([{ kind: 'node', id: 'A' }]);
    expect(e.core.run('inlineEdit', { kind: 'node', id: 'A' })).toBe(true);
    const ta = $<HTMLTextAreaElement>('.inline-edit')!;
    ta.setSelectionRange(5, 5);
    expect($('.inline-emoji')).toBeNull();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: ';', metaKey: true, bubbles: true }));
    await settle();
    input($<HTMLInputElement>('.ep-search')!, 'rocket');
    $<HTMLButtonElement>('.ep-e[aria-label="rocket"]')!.click();
    expect(ta.value).toBe('Hello🚀 world');
    // the picker stays open for more; the text box is still open
    expect($('.inline-edit')).not.toBeNull();
    e.core.popovers.close();
    key('Enter', ta);
    expect(e.core.code).toContain('A["Hello🚀 world"]');
    // an edge label (one line)
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
  test('a click adds the shape; Alt-click replace', async () => {
    const e = mount('flowchart LR\n  A["A"] --> B\n');
    await settle();
    e.core.run('toggleShapesMenu');
    await settle();
    const menu = $('.shapes-menu')!;
    const tile = (k: string): HTMLElement => menu.querySelector<HTMLElement>(`.sp-tile[data-key="${k}"]`)!;
    const click = (el: HTMLElement, alt = false): void => {
      el.dispatchEvent(pev('pointerdown', { x: 0, y: 0 }, { altKey: alt }));
      el.dispatchEvent(pev('pointerup', { x: 0, y: 0 }, { altKey: alt }));
    };
    click(tile('datastore'));
    const id = e.core.primary()!.id;
    expect(e.core.code).toContain(`${id}@{ shape: datastore }`);
    e.core.run('toggleShapesMenu');
    await settle();
    // Alt-click with a node selected gives it the shape
    e.core.select([{ kind: 'node', id: 'A' }]);
    click(tile('diamond'), true);
    expect(e.core.code).toContain('A{"A"} --> B');
    expect(e.core.model.type === 'flowchart' && e.core.model.nodes.size).toBe(3);
    await valid(e.core.code);
  });
});

describe('selection toolbar and Properties', () => {
  test('a state: no Icon button on a plain one; an image state has Source and its settings, as a flowchart image node', async () => {
    const e = mount('stateDiagram-v2\n  [*] --> idle\n  idle --> run\n%%@ node run {"img":"https://example.com/a.png","w":200,"h":200,"pos":"b","constraint":"on"}\n');
    await settle();
    const controls = async (id: string): Promise<string[]> => {
      e.core.select([{ kind: 'node', id }]);
      e.core.fire('selection');
      await settle();
      e.core.run('refreshToolbar');
      return [...$('.mtb')!.querySelectorAll<HTMLElement>('.mtb-seg [data-c]')].map((b) => b.dataset['c']!);
    };
    const plain = await controls('idle');
    expect(plain).not.toContain('icon');
    expect(plain).not.toContain('source');
    const image = await controls('run');
    expect(image.slice(0, 2)).toEqual(['source', 'media']);
    expect(image).not.toContain('icon');
    expect(image).not.toContain('shape');
    const source = $<HTMLButtonElement>('.mtb [data-c="source"]')!;
    expect(source.title).toBe('Change image');
    source.click();
    await settle();
    // Change image: the image tool, its tabs the picture's sources the host has (here a URL only) and an icon
    expect([...$$('.imp [role=tab]')].map((b) => b.textContent)).toEqual(['URL', 'Icon']);
    expect($('.imp [role=tab][aria-selected=true]')!.textContent).toBe('URL');
    expect($('.imp-title')).toBeNull();
  });

  test('an image node: Source (a picture or an icon) and its settings (frame, label position); no shape picker, no sizes', async () => {
    const e = mount('flowchart LR\n  n4["User"]\n  n4@{ icon: "tabler:user", form: "rounded", pos: "b", h: 60 }\n  A --> n4\n');
    await settle();
    e.core.select([{ kind: 'node', id: 'n4' }]);
    e.core.fire('selection');
    await settle();
    e.core.run('refreshToolbar');
    const bar = $('.mtb')!;
    const controls = (): string[] => [...bar.querySelectorAll<HTMLElement>('.mtb-seg [data-c]')].map((b) => b.dataset['c']!);
    expect(controls().slice(0, 2)).toEqual(['source', 'media']);
    expect(controls()).not.toContain('shape');
    expect(controls()).not.toContain('icon');
    expect(bar.querySelector('[data-c="mediaSize"]')).toBeNull();
    const titles = (): string[] => [...$$('.mtb-pop .mtb-choice')].map((b) => b.getAttribute('title') ?? b.textContent ?? '');
    expect(bar.querySelector<HTMLButtonElement>('[data-c="source"]')!.title).toBe('Change image — now the icon tabler:user');
    bar.querySelector<HTMLButtonElement>('[data-c="source"]')!.click();
    await settle();
    // an icon node's image tool opens on its Icon tab: the icon picker
    expect([...$$('.imp [role=tab]')].map((b) => b.textContent)).toEqual(['URL', 'Icon']);
    expect($('.imp [role=tab][aria-selected=true]')!.textContent).toBe('Icon');
    // the compact icon picker: the search and the icons, no pack filters, texts or footer
    expect($('.imp [data-panel=icon] .ip')!.classList.contains('ip-compact')).toBe(true);
    expect($<HTMLElement>('.imp [data-panel=icon] .ip')!.style.getPropertyValue('--ip-tile')).toBe('32px');
    expect($<HTMLElement>('.imp [data-panel=url]')!.hidden).toBe(true);
    e.core.popovers.close();
    bar.querySelector<HTMLButtonElement>('[data-c="media"]')!.click();
    expect(titles()).toEqual(['No frame', 'Square', 'Circle', 'Rounded', 'Above', 'Below']);
    [...$$('.mtb-pop .mtb-choice')].find((b) => b.getAttribute('title') === 'Circle')!.click();
    expect(e.core.code).toContain('n4@{ icon: "tabler:user", form: "circle", pos: "b", h: 60 }');
    [...$$('.mtb-pop .mtb-choice')].find((b) => b.getAttribute('title') === 'Above')!.click();
    expect(e.core.code).toContain('pos: "t"');
    await valid(e.core.code);
    // a plain node: the shape picker, no icon and no image item; a connector: none
    e.core.select([{ kind: 'node', id: 'A' }]);
    e.core.run('refreshToolbar');
    expect(controls()).toContain('shape');
    expect(controls()).not.toContain('icon');
    expect(controls()).not.toContain('media');
    expect(controls()).not.toContain('source');
    const edge = e.core.model.type === 'flowchart' ? e.core.model.edges[0]!.id : '';
    e.core.select([{ kind: 'edge', id: edge }]);
    e.core.run('refreshToolbar');
    expect(controls()).not.toContain('media');
  });

  test('a picture\'s source and settings: its fit and the label position; the aspect lock is in Properties only', async () => {
    const e = mount('flowchart LR\n  A["Photo"]\n  A@{ img: "https://example.com/a.png", h: 200, w: 200, pos: "b" }\n');
    await settle();
    e.core.select([{ kind: 'node', id: 'A' }]);
    e.core.fire('selection');
    await settle();
    e.core.run('refreshToolbar');
    $<HTMLButtonElement>('.mtb [data-c="source"]')!.click();
    await settle();
    expect([...$$('.imp [role=tab]')].map((b) => b.textContent)).toEqual(['URL', 'Icon']);
    e.core.popovers.close();
    $<HTMLButtonElement>('.mtb [data-c="media"]')!.click();
    expect([...$$('.mtb-pop .mtb-choice')].map((b) => b.getAttribute('title') ?? b.textContent)).toEqual(['Contain', 'Cover', 'Stretch', 'Above', 'Below']);
    expect($('.mtb-pop input[type="checkbox"]')).toBeNull();
  });

  test('with an image store: Change image and Properties replace a picture from the library, by an upload, by URL or with an icon', async () => {
    const store = memoryImageStore([
      { id: 'p1', url: 'https://example.com/team.png', name: 'team.png' },
      { id: 'p2', url: 'http://example.com/old.png', name: 'old.png' },
    ], { url: (_f, id) => `https://cdn.example.com/${id}.png` });
    const e = mount('flowchart LR\n  A["Photo"]\n  A@{ img: "https://example.com/a.png", h: 200, w: 200, pos: "b" }\n', { images: store });
    await settle();
    e.core.select([{ kind: 'node', id: 'A' }]);
    e.core.fire('selection');
    await settle();
    e.core.run('refreshToolbar');
    $<HTMLButtonElement>('.mtb [data-c="source"]')!.click();
    await settle();
    // Change image: four tabs, the library first
    expect([...$$('.imp [role=tab]')].map((b) => b.textContent)).toEqual(['Library', 'Upload', 'URL', 'Icon']);
    // the library: the store's pictures; one the image policy refuses is marked and not taken
    expect($('.imp [role=tab][aria-selected=true]')!.textContent).toBe('Library');
    const tiles = $$('.imp-tile');
    expect(tiles.map((b) => b.dataset['id'])).toEqual(['p1', 'p2']);
    expect(tiles[1]!.getAttribute('aria-disabled')).toBe('true');
    tiles[1]!.click();
    expect(e.core.code).toContain('img: "https://example.com/a.png"');
    tiles[0]!.click();
    expect(e.core.code).toContain('A@{ img: "https://example.com/team.png", h: 200, w: 200, pos: "b" }');
    await settle();
    // Properties: the same three; an upload goes into the store and the picture references it
    e.core.run('setPanel', 'properties', true);
    e.core.fire('panels');
    await settle();
    // one Change image button (an icon) beside Remove image: the image tool and its four tabs
    const change = $<HTMLButtonElement>('[data-act="change"]')!;
    expect(change.title).toBe('Change image');
    expect($<HTMLButtonElement>('[data-act="remove"]')!.title).toBe('Remove image');
    change.click();
    await settle();
    expect([...$$('.imp [role=tab]')].map((b) => b.textContent)).toEqual(['Library', 'Upload', 'URL', 'Icon']);
    $<HTMLButtonElement>('.imp [role=tab][data-tab="upload"]')!.click();
    expect($('.imp [role=tab][aria-selected=true]')!.textContent).toBe('Upload');
    expect($('.imp-drop')!.hidden).toBe(false);
    const fileInput = $<HTMLInputElement>('.imp input[type=file]')!;
    Object.defineProperty(fileInput, 'files', { value: [new File(['x'], 'logo.png', { type: 'image/png' })], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    await settle();
    await settle();
    expect(e.core.code).toContain('img: "https://cdn.example.com/img-3.png"');
    expect((await store.list()).images.map((i) => i.name)).toEqual(['logo.png', 'team.png', 'old.png']);
    await settle();
    $<HTMLButtonElement>('[data-act="change"]')!.click();
    await settle();
    $<HTMLButtonElement>('.imp [role=tab][data-tab="url"]')!.click();
    expect($('.imp [role=tab][aria-selected=true]')!.textContent).toBe('URL');
    expect($<HTMLInputElement>('.imp-url')!.value).toBe('https://cdn.example.com/img-3.png');
    e.core.popovers.close();
    await settle();
    // the Icon tab: a picked icon replaces the picture
    $<HTMLButtonElement>('[data-act="change"]')!.click();
    await settle();
    $<HTMLButtonElement>('.imp [role=tab][data-tab="icon"]')!.click();
    expect($('.imp [role=tab][aria-selected=true]')!.textContent).toBe('Icon');
    input($<HTMLInputElement>('.imp .ip-search')!, 'car');
    $<HTMLButtonElement>('.imp .ip-tile[aria-label="tabler:car"]')!.click();
    expect(e.core.code).toContain('icon: "tabler:car"');
    expect(e.core.code).not.toContain('img:');
    expect($('.imp')).toBeNull();
    await valid(e.core.code);
  });

  test('Properties of a plain node: Set image opens the image tool; an icon from its Icon tab makes the node an icon node', async () => {
    const e = mount('flowchart LR\n  A["Car"] --> B\n');
    await settle();
    e.core.select([{ kind: 'node', id: 'A' }]);
    e.core.run('setPanel', 'properties', true);
    e.core.fire('panels');
    await settle();
    const set = $<HTMLButtonElement>('[data-act="set"]')!;
    expect(set.title).toBe('Set image');
    set.click();
    await settle();
    expect([...$$('.imp [role=tab]')].map((b) => b.textContent)).toEqual(['URL', 'Icon']);
    $<HTMLButtonElement>('.imp [role=tab][data-tab="icon"]')!.click();
    input($<HTMLInputElement>('.imp .ip-search')!, 'car');
    $<HTMLButtonElement>('.imp .ip-tile[aria-label="tabler:car"]')!.click();
    expect(e.core.code).toContain('A@{ icon: "tabler:car", form: "square", h: 60, pos: "b" }');
    expect(e.core.code).toContain('A["Car"]');
    await valid(e.core.code);
  });

  test('the library is searched and paged; a failing store says why', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, url: `https://example.com/${i}.png`, name: i % 2 ? `cat-${i}.png` : `dog-${i}.png` }));
    const e = mount('flowchart LR\n  A --> B\n', { images: memoryImageStore(many, { pageSize: 2 }) });
    await settle();
    e.core.run('openImageTool', null, { insert: true });
    await settle();
    expect($$('.imp-tile').length).toBe(2);
    $<HTMLButtonElement>('.imp-more')!.click();
    await settle();
    expect($$('.imp-tile').length).toBe(4);
    const search = $<HTMLInputElement>('.imp-search')!;
    search.value = 'cat';
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect($$('.imp-tile').map((b) => b.dataset['id'])).toEqual(['p1', 'p3']);
    search.value = 'bird';
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect($('.imp-empty')!.textContent).toBe('No images match “bird”');
    e.core.popovers.close();
    const broken: ImageStore = { list: () => Promise.reject(new Error('offline')), get: () => Promise.reject(new Error('offline')), put: () => Promise.reject(new Error('offline')) };
    e.images = broken;
    e.core.run('openImageTool', null, { insert: true });
    await settle();
    expect($('.imp-empty')!.textContent).toBe('The library could not be loaded: offline');
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

  test("Properties of an image state: the flowchart image node's rows (label, height, width, aspect lock, fit), in metadata; the code stays", async () => {
    const e = mount('stateDiagram-v2\n  state "Running" as run\n  [*] --> run\n  [*] --> idle\n%%@ node run {"img":"https://example.com/a.png","w":200,"h":200,"pos":"b","constraint":"on"}\n');
    await settle();
    const code = e.core.code;
    // a plain state: no icon section, an image can be added
    e.core.select([{ kind: 'node', id: 'idle' }]);
    e.core.run('setPanel', 'properties', true);
    e.core.fire('panels');
    await settle();
    expect($('select[aria-label="Position"]')).toBeNull();
    expect($('select[aria-label="Label"]')).toBeNull();
    e.core.select([{ kind: 'node', id: 'run' }]);
    e.core.fire('panels');
    await settle();
    const pos = $<HTMLSelectElement>('select[aria-label="Label"]')!;
    expect(pos.value).toBe('b');
    pos.value = 't';
    pos.dispatchEvent(new Event('change'));
    expect(e.core.meta.nodes?.['run']).toMatchObject({ pos: 't' });
    await settle();
    const hh = $<HTMLInputElement>('input[aria-label="Height"]')!;
    hh.value = '80';
    hh.dispatchEvent(new Event('change'));
    await settle();
    const w = $<HTMLInputElement>('input[aria-label="Width"]')!;
    w.value = '120';
    w.dispatchEvent(new Event('change'));
    await settle();
    const lock = $<HTMLInputElement>('input[aria-label="Keep aspect ratio"]')!;
    expect(lock.checked).toBe(true);
    lock.checked = false;
    lock.dispatchEvent(new Event('change'));
    await settle();
    const fit = $<HTMLSelectElement>('select[aria-label="Fit"]')!;
    fit.value = 'cover';
    fit.dispatchEvent(new Event('change'));
    expect(e.core.meta.nodes?.['run']).toEqual({ img: 'https://example.com/a.png', w: 120, h: 80, pos: 't', imgFit: 'cover' });
    expect($('select[aria-label="Position"]')).toBeNull();
    expect(e.core.code).toBe(code);
  });
});
