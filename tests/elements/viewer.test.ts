// @vitest-environment jsdom
import { forgetKinds } from '../../src/core/kinds/registry.js';
import { registerExtendedShapes } from '../../src/core/extras.js';
import { forgetMediaKit } from '../../src/core/media/kit.js';
import { forgetShapes, shapeById } from '../../src/core/shapes/registry.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DiagramViewer, dedent, defineViewer, type HostFullscreen, type MmdxViewerElement } from '../../src/elements/viewer.js';
import { hasKind, loadKind } from '../../src/platform/kinds.js';
import { memoryStorage } from '../../src/adapters/storage.js';

const example = (f: string): string => readFileSync(resolve(__dirname, '../../examples', f), 'utf8');

beforeAll(() => {
  // jsdom: no layout, no ResizeObserver / IntersectionObserver
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

describe('kinds on demand', () => {
  it('loads the parser and renderer of a diagram type before the first render', async () => {
    forgetKinds();
    expect(hasKind('er')).toBe(false);
    const host = document.createElement('div');
    document.body.append(host);
    const rendered = new Promise((r) => host.addEventListener('mmdx-render', r, { once: true }));
    new DiagramViewer(host, { lazy: false, source: 'erDiagram\n  A ||--o{ B : has' });
    expect(host.shadowRoot!.querySelectorAll('.el').length).toBe(0);
    await rendered;
    expect(hasKind('er')).toBe(true);
    expect(host.shadowRoot!.querySelectorAll('.el[data-kind="entity"]').length).toBe(2);
    host.remove();
  });

  describe('the shapes beyond the 17 (T02.9)', () => {
    afterEach(() => registerExtendedShapes());
    const show = async (source: string): Promise<ShadowRoot> => {
      const host = document.createElement('div');
      document.body.append(host);
      const rendered = new Promise((r) => host.addEventListener('mmdx-render', r, { once: true }));
      new DiagramViewer(host, { lazy: false, source });
      await rendered;
      return host.shadowRoot!;
    };

    it('load before a flowchart that draws one renders, which then shows the shape', async () => {
      forgetShapes();
      expect(shapeById('bolt')).toBeUndefined();
      const sr = await show('flowchart LR\n  A@{ shape: bolt } --> B');
      expect(shapeById('bolt')).toBeDefined();
      const a = sr.querySelector('.el[data-kind="node"][data-id="A"]')!;
      expect(a.querySelector('path')?.getAttribute('d')).toMatch(/^M[\d.,]+ L/);
      expect(a.querySelector('rect')).toBeNull();
      sr.host.remove();
    });

    it('the media kit (T06) loads with them: a markdown label and an icon node draw once it has', async () => {
      forgetMediaKit();
      const sr = await show('flowchart LR\n  A["`**bold** text`"] --> n1\n  n1["User"]\n  n1@{ icon: "fa:user", form: "rounded" }');
      expect(sr.querySelector('.el[data-id="A"] tspan[font-weight="700"]')?.textContent).toBe('bold');
      expect(sr.querySelector('.el[data-id="n1"] image')).not.toBeNull();
      sr.host.remove();
    });

    it('load for a shape a node takes from its metadata too', async () => {
      forgetShapes();
      const sr = await show('flowchart LR\n  A --> B\n%%@ node A {"shape":"collections"}');
      expect(shapeById('collections')).toBeDefined();
      expect(sr.querySelectorAll('.el[data-kind="node"][data-id="A"] path').length).toBe(2);
      sr.host.remove();
    });

    it('a mindmap (T08) loads its kind, then bang, cloud and the media kit for its shapes, icons and markdown', async () => {
      forgetKinds();
      forgetShapes();
      forgetMediaKit();
      const sr = await show(example('product-mindmap.mmdx'));
      expect(hasKind('mindmap')).toBe(true);
      expect(shapeById('bang')).toBeDefined();
      expect(sr.querySelectorAll('.el.mm-node').length).toBe(25);
      expect(sr.querySelector('.el[data-id="launch"] path')).not.toBeNull();
      expect(sr.querySelector('.el.mm-node tspan[font-weight="700"]')?.textContent).toBe('Faster');
      expect(sr.querySelector('[aria-label="Mindmap: 25 nodes"]')).not.toBeNull();
      sr.host.remove();
    });

    it('a state diagram (T09) loads its kind with its five shapes, and not the shapes beyond them', async () => {
      forgetKinds();
      forgetShapes();
      forgetMediaKit();
      const sr = await show(example('traffic-light.mmdx'));
      expect(hasKind('state')).toBe(true);
      expect(shapeById('sm-circ')).toBeDefined();
      expect(shapeById('bolt')).toBeUndefined();
      expect(sr.querySelectorAll('.el.st-state').length).toBe(4);
      expect(sr.querySelector('.el[data-id="[*]start"] path')).not.toBeNull();
      expect(sr.querySelector('[aria-label="State diagram: 4 states, 8 transitions"]')).not.toBeNull();
      sr.host.remove();
    });

    it('do not load for a flowchart of the 17', async () => {
      forgetShapes();
      const sr = await show('flowchart LR\n  a[(DB)] --> b{Q} --> c([End])\n  d@{ shape: cyl }');
      expect(sr.querySelectorAll('.el[data-kind="node"]').length).toBe(4);
      expect(shapeById('bolt')).toBeUndefined();
      expect(shapeById('collections')).toBeUndefined();
      sr.host.remove();
    });
  });
});

describe('DiagramViewer (kinds loaded)', () => {
  beforeAll(() => Promise.all([loadKind('flowchart'), loadKind('sequence'), loadKind('er')]));


const hosts: HTMLElement[] = [];
const mount = (opts: ConstructorParameters<typeof DiagramViewer>[1]): { host: HTMLElement; v: DiagramViewer } => {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  return { host, v: new DiagramViewer(host, { lazy: false, ...opts }) };
};
afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
});


  it('renders a flowchart into its shadow root and fires mmdx-render', () => {
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    let rendered: unknown = null;
    host.addEventListener('mmdx-render', (e) => (rendered = (e as CustomEvent).detail));
    new DiagramViewer(host, { lazy: false, source: 'flowchart LR\n  a --> b' });
    const sr = host.shadowRoot!;
    expect(sr.querySelectorAll('.el[data-kind="node"]').length).toBe(2);
    expect(sr.querySelectorAll('.el[data-kind="edge"]').length).toBe(1);
    expect(rendered).toMatchObject({ type: 'flowchart' });
    expect(sr.querySelector('.root')!.getAttribute('aria-label')).toBe('Flowchart: 2 nodes, 1 connections');
  });

  it('names the diagram with its accTitle and describes it with its accDescr (T06.8)', () => {
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    new DiagramViewer(host, { lazy: false, source: 'flowchart LR\n  accTitle: Order flow\n  accDescr {\n    From cart\n    to delivery\n  }\n  a --> b' });
    const root = host.shadowRoot!.querySelector('.root')!;
    expect(root.getAttribute('aria-label')).toBe('Order flow');
    expect(root.getAttribute('aria-description')).toBe('From cart\nto delivery');
  });

  it('renders every example without errors', () => {
    for (const f of ['simple-flow.mmdx', 'docker-deploy-sequence.mmdx', 'atom-schema-er.mmdx', 'production-microservices.mmdx']) {
      const { host, v } = mount({ source: example(f) });
      expect(host.shadowRoot!.querySelectorAll('.el').length).toBeGreaterThan(3);
      expect(v.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    }
  });

  it('neutralises markup, handlers and javascript: links', () => {
    const { host } = mount({ source: 'flowchart LR\n  A["<img src=x onerror=alert(1)>"] --> B\n  style A fill:red" onmouseover="alert(2)\n  click B href "javascript:alert(3)"' });
    const html = host.shadowRoot!.innerHTML;
    expect(host.shadowRoot!.querySelector('img')).toBeNull();
    expect(html).not.toContain('onmouseover');
    expect(html).not.toContain('javascript:');
  });

  it('shows the source for unsupported types with fallback="source"', () => {
    const { host } = mount({ source: 'pie title Pets\n  "Dogs" : 386', fallback: 'source' });
    expect(host.shadowRoot!.querySelector('pre')!.textContent).toContain('pie title Pets');
  });

  it('hides layers given through setLayers()', () => {
    const src = 'flowchart LR\n  a --> b\n%%@ layer L1 {"name":"One"}\n%%@ node b {"layer":"L1"}';
    const { host, v } = mount({ source: src });
    expect(host.shadowRoot!.querySelectorAll('.el[data-kind="node"]').length).toBe(2);
    v.setLayers(['default']);
    // re-render is scheduled; force it through the public option path
    v.set({ layers: ['default'] });
    return new Promise<void>((resolve) => setTimeout(() => {
      expect(host.shadowRoot!.querySelectorAll('.el[data-kind="node"]').length).toBe(1);
      resolve();
    }, 50));
  });

  it('setLayers() and the labels repaint; the hover highlight and the animation do not (P20)', async () => {
    const src = 'flowchart LR\n  a -- go --> b\n%%@ layer L1 {"name":"One"}\n%%@ node b {"layer":"L1"}';
    const { host, v } = mount({ source: src });
    const core = (v as unknown as { core: { display: { peek(): object }; setDisplay(d: object): void; on(e: string, f: () => void): () => void } }).core;
    const settle = () => new Promise((r) => setTimeout(r, 30));
    const nodes = () => host.shadowRoot!.querySelectorAll('.el[data-kind="node"]').length;
    // the first paint, and whatever it loaded on the way (a busy machine is slow), are over
    await vi.waitFor(() => expect(host.shadowRoot!.querySelectorAll('.elabel').length).toBe(1));
    await settle();
    let draws = 0;
    core.on('draw', () => draws++);
    v.setLayers(['default']);
    await vi.waitFor(() => expect(nodes()).toBe(1));
    const once = draws;
    expect(once).toBeGreaterThan(0);
    v.setLayers(['default']);
    core.setDisplay({ hoverHighlight: false, animate: false });
    await settle();
    expect(draws).toBe(once);
    v.set({ labels: false });
    // the labels setting repaints with no invalidate() of its own
    await vi.waitFor(() => expect(host.shadowRoot!.querySelectorAll('.elabel').length).toBe(0));
  });

  it('toSvg() returns a standalone document', () => {
    const { v } = mount({ source: 'sequenceDiagram\n  A->>B: hi' });
    const svg = v.toSvg();
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('hi');
  });

  it('cleans up on destroy', () => {
    const { host, v } = mount({ source: 'flowchart LR\n  a --> b' });
    v.destroy();
    expect(host.shadowRoot!.querySelector('.root')).toBeNull();
  });

  it('dedents inline sources', () => {
    expect(dedent('\n    flowchart LR\n      a --> b\n  ')).toBe('flowchart LR\n  a --> b');
  });
});

describe('code view (controls="code")', () => {
  beforeAll(() => loadKind('flowchart'));

  it('shows the Mermaid code without metadata and styles, and toggles back to the diagram', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const source = [
      'flowchart LR',
      '  a[Start]:::hot --> b[End]',
      '  classDef hot fill:#f00',
      '  style b stroke:#00f',
      '%% ---- diagram-studio layout (safe to keep: Mermaid ignores %% comments) ----',
      '%%@ node a {"x":10,"y":10,"w":80,"h":40}',
    ].join('\n');
    new DiagramViewer(host, { lazy: false, source, controls: ['code'], storage: memoryStorage() });
    const sr = host.shadowRoot!;
    // the code view is a panel of the left stack, toggled from the tool dock
    const btn = (): HTMLButtonElement => sr.querySelector<HTMLButtonElement>('.tool-dock .vt-code-view')!;
    const panel = (): HTMLElement | null => sr.querySelector<HTMLElement>('.mmdx-stack .code-panel');
    // the tool dock, the panel stacks and the code view load on demand
    await vi.waitFor(() => expect(btn()).not.toBeNull());
    await vi.waitFor(() => expect(panel()).not.toBeNull());
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    expect(sr.querySelector('.mmdx-stack.open')).toBeNull();
    btn().click();
    expect(sr.querySelector('.mmdx-stack.open')).not.toBeNull();
    const lines = [...panel()!.querySelectorAll('table.code td.txt')].map((td) => td.textContent);
    expect(lines).toEqual(['flowchart LR', '  a[Start] --> b[End]']);
    expect(sr.querySelector('.root')!.getAttribute('role')).toBe('group');
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    btn().click();
    expect(sr.querySelector('.mmdx-stack.open')).toBeNull();
    expect(sr.querySelector('.root')!.getAttribute('role')).toBe('img');
    host.remove();
  });
});

