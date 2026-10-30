// Connections (A.4 rows 41–43, A.7 row 84): connection dots on hover / selection, drag a dot to another item to
// connect (`newDrag` → `createConnection`), end handles with magnet points to move or re-attach a connector end
// (`portDrag` → `reconnect`), bend points (`bendHandles`, `bendDrag`, `removeBendPoint`, `hoverBend`).
// Ported from prototype/app.js ~425–970 and `hoverConnect`.
import { KIND_TO_COLL, type ItemMeta } from '../../../core/meta/types.js';
import type { FlowchartModel, ErModel } from '../../../core/model.js';
import { addERRel, addFlowEdge, addSeqMessage, reconnectER, reconnectFlow } from '../../../core/ops/connect.js';
import { cloneMeta, ensure as ensureIn } from '../../../core/ops/meta-util.js';
import { parse } from '../../../core/parse/index.js';
import { outerBox, portPoint } from '../../../core/render/common.js';
import type { EdgeGeom } from '../../../core/render/types.js';
import { el, g } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import type { Side } from '../../../core/style.js';
import type { CenterBox, ItemKind, ItemRef, Point } from '../../../core/types.js';
import type { EditorCore, Gesture, Hit, Sel } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { CONNECT_CSS } from './css.js';
import { canConnect, deepInside, endpointBox, endpointId, geomBoxOf, MAGNETS, projectToBox, targetAt } from './geometry.js';

export { CONNECTABLE, MAGNETS, canConnect, deepInside, geomBoxOf, projectToBox, targetAt } from './geometry.js';

interface Linking {
  a: Point;
  b: Point;
  target: ItemRef | null;
  side?: Side;
  at?: number;
}

interface Magnets {
  box: CenterBox;
  side?: Side | undefined;
  at?: number | undefined;
}

type LineKind = 'edge' | 'rel';
const isLine = (k: string | null | undefined): k is LineKind => k === 'edge' || k === 'rel';
const sameRef = (a: ItemRef | null | undefined, b: ItemRef | null | undefined): boolean =>
  (!a && !b) || (!!a && !!b && a.kind === b.kind && a.id === b.id);

/** A second press on the same handle within 600 ms and 8 px (the prototype's double-click on handles). */
class DoublePress {
  private last: { key: string; t: number; x: number; y: number } | null = null;
  /** Time of the last double press (the browser's own dblclick that follows must not edit text). */
  at = -1e9;
  hit(key: string, ev: PointerEvent, track = true): boolean {
    const last = this.last;
    this.last = track ? { key, t: ev.timeStamp, x: ev.clientX, y: ev.clientY } : null;
    if (last && last.key === key && ev.timeStamp - last.t < 600 && Math.hypot(ev.clientX - last.x, ev.clientY - last.y) < 8) {
      this.last = null;
      this.at = ev.timeStamp;
      return true;
    }
    return false;
  }
}

const NOOP: Gesture = { move: () => undefined };

