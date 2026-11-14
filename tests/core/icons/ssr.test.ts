// Icons on the server (T04.4): `renderToSvg` loads what the source references before it renders (its `iconPacks`
// over the context's registry), the rehype plugin awaits loading only when a page needs it, and `preloadIcons` serves
// the synchronous markdown-it plugin.
import { describe, expect, it, vi } from 'vitest';
import { createContext } from '../../../src/core/context.js';
import { createIconRegistry } from '../../../src/core/icons/index.js';
import type { IconifyJSON } from '../../../src/core/icons/types.js';
import { renderToSvg } from '../../../src/core/pipeline.js';
import { preloadIcons, rehypeMmdx } from '../../../src/markdown/index.js';

const PACK: IconifyJSON = { prefix: 'p', icons: { dot: { body: '<circle cx="8" cy="8" r="4"/>' } } };
const SRC = 'flowchart LR\n  a[p:dot Dot] --> b[fa:fa-car Car]\n  c@{ icon: "tabler:database" }';

describe('SSR', () => {
  it('renderToSvg loads the icons the source references first', async () => {
    const loader = vi.fn(async () => PACK);
    const ctx = createContext({ icons: createIconRegistry([{ name: 'p', loader }]) });
    const svg = await renderToSvg(SRC, { ctx });
    expect(svg).toMatch(/^<svg /);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(ctx.icons.get('p:dot').status).toBe('ready');
    expect(ctx.icons.get('fa:car')).toMatchObject({ status: 'ready', fallback: 'tabler:car' });
    expect(ctx.icons.get('tabler:database').status).toBe('ready');
  });

  it('renderToSvg takes iconPacks over the context\'s registry, without changing it', async () => {
    const loader = vi.fn(async () => PACK);
    const ctx = createContext();
    await renderToSvg(SRC, { ctx, iconPacks: [{ name: 'p', loader }] });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(ctx.icons.has('p')).toBe(false);
  });
});

describe('markdown plugins', () => {
  interface Node {
    type: string;
    tagName?: string;
    value?: string;
    properties?: Record<string, unknown>;
    children?: Node[];
  }
  const tree = (src: string): Node & { children: Node[] } => ({
    type: 'root',
    children: [{ type: 'element', tagName: 'pre', children: [{ type: 'element', tagName: 'code', properties: { className: ['language-mermaid'] }, children: [{ type: 'text', value: src }] }] }],
  });

  it('rehype renders synchronously when nothing needs loading, and awaits icons that do', async () => {
    const plain = tree('flowchart LR\n  a --> b');
    expect(rehypeMmdx()(plain)).toBeUndefined();
    expect(plain.children[0]).toMatchObject({ type: 'raw' });

    const loader = vi.fn(async () => PACK);
    const withIcons = tree('flowchart LR\n  a[p:dot Dot] --> b');
    const done = rehypeMmdx({ iconPacks: [{ name: 'p', loader }] })(withIcons);
    expect(done).toBeInstanceOf(Promise);
    expect(withIcons.children[0]).toMatchObject({ tagName: 'pre' });
    await done;
    expect(withIcons.children[0]).toMatchObject({ type: 'raw' });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('preloadIcons loads a page\'s icons into a context (markdown-it renders synchronously)', async () => {
    const loader = vi.fn(async () => PACK);
    const ctx = createContext({ icons: createIconRegistry([{ name: 'p', loader }]) });
    await preloadIcons(ctx, ['flowchart LR\n  a[p:dot]', 'flowchart LR\n  b[plain]']);
    expect(ctx.icons.get('p:dot').status).toBe('ready');
  });
});
