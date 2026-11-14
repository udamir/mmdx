// @vitest-environment jsdom
// Hover highlight (P8): one scan of the scene per lit box, none for a move within the same box or a clear with
// nothing lit.
import { describe, expect, it, vi } from 'vitest';
import { renderToSvg } from '../../src/core/pipeline.js';
import { clearHighlight, highlightItems, hoverHighlight } from '../../src/dom/highlight.js';

const scene = async (): Promise<Element> => {
  const host = document.createElement('div');
  host.innerHTML = await renderToSvg('flowchart LR\n  A --> B\n  B --> C\n  D');
  document.body.append(host);
  return host.querySelector('svg')!;
};
const lit = (root: Element): string[] => [...root.querySelectorAll('.hl')].map((e) => `${e.getAttribute('data-kind')}:${e.getAttribute('data-id')}`).sort();

describe('hover highlight', () => {
  it('lights the box, its connectors and their other ends; the rest dims', async () => {
    const root = await scene();
    const b = root.querySelector('.el.node[data-id="B"]')!;
    expect(hoverHighlight(root, b, null)).toBe('node:B');
    expect(root.classList.contains('dim')).toBe(true);
    const on = lit(root);
    for (const id of ['A', 'B', 'C']) expect(on).toContain(`node:${id}`);
    expect(on).not.toContain('node:D');
    expect(on.filter((x) => x.startsWith('edge:')).length).toBe(2);
    clearHighlight(root);
    expect(lit(root)).toEqual([]);
    expect(root.classList.contains('dim')).toBe(false);
  });

  it('a move within the lit box and a clear with nothing lit scan nothing', async () => {
    const root = await scene();
    const a = root.querySelector('.el.node[data-id="A"]')!;
    const spy = vi.spyOn(root, 'querySelectorAll');
    hoverHighlight(root, a, null);
    // one scan to index, one to clear what was lit before (nothing: the root was not dimmed)
    expect(spy.mock.calls.length).toBe(1);
    spy.mockClear();
    expect(hoverHighlight(root, a.firstElementChild ?? a, null)).toBe('node:A');
    expect(spy).not.toHaveBeenCalled();
    clearHighlight(root);
    spy.mockClear();
    clearHighlight(root);
    expect(spy).not.toHaveBeenCalled();
  });

  it('lights again once a re-render restyled the lit elements', async () => {
    const root = await scene();
    const a = root.querySelector('.el.node[data-id="A"]')!;
    hoverHighlight(root, a, null);
    for (const e of root.querySelectorAll('.hl')) e.classList.remove('hl');
    hoverHighlight(root, a, null);
    expect(lit(root)).toContain('node:A');
  });

  it('highlightItems lights the listed items', async () => {
    const root = await scene();
    highlightItems(root, [{ kind: 'node', id: 'D' }]);
    expect(lit(root)).toEqual(['node:D']);
  });
});
