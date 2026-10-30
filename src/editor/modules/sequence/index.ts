// Sequence gestures (A.5 rows 45–48, 50): lifeline circle → new message / self message / process, message end
// circles → process to another message, process top / bottom handles, block edge handles (pull / push statements),
// note edge handles (span), participant ◀ ▶ swap arrows, two messages → Show as process.
// Ported from prototype/app.js `participantArrows`, `lifelineDrag`, `actEndDrag`, `actEdgeDrag`, `hoverSeq`,
// `seqDots`, `llBars`, `actPreviewSvg`, `seqLineAbove`, `seqAnchor`, `edgeAnchors`, `blockEdgeDrag`,
// `activationInfo`, `applyActivation`, `noteEdgeDrag`.
import type { SeqBlockStart, SeqMessage, SeqNote, SequenceModel } from '../../../core/model.js';
import { remapSequenceMeta } from '../../../core/ops/remap.js';
import { addActivation, addSeqMessageAt, moveActivationEdge, resizeBlockStep, setNoteSpan, toggleActivation } from '../../../core/ops/sequence.js';
import { parse } from '../../../core/parse/index.js';
import type { SequenceGeometry } from '../../../core/render/types.js';
import { el, g, text } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import type { Point } from '../../../core/types.js';
import type { EditorCore, Gesture, Hit, Sel } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { sizeBadge } from '../canvas/shared.js';
import { elementsAt } from '../connect/geometry.js';
import { SEQUENCE_CSS } from './css.js';

interface SeqLinking {
  a: Point;
  b: Point;
  target: string | null;
  self?: boolean;
}

interface ActPreview {
  x: number;
  y0: number;
  y1: number;
  target?: string | undefined;
}

const NOOP: Gesture = { move: () => undefined };

const seqModel = (core: EditorCore): SequenceModel | null => (core.model.type === 'sequence' ? core.model : null);
const seqGeom = (core: EditorCore): SequenceGeometry | null => (core.geom.type === 'sequence' ? core.geom : null);

/** The processes of a participant that cover height y. */
export function llBars(core: EditorCore, pid: string, y: number): { x: number; y0: number; y1: number; w: number }[] {
  const gm = seqGeom(core);
  return gm ? [...gm.activations.values()].filter((a) => a.participant === pid && y >= a.y0 && y <= a.y1) : [];
}

/** Source line after which something dropped at height y belongs (last statement above it). */
export function seqLineAbove(core: EditorCore, y: number): number | null {
  const M = seqModel(core), gm = seqGeom(core);
  if (!M || !gm) return null;
  let best: { line: number; y: number } | null = null;
  const take = (line: number | undefined, yy: number | undefined): void => {
    if (line != null && yy != null && yy < y && (!best || yy > best.y)) best = { line, y: yy };
  };
  for (const it of M.items) {
    if (it.kind === 'message') take(it.src, gm.messages.get(it.id)?.y);
    else if (it.kind === 'note') take(it.src, gm.notes.get(it.id)?.y);
    else if (it.kind === 'blockStart') {
      const b = gm.blocks.get(it.id);
      if (b) {
        take(it.src, b.y0 + 30);
        take(it.lines[it.lines.length - 1], b.y1);
      }
    }
  }
  return (best as { line: number } | null)?.line ?? null;
}

/** Height of the statement on line j (undefined: a non-visual line, keep scanning). */
function seqAnchor(core: EditorCore, j: number): number | null | undefined {
  const M = seqModel(core)!, gm = seqGeom(core)!;
  const blk = M.items.find((x): x is SeqBlockStart => x.kind === 'blockStart' && (x.src === j || x.lines[x.lines.length - 1] === j));
  if (blk) {
    const b = gm.blocks.get(blk.id);
    return b ? (b.y0 + b.y1) / 2 : null;
  }
  const it = M.items.find((x): x is SeqMessage | SeqNote => x.src === j && (x.kind === 'message' || x.kind === 'note'));
  if (!it) return undefined;
  return (it.kind === 'message' ? gm.messages.get(it.id)?.y : gm.notes.get(it.id)?.y) ?? null;
}

