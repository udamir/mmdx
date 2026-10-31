// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TRANSITION_MS } from '../../src/dom/motion.js';
import { DiagramDiff, defineDiff } from '../../src/elements/diff.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { StaticVersion } from '../../src/adapters/history.js';

const sample = (name: string, side: string): string => readFileSync(`apps/studio-site/diff-samples/${name}.${side}.mmd`, 'utf8');
const history = (id: string): StaticVersion[] => JSON.parse(readFileSync(`examples/history/${id}.json`, 'utf8')).versions;

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe(): void {} disconnect(): void {} };
});

const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
});

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 30));

/** Mounts a diff and waits for its first comparison. */
async function mount(opts: ConstructorParameters<typeof DiagramDiff>[1]): Promise<{ host: HTMLElement; d: DiagramDiff; root: ShadowRoot; events: CustomEvent[] }> {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const events: CustomEvent[] = [];
  for (const t of ['mmdx-compare', 'mmdx-select', 'mmdx-view', 'mmdx-filters', 'mmdx-version', 'mmdx-export', 'mmdx-render'])
    host.addEventListener(t, (e) => events.push(e as CustomEvent));
  const ready = new Promise((r) => host.addEventListener('mmdx-render', r, { once: true }));
  const d = new DiagramDiff(host, { storage: memoryStorage(), ...opts });
  await ready;
  // the side panels load on demand
  await import('../../src/diff/modules/panels.js');
  await settle();
  return { host, d, root: host.shadowRoot!, events };
}

