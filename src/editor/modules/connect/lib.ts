// Connections, the parts that are not the module's (5.5): creating a connector after a drag from a connection dot,
// re-attaching an end, a double press on a handle, and the small checks they share.
import { KIND_TO_COLL, type ItemMeta } from '../../../core/meta/types.js';
import { reparse } from '../../../core/parse/dispatch.js';
import { cloneMeta, ensure as ensureIn } from '../../../core/ops/meta-util.js';
import type { Side } from '../../../core/style.js';
import type { CenterBox, ItemRef, Point } from '../../../core/types.js';
import type { EditorCore, Gesture, Sel } from '../../core.js';
import { editKind, withEdit } from '../../kinds/registry.js';

export interface Linking {
  a: Point;
  b: Point;
  target: ItemRef | null;
  side?: Side;
  at?: number;
}

export interface Magnets {
  box: CenterBox & { shape?: string };
  side?: Side | undefined;
  at?: number | undefined;
}

export type LineKind = 'edge' | 'rel';
export const isLine = (k: string | null | undefined): k is LineKind => k === 'edge' || k === 'rel';

/** A second press on the same handle within 600 ms and 8 px (the prototype's double-click on handles). */
export class DoublePress {
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

export const NOOP: Gesture = { move: () => undefined };

/** Creates the connector after a drag from a connection dot (prototype `createConnection`). */
export function createConnection(core: EditorCore, src: ItemRef, fromSide: Side, tgt: ItemRef, toSide?: Side, toAt?: number): boolean {
  const kind = editKind(core.model.type);
  const r = kind?.connect?.(core.code, src.id, tgt.id);
  if (!kind || !r) return false;
  // a connection the type refuses (a state diagram's start has no incoming transitions…)
  const why = (r as { reason?: string }).reason;
  if (why) {
    core.toast(why);
    return false;
  }
  const M = reparse(r.code);
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
  const made = M.type === kind.type ? withEdit(M, (k, m) => k.added?.(m, src.id, tgt.id)) : null;
  if (made) {
    if (made.ports) ends(ensureIn(meta, made.ref.kind, made.ref.id));
    sel = made.ref;
  }
  const said = kind.connected ?? { label: 'Connect', toast: 'Connection added — style it with the toolbar' };
  const ok = core.applyCode({ code: r.code, meta }, said.label, { select: sel ? [sel] : [] });
  // A.13: inline edit exists, so the copy no longer sends the user to the Mermaid source
  if (ok) core.toast(said.toast);
  return ok;
}

/** Re-attaches end `which` of a connector to another item (prototype `reconnect`): line rewritten, style kept. */
export function reconnect(core: EditorCore, kind: LineKind, id: string, which: 'a' | 'b', target: ItemRef, side?: Side, at?: number): boolean {
  const M0 = core.model;
  const old: ItemMeta = { ...core.getM(kind, id) };
  const r = withEdit(M0, (k, m) => k.reconnect?.(core.code, m, { kind, id }, which, target.id)) ?? null;
  if (!r || r.code === core.code) return false;
  const meta = cloneMeta(core.meta);
  const coll = meta[KIND_TO_COLL[kind]] as Record<string, ItemMeta> | undefined;
  if (coll) delete coll[id];
  const M = reparse(r.code);
  const nid = withEdit(M, (k, m) => k.reconnected?.(m, r));
  if (nid === undefined) return core.applyCode({ code: r.code, meta }, 'Re-connect', { select: [] });
  const ne = { id: nid };
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