/** Heights where a block edge pulls in the next statement outside (`out`) or pushes out the last inside (`inn`). */
export function edgeAnchors(core: EditorCore, id: string, edge: 'top' | 'bottom'): { out?: number | null; inn?: number | null } {
  const M = seqModel(core);
  const it = M?.items.find((x) => x.kind === 'blockStart' && x.id === id);
  if (!M || !it || it.kind !== 'blockStart') return {};
  const L = core.code.split('\n');
  const s = it.src, e = it.lines[it.lines.length - 1]!;
  const isBlockStartAt = (j: number): boolean => M.items.some((x) => x.kind === 'blockStart' && x.src === j);
  const scan = (from: number, dir: number, stop: (t: string, j: number) => boolean): number | null => {
    for (let j = from; j >= 0 && j < L.length; j += dir) {
      const t = (L[j] ?? '').trim();
      if (!t || t.startsWith('%%')) continue;
      if (stop(t, j)) return null;
      const a = seqAnchor(core, j);
      if (a !== undefined) return a;
    }
    return null;
  };
  const outerStop = (t: string): boolean => /^(sequenceDiagram|participant|actor|box|title|autonumber|else|and|option)\b/.test(t);
  if (edge === 'bottom')
    return {
      out: scan(e + 1, +1, (t, j) => (t === 'end' && !isBlockStartAt(j)) || /^(else|and|option)\b/.test(t)),
      inn: scan(e - 1, -1, (t, j) => j <= s || /^(else|and|option)\b/.test(t)),
    };
  return {
    out: scan(s - 1, -1, (t, j) => outerStop(t) || M.items.some((x) => x.kind === 'blockStart' && x.src === j && x.lines[x.lines.length - 1]! > s)),
    inn: scan(s + 1, +1, (t, j) => j >= e || /^(else|and|option)\b/.test(t)),
  };
}

/** Replaces the code inside an open transaction (live gesture preview), carrying positional metadata along. */
function liveCode(core: EditorCore, code: string): void {
  const oldModel = core.model, oldCode = core.code;
  core.store.code.set(code);
  const M = core.model;
  if (oldModel.type === 'sequence' && M.type === 'sequence') core.store.meta.set(remapSequenceMeta(core.meta, oldModel, oldCode, M, code));
}

/** Two selected messages → can they become a process (`activationInfo`)? */
export function activationInfo(core: EditorCore): { participant?: string; removed?: boolean; reason?: string } | null {
  const sel = core.selection(), M = seqModel(core);
  if (!M || sel.length !== 2 || sel.some((x) => x.kind !== 'message')) return null;
  const r = toggleActivation(core.code, M, sel[0]!.id, sel[1]!.id);
  if (r.reason) return { reason: r.reason };
  const out: { participant?: string; removed?: boolean } = {};
  if (r.participant !== undefined) out.participant = r.participant;
  if (r.removed !== undefined) out.removed = r.removed;
  return out;
}

/** Two selected messages → a process on their shared participant, or removes it (`applyActivation`). */
export function applyActivation(core: EditorCore): void {
  const sel = core.selection(), M = seqModel(core);
  if (!M || sel.length !== 2) return;
  const r = toggleActivation(core.code, M, sel[0]!.id, sel[1]!.id);
  if (r.reason) {
    core.toast(r.reason);
    return;
  }
  core.applyCode(r, r.removed ? 'Remove process' : 'Show as process', { select: sel });
  core.toast(r.removed ? `Process on ${r.participant ?? ''} removed` : `${r.participant ?? ''} is now active between the two messages`);
}

