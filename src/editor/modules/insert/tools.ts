// The Connector and Container tools of the insert dock (T05 §4.1), the insert module's lazy part: Connector — click
// a source, then a target (the kind's `connect`; the tool stays on for the next one, Esc ends it); Container — a frame
// drawn around items puts the outermost ones in a container (the kind's `group`, as ⌘G does).
import { el } from '../../../core/scene/build.js';
import type { SceneNode } from '../../../core/scene/types.js';
import type { ItemRef } from '../../../core/types.js';
import { registerMessages } from '../../../ui/i18n.js';
import { EDITOR_MEDIA_MESSAGES } from '../../../ui/messages/editor-media.js';
import type { EditorCore, Gesture, Sel } from '../../core.js';
import { editKind, withEdit } from '../../kinds/registry.js';
import type { ModuleScope } from '../../../view/module.js';
import { inArea, LINE_KINDS, selectable } from '../canvas/shared.js';

registerMessages(EDITOR_MEDIA_MESSAGES);

export const TOOLS_CSS = /* css */ `
.ins-frame { fill: rgba(79,70,229,.06); stroke: var(--accent); pointer-events: none; }
.ins-source { fill: none; stroke: var(--accent); pointer-events: none; }
.ed.tool-connect .canvas, .ed.tool-container .canvas { cursor: crosshair; }
`;

const NOOP: Gesture = { move: () => undefined };

/** Adds a connector between two items (the kind's `connect`), selecting it. */
function connectItems(core: EditorCore, from: ItemRef, to: ItemRef): boolean {
  const kind = editKind(core.model.type);
  const r = kind?.connect?.(core.code, from.id, to.id);
  if (!kind || !r) return false;
  const said = kind.connected ?? { label: 'Connect', toast: '' };
  if (!core.applyCode(r, said.label)) return false;
  const made = withEdit(core.model, (k, m) => k.added?.(m, from.id, to.id));
  if (made) core.select([made.ref]);
  return true;
}

export function activateTools(scope: ModuleScope<EditorCore>): void {
  const core = scope.core;
  const t = core.i18n.t;
  const kind = () => editKind(core.model.type);
  const editing = (): boolean => core.mode.peek() === 'edit' && !core.version.peek();
  let source: Sel | null = null;
  let frame: { x0: number; y0: number; x1: number; y1: number } | null = null;
  scope.effect(() => {
    const tl = core.tool();
    core.dom.root.classList.toggle('tool-connect', tl === 'connect');
    core.dom.root.classList.toggle('tool-container', tl === 'container');
    if (tl !== 'connect') source = null;
    frame = null;
    core.drawOverlay();
  });
  // ---- Connector tool: click a source, then a target (the tool stays on for the next one; Esc ends it) ------------
  core.addGestureSource({
    id: 'insert-tools',
    priority: 120,
    down(ev, hit) {
      if (!editing() || ev.button !== 0) return null;
      const tl = core.tool.peek();
      if (tl === 'connect') {
        const k = kind();
        const it = hit.item && k?.connectable?.includes(hit.item.kind) ? { kind: hit.item.kind, id: hit.item.id } : null;
        if (!it) {
          if (hit.item) core.toast(t('connect.notHere'));
          source = null;
          core.drawOverlay();
          return NOOP;
        }
        if (!source || (source.kind === it.kind && source.id === it.id)) {
          source = it;
          core.select([it]);
          core.toast(t('connect.target'));
        } else {
          const from = source;
          source = null;
          connectItems(core, from, it);
        }
        core.drawOverlay();
        return NOOP;
      }
      if (tl !== 'container') return null;
      // ---- Container tool: a frame drawn around the items to group
      const p0 = hit.p;
      const finish = (): void => {
        frame = null;
        core.drawOverlay();
      };
      return {
        move(dx, dy) {
          frame = { x0: p0.x, y0: p0.y, x1: p0.x + dx, y1: p0.y + dy };
          core.drawOverlay();
        },
        end() {
          const f = frame;
          finish();
          if (!f) return;
          const area = { x0: Math.min(f.x0, f.x1), x1: Math.max(f.x0, f.x1), y0: Math.min(f.y0, f.y1), y1: Math.max(f.y0, f.y1) };
          const inside = selectable(core).filter((x) => !LINE_KINDS.has(x.kind) && inArea(x, area, false)).map(({ kind: kd, id }) => ({ kind: kd, id }));
          // only the outermost items: what is inside a framed group goes with it
          const top = inside.filter((x) => !inside.some((g) => g.kind === 'group' && g.id !== x.id && core.insideGroup(x, g.id)));
          const ok = top.length ? withEdit(core.model, (k, m) => k.canGroup(m, top)) : null;
          if (!ok?.ok) {
            core.toast(ok?.reason ? t(ok.reason) : t('container.empty'));
            return;
          }
          core.select(top);
          core.run('setTool', 'pointer');
          void core.run('groupSelection');
        },
        cancel: finish,
        click: () => core.toast(t('container.draw')),
        threshold: 3,
      };
    },
  });
  core.addOverlay({
    id: 'insert-tools',
    order: 30,
    paint(k) {
      const out: SceneNode[] = [];
      if (frame) {
        const f = frame;
        out.push(el('rect', { class: 'ins-frame', x: Math.min(f.x0, f.x1), y: Math.min(f.y0, f.y1), width: Math.abs(f.x1 - f.x0), height: Math.abs(f.y1 - f.y0), rx: 8 / k, 'stroke-width': 1.5 / k, 'stroke-dasharray': `${6 / k} ${4 / k}` }, 'ins-frame'));
      }
      const b = source && core.tool.peek() === 'connect' ? core.boxOf(source) : null;
      if (b && !b.hidden) {
        const p = 6 / k;
        out.push(el('rect', { class: 'ins-source', x: b.x - b.w / 2 - p, y: b.y - b.h / 2 - p, width: b.w + 2 * p, height: b.h + 2 * p, rx: 6 / k, 'stroke-width': 2.5 / k }, 'ins-source'));
      }
      return out;
    },
  });

  scope.onDispose(() => core.dom.root.classList.remove('tool-connect', 'tool-container'));
}