describe('DiagramDiff: two versions', () => {
  it('compares two sources: merged view, change list, counts and an accessible label', async () => {
    const { d, root, events } = await mount({ beforeSource: sample('architecture', 'before'), afterSource: sample('architecture', 'after') });
    const diff = d.getDiff()!;
    expect(diff.counts.added).toBeGreaterThan(0);
    const compare = events.find((e) => e.type === 'mmdx-compare')!;
    expect(compare.detail.counts).toEqual(diff.counts);
    expect(root.querySelectorAll('.change').length).toBe(diff.counts.added + diff.counts.removed + diff.counts.changed);
    // the merged picture: highlights per change, removed items kept, word marks as styled runs
    expect(root.querySelectorAll('.dx-hl').length).toBeGreaterThan(0);
    expect(root.querySelector('.el.dx-gone')).not.toBeNull();
    expect(root.querySelector('tspan.dx-ins')).not.toBeNull();
    expect(root.querySelector('.root')!.getAttribute('aria-label')).toMatch(/Diagram diff: \d+ added, \d+ removed, \d+ changed/);
    // no History tool without a history
    expect(root.querySelector('.vt-history:not([hidden])')).toBeNull();
  });

  it('filters: hiding added items and ignoring style updates the list and the counts', async () => {
    const { d, root, events } = await mount({ beforeSource: sample('architecture', 'before'), afterSource: sample('architecture', 'after') });
    const before = root.querySelectorAll('.change').length;
    root.querySelector<HTMLButtonElement>('.flt-added')!.click();
    await settle();
    expect(d.filters).not.toContain('added');
    expect(d.getDiff()!.counts.added).toBe(0);
    expect(root.querySelectorAll('.change.st-added').length).toBe(0);
    d.setFilters(['added', 'removed', 'content', 'layout']);
    await settle();
    expect(d.getDiff()!.items.some((c) => c.facets.includes('style'))).toBe(false);
    expect(root.querySelectorAll('.change').length).toBeLessThan(before);
    expect(events.some((e) => e.type === 'mmdx-filters')).toBe(true);
  });

  it('the bar shows only the kinds of change the comparison has', async () => {
    const shown = (root: ShadowRoot): string[] => [...root.querySelectorAll<HTMLElement>('.dbar .flt')].map((b) => b.dataset['f']!);
    const visibleSeps = (root: ShadowRoot): number => [...root.querySelectorAll<HTMLElement>('.dbar > .mmdx-sep')].filter((x) => !x.hidden).length;
    const a = await mount({ beforeSource: 'flowchart LR\n  a[One] --> b', afterSource: 'flowchart LR\n  a[Two] --> b' });
    expect(shown(a.root)).toEqual(['flt-content']);
    expect(a.root.querySelector('.dbar .mmdx-dim')).not.toBeNull();
    // switching it off keeps it (the counts are of the unfiltered diff)
    a.root.querySelector<HTMLButtonElement>('.dbar .flt-content')!.click();
    await vi.waitFor(() => expect(a.root.querySelector('.dbar .flt-content.off')).not.toBeNull());
    expect(shown(a.root)).toEqual(['flt-content']);
    const same = await mount({ beforeSource: 'flowchart LR\n  a --> b', afterSource: 'flowchart LR\n  a --> b' });
    expect(shown(same.root)).toEqual([]);
    expect(same.root.querySelector('.dbar .mmdx-dim')).toBeNull();
    expect(visibleSeps(same.root)).toBe(1);
  });

  it('views: one canvas for before / merged / after, two linked canvases side by side', async () => {
    const { d, root, events } = await mount({ beforeSource: sample('schema', 'before'), afterSource: sample('schema', 'after') });
    expect(root.querySelectorAll('.pane svg').length).toBe(1);
    // the views are icon buttons named by their view, the shown one pressed
    const views = [...root.querySelectorAll<HTMLButtonElement>('.dbar button.view')];
    expect(views.map((b) => b.getAttribute('aria-label'))).toEqual(['Before', 'Merged', 'After', 'Side by side']);
    expect(views.every((b) => b.querySelector('svg.dx-view-icon') && !b.textContent)).toBe(true);
    expect(views[1]!.getAttribute('aria-pressed')).toBe('true');
    views[3]!.click();
    expect(views[3]!.getAttribute('aria-pressed')).toBe('true');
    d.setView('side');
    expect(root.querySelectorAll('.pane svg').length).toBe(2);
    expect(root.querySelector('.pane.before .pane-title')).not.toBeNull();
    d.setView('before');
    expect(root.querySelectorAll('.pane svg').length).toBe(1);
    expect(events.filter((e) => e.type === 'mmdx-view').map((e) => e.detail.view)).toEqual(['side', 'before']);
  });

  it('selection: J / K step through the changes, the code panel narrows to the selected item', async () => {
    const { d, root, events } = await mount({ beforeSource: sample('architecture', 'before'), afterSource: sample('architecture', 'after'), panels: ['code', 'changes'] });
    d.next();
    const sel = events.filter((e) => e.type === 'mmdx-select').pop()!;
    expect(sel.detail.change).not.toBeNull();
    expect(root.querySelector('.change[aria-selected=true]')!.getAttribute('data-key')).toBe(sel.detail.key);
    expect(root.querySelector('.code-filter')!.textContent).toContain(sel.detail.change.label);
    expect(root.querySelector(`.dx-hl.dx-selected[data-key="${sel.detail.key}"]`)).not.toBeNull();
    d.select(null);
    expect(root.querySelector('.code-filter')).toBeNull();
  });

  it('keyboard shortcuts act while focus is inside the component', async () => {
    const { d, root } = await mount({ beforeSource: sample('architecture', 'before'), afterSource: sample('architecture', 'after') });
    const key = (k: string): void => void root.querySelector('.root')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));
    key('4');
    expect(root.querySelectorAll('.pane svg').length).toBe(2);
    key('c');
    expect(root.querySelector('.mmdx-stack[data-side=left].open .mmdx-panel.code:not([hidden])')).not.toBeNull();
    key('j');
    expect(root.querySelector('.change[aria-selected=true]')).not.toBeNull();
    key('Escape');
    expect(root.querySelector('.change[aria-selected=true]')).toBeNull();
    void d;
  });

  it('exports reports, patches and images through the cancelable mmdx-export event', async () => {
    const { d, host } = await mount({ beforeSource: sample('architecture', 'before'), afterSource: sample('architecture', 'after'), name: 'arch' });
    const got: { kind: string; name: string; data: unknown }[] = [];
    host.addEventListener('mmdx-export', (e) => {
      e.preventDefault();
      got.push((e as CustomEvent).detail);
    });
    await d.exportAs('md');
    await d.exportAs('diff');
    await d.exportAs('svg');
    await d.exportAs('mmdx', { version: 'before' });
    expect(got.map((g) => g.kind)).toEqual(['md', 'diff', 'svg', 'mmdx']);
    expect(got[0]!.name).toMatch(/^arch-\w+\.\.\w+\.md$/);
    expect(String(got[0]!.data)).toContain('### Diagram changes: arch');
    expect(String(got[1]!.data)).toMatch(/^--- a\/arch\.mmdx\n\+\+\+ b\/arch\.mmdx\n@@/);
    expect(String(got[2]!.data)).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(got[3]!.data).toBe(sample('architecture', 'before'));
  });
});

