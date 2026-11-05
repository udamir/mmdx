// @vitest-environment jsdom
// Sequence participants in the editor (T10.2): the toolbar's shape picker writes Mermaid's types to the code (the looks
// only mmdx draws stay metadata), the icon picker writes a token at the start of the name (adding an alias), Properties
// edits where it is drawn (above the name by default) and says stock Mermaid shows it as text, and the image tool sets
// metadata `img` or drops a participant holding it. Every output is read by stock Mermaid 12.2 and 11.17.
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
  test('the icon picker writes a token at the start of the name, adding an alias; removing it removes the alias', async () => {
    const e = mount('sequenceDiagram\n  participant A\n  A->>B: hi\n');
    await settle();
    e.core.select(A);
    e.core.run('openIconPicker', null);
    await settle();
    input($<HTMLInputElement>('.ip-search')!, 'user');
    $<HTMLButtonElement>('.ip-tile[aria-label="tabler:user"]')!.click();
    expect(e.core.code.trimEnd() + '\n').toBe('sequenceDiagram\n  participant A as tabler:user A\n  A->>B: hi\n');
    await stockParse(e.core.code);
    // drawn above the name, the token out of the text
    const head = $('.el[data-kind="participant"][data-id="A"]')!;
    expect(head.querySelector('.mmdx-icon')).not.toBeNull();
    expect(head.textContent).not.toContain('tabler:user');
    e.core.run('openIconPicker', null);
    await settle();
    $<HTMLButtonElement>('.ip-foot button')!.click();
    expect(e.core.code.trimEnd() + '\n').toBe('sequenceDiagram\n  participant A\n  A->>B: hi\n');
  });

  test('Properties: the position defaults to above the name, and a note says stock Mermaid shows the token as text', async () => {
    const e = mount('sequenceDiagram\n  participant A as fa:fa-user Alice\n  A->>B: hi\n');
    await settle();
    const code = e.core.code;
    e.core.select(A);
    e.core.run('setPanel', 'properties', true);
    e.core.fire('panels');
    await settle();
    expect(host.shadowRoot!.textContent).toContain('stock Mermaid shows icons in this diagram type as text');
    const pos = $<HTMLSelectElement>('select[aria-label="Position"]')!;
    expect(pos.value).toBe('t');
    pos.value = 'l';
    pos.dispatchEvent(new Event('change'));
    expect(e.core.meta.participants?.['A']).toEqual({ iconPos: 'l' });
    await settle();
    const pos2 = $<HTMLSelectElement>('select[aria-label="Position"]')!;
    pos2.value = 't';
    pos2.dispatchEvent(new Event('change'));
    // the default: no key
    expect(e.core.meta.participants?.['A']).toBeUndefined();
    expect(e.core.code).toBe(code);
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
    expect(e.core.meta.participants?.['A']).toEqual({ img: 'https://example.com/alice.png' });
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
    expect(e.core.meta.participants?.[id]).toEqual({ img: '' });
    expect($(`.el[data-kind="participant"][data-id="${id}"] .mmdx-image-blocked`)).not.toBeNull();
    await stockParse(e.core.code);
  });
});
