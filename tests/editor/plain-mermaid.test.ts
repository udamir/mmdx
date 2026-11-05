// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/adapters/storage.js';
import { DiagramEditor } from '../../src/editor/editor.js';
import { documentModule, parseMermaidSvg } from '../../src/editor/modules/chrome/document.js';

// stock Mermaid is not loaded in the tests: its render returns a small SVG saying which scheme it was asked for
vi.mock('../../src/config.js', async (orig) => ({
  ...(await orig<typeof import('../../src/config.js')>()),
  renderWithMermaid: vi.fn(async (_code: string, dark: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" data-dark="${dark}"><rect width="5" height="5"/></svg>`),
}));

// Mermaid's output: labels are HTML inside <foreignObject>, with void tags such as <br> (not valid XML)
const LABEL_WITH_BREAK =
  '<svg xmlns="http://www.w3.org/2000/svg" id="m1" viewBox="0 0 100 50"><g><foreignObject width="80" height="40">' +
  '<div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel">one<br>two</span></div></foreignObject></g></svg>';

describe('Plain Mermaid: parsing Mermaid’s SVG', () => {
  test('a label with a <br> line break parses (it is not valid XML)', () => {
    expect(new DOMParser().parseFromString(LABEL_WITH_BREAK, 'image/svg+xml').querySelector('parsererror')).not.toBeNull();
    const svg = parseMermaidSvg(LABEL_WITH_BREAK);
    expect(svg).not.toBeNull();
    expect(svg!.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg!.getAttribute('viewBox')).toBe('0 0 100 50');
    expect(svg!.querySelector('br')).not.toBeNull();
    expect(svg!.textContent).toContain('one');
  });

  test('scripts and on* handlers are dropped', () => {
    const svg = parseMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect onclick="x()" width="5" height="5"/></svg>');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('onload')).toBeNull();
    expect(svg!.querySelector('script')).toBeNull();
    expect(svg!.querySelector('rect')!.getAttribute('onclick')).toBeNull();
    expect(svg!.querySelector('rect')!.getAttribute('width')).toBe('5');
  });

  test('no SVG in the output gives null', () => {
    expect(parseMermaidSvg('<div>Syntax error</div>')).toBeNull();
    expect(parseMermaidSvg('')).toBeNull();
  });
});

describe('Plain Mermaid: the dialog', () => {
  afterEach(() => document.body.replaceChildren());

  test('opens as an in-component dialog with the stock render; Close closes it', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const ed = new DiagramEditor(host, { value: 'flowchart LR\n  A --> B\n', modules: [documentModule], storage: memoryStorage(), ui: 'dark' });
    await ed.core.run('plainMermaid');
    const card = host.shadowRoot!.querySelector<HTMLElement>('.mmdx-dialog.mm-card')!;
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.querySelector('h2')!.textContent).toBe('Plain Mermaid render');
    expect(card.querySelector('.mm-body svg')!.getAttribute('data-dark')).toBe('true');
    const close = [...card.querySelectorAll('button')].find((b) => b.textContent === 'Close')!;
    close.click();
    expect(host.shadowRoot!.querySelector('.mmdx-dialog')).toBeNull();
    ed.destroy();
  });

  test('says which mmdx-only content stock Mermaid does not get (T10.6)', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const src = 'mindmap\n  root\n    a[fa:fa-car Car]\n    b[Photo]\n%%@ node b {"img":"https://example.com/p.png"}\n';
    const ed = new DiagramEditor(host, { value: src, modules: [documentModule], storage: memoryStorage() });
    await ed.core.run('plainMermaid');
    const card = host.shadowRoot!.querySelector<HTMLElement>('.mmdx-dialog.mm-card')!;
    expect(card.querySelector('.mm-only')!.textContent).toBe('1 image is mmdx-only and is not in the portable file');
    ed.destroy();
    const plain = document.createElement('div');
    document.body.append(plain);
    const ed2 = new DiagramEditor(plain, { value: 'mindmap\n  root\n    a[fa:fa-car Car]\n', modules: [documentModule], storage: memoryStorage() });
    await ed2.core.run('plainMermaid');
    expect(plain.shadowRoot!.querySelector('.mm-only')).toBeNull();
    ed2.destroy();
  });
});