describe('<mmdx-viewer> attributes', () => {
  beforeAll(async () => {
    await loadKind('flowchart');
    defineViewer();
  });

  const element = async (attrs: Record<string, string>): Promise<MmdxViewerElement> => {
    const el = document.createElement('mmdx-viewer');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.storage = memoryStorage();
    el.source = 'flowchart LR\n  a --> b';
    const rendered = new Promise((r) => el.addEventListener('mmdx-render', r, { once: true }));
    document.body.append(el);
    await rendered;
    return el;
  };

  it('a change of one attribute keeps the modules, the pen and the user\'s light / dark choice', async () => {
    const el = await element({ interactive: '', ui: 'auto', controls: 'zoom pen', lazy: 'false' });
    const v = el.instance!;
    await vi.waitFor(() => expect(v.core.moduleScope('pen')).not.toBeNull());
    const pen = v.core.moduleScope('pen');
    v.core.setTool('pen');
    // the diagram follows the chrome to dark (nothing picked)
    const dark = new Promise((r) => el.addEventListener('mmdx-render', r, { once: true }));
    v.core.chooseScheme('dark');
    await dark;
    const renders = vi.fn();
    el.addEventListener('mmdx-render', renders);
    el.setAttribute('label', 'Deploy flow');
    el.setAttribute('wheel', 'always');
    expect(v.core.moduleScope('pen')).toBe(pen);
    expect(v.core.tool.peek()).toBe('pen');
    expect(v.core.scheme.peek()).toBe('dark');
    expect(v.core.root.getAttribute('aria-label')).toBe('Deploy flow');
    await new Promise((r) => setTimeout(r, 200));
    expect(renders).not.toHaveBeenCalled();
    el.remove();
  });

  it('a removed attribute resets its option', async () => {
    const el = await element({ theme: 'default-dark', labels: 'false', lazy: 'false' });
    const v = el.instance!;
    expect(v.core.themes.attr.peek()).toBe('default-dark');
    expect(v.core.display.peek().labels).toBe(false);
    el.removeAttribute('theme');
    el.removeAttribute('labels');
    expect(v.core.themes.attr.peek()).toBeNull();
    expect(v.core.display.peek().labels).toBe(true);
    expect(v.options.theme).toBeUndefined();
    el.remove();
  });

  it('controls changed at runtime re-evaluate the zoom bar (help appears) without reinstalling the rest', async () => {
    const el = await element({ controls: 'fullscreen', lazy: 'false' });
    const v = el.instance!;
    const sr = el.shadowRoot!;
    expect(sr.querySelector('.help-btn')).toBeNull();
    const links = v.core.moduleScope('links');
    el.setAttribute('controls', 'zoom fullscreen');
    expect(sr.querySelector('.help-btn')).not.toBeNull();
    expect(v.core.moduleScope('links')).toBe(links);
    el.setAttribute('controls', 'fullscreen');
    expect(sr.querySelector('.help-btn')).toBeNull();
    el.remove();
  });
});

