// @vitest-environment jsdom
// Sequence participants in the editor (T10.2): the toolbar's shape picker writes Mermaid's types to the code (the looks
// only mmdx draws stay metadata); a participant's image works as a flowchart image node's, in metadata — the image tool
// sets a picture or (its Icon tab) an icon, or drops a participant holding the placeholder. Every output is read by stock
// Mermaid 12.2 and 11.17.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { loadBuiltinIcons } from '../../src/core/icons/registry.js';
import { pev } from './connect.helpers.js';
import { stockParse } from '../helpers/mermaid.js';

vi.spyOn(console, 'error').mockImplementation(() => undefined);

let host: HTMLElement;
let ed: DiagramEditor | null = null;

beforeAll(async () => {
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

const mount = (value: string): DiagramEditor => {
  ed = new DiagramEditor(host, { value, storage: memoryStorage() });
  ed.core.viewport.set({ k: 1, tx: 0, ty: 0 });
  return ed;
};
const $ = <T extends Element = HTMLElement>(sel: string): T | null => host.shadowRoot!.querySelector<T>(sel);
const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    await vi.dynamicImportSettled();
    await new Promise((r) => setTimeout(r, 0));
  }
};
const input = (el: HTMLInputElement, v: string): void => {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const A = [{ kind: 'participant' as const, id: 'A' }];

describe('the shape picker', () => {
  test('writes the 8 types to the code; rounded and stadium stay metadata', async () => {
    const e = mount('sequenceDiagram\n  A->>B: hi\n');
    await settle();
    e.core.select(A);
    e.core.fire('selection');
    await settle();
    const pick = async (shape: string): Promise<void> => {
      e.core.run('refreshToolbar');
      $<HTMLButtonElement>('.mtb [data-c="shape"]')!.click();
      $<HTMLButtonElement>(`.mtb-pop .sp-tile[data-key="${shape}"]`)!.click();
      await settle();
    };
    // every type is offered, the old horizontal cylinder is not (the queue is)
    e.core.run('refreshToolbar');
    $<HTMLButtonElement>('.mtb [data-c="shape"]')!.click();
    const keys = [...host.shadowRoot!.querySelectorAll('.mtb-pop .sp-tile')].map((b) => b.getAttribute('data-key'));
    expect(keys).toEqual(expect.arrayContaining(['box', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue', 'rounded', 'stadium']));
    expect(keys).not.toContain('hcyl');
    $<HTMLButtonElement>('.mtb [data-c="shape"]')!.click();
    await pick('boundary');
    expect(e.core.code.trimEnd() + '\n').toBe('sequenceDiagram\n  participant A@{ "type": "boundary" }\n  A->>B: hi\n');
    expect(e.core.meta.participants?.['A']?.shape).toBeUndefined();
    await stockParse(e.core.code);
    await pick('rounded');
    expect(e.core.code.trimEnd() + '\n').toBe('sequenceDiagram\n  participant A@{ "type": "boundary" }\n  A->>B: hi\n');
    expect(e.core.meta.participants?.['A']?.shape).toBe('rounded');
    await pick('actor');
    expect(e.core.code.trimEnd() + '\n').toBe('sequenceDiagram\n  actor A\n  A->>B: hi\n');
    expect(e.core.meta.participants?.['A']?.shape).toBeUndefined();
    await stockParse(e.core.code);
    await pick('box');
    expect(e.core.code.trimEnd() + '\n').toBe('sequenceDiagram\n  participant A\n  A->>B: hi\n');
    // the drawn shape follows
    expect($('.el[data-kind="participant"][data-id="A"]')).not.toBeNull();
  });
});

describe('icons', () => {
  test('an icon is an image\'s source: the image tool\'s Icon tab makes the participant an icon participant (metadata); no Icon button', async () => {
    const e = mount('sequenceDiagram\n  participant A\n  A->>B: hi\n');
    await settle();
    const code = e.core.code;
    e.core.select(A);
    e.core.fire('selection');
    await settle();
    e.core.run('refreshToolbar');
    const controls = [...host.shadowRoot!.querySelectorAll<HTMLElement>('.mtb .mtb-seg [data-c]')].map((b) => b.dataset['c']);
    expect(controls).not.toContain('icon');
    e.core.run('openImageTool', null, { insert: false, tab: 'icon' });
    await settle();
    input($<HTMLInputElement>('.imp .ip-search')!, 'user');
    $<HTMLButtonElement>('.imp .ip-tile[aria-label="tabler:user"]')!.click();
    expect(e.core.meta.participants?.['A']).toEqual({ icon: 'tabler:user', form: 'square', pos: 'b' });
    expect(e.core.code).toBe(code);
    // the head is the icon in its frame, the name under it
    expect($('.el[data-kind="participant"][data-id="A"] .mmdx-icon')).not.toBeNull();
    e.core.run('refreshToolbar');
    const after = [...host.shadowRoot!.querySelectorAll<HTMLElement>('.mtb .mtb-seg [data-c]')].map((b) => b.dataset['c']);
    expect(after.slice(0, 2)).toEqual(['source', 'media']);
    expect(after).not.toContain('shape');
  });
});

describe('images', () => {
  test('the image tool on a selected participant: metadata img, the code unchanged', async () => {
    const e = mount('sequenceDiagram\n  participant A\n  A->>B: hi\n');
    await settle();
    const code = e.core.code;
    e.core.select(A);
    e.core.run('openImageTool', null, { insert: false });
    await settle();
    input($<HTMLInputElement>('.imp-url')!, 'https://example.com/alice.png');
    $<HTMLButtonElement>('.imp-row button')!.click();
    expect(e.core.meta.participants?.['A']).toEqual({ img: 'https://example.com/alice.png', h: 200, w: 200, pos: 'b', constraint: 'on' });
    expect(e.core.code).toBe(code);
    expect($('.el[data-kind="participant"][data-id="A"] image')).not.toBeNull();
  });

  test('the Image button drops a participant holding the placeholder', async () => {
    const e = mount('sequenceDiagram\n  participant A\n  A->>B: hi\n');
    await e.whenLoaded?.();
    await settle();
    const btn = $('.vt-image')!;
    expect(btn.hidden).toBe(false);
    btn.dispatchEvent(pev('pointerdown', { x: 0, y: 0 }));
    btn.dispatchEvent(pev('pointerup', { x: 0, y: 0 }));
    await settle();
    const id = e.core.primary()!.id;
    expect(e.core.model.type === 'sequence' && e.core.model.participants.some((p) => p.id === id)).toBe(true);
    expect(e.core.meta.participants?.[id]).toEqual({ img: '', h: 200, w: 200, pos: 'b', constraint: 'on' });
    expect($(`.el[data-kind="participant"][data-id="${id}"] .mmdx-image-blocked`)).not.toBeNull();
    await stockParse(e.core.code);
  });
});
