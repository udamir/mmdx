// DiffSession (component architecture §8.1): the model behind the diff scene and the diff modules, without a DOM —
// loading a pair or a history, the filters, the selection, the view, History mode and the events it emits.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { HistoryAdapter, StaticVersion } from '../../src/adapters/history.js';
import { createContext } from '../../src/core/context.js';
import { changeKey } from '../../src/core/diff/merge.js';
import type { FlowGeometry } from '../../src/core/render/types.js';
import { registerExtendedShapes } from '../../src/core/shapes/extended.js';
import { forgetShapes, shapeById } from '../../src/core/shapes/registry.js';
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

  it('loads the shapes beyond the 17 before it renders a version that draws one (T02.9)', async () => {
    forgetShapes();
    try {
      const { s } = session();
      await s.load({ before: 'flowchart LR\n  A --> B', after: 'flowchart LR\n  A@{ shape: bolt } --> B' });
      expect(shapeById('bolt')).toBeDefined();
      expect((s.rendered.peek()!.after.result.geom as FlowGeometry).nodes.get('A')?.shape).toBe('bolt');
      s.destroy();
    } finally {
      registerExtendedShapes();
    }
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

/** A promise resolved or rejected from outside. */
function deferred<T>(): { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void } {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
}

/** A history adapter over versions, `size` per page; `gate(id)` can hold a version's source back. */
function paged(list: readonly StaticVersion[], size = 2, o: { gate?: (id: string) => Promise<void> | undefined; failList?: () => boolean } = {}): HistoryAdapter & { notify(): void } {
  let cb: (() => void) | null = null;
  return {
    async list(cursor) {
      if (o.failList?.()) throw new Error('HTTP 503');
      const from = cursor ? Number(cursor) : 0;
      const versions = list.slice(from, from + size).map(({ source: _s, ...v }) => v);
      return from + size < list.length ? { versions, next: String(from + size) } : { versions };
    },
    async load(id) {
      await o.gate?.(id);
      return list.find((v) => v.id === id)!.source;
    },
    subscribe(f) {
      cb = f;
      return () => (cb = null);
    },
    notify: () => cb?.(),
  };
}

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => unknown): Promise<void> => {
  for (let i = 0; i < 200 && !f(); i++) await tick(10);
  if (!f()) throw new Error('timed out');
};

describe('DiffSession: compare and History mode', () => {
  it('setPair leaves History mode: the pair is rendered, not the viewed version (mmdx-mode)', async () => {
    const versions = history('production-microservices');
    const { s, events } = session();
    await s.load({ history: versions });
    s.setVersionsShown(true);
    s.viewVersion(versions[2]!.id);
    await s.refresh();
    expect(s.viewOnly.peek()).toBe(true);
    s.setPair(versions[4]!.id, versions[3]!.id);
    expect(s.mode.peek()).toBe('compare');
    expect(s.viewOnly.peek()).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'mmdx-mode', detail: { mode: 'compare', viewOnly: false } });
    await s.refresh();
    expect(s.pair).toEqual({ base: versions[4]!.id, head: versions[3]!.id, viewing: null });
    expect(s.rendered.peek()!.sources.after).toBe(versions[3]!.source);
    expect(s.toSvg()).toContain('data-mmdx-diff');
    s.destroy();
  });

  it('the mode has its own event: mmdx-mode for the tab and History mode, mmdx-view only for the view', async () => {
    const { s, events } = session();
    await s.load({ history: history('production-microservices') });
    s.setMode('history');
    s.setVersionsShown(true);
    s.setVersionsShown(false);
    s.setView('after');
    expect(events.filter((e) => e.type === 'mmdx-mode').map((e) => e.detail)).toEqual([
      { mode: 'history', viewOnly: false }, { mode: 'history', viewOnly: true }, { mode: 'history', viewOnly: false },
    ]);
    expect(events.filter((e) => e.type === 'mmdx-view').map((e) => e.detail)).toEqual([{ view: 'after', mode: 'history' }]);
    // host options set them without an event
    const n = events.length;
    expect(s.applyMode('compare')).toBe(true);
    expect(s.applyView('before')).toBe(true);
    expect(events.length).toBe(n);
    s.destroy();
  });

  it('compareWithPrevious on the last loaded version loads the next page first', async () => {
    const versions = history('production-microservices');
    const { s } = session();
    await s.load({ history: paged(versions, 2) });
    expect(s.versions.peek().map((v) => v.id)).toEqual([versions[0]!.id, versions[1]!.id]);
    expect(s.hasMore.peek()).toBe(true);
    await s.compareWithPrevious(versions[1]!.id);
    expect(s.versions.peek().length).toBe(4);
    expect(s.pair).toMatchObject({ base: versions[2]!.id, head: versions[1]!.id });
    s.destroy();
  });

  it('viewing another version drops the previous picture: loading, and no export of the old one under the new name', async () => {
    const versions = history('production-microservices');
    const gate = deferred<void>();
    const exports: unknown[] = [];
    const { s } = session({
      emit: (type, detail) => {
        if (type === 'mmdx-export') exports.push(detail);
        return false;
      },
    });
    await s.load({ history: paged(versions, 10, { gate: (id) => (id === versions[3]!.id ? gate.promise : undefined) }) });
    s.setVersionsShown(true);
    s.viewVersion(versions[2]!.id);
    await s.refresh();
    const old = s.plain.peek();
    expect(old).not.toBeNull();
    s.viewVersion(versions[3]!.id);
    expect(s.plain.peek()).toBeNull();
    expect(s.status.peek()).toMatchObject({ kind: 'loading' });
    expect(s.toSvg()).toBe('');
    await s.exportAs('svg');
    expect(exports).toEqual([]);
    gate.resolve();
    await until(() => s.plain.peek());
    expect(s.plain.peek()).not.toBe(old);
    expect(s.status.peek()).toBeNull();
    await s.exportAs('svg');
    expect(exports).toMatchObject([{ kind: 'svg', name: `arch-${versions[3]!.id}.svg` }]);
    s.destroy();
  });
});

