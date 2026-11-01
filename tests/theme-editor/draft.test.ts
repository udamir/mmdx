import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_THEMES } from '../../src/core/theme/builtin.js';
import { ThemeRegistry } from '../../src/core/theme/registry.js';
import { Draft } from '../../src/theme-editor/draft.js';
import { effect, signal } from '../../src/ui/signal.js';

const THEME = {
  id: 'mine', name: 'Mine', extends: 'default-light',
  palette: { lime: '#00ff00' },
  flowchart: { node: { fill: '@cream' }, nodePresets: { core: { fill: '#ffffff', text: '#111111' } } },
};

const make = (file: Record<string, unknown> = THEME, editable = true): Draft => {
  const d = new Draft(signal(new ThemeRegistry(BUILTIN_THEMES)), () => editable);
  d.open(String(file['id']), file);
  return d;
};

afterEach(() => vi.restoreAllMocks());

describe('Draft', () => {
  it('the path setter tracks the changed paths against the saved copy; setting a value back makes it clean', () => {
    const d = make();
    const dirty = vi.fn();
    const off = effect(() => dirty(d.dirty()));
    expect(d.dirty.peek()).toBe(false);
    d.set(['palette', 'lime'], '#123456');
    expect([...d.changed.peek()]).toEqual(['palette.lime']);
    d.set(['flowchart', 'nodePresets', 'core', 'fill'], '#000000');
    expect([...d.changed.peek()].sort()).toEqual(['flowchart.nodePresets.core.fill', 'palette.lime']);
    expect(d.dirty.peek()).toBe(true);
    d.set(['palette', 'lime'], '#00ff00');
    d.set(['flowchart', 'nodePresets', 'core', 'fill'], '#ffffff');
    expect(d.changed.peek().size).toBe(0);
    expect(d.dirty.peek()).toBe(false);
    // the dirty signal changes only when the state flips
    expect(dirty.mock.calls.map((c) => c[0])).toEqual([false, true, false]);
    off();
  });

  it('a whole object added or removed is one changed path; its parts are marked through it', () => {
    const d = make();
    d.set(['sequence', 'notePresets', 'warn', 'fill'], '#ffcc00');
    // sequence did not exist: the patch root is the new object, the changed path too
    expect([...d.changed.peek()]).toEqual(['sequence']);
    expect(d.isChanged('sequence.notePresets.warn')).toBe(true);
    expect(d.isChanged('sequence')).toBe(true);
    expect(d.isChanged('flowchart')).toBe(false);
    // removing it again (the reset tidies the empty objects) is clean
    d.set(['sequence', 'notePresets', 'warn', 'fill'], undefined);
    expect(d.current()!['sequence']).toBeUndefined();
    expect(d.changed.peek().size).toBe(0);
  });

  it('a burst of edits is one undo step; undo / redo restore the exact structure (objects a reset removed too)', () => {
    vi.useFakeTimers();
    const d = make();
    const before = d.snapshot();
    d.set(['flowchart', 'nodePresets', 'core', 'fill'], undefined);
    d.set(['flowchart', 'nodePresets', 'core', 'text'], undefined);
    // core emptied: the reset removed it and nodePresets with it
    expect(d.current()!['flowchart']).toEqual({ node: { fill: '@cream' } });
    expect(d.canUndo.peek()).toBe(true);
    d.undo();
    expect(d.snapshot()).toEqual(before);
    expect(d.dirty.peek()).toBe(false);
    expect(d.canRedo.peek()).toBe(true);
    d.redo();
    expect(d.current()!['flowchart']).toEqual({ node: { fill: '@cream' } });
    expect([...d.changed.peek()]).toEqual(['flowchart.nodePresets']);
    // a pause ends the step: two steps now
    d.undo();
    d.set(['name'], 'A');
    vi.advanceTimersByTime(600);
    d.set(['name'], 'B');
    d.undo();
    expect(d.current()!['name']).toBe('A');
    d.undo();
    expect(d.current()!['name']).toBe('Mine');
    expect(d.canUndo.peek()).toBe(false);
    vi.useRealTimers();
  });

  it('an edit neither serialises nor diffs the whole theme', () => {
    const d = make(BUILTIN_THEMES[0] as unknown as Record<string, unknown>);
    const root = d.current();
    const spy = vi.spyOn(JSON, 'stringify');
    d.set(['palette', 'lime'], '#123456');
    d.set(['flowchart', 'node', 'fill'], '#ffffff');
    expect(spy.mock.calls.every(([v]) => v !== root)).toBe(true);
    // only the values edited (leaves here), never an object around them
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    expect(spy.mock.calls.every(([v]) => typeof v !== 'object' || v === null)).toBe(true);
  });

  it('touched paths: the paths edited since the last call (the views redraw what they show of them)', () => {
    const d = make();
    d.set(['flowchart', 'nodePresets', 'core', 'fill'], '#000000');
    d.set(['er', 'entity', 'fill'], '#eeeeee');
    expect([...d.takeTouched()]).toEqual(['flowchart.nodePresets.core.fill', 'er.entity.fill']);
    expect(d.takeTouched().size).toBe(0);
  });

  it('read only: the setter changes nothing; markSaved makes the draft the saved copy with its schema version', () => {
    const ro = make(THEME, false);
    ro.set(['palette', 'lime'], '#000000');
    expect(ro.current()!['palette']).toEqual({ lime: '#00ff00' });
    const d = make();
    d.set(['palette', 'lime'], '#000000');
    d.markSaved({ ...d.snapshot()!, schemaVersion: 1 } as unknown as Record<string, unknown>);
    expect(d.dirty.peek()).toBe(false);
    expect(d.current()!['schemaVersion']).toBe(1);
    d.set(['palette', 'lime'], '#00ff00');
    expect([...d.changed.peek()]).toEqual(['palette.lime']);
  });

  it('a removed palette colour: references become its value, in the same undo step', () => {
    const d = make();
    d.set(['flowchart', 'node', 'stroke'], '@lime~50');
    d.replaceRefs('cream', '#fff8e0');
    d.set(['palette', 'cream'], undefined);
    expect(d.get(['flowchart', 'node', 'fill'])).toBe('#fff8e0');
    d.undo();
    expect(d.get(['flowchart', 'node', 'fill'])).toBe('@cream');
    expect(d.get(['flowchart', 'node', 'stroke'])).toBeUndefined();
  });

  it('effective styles and the contrast check of a tile', () => {
    const low = make({ id: 'low', extends: 'default-light', flowchart: { nodePresets: { faint: { fill: '#ffffff', text: '#eeeeee' } } } });
    const sel = { type: 'flowchart' as const, kind: 'node', presets: 'nodePresets', preset: 'faint', fields: [], props: null as never };
    expect(low.effectiveFor(sel)['text']).toBe('#eeeeee');
    expect(low.lowContrast(sel)).toBeCloseTo(1.16, 1);
    expect(low.lowContrast({ ...sel, preset: null })).toBeNull();
    expect(low.stylePath(sel)).toEqual(['flowchart', 'nodePresets', 'faint']);
    expect(low.stylePath({ ...sel, preset: null, shape: 'rect', shapesKey: 'nodeShapes' })).toEqual(['flowchart', 'nodeShapes', 'rect']);
  });
});
