// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
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
  return { host, d, root: host.shadowRoot!, events };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 30));

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
    expect(root.querySelector('[data-tip^="History"]')).toBeNull();
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

  it('views: one canvas for before / merged / after, two linked canvases side by side', async () => {
    const { d, root, events } = await mount({ beforeSource: sample('schema', 'before'), afterSource: sample('schema', 'after') });
    expect(root.querySelectorAll('.pane svg').length).toBe(1);
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
    expect(root.querySelector('.pane-side.left.open')).not.toBeNull();
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

describe('DiagramDiff: history', () => {
  it('compares the newest version with the one before it, and keeps one version from being both sides', async () => {
    const versions = history('production-microservices');
    const { d, root, events } = await mount({ history: versions, panels: ['history', 'changes'] });
    expect(d.pair).toEqual({ base: versions[1]!.id, head: versions[0]!.id, viewing: null });
    const rows = root.querySelectorAll('.version');
    expect(rows.length).toBe(6);
    expect(rows[0]!.classList.contains('after')).toBe(true);
    expect(rows[1]!.classList.contains('before')).toBe(true);
    // the After version's Before button is disabled
    expect(rows[0]!.querySelector<HTMLButtonElement>('.pick-before')!.disabled).toBe(true);
    // pick another base
    rows[4]!.querySelector<HTMLButtonElement>('.pick-before')!.click();
    await settle();
    expect(d.pair.base).toBe(versions[4]!.id);
    expect(events.filter((e) => e.type === 'mmdx-version').pop()!.detail).toEqual({ base: versions[4]!.id, head: versions[0]!.id });
  });

  it('History mode shows one version as it is, without diff controls', async () => {
    const versions = history('docker-deploy-sequence');
    const { d, root } = await mount({ history: versions, panels: ['history'] });
    d.viewVersion(versions[3]!.id);
    await settle();
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