/** Creates the connector after a drag from a connection dot (prototype `createConnection`). */
export function createConnection(core: EditorCore, src: ItemRef, fromSide: Side, tgt: ItemRef, toSide?: Side, toAt?: number): boolean {
  const type = core.model.type;
  if (!type) return false;
  const add = type === 'flowchart' ? addFlowEdge : type === 'er' ? addERRel : addSeqMessage;
  const r = add(core.code, src.id, tgt.id);
  const M = parse(r.code);
  const meta = cloneMeta(core.meta);
  let sel: Sel | null = null;
  const ends = (m: ItemMeta): void => {
    m.fromSide = fromSide;
    m.fromAt = 0.5;
    if (toSide) {
      m.toSide = toSide;
      if (toAt !== undefined) m.toAt = toAt;
    }
  };
  if (M.type === 'flowchart') {
    const e = [...M.edges].reverse().find((x) => x.from === src.id && x.to === tgt.id);
    if (e) {
      ends(ensureIn(meta, 'edge', e.id));
      sel = { kind: 'edge', id: e.id };
    }
  } else if (M.type === 'er') {
    const rel = [...M.rels].reverse().find((x) => x.from === src.id && x.to === tgt.id);
    if (rel) {
      ends(ensureIn(meta, 'rel', rel.id));
      sel = { kind: 'rel', id: rel.id };
    }
  } else if (M.type === 'sequence') {
    const msg = [...M.items].reverse().find((x) => x.kind === 'message');
    if (msg) sel = { kind: 'message', id: msg.id };
  }
  const ok = core.applyCode({ code: r.code, meta }, type === 'sequence' ? 'Add message' : 'Connect', { select: sel ? [sel] : [] });
  // A.13: inline edit exists, so the copy no longer sends the user to the Mermaid source
  if (ok) core.toast(type === 'sequence' ? 'Message added — double-click it to edit its text' : 'Connection added — style it with the toolbar');
  return ok;
}

/** Re-attaches end `which` of a connector to another item (prototype `reconnect`): line rewritten, style kept. */
export function reconnect(core: EditorCore, kind: LineKind, id: string, which: 'a' | 'b', target: ItemRef, side?: Side, at?: number): boolean {
  const M0 = core.model;
  const old: ItemMeta = { ...core.getM(kind, id) };
  const r = kind === 'edge' ? (M0.type === 'flowchart' ? reconnectFlow(core.code, M0 as FlowchartModel, id, which, target.id) : null)
    : M0.type === 'er' ? reconnectER(core.code, M0 as ErModel, id, which, target.id) : null;
  if (!r || r.code === core.code) return false;
  const meta = cloneMeta(core.meta);
  const coll = meta[KIND_TO_COLL[kind]] as Record<string, ItemMeta> | undefined;
  if (coll) delete coll[id];
  const M = parse(r.code);
  const list: { id: string; from: string; to: string; src: number }[] = M.type === 'flowchart' ? M.edges : M.type === 'er' ? M.rels : [];
  const ne = list.find((e) => e.src === r.line && e.from === r.from && e.to === r.to) ?? [...list].reverse().find((e) => e.from === r.from && e.to === r.to);
  if (!ne) return core.applyCode({ code: r.code, meta }, 'Re-connect', { select: [] });
  const sk = which === 'a' ? 'fromSide' : 'toSide', ak = which === 'a' ? 'fromAt' : 'toAt';
  const m = Object.assign(ensureIn(meta, kind, ne.id), old);
  if (side) {
    m[sk] = side;
    if (at !== undefined) m[ak] = at;
  } else {
    delete m[sk];
    delete m[ak];
  }
  if (!Object.keys(m).length) delete (meta[KIND_TO_COLL[kind]] as Record<string, ItemMeta>)[ne.id];
  const ok = core.applyCode({ code: r.code, meta }, 'Re-connect', { select: [{ kind, id: ne.id }] });
  if (ok) core.toast(`Re-connected to ${target.id}`);
  return ok;
}

