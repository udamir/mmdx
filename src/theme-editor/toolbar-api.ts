// What the floating style toolbar edits: the selected tile's style in the theme being edited. A shape's default lives
// in <type>.<shapesKey>.<shape> (flowchart.nodeShapes, sequence.participantShapes); everything else in <type>.<kind> /
// <type>.<presets>.<name>.
import type { Rect } from '../core/types.js';
import type { StyleToolbarHandle, ToolbarApi } from '../ui/diagram/style-toolbar.js';
import type { Env } from './env.js';
import { isObj, obj } from './util.js';
import { themeStyleTarget } from '../ui/diagram/style-toolbar/theme-target.js';

export function styleApi(env: Env, toolbar: () => StyleToolbarHandle): ToolbarApi {
  const { draft } = env;
  const sel = (): ReturnType<Env['sel']['peek']> => env.sel.peek();
  const pal = (): Record<string, string> => ({ ...draft.palette(), ...(obj(draft.current()?.['palette']) as Record<string, string>) });
  const font = (): string => String((draft.isBase() ? draft.current()?.['font'] : draft.current()?.['font'] ?? draft.parent.peek()?.['font']) ?? '');
  // the baseline's item style itself cannot be reset (a baseline preset is emptied instead)
  const fixed = (): boolean => { const s = sel(); return draft.isBase() && s?.preset === null && !s.shape; };
  return {
    selection: () => {
      const s = sel();
      return s && s.kind !== 'page' ? { kind: s.kind, id: s.preset ?? '' } : null;
    },
    editable: () => env.canEdit(),
    multiCount: () => 1,
    diagramType: () => sel()?.type,
    eff: (k) => {
      const s = sel();
      const v = s ? draft.effectiveFor(s)[k] : undefined;
      return typeof v === 'string' ? draft.show(v) : v;
    },
    effRaw: (k) => {
      const s = sel();
      return s ? draft.effectiveFor(s)[k] : undefined;
    },
    // tiles and the preview redraw after a short pause, so dragging a slider is not interrupted; releasing it ends the
    // undo step at once (commit)
    set: (k, v) => {
      const s = sel();
      if (!s) return;
      const entries = typeof k === 'string' ? [[k, v] as const] : Object.entries(k);
      for (const [key, val] of entries) {
        if (key === 'shape' && s.shape && s.preset === null) continue; // a shape's default keeps its shape
        draft.set([...draft.stylePath(s), key], val === null ? undefined : val);
      }
    },
    commit: () => draft.endGroup(),
    canReset: () => {
      const s = sel();
      const own = s ? draft.get(draft.stylePath(s)) : undefined;
      return isObj(own) && Object.keys(own).length > 0 && !fixed();
    },
    // a theme drops its overrides; a baseline preset is emptied (it then looks like the default style)
    reset: () => {
      const s = sel();
      if (!s || fixed()) return;
      draft.set(draft.stylePath(s), draft.isBase() && s.preset !== null ? {} : undefined);
      env.flush();
      toolbar().refresh();
    },
    ...themeStyleTarget(() => ({ palette: pal(), font: font() })),
    edgeEnds: () => {
      const s = sel();
      return { start: 'none', end: s && draft.effectiveFor(s)['arrow'] === 'none' ? 'none' : 'arrow' };
    },
    anchorRect: (): Rect | null => {
      const tl = env.main.querySelector('.te-tile.on');
      if (!tl) return null;
      const r = tl.getBoundingClientRect(), b = env.body.getBoundingClientRect(), m = env.main.getBoundingClientRect();
      if (m.height && (r.bottom < m.top || r.top > m.bottom)) return null;
      return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
    },
    inspect: () => {
      const det = sel()?.props.querySelector('details');
      if (det) det.open = true;
    },
  };
}
