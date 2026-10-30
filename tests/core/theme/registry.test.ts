import { describe, expect, it, vi } from 'vitest';
import { BUILTIN_THEMES, createDefaultRegistry } from '../../../src/core/theme/builtin.js';
import { resolveAll } from '../../../src/core/theme/colors.js';
import { BASELINE, ThemeRegistry, canonicalId, deepMerge } from '../../../src/core/theme/registry.js';
import type { ThemeFile } from '../../../src/core/theme/types.js';

type Obj = Record<string, unknown>;

// A reference merge over a plain map (the semantics of the original plain-JS studio's mergedTheme).
function referenceMerged(files: Map<string, Obj>, id: string, depth = 0): Obj | null {
  id = id === 'studio' ? BASELINE : id || BASELINE;
  const raw = files.get(id) ?? files.get(BASELINE);
  if (!raw) return null;
  const { id: tid, name, extends: parent, ...rest } = JSON.parse(JSON.stringify(raw)) as Obj;
  if (tid === BASELINE || depth > 5) return { id: tid, name, ...rest };
  const p = referenceMerged(files, (parent as string) || BASELINE, depth + 1);
  return { ...deepMerge(p, rest), id: tid, name: name || tid, extends: parent || BASELINE };
}
const strip = (o: unknown): unknown => JSON.parse(JSON.stringify(o));
const fileMap = (): Map<string, Obj> => new Map(BUILTIN_THEMES.map((t) => [t.id, t as unknown as Obj]));

describe('ThemeRegistry merge against the reference merge', () => {
  const reg = createDefaultRegistry();
  for (const t of BUILTIN_THEMES) {
    it(`merged(${t.id})`, () => {
      expect(strip(reg.merged(t.id))).toEqual(strip(referenceMerged(fileMap(), t.id)));
    });
  }
  it('resolved colours equal the reference merge, resolved', () => {
    for (const t of BUILTIN_THEMES) {
      const m = referenceMerged(fileMap(), t.id)!;
      const basePalette = (referenceMerged(fileMap(), BASELINE)!['palette'] ?? {}) as Record<string, string>;
      const p = resolveAll(m, (m['palette'] ?? {}) as Record<string, string>, basePalette) as Obj;
      const ours = reg.get(t.id);
      for (const sec of ['flowchart', 'sequence', 'er', 'canvas'] as const) expect(ours[sec]).toMatchObject(p[sec] as Obj);
      expect(ours.basePalette).toEqual(basePalette);
      expect(ours.font).toBe(p['font']);
    }
  });
  it('a three-level chain merges like the reference', () => {
    const extra: ThemeFile[] = [
      { id: 'a', extends: 'default-dark', flowchart: { node: { fill: '@lime', radius: 3 } } },
      { id: 'b', extends: 'a', name: 'B', flowchart: { node: { radius: 9 } }, palette: { lime: '#00ff00' } },
    ];
    const r = createDefaultRegistry();
    for (const e of extra) r.register(e);
    const files = fileMap();
    for (const e of extra) files.set(e.id, e as unknown as Obj);
    expect(strip(r.merged('b'))).toEqual(strip(referenceMerged(files, 'b')));
    expect(r.get('b').flowchart.node).toMatchObject({ fill: '#00ff00', radius: 9 });
  });
});