export const sequenceModule: EditorModule = {
  id: 'sequence',
  css: SEQUENCE_CSS,
  install(core) {
    const ac = new AbortController();
    const offs: (() => void)[] = [];
    let linking: SeqLinking | null = null;
    let actPreview: ActPreview | null = null;
    let llHover: { id: string; y: number } | null = null;
    let hoverMsg: string | null = null;
    let active = false;
    // an edge handle of a note / block / process is being dragged: its size shows under it
    let sizing = false;
    const busy = (): boolean => active || core.dragging;

    offs.push(core.provide('applyActivation', () => applyActivation(core)));
    offs.push(core.provide('activationInfo', () => activationInfo(core)));

    // ---- painters ------------------------------------------------------------------------------------------------

    /** ◀ ▶ next to the selected participant: swap it with its neighbour. */
    const participantArrows = (b: { x: number; y: number; w: number }, s: Sel, k: number): SceneNode[] => {
      const M = seqModel(core);
      if (!M || core.selection().length !== 1 || !core.isSelected(s)) return [];
      const r = 11 / k, off = 20 / k;
      const order = M.participants.map((p) => p.id), i = order.indexOf(s.id);
      return ([[-1, b.x - b.w / 2 - off], [1, b.x + b.w / 2 + off]] as const).map(([dir, x]) => {
        const can = i + dir >= 0 && i + dir < order.length;
        const a = 4.2 / k, y = b.y;
        const tri = dir < 0
          ? `M${x + a * 0.6},${y - a} L${x - a * 0.8},${y} L${x + a * 0.6},${y + a} Z`
          : `M${x - a * 0.6},${y - a} L${x + a * 0.8},${y} L${x - a * 0.6},${y + a} Z`;
        return g({ class: can ? 'pmove' : 'pmove off', 'data-handle': 'pmove', 'data-dir': dir }, [
          el('circle', { cx: x, cy: y, r, 'stroke-width': 1.6 / k }),
          el('path', { d: tri }),
        ], { key: `seq:pmove:${dir}` });
      });
    };

    /** Edge handles of the selected note (left / right), block (top / bottom) or process (top / bottom). */
    const edgeHandles = (s: Sel, k: number): SceneNode[] => {
      const b = core.boxOf(s);
      if (!b || b.hidden) return [];
      const out: SceneNode[] = [];
      if (s.kind === 'note') {
        const hw = 9 / k, hh = Math.min(30 / k, b.h * 0.8);
        for (const [edge, x] of [['left', b.x - b.w / 2], ['right', b.x + b.w / 2]] as const)
          out.push(el('rect', { class: 'nedge', 'data-handle': 'nedge', 'data-edge': edge, x: x - hw / 2, y: b.y - hh / 2, width: hw, height: hh, rx: hw / 2, 'stroke-width': 1.5 / k }, `seq:nedge:${edge}`));
      } else if (s.kind === 'block' || s.kind === 'activation') {
        const [hw, hh, handle] = s.kind === 'block' ? [44 / k, 9 / k, 'bedge'] : [22 / k, 8 / k, 'aedge'];
        for (const [edge, y] of [['top', b.y - b.h / 2], ['bottom', b.y + b.h / 2]] as const)
          out.push(el('rect', { class: 'bedge', 'data-handle': handle, 'data-edge': edge, x: b.x - hw / 2, y: y - hh / 2, width: hw, height: hh, rx: hh / 2, 'stroke-width': 1.5 / k }, `seq:${handle}:${edge}`));
      }
      return out;
    };

    /** Hover circle on a lifeline, and the end circles of the hovered / selected message. */
    const seqDots = (k: number): SceneNode[] => {
      const M = seqModel(core), gm = seqGeom(core);
      if (!M || !gm) return [];
      const r = 5.5 / k, out: SceneNode[] = [];
      const L = llHover, pg = gm.participants.get(L?.id ?? '');
      if (L && pg) {
        const dot = (cx: number, side: 'l' | 'r' | null): SceneNode =>
          g({ class: 'll-dot', 'data-handle': 'lifeline', 'data-id': L.id, 'data-side': side ?? undefined }, [
            el('circle', { cx, cy: L.y, r: r * 2, fill: 'transparent', stroke: 'none' }),
            el('circle', { class: 'll-dot-c', cx, cy: L.y, r, 'stroke-width': 1.6 / k }),
          ], { key: `seq:ll:${L.id}:${side ?? ''}` });
        // over a process: no circle inside the bar — one on each side that has participants, to draw a message from there
        const bars = llBars(core, L.id, L.y);
        if (bars.length) {
          const order = M.participants.map((p) => p.id), i = order.indexOf(L.id), gap = r * 2.2;
          const pad = 9; // the bars' hover area (act-hit in the renderer): the circles sit just outside it
          const left = Math.min(...bars.map((a) => a.x - a.w / 2)) - pad, right = Math.max(...bars.map((a) => a.x + a.w / 2)) + pad;
          if (i > 0) out.push(dot(left - gap, 'l'));
          if (i < order.length - 1) out.push(dot(right + gap, 'r'));
        } else out.push(dot(pg.x, null));
      }
      const p = core.primary();
      const ids = new Set([hoverMsg, p?.kind === 'message' ? p.id : null].filter((x): x is string => !!x));
      for (const id of ids) {
        const it = M.items.find((x) => x.kind === 'message' && x.id === id), mg = gm.messages.get(id);
        if (!it || it.kind !== 'message' || !mg || it.from === it.to) continue;
        for (const [pid, ex] of [[it.from, mg.x0], [it.to, mg.x1]] as const)
          out.push(g({ class: 'act-dot', 'data-handle': 'actend', 'data-msg': id, 'data-pid': pid }, [
            el('circle', { cx: ex, cy: mg.y, r: r * 2, fill: 'transparent', stroke: 'none' }),
            el('circle', { class: 'act-dot-c', cx: ex, cy: mg.y, r, 'stroke-width': 1.6 / k }),
          ], { key: `seq:act:${id}:${pid}` }));
      }
      return out;
    };

    const actPreviewSvg = (k: number): SceneNode[] => {
      const P = actPreview!;
      const w = Number((core.result.theme.sequence?.activation as { w?: unknown } | undefined)?.w) || 10;
      const y = Math.min(P.y0, P.y1), h = Math.max(2, Math.abs(P.y1 - P.y0));
      return [
        el('rect', { class: 'act-preview', x: P.x - w / 2, y, width: w, height: h, 'stroke-width': 1.5 / k, 'stroke-dasharray': `${4 / k} ${3 / k}` }),
        ...sizeBadge({ x: P.x, y: y + h / 2, w, h }, k),
      ];
    };

    const linkPreview = (k: number): SceneNode[] => {
      const L = linking!;
      if (L.self) {
        // the loop a self-message is drawn as (same proportions as the renderer)
        const x = L.a.x, y = L.a.y;
        return [
          el('path', { class: 'link-preview', d: `M${x},${y} H${x + 40} Q${x + 54},${y} ${x + 54},${y + 12} Q${x + 54},${y + 24} ${x + 40},${y + 24} H${x + 2}`, fill: 'none', 'stroke-width': 2 / k, 'stroke-dasharray': `${6 / k} ${4 / k}` }),
          text({ class: 'link-hint', x: x + 62, y: y + 16, 'font-size': 12 / k }, [{ text: 'to itself', x: x + 62, y: y + 16 }]),
        ];
      }
      return [
        el('path', { class: 'link-preview', d: `M${L.a.x},${L.a.y} L${L.b.x},${L.b.y}`, 'stroke-width': 2 / k, 'stroke-dasharray': `${6 / k} ${4 / k}` }),
        el('circle', { class: 'link-tip', cx: L.b.x, cy: L.b.y, r: 4 / k }),
      ];
    };

    offs.push(core.addOverlay({
      id: 'sequence',
      exclusive: () => !!linking || !!actPreview,
      order: 80,
      paint(k) {
        if (!seqModel(core)) return [];
        if (linking) return linkPreview(k);
        if (actPreview) return actPreviewSvg(k);
        const out: SceneNode[] = [];
        const s = core.primary();
        if (s) {
          if (s.kind === 'participant') {
            const b = core.boxOf(s);
            if (b && !b.hidden) out.push(...participantArrows(b, s, k));
          } else out.push(...edgeHandles(s, k));
          const b = sizing ? core.boxOf(s) : null;
          if (b && !b.hidden) out.push(...sizeBadge(b, k));
        }
        if (!busy()) out.push(...seqDots(k));
        return out;
      },
    }));

    // ---- gestures ------------------------------------------------------------------------------------------------

    /** Selects the new message and opens its text (prototype `focusLabel`). */
    const focusLabel = (it: Sel): void => {
      setTimeout(() => {
        if (!core.isSelected(it)) return;
        if (!core.run('inlineEdit', it)) core.run('setPanel', 'properties', true);
      }, 0);
    };

    /**
     * Drag from a participant's lifeline (its hover circle): sideways to another participant → a new message at that
     * height; up or down → a process (activation bar) over the messages it spans.
     */
    const lifelineDrag = (hit: Hit, srcId: string): Gesture | null => {
      const gm = seqGeom(core);
      const pg = gm?.participants.get(srcId);
      if (!gm || !pg) return null;
      const p0 = hit.p, x = pg.x;
      // from a side circle of a process: the arrow starts at the bar's edge, at the circle's height
      const sideC = hit.handle?.hasAttribute('data-side') ? hit.handle.querySelector('circle') : null;
      const a = sideC ? { x: Number(sideC.getAttribute('cx')), y: Number(sideC.getAttribute('cy')) } : { x, y: p0.y };
      llHover = null;
      let mode: 'act' | 'msg' | null = null;
      const targetUnder = (ev: PointerEvent): string | null => {
        for (const n of elementsAt(core, ev)) {
          const h = n.closest('[data-handle="lifeline"]') ?? n.closest('.el[data-kind="participant"]');
          const id = h?.getAttribute('data-id');
          if (id && id !== srcId) return id;
        }
        return null;
      };
      const done = (): void => {
        active = false;
        linking = null;
        actPreview = null;
      };
      return {
        move(dx, dy, ev) {
          const k = core.viewport.state.k;
          // the first 8px decide: mostly vertical = a process, otherwise a message
          if (!mode) {
            if (Math.hypot(dx, dy) * k < 8) return;
            mode = Math.abs(dy) > Math.abs(dx) ? 'act' : 'msg';
          }
          if (mode === 'act') {
            actPreview = { x, y0: a.y, y1: a.y + dy };
            core.drawOverlay();
            return;
          }
          const b = { x: p0.x + dx, y: p0.y + dy };
          // snap to a lifeline the pointer is near (within ~40px on screen), not only when exactly over it
          let t = targetUnder(ev);
          if (!t) {
            let best: { pid: string; d: number } | null = null;
            for (const [pid, q] of gm.participants)
              if (pid !== srcId && !q.hidden && (!best || Math.abs(q.x - b.x) < best.d)) best = { pid, d: Math.abs(q.x - b.x) };
            if (best && best.d * k < 40) t = best.pid;
          }
          // let go close to the start (no other participant under the pointer): a message back to the same lifeline
          const near = Math.abs(dx) * k < 110 && Math.abs(dy) * k < 80;
          const tx = t ? gm.participants.get(t)?.x : undefined;
          linking = t && tx !== undefined ? { a, b: { x: tx, y: a.y }, target: t } : near ? { a, b, target: srcId, self: true } : { a, b, target: null };
          core.drawOverlay();
        },
        end() {
          const P = actPreview, L = linking;
          done();
          const M = seqModel(core);
          if (!M) return;
          if (mode === 'act') {
            if (!P) return;
            const r = addActivation(core.code, M, srcId, seqLineAbove(core, Math.min(P.y0, P.y1)), seqLineAbove(core, Math.max(P.y0, P.y1)));
            if (r.reason) {
              core.toast(r.reason);
              return;
            }
            core.applyCode(r, 'Add process', { select: null });
            core.toast(`Process added on ${srcId}`);
            return;
          }
          if (!L?.target) return;
          const r = addSeqMessageAt(core.code, M, srcId, L.target, seqLineAbove(core, a.y));
          const N = parse(r.code);
          const msg = N.type === 'sequence' ? N.items.find((x): x is SeqMessage => x.kind === 'message' && x.src === r.line) : undefined;
          const sel: Sel | null = msg ? { kind: 'message', id: msg.id } : null;
          if (core.applyCode(r, 'Add message', { select: sel ? [sel] : null }) && sel) focusLabel(sel);
        },
        cancel: done,
      };
    };

    /** Drag a message end up or down to another message: a process on that end's participant between the two. */
    const actEndDrag = (msgId: string, pid: string): Gesture | null => {
      const gm = seqGeom(core), M = seqModel(core);
      const pg = gm?.participants.get(pid), m0 = gm?.messages.get(msgId);
      if (!gm || !M || !pg || !m0) return null;
      const x = pg.x, y0 = m0.y;
      // the message whose arrow is nearest to y (any message — the process may end on a message of another participant)
      const nearest = (y: number): { id: string; y: number } | null => {
        let best: { id: string; y: number } | null = null;
        for (const it of M.items) {
          if (it.kind !== 'message') continue;
          const mg = gm.messages.get(it.id);
          if (mg && it.id !== msgId && (!best || Math.abs(mg.y - y) < Math.abs(best.y - y))) best = { id: it.id, y: mg.y };
        }
        return best;
      };
      return {
        move(_dx, dy) {
          const t = nearest(y0 + dy);
          actPreview = { x, y0, y1: t ? t.y : y0 + dy, target: t?.id };
          core.drawOverlay();
        },
        end() {
          const t = actPreview?.target;
          actPreview = null;
          active = false;
          const Mn = seqModel(core);
          if (!t || !Mn) return;
          const r = toggleActivation(core.code, Mn, msgId, t, pid);
          if (r.reason) {
            core.toast(r.reason);
            return;
          }
          core.applyCode(r, r.removed ? 'Remove process' : 'Add process', { select: null });
          core.toast(r.removed ? `Process removed from ${pid}` : `Process added on ${pid}`);
        },
        cancel() {
          actPreview = null;
          active = false;
        },
      };
    };

    /** Drag the top / bottom handle of the selected process: it snaps to the nearest message arrow. */
    const actEdgeDrag = (id: string, edge: 'top' | 'bottom'): Gesture | null => {
      const gm = seqGeom(core), M = seqModel(core);
      const b = gm?.activations.get(id);
      if (!gm || !M || !b) return null;
      const fixed = edge === 'top' ? b.y1 : b.y0;
      return {
        move(_dx, dy) {
          const y = (edge === 'top' ? b.y0 : b.y1) + dy;
          let best: { id: string; y: number } | null = null;
          for (const it of M.items) {
            if (it.kind !== 'message') continue;
            const mg = gm.messages.get(it.id);
            if (mg && (edge === 'top' ? mg.y < fixed : mg.y > fixed) && (!best || Math.abs(mg.y - y) < Math.abs(best.y - y))) best = { id: it.id, y: mg.y };
          }
          actPreview = { x: b.x, y0: fixed, y1: best ? best.y : y, target: best?.id };
          core.drawOverlay();
        },
        end() {
          const P = actPreview;
          actPreview = null;
          active = false;
          const Mn = seqModel(core);
          if (!P?.target || !Mn) return;
          const r = moveActivationEdge(core.code, Mn, id, edge, P.target);
          if (r.reason) {
            core.toast(r.reason);
            return;
          }
          if (r.code === core.code) return;
          core.applyCode(r, 'Resize process', { select: null });
          // keep the process selected: the one on that participant whose moved edge is nearest the target arrow
          const gn = seqGeom(core);
          let pick: { id: string; dist: number } | null = null;
          for (const [aid, ag] of gn?.activations ?? []) {
            if (ag.participant !== r.participant) continue;
            const dist = Math.abs((edge === 'top' ? ag.y0 : ag.y1) - P.y1) + Math.abs((edge === 'top' ? ag.y1 : ag.y0) - fixed);
            if (!pick || dist < pick.dist) pick = { id: aid, dist };
          }
          if (pick) core.select([{ kind: 'activation', id: pick.id }]);
        },
        cancel() {
          actPreview = null;
          active = false;
        },
      };
    };

    /**
     * Resize a block by dragging its top / bottom edge. The edge snaps one statement at a time: past the middle of the
     * next statement outside it is pulled in, past the middle of the last statement inside it is pushed out.
     */
    const blockEdgeDrag = (hit: Hit, startId: string, edge: 'top' | 'bottom'): Gesture => {
      let id = startId, began = false, reason: string | undefined;
      const p0 = hit.p;
      return {
        move(_dx, dy) {
          const y = p0.y + dy;
          for (let n = 0; n < 40; n++) {
            const { out, inn } = edgeAnchors(core, id, edge);
            let grow: boolean | null;
            if (edge === 'bottom') grow = out != null && y > out ? true : inn != null && y < inn ? false : null;
            else grow = out != null && y < out ? true : inn != null && y > inn ? false : null;
            if (grow === null) break;
            const M = seqModel(core);
            if (!M) break;
            const r = resizeBlockStep(core.code, M, id, edge, grow);
            if (r.code === core.code) {
              reason = r.reason;
              break;
            }
            if (!began) {
              core.begin();
              began = true;
            }
            reason = undefined;
            liveCode(core, r.code);
            const Mn = seqModel(core);
            const blk = Mn?.items.find((x): x is SeqBlockStart => x.kind === 'blockStart' && x.src === r.start);
            if (!blk) break;
            id = blk.id;
            core.select([{ kind: 'block', id }]);
            core.draw();
          }
        },
        end() {
          active = false;
          if (began) core.commit('Resize block');
          if (reason) core.toast(reason);
        },
        cancel() {
          active = false;
          if (began) core.rollback();
        },
      };
    };

    /** Stretch a note over several participants (left / right edge handles). */
    const noteEdgeDrag = (hit: Hit, id: string, edge: 'left' | 'right'): Gesture => {
      let began = false;
      const p0 = hit.p;
      return {
        move(dx) {
          const M = seqModel(core), gm = seqGeom(core);
          const note = M?.items.find((x) => x.kind === 'note' && x.id === id);
          if (!M || !gm || !note || note.kind !== 'note') return;
          const order = M.participants.filter((p) => gm.participants.has(p.id)).map((p) => ({ id: p.id, x: gm.participants.get(p.id)!.x }));
          if (!order.length) return;
          const idx = (pid: string): number => order.findIndex((o) => o.id === pid);
          const span = note.targets.map(idx).filter((i) => i >= 0);
          if (!span.length) return;
          let lo = Math.min(...span), hi = Math.max(...span);
          const x = p0.x + dx;
          const nearest = order.reduce((best, o, i) => (Math.abs(o.x - x) < Math.abs(order[best]!.x - x) ? i : best), 0);
          if (edge === 'left') lo = Math.min(nearest, hi);
          else hi = Math.max(nearest, lo);
          const r = setNoteSpan(core.code, M, id, order[lo]!.id, order[hi]!.id);
          if (r.code === core.code) return;
          if (!began) {
            core.begin();
            began = true;
          }
          liveCode(core, r.code);
          core.draw();
        },
        end() {
          active = false;
          if (began) core.commit('Stretch note');
        },
        cancel() {
          active = false;
          if (began) core.rollback();
        },
      };
    };

    offs.push(core.addGestureSource({
      id: 'sequence',
      priority: 90,
      down(ev, hit) {
        if (core.mode.peek() !== 'edit' || core.tool.peek() === 'hand' || core.spaceDown || ev.button !== 0 || !hit.handle || !seqModel(core)) return null;
        const h = hit.handle;
        const type = h.getAttribute('data-handle');
        const s = core.primary();
        let gst: Gesture | null = null;
        if (type === 'pmove') {
          core.run('moveSelection', Number(h.getAttribute('data-dir')) < 0 ? -1 : 1);
          return NOOP;
        }
        if (type === 'lifeline') gst = lifelineDrag(hit, h.getAttribute('data-id') ?? '');
        else if (type === 'actend') gst = actEndDrag(h.getAttribute('data-msg') ?? '', h.getAttribute('data-pid') ?? '');
        else if (type === 'aedge' && s?.kind === 'activation') gst = actEdgeDrag(s.id, h.getAttribute('data-edge') === 'bottom' ? 'bottom' : 'top');
        else if (type === 'bedge' && s?.kind === 'block') gst = blockEdgeDrag(hit, s.id, h.getAttribute('data-edge') === 'bottom' ? 'bottom' : 'top');
        else if (type === 'nedge' && s?.kind === 'note') gst = noteEdgeDrag(hit, s.id, h.getAttribute('data-edge') === 'right' ? 'right' : 'left');
        if (gst && (type === 'bedge' || type === 'nedge')) {
          const inner = gst;
          const done = (): void => {
            sizing = false;
            core.drawOverlay();
          };
          gst = {
            move(dx, dy, ev) {
              sizing = true;
              inner.move(dx, dy, ev);
              core.drawOverlay();
            },
            end(ev) {
              inner.end?.(ev);
              done();
            },
            cancel() {
              inner.cancel?.();
              done();
            },
          };
        }
        if (gst) {
          active = true;
          core.drawOverlay();
        }
        return gst;
      },
    }));

    // ---- hover (prototype hoverSeq) ------------------------------------------------------------------------------

    const svg = core.dom.svg;
    const clear = (): void => {
      if (llHover || hoverMsg) {
        llHover = null;
        hoverMsg = null;
        core.drawOverlay();
      }
    };
    svg.addEventListener('pointermove', (ev) => {
      if (ev.buttons || busy()) return;
      const gm = seqGeom(core);
      if (!gm || core.mode.peek() !== 'edit' || core.tool.peek() !== 'pointer' || !(ev.target instanceof Element)) {
        clear();
        return;
      }
      const t = ev.target;
      let ll: { id: string; y: number } | null = null, msg: string | null = null;
      const dot = t.closest('[data-handle="actend"]');
      if (dot) msg = dot.getAttribute('data-msg');
      else {
        const m = t.closest('.el.message');
        if (m) msg = m.getAttribute('data-id');
        const h = !m ? t.closest('[data-handle="lifeline"]') : null;
        const bar = !m && !h ? t.closest('.el.activation') : null;
        const y = core.toDiagram(ev).y;
        if (h) ll = { id: h.getAttribute('data-id') ?? '', y: h.hasAttribute('data-side') ? llHover?.y ?? y : y };
        else if (bar) ll = { id: gm.activations.get(bar.getAttribute('data-id') ?? '')?.participant ?? '', y };
        if (ll && !ll.id) ll = null;
      }
      const same = llHover?.id === ll?.id && Math.abs((llHover?.y ?? 0) - (ll?.y ?? 0)) < 0.5 && hoverMsg === msg;
      if (same) return;
      llHover = ll;
      hoverMsg = msg;
      core.drawOverlay();
    }, { signal: ac.signal });
    svg.addEventListener('pointerleave', () => {
      if (!busy()) clear();
    }, { signal: ac.signal });
    offs.push(core.on('model', () => {
      llHover = null;
      hoverMsg = null;
    }));

    return () => {
      ac.abort();
      for (const off of offs) off();
      linking = null;
      actPreview = null;
    };
  },
};