export const connectModule: EditorModule = {
  id: 'connect',
  css: CONNECT_CSS,
  install(core) {
    const ac = new AbortController();
    const offs: (() => void)[] = [];
    let linking: Linking | null = null;
    let magnets: Magnets | null = null;
    let hoverEdge: ItemRef | null = null;
    let active = false;
    const endPress = new DoublePress();
    const bendPress = new DoublePress();
    const edgeGeom = (it: ItemRef): EdgeGeom | undefined => {
      const gm = core.geom;
      return it.kind === 'edge' && gm.type === 'flowchart' ? gm.edges.get(it.id) : it.kind === 'rel' && gm.type === 'er' ? gm.rels.get(it.id) : undefined;
    };
    const busy = (): boolean => active || core.dragging;

    // ---- painters ------------------------------------------------------------------------------------------------

    const connectDots = (b: CenterBox & { stack?: unknown }, s: Sel, k: number): SceneNode[] => {
      if (s.kind === 'participant') return []; // messages start from lifelines instead (sequence module: ◀ ▶)
      if (!canConnect(core, s.kind, s.id) || core.getM(s.kind, s.id).locked) return [];
      const box = outerBox(b, b.stack);
      const off = 16 / k, r = 6 / k;
      return (['t', 'r', 'b', 'l'] as Side[]).map((side) => {
        const p = portPoint(box, side, 0.5);
        const x = p.x + p.n.x * off, y = p.y + p.n.y * off;
        return g({ class: 'conn-dot', 'data-handle': 'new', 'data-side': side, 'data-kind': s.kind, 'data-id': s.id }, [
          el('circle', { cx: x, cy: y, r: r * 1.9, fill: 'transparent', stroke: 'none' }),
          el('circle', { class: 'conn-dot-c', cx: x, cy: y, r, 'stroke-width': 1.6 / k }),
          el('path', { d: `M${x - r * 0.5},${y}h${r}M${x},${y - r * 0.5}v${r}`, 'stroke-width': 1.6 / k }),
        ]);
      });
    };

    const magnetDots = (k: number): SceneNode[] => {
      const mg = magnets;
      if (!mg) return [];
      const r = 3.6 / k, out: SceneNode[] = [];
      for (const side of ['t', 'r', 'b', 'l'] as Side[])
        for (const at of MAGNETS) {
          const p = portPoint(mg.box, side, at);
          const on = side === mg.side && Math.abs(at - (mg.at ?? -1)) < 0.001;
          out.push(el('circle', { class: on ? 'magnet on' : 'magnet', cx: p.x, cy: p.y, r: on ? r * 1.6 : r, 'stroke-width': 1.4 / k }));
        }
      return out;
    };

    const endHandles = (s: Sel, k: number): SceneNode[] => {
      if (!isLine(s.kind)) return [];
      const gm = edgeGeom(s);
      if (!gm) return [];
      const r = 6.5 / k, m = core.getM(s.kind, s.id);
      const dot = (p: Point, which: 'a' | 'b', fixed: boolean): SceneNode =>
        el('circle', { class: fixed ? 'end-handle fixed' : 'end-handle', 'data-handle': 'end', 'data-end': which, cx: p.x, cy: p.y, r, 'stroke-width': 2 / k });
      return [dot(gm.a, 'a', !!m.fromSide), dot(gm.b, 'b', !!m.toSide)];
    };

    const bendHandles = (it: ItemRef | null, k: number): SceneNode[] => {
      if (!it || !isLine(it.kind)) return [];
      const gm = edgeGeom(it);
      if (!gm) return [];
      const out: SceneNode[] = [];
      gm.mids.forEach((p, i) =>
        out.push(el('circle', { class: 'bend-new', 'data-handle': 'bendNew', 'data-kind': it.kind, 'data-id': it.id, 'data-i': i, cx: p.x, cy: p.y, r: 4.5 / k, 'stroke-width': 1.5 / k })));
      (gm.points ?? []).forEach(([x, y], j) =>
        out.push(el('circle', { class: 'bend-pt', 'data-handle': 'bend', 'data-kind': it.kind, 'data-id': it.id, 'data-j': j, cx: x, cy: y, r: 5 / k, 'stroke-width': 1.5 / k })));
      return out;
    };

    const linkPreview = (k: number): SceneNode[] => {
      const L = linking!;
      return [
        ...magnetDots(k),
        el('path', { class: 'link-preview', d: `M${L.a.x},${L.a.y} L${L.b.x},${L.b.y}`, 'stroke-width': 2 / k, 'stroke-dasharray': `${6 / k} ${4 / k}` }),
        el('circle', { class: 'link-tip', cx: L.b.x, cy: L.b.y, r: 4 / k }),
      ];
    };

    offs.push(core.addOverlay({
      id: 'connect',
      exclusive: () => !!linking,
      order: 70,
      paint(k) {
        const sel = core.selection();
        const single = sel.length === 1 ? sel[0]! : null;
        if (single && isLine(single.kind)) {
          const ends = endHandles(single, k);
          // bend points on top: placed by hand
          if (ends.length) return [...magnetDots(k), ...ends, ...bendHandles(single, k)];
        }
        if (linking) return linkPreview(k);
        const out: SceneNode[] = [];
        const b = single ? core.boxOf(single) : null;
        if (single && b && !b.hidden) out.push(...connectDots(b, single, k));
        const hov = core.hover;
        if (hov && !core.isSelected(hov) && !busy()) {
          const hb = core.boxOf(hov);
          if (hb && !hb.hidden) out.push(...connectDots(hb, hov, k));
        }
        if (hoverEdge && !busy()) out.push(...bendHandles(hoverEdge, k));
        return out;
      },
    }));

    // ---- gestures ------------------------------------------------------------------------------------------------

    /** Drag from a connection dot to another item (prototype `newDrag`). */
    const newDrag = (hit: Hit, side: Side, src: ItemRef): Gesture | null => {
      const srcBox = geomBoxOf(core, src.kind, src.id);
      if (!srcBox) return null;
      const a = portPoint(srcBox, side, 0.5);
      const p0 = hit.p;
      linking = { a, b: a, target: null };
      return {
        move(dx, dy, ev) {
          const cur = { x: p0.x + dx, y: p0.y + dy };
          const t = targetAt(core, ev, src);
          const box = t && geomBoxOf(core, t.kind, t.id);
          if (t && box) {
            const auto = src.kind === 'participant' || deepInside(box, cur, core.viewport.state.k);
            const pr = auto ? null : projectToBox(box, cur, ev.altKey);
            const tip = pr ? portPoint(box, pr.side, pr.at) : { x: box.x, y: box.y };
            linking = { a, b: tip, target: t };
            if (pr) {
              linking.side = pr.side;
              linking.at = pr.at;
            }
            magnets = auto ? null : { box, side: pr?.side, at: pr?.at };
          } else {
            linking = { a, b: cur, target: null };
            magnets = null;
          }
          core.drawOverlay();
        },
        end() {
          const L = linking;
          linking = null;
          magnets = null;
          active = false;
          if (L?.target) createConnection(core, src, side, L.target, L.side, L.at);
        },
        cancel() {
          linking = null;
          magnets = null;
          active = false;
        },
      };
    };

    /** Drag an end handle around its box (magnets; Alt = free) or onto another item (prototype `portDrag`). */
    const portDrag = (hit: Hit, which: 'a' | 'b', kind: LineKind, id: string): Gesture | null => {
      const box = endpointBox(core, kind, id, which);
      const sk = which === 'a' ? 'fromSide' : 'toSide', ak = which === 'a' ? 'fromAt' : 'toAt';
      const m0 = core.getM(kind, id);
      const orig = { side: m0[sk], at: m0[ak] };
      const current = endpointId(core, kind, id, which);
      const p0 = hit.p;
      let began = false;
      let target: { t: ItemRef; side?: Side; at?: number } | null = null;
      if (box) magnets = { box, side: orig.side, at: orig.at };
      return {
        move(dx, dy, ev) {
          if (!began) {
            core.begin();
            began = true;
          }
          const m = core.ensure(kind, id);
          const cur = { x: p0.x + dx, y: p0.y + dy };
          const t = targetAt(core, ev);
          const tb = t && t.id !== current ? geomBoxOf(core, t.kind, t.id) : null;
          if (t && tb) {
            // hovering another item: preview the re-attachment, keep the current end untouched
            const pr = deepInside(tb, cur, core.viewport.state.k) ? null : projectToBox(tb, cur, ev.altKey);
            target = { t };
            if (pr) Object.assign(target, pr);
            if (orig.side === undefined) {
              delete m[sk];
              delete m[ak];
            } else {
              m[sk] = orig.side;
              if (orig.at === undefined) delete m[ak];
              else m[ak] = orig.at;
            }
            magnets = { box: tb, side: pr?.side, at: pr?.at };
            core.draw();
            return;
          }
          target = null;
          if (!box) return;
          const pr = projectToBox(box, cur, ev.altKey);
          m[sk] = pr.side;
          m[ak] = pr.at;
          magnets = { box, side: pr.side, at: pr.at };
          core.draw();
        },
        end() {
          magnets = null;
          active = false;
          if (target) {
            core.store.rollback();
            if (!reconnect(core, kind, id, which, target.t, target.side, target.at)) core.afterChange();
          } else if (began) core.commit('Move connector end');
        },
        cancel() {
          magnets = null;
          active = false;
          if (began) core.rollback();
        },
      };
    };

    /** Drag a bend point, or pull a new one out of the middle of a part (added on the first move). */
    const bendDrag = (hit: Hit, handle: Element, kind: LineKind, id: string): Gesture => {
      const isNew = handle.getAttribute('data-handle') === 'bendNew';
      const j = Number(handle.getAttribute(isNew ? 'data-i' : 'data-j'));
      let added = !isNew, began = false;
      const p0 = hit.p;
      // select the line (the overlay is redrawn; the pointer is captured by the canvas)
      const p = core.primary();
      if (!p || p.kind !== kind || p.id !== id) {
        hoverEdge = null;
        core.select([{ kind, id }]);
      }
      return {
        move(dx, dy, ev) {
          if (!began) {
            core.begin();
            began = true;
          }
          const m = core.ensure(kind, id);
          const pt: [number, number] = [core.snapV(p0.x + dx, ev), core.snapV(p0.y + dy, ev)];
          const pts = (m.points ?? []).map((q): [number, number] => [q[0], q[1]]);
          if (!added) {
            pts.splice(j, 0, pt);
            added = true;
          } else pts[j] = pt;
          m.points = pts;
          core.draw();
        },
        end() {
          active = false;
          if (began) core.commit('Bend line');
        },
        cancel() {
          active = false;
          if (began) core.rollback();
        },
      };
    };

    const removeBendPoint = (kind: LineKind, id: string, j: number): void => {
      core.change('Remove bend point', () => {
        const m = core.ensure(kind, id);
        m.points = (m.points ?? []).filter((_, i) => i !== j);
        if (!m.points.length) delete m.points;
        core.tidy(kind, id);
      });
    };

    const resetEnd = (kind: LineKind, id: string, which: 'a' | 'b'): void => {
      core.change('Reset connector end', () => {
        const m = core.ensure(kind, id);
        if (which === 'a') {
          delete m.fromSide;
          delete m.fromAt;
        } else {
          delete m.toSide;
          delete m.toAt;
        }
        core.tidy(kind, id);
      });
    };

    offs.push(core.addGestureSource({
      id: 'connect',
      priority: 100,
      down(ev, hit) {
        if (core.mode.peek() !== 'edit' || core.tool.peek() === 'hand' || core.spaceDown || ev.button !== 0 || !hit.handle) return null;
        const h = hit.handle;
        const type = h.getAttribute('data-handle');
        let gst: Gesture | null = null;
        if (type === 'bend' || type === 'bendNew') {
          const kind = h.getAttribute('data-kind'), id = h.getAttribute('data-id') ?? '';
          if (!isLine(kind)) return null;
          if (bendPress.hit(`${kind}|${id}|${h.getAttribute('data-j')}`, ev, type === 'bend')) {
            removeBendPoint(kind, id, Number(h.getAttribute('data-j')));
            return NOOP;
          }
          gst = bendDrag(hit, h, kind, id);
        } else if (type === 'new') {
          const side = h.getAttribute('data-side') as Side | null;
          const kind = h.getAttribute('data-kind') as ItemKind | null;
          if (!side || !kind) return null;
          gst = newDrag(hit, side, { kind, id: h.getAttribute('data-id') ?? '' });
        } else if (type === 'end') {
          const s = core.primary();
          const which = h.getAttribute('data-end') === 'b' ? 'b' : 'a';
          if (!s || !isLine(s.kind)) return null;
          if (endPress.hit(`${s.kind}|${s.id}|${which}`, ev)) {
            resetEnd(s.kind, s.id, which);
            return NOOP;
          }
          gst = portDrag(hit, which, s.kind, s.id);
        }
        if (gst) {
          active = true;
          core.drawOverlay();
        }
        return gst;
      },
    }));

    // ---- hover ---------------------------------------------------------------------------------------------------

    const svg = core.dom.svg;
    const hoverConnect = (ev: PointerEvent, t: Element): void => {
      if (core.tool.peek() === 'hand' || core.tool.peek() === 'paint') return;
      if (t.closest('.conn-dot')) return;
      let it: Sel | null = null;
      const e = t.closest('.el');
      const kind = e?.getAttribute('data-kind') as ItemKind | null, id = e?.getAttribute('data-id') ?? '';
      if (e && kind && !e.hasAttribute('data-part') && canConnect(core, kind, id)) it = { kind, id };
      else if (core.hover) {
        const b = core.boxOf(core.hover), p = core.toDiagram(ev), m = 30 / core.viewport.state.k;
        if (b && Math.abs(p.x - b.x) <= b.w / 2 + m && Math.abs(p.y - b.y) <= b.h / 2 + m) it = core.hover;
      }
      if (!sameRef(it, core.hover)) {
        core.hover = it;
        core.drawOverlay();
      }
    };
    const hoverBend = (ev: PointerEvent, t: Element): void => {
      if (t.closest('[data-handle="bend"], [data-handle="bendNew"]')) return;
      const e = t.closest('.el.edge, .el.rel, .el.elabel');
      const kind = e?.getAttribute('data-kind');
      let it: ItemRef | null = e && isLine(kind) ? { kind, id: e.getAttribute('data-id') ?? '' } : null;
      // off the line but still close to one of its handles (a point can sit beside a right-angled line): keep them
      if (!it && hoverEdge) {
        const gm = edgeGeom(hoverEdge);
        const p = core.toDiagram(ev), near = 12 / core.viewport.state.k;
        if (gm && [...gm.mids, ...(gm.points ?? []).map(([x, y]) => ({ x, y }))].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < near)) return;
        it = null;
      }
      if (sameRef(it, hoverEdge)) return;
      hoverEdge = it;
      core.drawOverlay();
    };
    svg.addEventListener('pointermove', (ev) => {
      if (ev.buttons || busy() || core.mode.peek() !== 'edit' || !(ev.target instanceof Element)) return;
      hoverConnect(ev, ev.target);
      hoverBend(ev, ev.target);
    }, { signal: ac.signal });
    // a double press on a bend point / end handle is handled on pointerdown: the browser's own dblclick that follows
    // must not reach the text editor (it would edit the line's label)
    svg.addEventListener('dblclick', (ev) => {
      const onHandle = ev.target instanceof Element && ev.target.closest('[data-handle="bend"], [data-handle="bendNew"], [data-handle="end"]');
      if (onHandle || ev.timeStamp - Math.max(bendPress.at, endPress.at) < 800) {
        ev.stopImmediatePropagation();
        ev.preventDefault();
      }
    }, { capture: true, signal: ac.signal });
    offs.push(core.on('model', () => {
      hoverEdge = null;
    }));

    return () => {
      ac.abort();
      for (const off of offs) off();
      linking = null;
      magnets = null;
    };
  },
};
