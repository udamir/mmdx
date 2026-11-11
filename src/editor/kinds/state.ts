// The state diagram edit kind (T09.5, T09.6): the palette (state, start, end, choice, fork, join, composite, note)
// drops into the composite under the point; connect and reconnect write transitions where Mermaid's scoping rules
// let them stand (core/ops/state.ts); titles keep the form in use; Properties edit a state's kind and description
// rows, a composite's direction and regions, a note's side; ⌘G makes a composite, Ungroup unwraps one (asking
// before its inner starts and ends are rewired), Delete asks whether a composite's contents go with it. Icons are
// label tokens, images metadata `img` (no Mermaid syntax), other shapes metadata `shape`.
import type { Direction, StateKind, StateModel } from '../../core/model.js';
import { isPseudo, parseState } from '../../core/parse/state.js';
import {
  addEnd, addNote, addRegion, addStart, addState, canMakeComposite, connectState, deleteState, innerPseudo, makeComposite, reconnectState, relabelNote,
  relabelState, relabelTransition, scopeOf, setCompositeDirection, setDescriptions, setNoteSide, setStateKind, stateFragment, ungroupState, type StateScope,
} from '../../core/ops/state.js';
import { cloneMeta, ensure as ensureIn } from '../../core/ops/meta-util.js';
import { NEW_IMAGE } from '../../core/ops/meta-media.js';
import { metaMediaSource } from '../../core/media/meta-source.js';
import { metaItemMedia } from './meta-media.js';
import type { StateGeometry } from '../../core/render/types.js';
import { registerExtendedShapes } from '../../core/extras.js';
import type { ItemRef, Point } from '../../core/types.js';
import type { DiagramMeta } from '../../core/meta/types.js';
import { OPS as STATE_OPS } from '../../core/kinds/state-ops.js';
import type { EditorCore, Sel } from '../core.js';
import { focusLabel } from '../lib/shape-drop.js';
import { blockIcon, noteIcon, shapeIcon, type PaletteItem } from './palette.js';
import type { EditKind, PropControl } from './types.js';

// the editor's shape menus and previews draw any catalogue shape (metadata `shape`) and rich labels at once, as its
// flowchart does: this chunk registers the extended geometry and the media kit statically
registerExtendedShapes();

const one = (s: string): string => s.replace(/\n/g, ' ');

const KIND_NAMES: Readonly<Record<StateKind, string>> = { state: 'state', start: 'start', end: 'end', choice: 'choice', fork: 'fork', join: 'join' };

const ITEMS: PaletteItem[] = [
  { key: 'state', label: 'State', icon: shapeIcon('rounded'), terms: ['state', 'status'], tip: 'State · s1' },
  { key: 'start', label: 'Start', icon: shapeIcon('sm-circ'), terms: ['start', 'initial', '[*]'], tip: 'Start · [*] --> state (drop it next to the first state; one per composite)' },
  { key: 'end', label: 'End', icon: shapeIcon('fr-circ'), terms: ['end', 'final', 'stop', '[*]'], tip: 'End · state --> [*] (drop it next to the last state)' },
  { key: 'choice', label: 'Choice', icon: shapeIcon('choice'), terms: ['choice', 'decision', 'branch'], tip: 'Choice · state c1 <<choice>>' },
  { key: 'fork', label: 'Fork', icon: shapeIcon('fork'), terms: ['fork', 'split', 'parallel'], tip: 'Fork · state f1 <<fork>>' },
  { key: 'join', label: 'Join', icon: shapeIcon('fork'), terms: ['join', 'merge', 'parallel'], tip: 'Join · state j1 <<join>>' },
  { key: 'composite', label: 'Composite state', icon: blockIcon('{ }'), terms: ['composite', 'group', 'nested', 'container'], tip: 'Composite state · state Group1 { … }' },
  { key: 'note', label: 'Note', icon: noteIcon, terms: ['note', 'comment'], tip: 'Note · note right of state : text (drop it next to a state)' },
];

/** The metadata of numbered notes after a code change (pure: `meta` is not modified). */
const remapMeta = (M: StateModel, code: string, N: StateModel, next: string, meta: DiagramMeta): DiagramMeta => STATE_OPS.remapMeta!(meta, M, code, N, next);

const geomOf = (core: EditorCore): StateGeometry | null => (core.geom.type === 'state' ? core.geom : null);

