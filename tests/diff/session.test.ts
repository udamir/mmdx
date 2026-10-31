// DiffSession (component architecture §8.1): the model behind the diff scene and the diff modules, without a DOM —
// loading a pair or a history, the filters, the selection, the view, History mode and the events it emits.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { StaticVersion } from '../../src/adapters/history.js';
import { createContext } from '../../src/core/context.js';
import { changeKey } from '../../src/core/diff/merge.js';
import { DiffSession, type DiffSessionOptions } from '../../src/diff/session.js';

const sample = (name: string, side: string): string => readFileSync(`apps/studio-site/diff-samples/${name}.${side}.mmd`, 'utf8');
const history = (id: string): StaticVersion[] => JSON.parse(readFileSync(`examples/history/${id}.json`, 'utf8')).versions;

function session(o: Partial<DiffSessionOptions> = {}): { s: DiffSession; events: { type: string; detail: unknown }[] } {
  const events: { type: string; detail: unknown }[] = [];
  const s = new DiffSession({
    ctx: createContext(),
    t: (k, p) => (p ? `${k} ${JSON.stringify(p)}` : k),
    emit: (type, detail) => {
      events.push({ type, detail });
      return true;
    },
    renderOptions: () => ({ theme: 'baseline' }),
    scheme: () => 'light',
    name: () => 'arch',
    ...o,
  });
  return { s, events };
}

const types = (events: { type: string }[]): string[] => events.map((e) => e.type);