describe('DiffSession: load generations', () => {
  it('a render of the previous source that lands after a new load() is dropped (no old diff, no old cache entry)', async () => {
    const versions = history('production-microservices');
    const gate = deferred<void>();
    const { s, events } = session();
    // the first load waits for its sources
    const first = s.load({ history: paged(versions, 10, { gate: () => gate.promise }) });
    await tick(10);
    // the second load waits for its two sources
    const before = deferred<string>(), after = deferred<string>();
    const second = s.load({ before: before.promise, after: after.promise });
    gate.resolve();
    await first;
    expect(s.rendered.peek()).toBeNull();
    expect(types(events)).not.toContain('mmdx-compare');
    before.resolve(sample('architecture', 'before'));
    after.resolve(sample('architecture', 'after'));
    await second;
    expect(s.rendered.peek()!.sources.after).toBe(sample('architecture', 'after'));
    expect(events.filter((e) => e.type === 'mmdx-compare')).toHaveLength(1);
    s.destroy();
  });

  it('a page or a history reload of the previous source is dropped; a failed reload is an mmdx-error, not an unhandled rejection', async () => {
    const versions = history('production-microservices');
    const pageGate = deferred<void>();
    let fail = false;
    const old = paged(versions, 2, { failList: () => fail });
    const { s, events } = session();
    await s.load({ history: old });
    // the history changed and cannot be read: an error event, the list stays
    fail = true;
    old.notify();
    await tick(10);
    expect(events.filter((e) => e.type === 'mmdx-error')).toHaveLength(1);
    expect(s.versions.peek()).toHaveLength(2);
    fail = false;
    // a page of the old history that arrives after another load
    const slow: HistoryAdapter = {
      ...old,
      async list(cursor) {
        if (cursor) await pageGate.promise;
        return old.list(cursor);
      },
    };
    await s.load({ history: slow });
    const more = s.loadMore();
    await s.load({ history: versions.slice(0, 3) });
    pageGate.resolve();
    await more;
    expect(s.versions.peek().map((v) => v.id)).toEqual(versions.slice(0, 3).map((v) => v.id));
    s.destroy();
  });

  it('reading the first page again keeps the older pages loaded already', async () => {
    const versions = history('production-microservices');
    const a = paged(versions, 2);
    const { s } = session();
    await s.load({ history: a });
    await s.loadMore();
    expect(s.versions.peek()).toHaveLength(4);
    a.notify();
    await tick(10);
    expect(s.versions.peek().map((v) => v.id)).toEqual(versions.slice(0, 4).map((v) => v.id));
    expect(s.hasMore.peek()).toBe(true);
    await s.loadMore();
    expect(s.versions.peek()).toHaveLength(6);
    s.destroy();
  });
});