describe('DiagramDiff: the kernel chrome', () => {
  const wait = async (f: () => unknown, ms = 3000): Promise<void> => {
    const t0 = Date.now();
    while (!f()) {
      if (Date.now() - t0 > ms) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  it('has the theme menu and the light / dark toggle: the scheme is the chrome only, a pick re-renders both versions', async () => {
    const { d, host, root } = await mount({ beforeSource: sample('architecture', 'before'), afterSource: sample('architecture', 'after'), ui: 'light' });
    await wait(() => root.querySelector('.view-params .mmdx-theme-btn'));
    const before = d.session.rendered.peek()!;
    root.querySelector<HTMLButtonElement>('.view-params .vp-mode [data-ui=dark]')!.click();
    expect(host.getAttribute('data-ui')).toBe('dark');
    // the Export menu of the view params carries the diff's formats
    expect(d.core.exportFormats.peek().map((f) => f.id)).toEqual(['png', 'svg', 'mmdx-before', 'mmdx-after', 'mmd', 'patch', 'md', 'json']);
    const rendered = new Promise((r) => host.addEventListener('mmdx-render', r, { once: true }));
    d.core.themes.choose('default-dark');
    await rendered;
    const after = d.session.rendered.peek()!;
    expect(after).not.toBe(before);
    expect(after.themeId).toBe('default-dark');
    expect(after.before.themeId).toBe('default-dark');
  });

  it('has view settings: the dock toggle opens the card, connector labels off re-renders both versions', async () => {
    const { d, host, root } = await mount({ beforeSource: sample('architecture', 'before'), afterSource: sample('architecture', 'after') });
    await wait(() => root.querySelector('.vt-view-settings'));
    root.querySelector<HTMLButtonElement>('.vt-view-settings')!.click();
    expect(root.querySelector('.mmdx-stack[data-side=right] .mmdx-panel.view-settings:not([hidden])')).not.toBeNull();
    // L stays the change list's key in the diff
    expect(root.querySelector('.vt-view-settings')!.hasAttribute('aria-keyshortcuts')).toBe(false);
    const labels = (): number => d.core.canvas.svg.querySelectorAll('.el.elabel').length;
    expect(labels()).toBeGreaterThan(0);
    const rendered = new Promise((r) => host.addEventListener('mmdx-render', r, { once: true }));
    root.querySelector<HTMLButtonElement>('.view-settings [data-f=opt-labels]')!.click();
    await rendered;
    expect(d.core.display.peek().labels).toBe(false);
    expect(labels()).toBe(0);
  });
});

describe('DiagramDiff: history', () => {
  it('compares the newest version with the one before it; the timeline moves the nearer end and swaps the pair', async () => {
    const versions = history('production-microservices');
    const { d, root, events } = await mount({ history: versions, panels: ['history', 'changes'] });
    expect(d.pair).toEqual({ base: versions[1]!.id, head: versions[0]!.id, viewing: null });
    const rows = root.querySelectorAll('.version');
    expect(rows.length).toBe(6);
    expect(rows[0]!.classList.contains('after')).toBe(true);
    expect(rows[1]!.classList.contains('before')).toBe(true);
    expect([...root.querySelectorAll('.version .vnode')].map((n) => n.textContent)).toEqual(['A', 'B', '', '', '', '']);
    // a dot below the range moves its bottom end (Before)
    rows[4]!.querySelector<HTMLButtonElement>('.vnode')!.click();
    await settle();
    expect(d.pair.base).toBe(versions[4]!.id);
    expect(events.filter((e) => e.type === 'mmdx-version').pop()!.detail).toEqual({ base: versions[4]!.id, head: versions[0]!.id });
    // After's own dot swaps the pair
    root.querySelector<HTMLButtonElement>('.version .vnode.after')!.click();
    await settle();
    expect(d.pair).toMatchObject({ base: versions[0]!.id, head: versions[4]!.id });
  });

  it('History and Code stack on the left; the change list toggles from the bottom bar; all three can be open', async () => {
    const versions = history('production-microservices');
    const { root } = await mount({ history: versions, panels: ['history', 'code', 'changes'] });
    const shown = (sel: string): boolean => !root.querySelector<HTMLElement>(sel)!.hidden;
    expect(shown('.mmdx-panel.history') && shown('.mmdx-panel.code')).toBe(true);
    // one stack on the left, History above Code with a splitter between them
    expect(root.querySelector('.mmdx-stack[data-side=left] > .mmdx-split:not([hidden])')).not.toBeNull();
    expect(root.querySelector('.mmdx-stack[data-side=right].open')).not.toBeNull();
    // the code panel's own close button leaves History open
    root.querySelector<HTMLButtonElement>('.mmdx-panel.code .collapse-btn')!.click();
    expect(shown('.mmdx-panel.code')).toBe(false);
    expect(shown('.mmdx-panel.history')).toBe(true);
    // the change list from the bottom bar
    const toggle = root.querySelector<HTMLButtonElement>('.dbar .changes-btn')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    expect(root.querySelector('.mmdx-stack[data-side=right].open')).toBeNull();
    expect(root.querySelector('.dbar .changes-btn')!.getAttribute('aria-pressed')).toBe('false');
    root.querySelector<HTMLButtonElement>('.dbar .changes-btn')!.click();
    expect(root.querySelector('.mmdx-stack[data-side=right].open')).not.toBeNull();
  });

  it('History mode shows one version as it is, without diff controls', async () => {
    const versions = history('docker-deploy-sequence');
    const { d, root } = await mount({ history: versions, panels: ['history'] });
    d.viewVersion(versions[3]!.id);
    await settle();
    // the comparison's highlights fade out while the picture animates to the version
    await new Promise((r) => setTimeout(r, TRANSITION_MS + 200));
    expect(d.pair.viewing).toBe(versions[3]!.id);
    expect(root.querySelector('.dbar')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.dx-hl')).toBeNull();
    expect(root.querySelector('.pane-title b')!.textContent).toBe(versions[3]!.id);
    expect(root.querySelector('.version.viewing .vid')!.textContent).toBe(versions[3]!.id);
  });

  it('computes per-version change counts lazily', async () => {
    const versions = history('atom-schema-er');
    const { root } = await mount({ history: versions, panels: ['history'] });
    await new Promise((r) => setTimeout(r, 600));
    const stats = [...root.querySelectorAll('.version')].map((v) => v.querySelector('.vstats, .vcount')!.textContent);
    expect(stats.at(-1)).toBe('initial');
    expect(stats.slice(0, -1).every((s) => /[+−~]\d/.test(s ?? ''))).toBe(true);
  });
});

describe('<mmdx-diff>', () => {
  it('reads attributes and properties', async () => {
    defineDiff();
    const el = document.createElement('mmdx-diff');
    el.setAttribute('view', 'side');
    el.setAttribute('filters', 'added removed content');
    el.beforeSource = sample('schema', 'before');
    el.afterSource = sample('schema', 'after');
    const ready = new Promise((r) => el.addEventListener('mmdx-render', r, { once: true }));
    document.body.append(el);
    hosts.push(el);
    await ready;
    expect(el.shadowRoot!.querySelectorAll('.pane svg').length).toBe(2);
    expect(el.instance!.filters).toEqual(['added', 'removed', 'content']);
    expect(el.getDiff()!.counts.layout).toBe(0);
    el.setAttribute('view', 'merged');
    expect(el.shadowRoot!.querySelectorAll('.pane svg').length).toBe(1);
  });
});
