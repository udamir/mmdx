// @vitest-environment jsdom
// Icons in the components (T04.4, T04.7): a component re-renders when an icon pack it waits for has loaded, a
// component's own packs extend the shared ones of configure(), and stock Mermaid receives the same packs (the built-in
// set under `tabler`) before a fallback render.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IconifyJSON } from '../../src/core/icons/types.js';
import type { MermaidLike } from '../../src/ports.js';

const PACK: IconifyJSON = { prefix: 'p', icons: { dot: { body: '<circle cx="8" cy="8" r="4"/>' } } };

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
});

describe('viewer', () => {
  it('renders again when a pack it looked up has loaded; the next render draws from it', async () => {
    const { DiagramViewer } = await import('../../src/elements/viewer.js');
    const { loadKind } = await import('../../src/view/kinds.js');
    await loadKind('flowchart');
    let resolve: ((p: IconifyJSON) => void) | null = null;
    const loader = vi.fn(() => new Promise<IconifyJSON>((r) => (resolve = r)));
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const ctx: { v: InstanceType<typeof DiagramViewer> | null } = { v: null };
    // what a renderer that draws the token sees on each render (T06 and later draw them)
    const seen: string[] = [];
    host.addEventListener('mmdx-render', () => void seen.push(ctx.v ? ctx.v.ctx.icons.get('p:dot').status : 'first'));
    ctx.v = new DiagramViewer(host, { lazy: false, source: 'flowchart LR\n  a[p:dot Dot] --> b', iconPacks: [{ name: 'p', loader }] });
    expect(ctx.v.ctx.icons.get('p:dot')).toEqual({ status: 'loading' });
    await vi.waitFor(() => expect(loader).toHaveBeenCalled());
    resolve!(PACK);
    await vi.waitFor(() => expect(seen[seen.length - 1]).toBe('ready'));
    expect(seen.length).toBeGreaterThan(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('a component\'s own packs are its own; the shared ones of configure() reach every component', async () => {
    const { DiagramViewer, configure } = await import('../../src/viewer.js');
    configure({ iconPacks: [{ name: 'shared', icons: PACK }] });
    const mk = (o: ConstructorParameters<typeof DiagramViewer>[1]): InstanceType<typeof DiagramViewer> => {
      const host = document.createElement('div');
      document.body.append(host);
      hosts.push(host);
      return new DiagramViewer(host, { lazy: false, source: 'flowchart LR\n  a --> b', ...o });
    };
    const a = mk({ iconPacks: [{ name: 'own', icons: PACK }] });
    const b = mk({});
    expect(a.ctx.icons.has('own')).toBe(true);
    expect(a.ctx.icons.has('shared')).toBe(true);
    expect(b.ctx.icons.has('own')).toBe(false);
    expect(b.ctx.icons.has('shared')).toBe(true);
    expect(b.ctx.icons.has('tabler')).toBe(true);
  });
});

describe('stock Mermaid', () => {
  it('receives the packs (the built-in set under tabler) once per pack set, before rendering', async () => {
    vi.resetModules();
    const config = { ...(await import('../../src/platform/config.js')), ...(await import('../../src/platform/mermaid.js')) };
    const calls: string[] = [];
    const registered: { name: string; icons?: unknown; loader?: () => Promise<unknown> }[][] = [];
    const mermaid: MermaidLike = {
      initialize: () => void calls.push('initialize'),
      render: async () => {
        calls.push('render');
        return { svg: '<svg/>' };
      },
      registerIconPacks: (packs) => {
        calls.push('registerIconPacks');
        registered.push(packs);
      },
    };
    config.configure({ mermaid, iconPacks: [{ name: 'p', icons: PACK }] });
    await config.renderWithMermaid('pie\n "a": 1', false);
    await config.renderWithMermaid('pie\n "a": 1', false);
    expect(calls).toEqual(['registerIconPacks', 'initialize', 'render', 'initialize', 'render']);
    expect(registered[0]!.map((p) => p.name).sort()).toEqual(['p', 'tabler']);
    const tabler = (await registered[0]!.find((p) => p.name === 'tabler')!.loader!()) as IconifyJSON;
    expect(tabler.icons['car']).toBeDefined();
    // a component's own packs are another set
    const own = config.getShared().icons.extend([{ name: 'own', icons: PACK }]);
    await config.renderWithMermaid('pie\n "a": 1', false, own);
    expect(registered[registered.length - 1]!.map((p) => p.name).sort()).toEqual(['own', 'p', 'tabler']);
  });
});