/** The innermost visible composite under a point, and the region of it nearest the point. */
function scopeAt(core: EditorCore, M: StateModel, pt: Point): StateScope {
  const g = geomOf(core);
  if (!g) return { g: null, r: 0 };
  let best: { id: string; a: number } | null = null;
  for (const [id, b] of g.groups) {
    if (b.hidden) continue;
    if (Math.abs(pt.x - b.x) <= b.w / 2 && Math.abs(pt.y - b.y) <= b.h / 2 && (!best || b.w * b.h < best.a)) best = { id, a: b.w * b.h };
  }
  if (!best) return { g: null, r: 0 };
  const G = M.groups.get(best.id);
  if (!G || G.regions < 2) return { g: best.id, r: 0 };
  // the region whose states are nearest
  let r = 0, d = Infinity;
  for (const c of G.children) {
    const b = g.nodes.get(c) ?? g.groups.get(c);
    const k = M.nodes.get(c)?.region ?? M.groups.get(c)?.region ?? 0;
    if (!b) continue;
    const dd = Math.hypot(b.x - pt.x, b.y - pt.y);
    if (dd < d) {
      d = dd;
      r = k;
    }
  }
  return { g: best.id, r };
}

/** The state (or composite) nearest a point in a scope (pseudo-states left out), within `max`. */
function nearest(core: EditorCore, M: StateModel, pt: Point, scope: StateScope | null, max = 260, groups = false): string | null {
  const g = geomOf(core);
  if (!g) return null;
  let best: { id: string; d: number } | null = null;
  const consider = (id: string, b: { x: number; y: number; w: number; h: number; hidden?: boolean }): void => {
    if (b.hidden || !Number.isFinite(b.x)) return;
    if (scope) {
      const s = scopeOf(M, id);
      if (s.g !== scope.g || s.r !== scope.r) return;
    }
    const dx = Math.max(0, Math.abs(pt.x - b.x) - b.w / 2), dy = Math.max(0, Math.abs(pt.y - b.y) - b.h / 2);
    const d = Math.hypot(dx, dy);
    if (d <= max && (!best || d < best.d)) best = { id, d };
  };
  for (const [id, b] of g.nodes) if (!isPseudo(id)) consider(id, b);
  if (groups) for (const [id, b] of g.groups) consider(id, b);
  return (best as { id: string } | null)?.id ?? null;
}

/** Applies an op that adds an item, places it at the point (states) and opens its text. */
function placeNew(core: EditorCore, M: StateModel, code: string, sel: Sel, pt: Point | null, history: string, extra?: Record<string, unknown>, edit = true): boolean {
  const N = parseState(code);
  const meta = cloneMeta(remapMeta(M, core.code, N, code, core.meta));
  if (sel.kind === 'node' && pt) Object.assign(ensureIn(meta, 'node', sel.id), { x: Math.round(pt.x), y: Math.round(pt.y) });
  if (extra) Object.assign(ensureIn(meta, sel.kind, sel.id), extra);
  const ok = core.applyCode({ code, meta }, history, { select: [sel] });
  if (ok && edit && N.nodes.get(sel.id)?.kind !== 'start' && !isPseudo(sel.id)) focusLabel(core, sel);
  return ok;
}

/** A palette item, an icon or an image dropped at a point. */
function dropItem(core: EditorCore, M: StateModel, key: string, pt: Point, extra?: { label?: string; meta?: Record<string, unknown>; preset?: string }): boolean {
  const scope = scopeAt(core, M, pt);
  const preset = extra?.preset ? { preset: extra.preset } : undefined;
  if (key === 'start' || key === 'end') {
    const near = nearest(core, M, pt, key === 'start' ? scope : null);
    const r = key === 'start' ? addStart(core.code, M, scope, near) : addEnd(core.code, M, near);
    if (r.reason) {
      core.toast(r.reason);
      if (r.select && M.nodes.has(r.select.id)) core.select([r.select]);
      return false;
    }
    return r.select ? placeNew(core, M, r.code, r.select, null, key === 'start' ? 'Add start' : 'Add end', undefined, false) : false;
  }
  if (key === 'note') {
    const target = nearest(core, M, pt, null, 400, true);
    if (!target) {
      core.toast('Drop the note next to a state');
      return false;
    }
    const b = geomOf(core)?.nodes.get(target) ?? geomOf(core)?.groups.get(target);
    const r = addNote(core.code, M, target, b && pt.x < b.x ? 'left' : 'right', extra?.label ?? 'Note');
    const N = parseState(r.code);
    const n = N.notes.find((x) => x.line === r.line);
    return n ? placeNew(core, M, r.code, { kind: 'note', id: n.id }, null, 'Add note', preset) : false;
  }
  if (key === 'composite') {
    const r = addState(core.code, M, { scope });
    // a composite with one state in it: `state Group1 {` around the new state
    const N = parseState(r.code);
    const res = makeComposite(r.code, N, [r.select]);
    if (res.reason || !res.select) return false;
    return placeNew(core, M, res.code, res.select, null, 'Add composite', preset);
  }
  const kind: StateKind = key === 'choice' || key === 'fork' || key === 'join' ? key : 'state';
  const r = addState(core.code, M, { kind, scope, ...(extra?.label ? { label: extra.label } : {}) });
  return placeNew(core, M, r.code, r.select, pt, 'Add state', { ...preset, ...extra?.meta }, kind === 'state');
}