describe('DiffSession', () => {
  it('loads two sources as a two-version history, renders the pair with the kinds it loaded and emits compare / render', async () => {
    const { s, events } = session();
    await s.load({ before: sample('architecture', 'before'), after: sample('architecture', 'after') });
    expect(s.hasHistory.peek()).toBe(false);
    expect(s.versions.peek()).toHaveLength(2);
    expect(s.pair).toEqual({ base: s.versions.peek()[1]!.id, head: s.versions.peek()[0]!.id, viewing: null });
    const D = s.rendered.peek()!;
    expect(D.after.model.type).toBe('flowchart');
    expect(s.getDiff()!.counts.added).toBeGreaterThan(0);
    expect(types(events)).toEqual(['mmdx-compare', 'mmdx-render']);
    expect((events[0]!.detail as { counts: unknown }).counts).toEqual(s.getDiff()!.counts);
    s.destroy();
  });

  it('nothing to compare without both sources', async () => {
    const { s } = session();
    await s.load({ before: null, after: sample('small', 'after') });
    expect(s.rendered.peek()).toBeNull();
    expect(s.status.peek()).toEqual({ kind: 'empty', text: 'diff.empty.nothing' });
  });

  it('a failed load is a status with Retry and an mmdx-error', async () => {
    const { s, events } = session();
    await s.load({ before: Promise.reject(new Error('HTTP 404')), after: 'flowchart TD\n  a --> b' });
    expect(s.status.peek()).toMatchObject({ kind: 'error', retry: true });
    expect(s.status.peek()!.text).toContain('HTTP 404');
    expect(types(events)).toEqual(['mmdx-error']);
  });

  it('filters: hide added items, ignore style; emits mmdx-filters and renders again', async () => {
    const { s, events } = session();
    await s.load({ before: sample('architecture', 'before'), after: sample('architecture', 'after') });
    const all = s.rendered.peek()!.changes.length;
    s.setFilters(['removed', 'content', 'layout'], false);
    expect(s.filters).toEqual(['removed', 'content', 'layout']);
    expect(s.dim.peek()).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'mmdx-filters', detail: { filters: ['removed', 'content', 'layout'], dim: false } });
    await s.refresh();
    const D = s.rendered.peek()!;
    expect(D.diff.counts.added).toBe(0);
    expect(D.changes.length).toBeLessThan(all);
    expect(D.changes.some((c) => c.facets.includes('style'))).toBe(false);
    s.toggleFilter('added');
    expect(s.filters).toContain('added');
    // host options set the filters without an event
    const n = events.length;
    s.applyFilters(undefined);
    expect(s.filters).toEqual(['added', 'removed', 'content', 'layout', 'style']);
    expect(events.length).toBe(n);
  });

  it('selection: select, next and prev step through the changes; unknown keys clear it; mmdx-select each time', async () => {
    const { s, events } = session();
    await s.load({ before: sample('architecture', 'before'), after: sample('architecture', 'after') });
    const keys = s.rendered.peek()!.changes.map(changeKey);
    s.next();
    expect(s.selected.peek()).toBe(keys[0]);
    s.next();
    expect(s.selected.peek()).toBe(keys[1]);
    s.prev();
    s.prev();
    expect(s.selected.peek()).toBe(keys.at(-1));
    s.select('node:no-such-node');
    expect(s.selected.peek()).toBeNull();
    const sel = events.filter((e) => e.type === 'mmdx-select');
    expect(sel).toHaveLength(5);
    expect(sel[0]!.detail).toMatchObject({ key: keys[0] });
    expect(sel.at(-1)!.detail).toEqual({ key: null, change: null });
  });

  it('view: setView emits mmdx-view; ← → step between Before, Merged and After, not side by side', async () => {
    const { s, events } = session();
    await s.load({ before: sample('schema', 'before'), after: sample('schema', 'after') });
    expect(s.view.peek()).toBe('merged');
    expect(s.stepView(1)).toBe(true);
    expect(s.view.peek()).toBe('after');
    s.setView('side');
    expect(s.stepView(-1)).toBe(false);
    s.setView('side');
    expect(events.filter((e) => e.type === 'mmdx-view').map((e) => (e.detail as { view: string }).view)).toEqual(['after', 'side']);
  });

  it('history: the newest pair, picks, History mode with the version panel, and the counts of each version', async () => {
    const versions = history('production-microservices');
    const { s, events } = session();
    await s.load({ history: versions });
    expect(s.hasHistory.peek()).toBe(true);
    expect(s.pair).toEqual({ base: versions[1]!.id, head: versions[0]!.id, viewing: null });
    // one version cannot be both sides
    s.setPair(versions[0]!.id, versions[0]!.id);
    expect(s.pair.base).toBe(versions[1]!.id);
    s.setPair(versions[3]!.id, versions[0]!.id);
    expect(events.at(-1)).toEqual({ type: 'mmdx-version', detail: { base: versions[3]!.id, head: versions[0]!.id } });
    // History mode needs the version panel shown
    s.setMode('history');
    expect(s.viewOnly.peek()).toBe(false);
    s.setVersionsShown(true);
    expect(s.viewOnly.peek()).toBe(true);
    s.viewVersion(versions[2]!.id);
    await s.refresh();
    expect(s.pair.viewing).toBe(versions[2]!.id);
    expect(s.plain.peek()!.model.type).toBe('flowchart');
    expect(s.toSvg()).toContain('<svg');
    // per-version counts arrive lazily
    await new Promise((r) => setTimeout(r, 400));
    expect(s.counts(versions.at(-1)!.id)).toBeNull();
    expect(s.counts(versions[0]!.id)).toMatchObject({ added: expect.any(Number) });
    expect(s.countsRev.peek()).toBeGreaterThan(0);
    s.destroy();
  });

  it('exports go to the host first (mmdx-export, cancelable)', async () => {
    const got: unknown[] = [];
    const { s } = session({
      emit: (type, detail) => {
        if (type === 'mmdx-export') got.push(detail);
        return type !== 'mmdx-export';
      },
    });
    await s.load({ before: sample('architecture', 'before'), after: sample('architecture', 'after') });
    await s.exportAs('json');
    await s.exportAs('mmdx', { version: 'before' });
    expect(got).toHaveLength(2);
    expect(got[0]).toMatchObject({ kind: 'json', name: expect.stringMatching(/^arch-\w+\.\.\w+\.json$/) });
    expect(got[1]).toMatchObject({ kind: 'mmdx', data: sample('architecture', 'before') });
  });
});