describe('ThemeRegistry', () => {
  it('a theme file naming an earlier id is migrated (id, extends, counterpart)', () => {
    const reg = createDefaultRegistry();
    reg.register({ id: 'mine', extends: 'studio-dark', counterpart: 'baseline' });
    expect(reg.raw('mine')).toMatchObject({ extends: 'default-dark', counterpart: 'default-light' });
    // a stored copy of the old base theme replaces the current one
    reg.register({ ...reg.raw('default-light')!, id: 'baseline', name: 'Edited' });
    expect(reg.raw('default-light')!.name).toBe('Edited');
    expect(reg.list().map((t) => t.id)).not.toContain('baseline');
  });


  it('earlier ids (studio, baseline, studio-dark) are aliases; unknown ids → default-light', () => {
    const reg = createDefaultRegistry();
    expect(canonicalId('studio')).toBe('default-light');
    expect(canonicalId('baseline')).toBe('default-light');
    expect(canonicalId('studio-dark')).toBe('default-dark');
    expect(reg.get('baseline')).toBe(reg.get('default-light'));
    expect(reg.get('studio-dark')).toBe(reg.get('default-dark'));
    expect(canonicalId(undefined)).toBe('default-light');
    expect(reg.has('studio')).toBe(true);
    expect(reg.get('studio')).toBe(reg.get('default-light'));
    expect(reg.get('nope')).toBe(reg.get('default-light'));
    expect(reg.has('nope')).toBe(false);
  });

  it('lists the built-ins with appearance and parent', () => {
    expect(createDefaultRegistry().list()).toEqual([
      { id: 'default-light', name: 'Default Light', appearance: 'light', extends: null },
      { id: 'default-dark', name: 'Default Dark', appearance: 'dark', extends: 'default-light' },
    ]);
  });

  it('detects extends cycles and roots them on baseline', () => {
    const reg = createDefaultRegistry();
    reg.register({ id: 'x', extends: 'y', flowchart: { node: { radius: 1 } } });
    reg.register({ id: 'y', extends: 'x', flowchart: { node: { radius: 2, fill: '#010101' } } });
    const m = reg.merged('x')!;
    expect(m.flowchart?.node).toMatchObject({ radius: 1, fill: '#010101' });
    expect(m.palette).toEqual(reg.merged('default-light')!.palette);
    reg.register({ id: 'self', extends: 'self' });
    expect(reg.get('self').sequence.participant).toEqual(reg.get('default-light').sequence.participant);
  });

  it('caps the extends depth at 5', () => {
    const reg = createDefaultRegistry();
    for (let i = 0; i < 10; i++) reg.register({ id: `t${i}`, extends: i < 9 ? `t${i + 1}` : 'default-light', flowchart: { node: { [`k${i}`]: i } as never } });
    const node = reg.merged('t0')!.flowchart!.node as Record<string, unknown>;
    expect(Object.keys(node).filter((k) => /^k\d$/.test(k)).sort()).toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k5']);
    expect(reg.merged('t0')!.palette).toBeDefined();
  });

  it('caches get() and clears the cache and notifies on change', () => {
    const reg = createDefaultRegistry();
    const a = reg.get('default-dark');
    expect(reg.get('default-dark')).toBe(a);
    const cb = vi.fn();
    const off = reg.onChange(cb);
    reg.register({ id: 'default-dark', extends: 'default-light', flowchart: { node: { fill: '#000' } } });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(reg.get('default-dark')).not.toBe(a);
    expect(reg.get('default-dark').flowchart.node.fill).toBe('#000');
    expect(reg.unregister('default-dark')).toBe(true);
    expect(reg.unregister('default-dark')).toBe(false);
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    reg.register({ id: 'z' });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('raw() is a validated copy', () => {
    const reg = createDefaultRegistry();
    const r = reg.raw('default-dark')!;
    r.name = 'changed';
    expect(reg.raw('default-dark')!.name).toBe('Default Dark');
    expect(reg.raw('nope')).toBeNull();
  });

  it('builds a complete ResolvedTheme even from a bare registry', () => {
    const reg = new ThemeRegistry([{ id: 'default-light', palette: { ink: '#111111' }, flowchart: { node: { text: '@ink' } } }]);
    const t = reg.get('default-light');
    expect(t.canvas.pad).toBe(16);
    expect(t.font).toMatch(/Open Sans/);
    expect(t.flowchart.node).toEqual({ text: '#111111' });
    expect(t.flowchart.edgePresets).toEqual({});
    expect(t.sequence.layout).toEqual({});
    expect(t.er.relPresets).toEqual({});
    expect(t.appearance).toBe('light');
    expect(new ThemeRegistry().get('x').id).toBe('default-light');
  });

  it('every built-in theme resolves to colour literals only', () => {
    const reg = createDefaultRegistry();
    for (const { id } of reg.list()) {
      const s = JSON.stringify(reg.get(id));
      expect(s).not.toMatch(/"@[\w-]+/);
    }
  });

  it('resolveDraft previews an unsaved theme', () => {
    const reg = createDefaultRegistry();
    const d = reg.resolveDraft({ id: 'draft', extends: 'default-dark', palette: { lime: '#00ff00' }, flowchart: { node: { fill: '@lime', stroke: 'bad"' } } });
    expect(d.flowchart.node.fill).toBe('#00ff00');
    expect(d.flowchart.node.stroke).toBe(reg.get('default-dark').flowchart.node.stroke);
    expect(d.appearance).toBe('dark');
    expect(reg.has('draft')).toBe(false);
    const b = reg.resolveDraft({ ...reg.raw('default-light')!, palette: { ...reg.raw('default-light')!.palette, ink: '#ff0000' } });
    expect(b.basePalette['ink']).toBe('#ff0000');
  });
});