export const EDIT: EditKind<StateModel, StateGeometry> = {
  type: 'state',
  describe(M, { kind, id }) {
    if (kind === 'node') {
      const n = M.nodes.get(id);
      if (!n) return null;
      if (n.kind === 'start' || n.kind === 'end') return { title: n.kind === 'start' ? 'Start' : 'End', sub: `${n.kind} · ${n.parent ? `in ${n.parent}` : 'top level'}` };
      return { title: one(n.label) || id, sub: `${KIND_NAMES[n.kind]} · id ${id}${n.parent ? ` · in ${n.parent}` : ''}${n.classes.length ? ' · :::' + n.classes.join(',') : ''}` };
    }
    if (kind === 'group') {
      const g = M.groups.get(id);
      return g ? { title: one(g.label) || id, sub: `composite state · id ${id}${g.regions > 1 ? ` · ${g.regions} regions` : ''}` } : null;
    }
    if (kind === 'edge') {
      const e = M.edges.find((x) => x.id === id);
      return e ? { title: e.label || 'Transition', sub: `transition · ${e.from} → ${e.to}` } : null;
    }
    if (kind === 'note') {
      const n = M.notes.find((x) => x.id === id);
      return n ? { title: one(n.text), sub: `note ${n.side} of ${n.target}` } : null;
    }
    return null;
  },
  text(M, { kind, id }) {
    if (kind === 'node') {
      const n = M.nodes.get(id);
      if (!n || n.kind !== 'state') return null;
      return { value: n.label, multi: false, title: 'props.text', write: (code, v) => relabelState(code, M, id, v) };
    }
    if (kind === 'group') {
      const g = M.groups.get(id);
      return g ? { value: g.label, multi: false, title: 'props.titleText', write: (code, v) => relabelState(code, M, id, v) } : null;
    }
    if (kind === 'edge') {
      const e = M.edges.find((x) => x.id === id);
      return e ? { value: e.label, multi: false, title: 'props.label', write: (code, v) => relabelTransition(code, M, id, v) } : null;
    }
    if (kind === 'note') {
      const n = M.notes.find((x) => x.id === id);
      return n ? { value: n.text, multi: true, title: 'props.text', write: (code, v) => relabelNote(code, M, id, v) } : null;
    }
    return null;
  },
  remove: (code, M, refs) => deleteState(code, M, refs),
  removeOne(core, M, ref) {
    // a composite with contents: delete them too, or keep them (unwrapped)
    const g = ref.kind === 'group' ? M.groups.get(ref.id) : undefined;
    if (!g || !g.children.some((c) => !isPseudo(c))) return false;
    const t = core.i18n.t;
    void core.dialogs
      .choose<'all' | 'keep' | null>({
        title: t('state.deleteTitle', { name: one(g.label) }),
        message: t('state.deleteMsg'),
        cancel: null,
        buttons: [{ label: t('state.cancel'), value: null }, { label: t('state.keepContents'), value: 'keep' }, { label: t('state.deleteContents'), value: 'all', danger: true }],
      })
      .then((v) => {
        if (!v || core.model !== M) return;
        const res = deleteState(core.code, M, [ref], v === 'keep');
        const N = parseState(res.code);
        const meta = cloneMeta(remapMeta(M, core.code, N, res.code, core.meta));
        delete meta.groups?.[ref.id];
        if (core.applyCode({ code: res.code, meta }, 'Delete', { select: null })) core.toast(v === 'keep' ? t('state.deletedKept') : t('state.deletedAll'));
      });
    return true;
  },
  canGroup: (M, sel) => {
    const why = canMakeComposite(M, sel);
    return why ? { ok: false, reason: why } : { ok: true, reason: '' };
  },
  group: (code, M, sel, title) => makeComposite(code, M, sel, title),
  ungroupConfirm(M, ref) {
    if (ref.kind !== 'group' || !innerPseudo(M, ref.id)) return null;
    return { title: 'Ungroup the composite?', message: 'Its start and end go: transitions into the composite are connected to the states its start led to, and transitions out of it leave from the states that led to its end.', ok: 'Ungroup' };
  },
  ungroup(code, M, ref) {
    if (ref.kind !== 'group' || !M.groups.has(ref.id)) return null;
    const r = ungroupState(code, M, ref.id);
    const N = parseState(r.code);
    return { code: r.code, members: r.members.map((id): Sel => ({ kind: N.groups.has(id) ? 'group' : 'node', id })) };
  },
  renameContainer: (code, M, ref, name) => (ref.kind === 'group' ? relabelState(code, M, ref.id, name) : null),
  fragment: (M, _code, refs) => stateFragment(M, refs),
  noCopy: 'Copy works for states and composite states',
  altCopy: true,
  connectable: ['node', 'group'],
  connect: (code, from, to) => connectState(code, parseState(code), from, to),
  added(M, from, to) {
    const e = [...M.edges].reverse().find((x) => x.from === from && x.to === to);
    return e ? { ref: { kind: 'edge', id: e.id }, ports: true } : null;
  },
  connected: { label: 'Add transition', toast: 'Transition added — double-click it to give it a label' },
  reconnect: (code, M, ref, which, target) => (ref.kind === 'edge' ? reconnectState(code, M, ref.id, which, target) : null),
  reconnected: (M, r) => [...M.edges].reverse().find((e) => e.from === r.from && e.to === r.to)?.id,
  // Mermaid has no shapes for states: one from the toolbar stays in metadata (mmdx only)
  palette: {
    mode: 'menu',
    title: 'State diagram',
    items: ITEMS,
    layout: 'list',
  },
  drop: (core, M, item, pt) => dropItem(core, M, item.key, pt, item.preset ? { preset: item.preset } : undefined),
  // the Text tool: a note beside the nearest state
  // an image state, as the flowchart's image node (core/ops/state-media.ts): the picture at Mermaid Chart's default
  // size, caption below, the aspect kept
  addImage: (core, M, url, pt) => dropItem(core, M, 'state', pt, { label: 'Image', meta: { img: url, ...NEW_IMAGE } }),
  media(M, ref, core) {
    const n = ref.kind === 'node' ? M.nodes.get(ref.id) : undefined;
    return n && n.kind === 'state' ? metaItemMedia(metaMediaSource(core.meta.nodes?.[n.id] ?? {})) : null;
  },
  // pictures, icons and their layout keys are metadata (mediaNodesInMeta): the editor writes them
  mediaNodesInMeta: true,
  direction: (M) => M.direction,
  properties(core, M, ref) {
    const t = core.i18n.t;
    const apply = (code: string, label: string, select: ItemRef[] = [ref]): void => {
      if (code === core.code) return;
      const N = parseState(code);
      core.applyCode({ code, meta: remapMeta(M, core.code, N, code, core.meta) }, label, { select });
    };
    const out: PropControl[] = [];
    if (ref.kind === 'node') {
      const n = M.nodes.get(ref.id);
      if (!n || n.kind === 'start' || n.kind === 'end') return out;
      out.push({
        type: 'select', label: t('state.kind'), value: n.kind,
        options: [['state', t('state.kind.state')], ['choice', t('state.kind.choice')], ['fork', t('state.kind.fork')], ['join', t('state.kind.join')]],
        set: (v) => apply(setStateKind(core.code, M, n.id, v as StateKind).code, t('state.kind')),
      });
      if (n.kind === 'state') out.push({ type: 'rows', label: t('state.rows'), value: n.descriptions, hint: t('state.rowsHint'), set: (rows) => apply(setDescriptions(core.code, M, n.id, rows).code, t('state.rows')) });
    } else if (ref.kind === 'group') {
      const g = M.groups.get(ref.id);
      if (!g) return out;
      out.push({
        type: 'select', label: t('state.direction'), value: g.dir ?? '',
        options: [['', t('state.dirDefault')], ['TB', 'TB'], ['BT', 'BT'], ['LR', 'LR'], ['RL', 'RL']],
        set: (v) => apply(setCompositeDirection(core.code, M, g.id, v ? (v as Direction) : null).code, t('state.direction')),
      });
      out.push({
        type: 'button', label: t('state.addRegion'), title: t('state.addRegionTip'),
        run: () => {
          const r = addRegion(core.code, M, g.id);
          apply(r.code, t('state.addRegion'), r.select ? [r.select] : [ref]);
        },
      });
    } else if (ref.kind === 'note') {
      const n = M.notes.find((x) => x.id === ref.id);
      if (!n) return out;
      out.push({
        type: 'select', label: t('state.noteSide'), value: n.side, options: [['left', t('state.left')], ['right', t('state.right')]],
        set: (v) => apply(setNoteSide(core.code, M, n.id, v === 'left' ? 'left' : 'right').code, t('state.noteSide')),
      });
    }
    return out;
  },
  problems(core, M) {
    const t = core.i18n.t;
    const out: { line: number | null; msg: string }[] = [];
    const P = (core.result.theme.state.nodePresets ?? {}) as Record<string, unknown>;
    for (const { cls, line } of M.undefinedClasses) if (!Object.hasOwn(P, cls)) out.push({ line: line + 1, msg: t('problems.undefinedClass', { cls }) });
    return out;
  },
  shapesLabel: 'tools.stateShapes',
};

// the type's view and ops kinds: the editor loads all three in one chunk (editor/kinds/loader.ts)
export { VIEW } from '../../core/kinds/state.js';
export { OPS } from '../../core/kinds/state-ops.js';