describe('schemeToggle option', () => {
  const settle = async (host: HTMLElement, sel: string): Promise<void> => {
    for (let i = 0; i < 100 && !host.shadowRoot?.querySelector(sel); i++) await new Promise((r) => setTimeout(r, 10));
  };
  it('with the theme control, the light / dark toggle shows next to the theme menu by default', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    new DiagramViewer(host, { lazy: false, source: 'flowchart LR\n  a --> b', controls: ['theme'], storage: memoryStorage() });
    await settle(host, '.view-params .mmdx-theme-btn');
    expect(host.shadowRoot!.querySelector('.view-params .mmdx-theme-btn')).not.toBeNull();
    expect(host.shadowRoot!.querySelector('.view-params .vp-mode')).not.toBeNull();
    host.remove();
  });
  it('schemeToggle: false keeps the theme menu and drops the toggle (the host sets ui)', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    new DiagramViewer(host, { lazy: false, source: 'flowchart LR\n  a --> b', controls: ['theme', 'export'], schemeToggle: false, ui: 'dark', storage: memoryStorage() });
    await settle(host, '.view-params .mmdx-theme-btn');
    expect(host.shadowRoot!.querySelector('.view-params .mmdx-theme-btn')).not.toBeNull();
    expect(host.shadowRoot!.querySelector('.view-params .vp-mode')).toBeNull();
    host.remove();
  });
});

describe('host full screen', () => {
  beforeAll(async () => {
    await loadKind('flowchart');
    defineViewer();
  });
  const handler = (on = { available: true }): HostFullscreen & { enter: ReturnType<typeof vi.fn>; exit: ReturnType<typeof vi.fn>; shown: boolean } => {
    const h = {
      shown: false,
      available: () => on.available,
      enter: vi.fn(async () => void (h.shown = true)),
      exit: vi.fn(async () => void (h.shown = false)),
      active: () => h.shown,
    };
    return h;
  };
  const mountFs = (opts: ConstructorParameters<typeof DiagramViewer>[1] = {}): { host: HTMLElement; v: DiagramViewer; btn: () => HTMLButtonElement | null } => {
    const host = document.createElement('div');
    document.body.append(host);
    const v = new DiagramViewer(host, { lazy: false, source: 'flowchart LR\n  a --> b', storage: memoryStorage(), ...opts });
    return { host, v, btn: () => host.shadowRoot!.querySelector<HTMLButtonElement>('.fs-btn') };
  };
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  it('without the browser\'s full screen (jsdom) and without a host handler, the button is hidden', () => {
    const { host, btn } = mountFs();
    expect(btn()).not.toBeNull();
    expect(btn()!.hidden).toBe(true);
    host.remove();
  });

  it('a host handler shows the button, which enters and leaves the host\'s full screen', async () => {
    const fs = handler();
    const { host, btn } = mountFs({ fullscreen: fs });
    const requests: boolean[] = [];
    const changes: boolean[] = [];
    host.addEventListener('mmdx-fullscreen-request', (e) => requests.push((e as CustomEvent<{ enter: boolean }>).detail.enter));
    host.addEventListener('mmdx-fullscreen', (e) => changes.push((e as CustomEvent<{ active: boolean }>).detail.active));
    expect(btn()!.hidden).toBe(false);
    btn()!.click();
    expect(fs.enter).toHaveBeenCalledTimes(1);
    await tick();
    expect(host.hasAttribute('data-fullscreen')).toBe(true);
    expect(btn()!.classList.contains('on')).toBe(true);
    btn()!.click();
    expect(fs.exit).toHaveBeenCalledTimes(1);
    await tick();
    expect(host.hasAttribute('data-fullscreen')).toBe(false);
    expect(requests).toEqual([true, false]);
    expect(changes).toEqual([true, false]);
    host.remove();
  });

  it('a cancelled mmdx-fullscreen-request leaves full screen to the host page', async () => {
    const fs = handler();
    const { host, btn } = mountFs({ fullscreen: fs });
    host.addEventListener('mmdx-fullscreen-request', (e) => e.preventDefault());
    btn()!.click();
    await tick();
    expect(fs.enter).not.toHaveBeenCalled();
    expect(host.hasAttribute('data-fullscreen')).toBe(false);
    host.remove();
  });

  it('a handler set later shows the button; an unavailable one keeps it hidden', () => {
    const { host, v, btn } = mountFs();
    expect(btn()!.hidden).toBe(true);
    v.set({ fullscreen: handler({ available: false }) });
    expect(btn()!.hidden).toBe(true);
    v.set({ fullscreen: handler() });
    expect(btn()!.hidden).toBe(false);
    v.set({ fullscreen: undefined });
    expect(btn()!.hidden).toBe(true);
    host.remove();
  });

  it('a host that left full screen by itself is noticed on resize (active())', async () => {
    const fs = handler();
    const { host, btn } = mountFs({ fullscreen: fs });
    btn()!.click();
    await tick();
    expect(host.hasAttribute('data-fullscreen')).toBe(true);
    fs.shown = false;
    window.dispatchEvent(new Event('resize'));
    expect(host.hasAttribute('data-fullscreen')).toBe(false);
    // the next click enters again
    btn()!.click();
    expect(fs.enter).toHaveBeenCalledTimes(2);
    host.remove();
  });

  it('a rejected enter() shows a toast and keeps the state', async () => {
    const fs = handler();
    fs.enter.mockImplementation(() => Promise.reject(new Error('no')));
    const { host, btn } = mountFs({ fullscreen: fs });
    btn()!.click();
    await tick();
    await tick();
    expect(host.hasAttribute('data-fullscreen')).toBe(false);
    expect(host.shadowRoot!.textContent).toContain('Full screen is not available here');
    host.remove();
  });

  it('the element takes the handler as the fullscreen property, and setControls() changes the controls', async () => {
    const el = document.createElement('mmdx-viewer');
    el.storage = memoryStorage();
    el.source = 'flowchart LR\n  a --> b';
    el.setAttribute('lazy', 'false');
    el.fullscreen = handler();
    const rendered = new Promise((r) => el.addEventListener('mmdx-render', r, { once: true }));
    document.body.append(el);
    await rendered;
    const sr = el.shadowRoot!;
    expect(sr.querySelector<HTMLButtonElement>('.fs-btn')!.hidden).toBe(false);
    el.setControls(['zoom']);
    expect(el.instance!.options.controls).toEqual(['zoom']);
    expect(sr.querySelector('.fs-btn')).toBeNull();
    el.setControls(['zoom', 'fullscreen']);
    expect(sr.querySelector<HTMLButtonElement>('.fs-btn')!.hidden).toBe(false);
    el.remove();
  });
});

describe('inline sources round-trip (B17)', () => {
  it('scriptSafe breaks </script, <script and <!--; the viewer and the editor read the text back as written', async () => {
    const { scriptSafe, readInlineSource } = await import('../../src/elements/base.js');
    const src = 'flowchart LR\n  a["</script> <!--<script> x"] --> b';
    const safe = scriptSafe(src);
    expect(safe).not.toMatch(/<\/script|<script|<!--/i);
    const host = document.createElement('div');
    host.innerHTML = `<script type="text/mermaid">\n    ${safe.split('\n').join('\n    ')}\n  </script>`;
    expect(readInlineSource(host)).toBe(src);
  });

  it('the editor element opens an inline source as the viewer does', async () => {
    const { defineEditor } = await import('../../src/elements/editor.js');
    defineEditor();
    const el = document.createElement('mmdx-editor');
    el.innerHTML = '<script type="text/mermaid">\n    flowchart LR\n      a["<\\/script>"] --> b\n  </script>';
    document.body.append(el);
    expect((el as unknown as { getSource(): string }).getSource()).toContain('flowchart LR\n  a["</script>"] --> b');
    el.remove();
  });
});

describe('viewer state sync (B19, B20)', () => {
  const mount = (opts: ConstructorParameters<typeof DiagramViewer>[1]): { host: HTMLElement; v: DiagramViewer } => {
    const host = document.createElement('div');
    document.body.append(host);
    return { host, v: new DiagramViewer(host, { lazy: false, ...opts }) };
  };
  it('a code panel restored from storage makes the root a group and pinned', async () => {
    const storage = memoryStorage();
    storage.set('viewer.panels', { 'code-view': true });
    const { host } = mount({ source: 'flowchart LR\n  a --> b', controls: ['code'], storage });
    const root = (): Element => host.shadowRoot!.querySelector('.root')!;
    await vi.waitFor(() => expect(root().getAttribute('role')).toBe('group'));
    expect(root().classList.contains('pinned')).toBe(true);
  });

  it('removing the label gives the diagram\'s own name back; interactive follows at run time', async () => {
    const { host, v } = mount({ source: 'flowchart LR\n  accTitle: The flow\n  a --> b', label: 'Host label' });
    const root = (): Element => host.shadowRoot!.querySelector('.root')!;
    await vi.waitFor(() => expect(root().getAttribute('aria-label')).toBe('Host label'));
    v.set({ label: undefined });
    expect(root().getAttribute('aria-label')).toBe('The flow');
    expect(root().classList.contains('can-pan')).toBe(true);
    v.set({ interactive: false });
    expect(root().classList.contains('can-pan')).toBe(false);
  });

  it('the view event fires on a pan of the viewer (B45)', async () => {
    const { host, v } = mount({ source: 'flowchart LR\n  a --> b' });
    await vi.waitFor(() => expect(host.shadowRoot!.querySelector('.el[data-kind="node"]')).not.toBeNull());
    let n = 0;
    v.core.on('view', () => n++);
    v.core.canvas.viewport!.panBy(10, 0);
    expect(n).toBeGreaterThan(0);
  });
});

describe('theme menu (B44)', () => {
  it('lists the themes of the host\'s theme source before any is registered', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const themeSource = { list: async () => [{ id: 'brand-x', name: 'Brand X', appearance: 'light' as const, extends: null }], get: async () => ({ id: 'brand-x', name: 'Brand X' }) };
    const v = new DiagramViewer(host, { lazy: false, source: 'flowchart LR\n  a --> b', controls: ['theme'], themeSource, storage: memoryStorage() });
    const sr = host.shadowRoot!;
    await vi.waitFor(() => expect(sr.querySelector('.mmdx-theme-btn')).not.toBeNull());
    await new Promise((r) => setTimeout(r, 20));
    sr.querySelector<HTMLButtonElement>('.mmdx-theme-btn')!.click();
    await vi.waitFor(() => expect([...sr.querySelectorAll('[role=menu] [role=menuitemradio], [role=menu] [role=menuitem]')].map((x) => x.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Brand X')])));
    v.destroy();
  });
});

