// Canvas structure (A.3 rows 29, 33, 35, 36, 37, 39): delete, group / ungroup, copy / paste / duplicate with the
// clipboard of §8.2, align / distribute, unlock all, ⌘[ / ⌘] and the board's right-click menu (Paste, Unlock all,
// disabled "Nothing to paste"). Ported from prototype app.js (`deleteSelection`, `canGroup`, `groupSelection`,
// `ungroupSelection`, `copySelection`, `pasteable`, `pasteAt`, `duplicateSelection`, `unlockAll`,
// `arrangeSelection`, `moveSelection`, `showContextMenu`).
import { KIND_TO_COLL } from '../../../core/meta/types.js';
import type { DiagramModel } from '../../../core/model.js';
import {
  alignItems, boxParticipants, cloneMeta, copyItems, deleteER, deleteFlow, deleteSeq, duplicateItems, edgeText, groupFlow,
  lockedItems, moveOrder, nodeDef, pasteable, pasteItems, relabelBox, relabelGroup, relText, removeActivation, ungroupFlow,
  unboxParticipants, unlockAll as unlockAllOp, type AlignOp, type ClipboardData,
} from '../../../core/ops/index.js';
import type { ItemRef } from '../../../core/types.js';
import { h } from '../../../ui/h.js';
import { formatKeys } from '../../../ui/shortcuts.js';
import type { EditorActions, EditorCore, Sel } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { items as nItems } from './shared.js';

export const STRUCTURE_CSS = /* css */ `
.ctx-menu { min-width: 190px; padding: 5px; background: var(--float); border: 1px solid var(--float-line); border-radius: 10px;
  box-shadow: 0 10px 30px rgba(20,30,60,.2); }
.ctx-menu .ctx-item { display: flex; align-items: center; gap: 12px; width: 100%; border: 0; background: none; text-align: left; padding: 6px 10px; border-radius: 7px; color: var(--ink); }
.ctx-item span { flex: 1; }
.ctx-item kbd { border: 0; background: none; color: var(--muted); font-size: 11px; font-family: inherit; }
.ctx-menu .ctx-item:hover:not(:disabled), .ctx-menu .ctx-item:focus-visible { background: var(--float-2); box-shadow: none; }
.ctx-item:disabled { color: var(--muted); cursor: default; }
`;

/** Clipboard MIME type of the editor's own format (§8.2); `web ` prefix = custom format of the async clipboard API. */
export const MMDX_CLIPBOARD_TYPE = 'web application/x-mmdx+json';

/** A Mermaid fragment for the copied items, so pasting into other apps produces useful text (§8.2). */
export function mermaidFragment(model: DiagramModel, code: string, refs: readonly ItemRef[]): string {
  const L = code.split('\n');
  if (model.type === 'flowchart') {
    const out = [`flowchart ${model.direction}`];
    const ids = new Set<string>();
    const emitNode = (id: string, ind: string): void => {
      const n = model.nodes.get(id);
      if (!n || ids.has(id)) return;
      ids.add(id);
      out.push(ind + nodeDef(n));
    };
    const emitGroup = (gid: string, ind: string, guard: number): void => {
      const g = model.groups.get(gid);
      if (!g || ids.has(gid) || guard > 64) return;
      ids.add(gid);
      out.push(`${ind}subgraph ${gid}["${g.label.replace(/"/g, '#quot;')}"]`);
      for (const c of g.children) {
        if (model.groups.has(c)) emitGroup(c, `${ind}  `, guard + 1);
        else emitNode(c, `${ind}  `);
      }
      out.push(`${ind}end`);
    };
    for (const r of refs) {
      if (r.kind === 'group') emitGroup(r.id, '  ', 0);
      else if (r.kind === 'node') emitNode(r.id, '  ');
    }
    for (const e of model.edges) if (ids.has(e.from) && ids.has(e.to)) out.push(`  ${edgeText(e, e.from, e.to)}`);
    return `${out.join('\n')}\n`;
  }
  if (model.type === 'er') {
    const out = ['erDiagram'];
    const ids = new Set<string>();
    for (const r of refs) {
      const e = r.kind === 'entity' ? model.entities.get(r.id) : undefined;
      if (!e || ids.has(e.id)) continue;
      ids.add(e.id);
      if (e.defLine !== undefined && e.endLine !== undefined && e.endLine >= e.defLine) out.push(...L.slice(e.defLine, e.endLine + 1));
      else out.push(`  ${e.id}`);
    }
    for (const r of model.rels) if (ids.has(r.from) && ids.has(r.to)) out.push(`  ${relText(r, r.from, r.to)}`);
    return `${out.join('\n')}\n`;
  }
  return '';
}

/** Best effort: the system clipboard gets plain Mermaid text and the editor's own format. */
async function writeSystemClipboard(text: string, json: string): Promise<void> {
  const cb = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (!cb) return;
  try {
    const CI = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (CI && cb.write) {
      try {
        await cb.write([new CI({ 'text/plain': new Blob([text], { type: 'text/plain' }), [MMDX_CLIPBOARD_TYPE]: new Blob([json], { type: 'application/x-mmdx+json' }) })]);
        return;
      } catch {
        // custom web formats unsupported: plain text only
      }
    }
    await cb.writeText?.(text);
  } catch {
    // no permission / not focused: the in-memory buffer stays the source of truth
  }
}

const ALIGN: Record<Parameters<EditorActions['arrange']>[0], AlignOp> = {
  left: 'left', center: 'hcenter', right: 'right', top: 'top', middle: 'vcenter', bottom: 'bottom', hdist: 'hdist', vdist: 'vdist',
};

export const canvasStructureModule: EditorModule = {
  id: 'canvas-structure',
  css: STRUCTURE_CSS,
  install(core: EditorCore) {
    const ac = new AbortController();
    const offs: (() => void)[] = [];
    /** The copy buffer (UI state, never saved): the source of truth for paste. */
    let clip: ClipboardData | null = null;
    const editing = (): boolean => core.mode.peek() === 'edit';

    // ---- delete ------------------------------------------------------------------------------------------------

    const deleteSelection = (): void => {
      const sel = core.selection();
      if (!sel.length) return;
      const M = core.model;
      if (sel.length === 1 && sel[0]!.kind === 'activation') {
        if (M.type !== 'sequence') return;
        const r = removeActivation(core.code, M, sel[0]!.id);
        if (r.reason) {
          core.toast(r.reason);
          return;
        }
        if (core.applyCode(r, 'Delete', { select: null })) core.toast(`Process on ${r.participant ?? ''} removed — ⌘/Ctrl+Z to undo`);
        return;
      }
      const res = M.type === 'flowchart' ? deleteFlow(core.code, M, sel) : M.type === 'er' ? deleteER(core.code, M, sel) : M.type === 'sequence' ? deleteSeq(core.code, M, sel) : null;
      if (!res) return;
      const reason = (res as { reason?: string }).reason;
      if (reason) {
        core.toast(reason);
        return;
      }
      const meta = cloneMeta(core.meta);
      const nodes = new Set(sel.filter((x) => x.kind === 'node' || x.kind === 'entity').map((x) => x.id));
      // messages, notes, blocks and processes have positional ids: the code change carries their metadata over
      for (const it of sel) if (it.kind !== 'message' && it.kind !== 'note' && it.kind !== 'block' && it.kind !== 'activation') delete meta[KIND_TO_COLL[it.kind]]?.[it.id];
      if (M.type === 'flowchart') for (const e of M.edges) if (nodes.has(e.from) || nodes.has(e.to)) delete meta.edges?.[e.id];
      if (M.type === 'er') for (const r of M.rels) if (nodes.has(r.from) || nodes.has(r.to)) delete meta.rels?.[r.id];
      if (core.applyCode({ code: res.code, meta }, 'Delete', { select: null })) core.toast(`Deleted ${nItems(sel.length)} — ⌘/Ctrl+Z to undo`);
    };

    // ---- group / ungroup ---------------------------------------------------------------------------------------

    const canGroup = (): { ok: boolean; reason: string } => {
      const sel = core.selection(), M = core.model;
      if (M.type === 'er') return { ok: false, reason: 'Mermaid ER diagrams have no groups' };
      if (M.type === 'flowchart') return sel.some((x) => x.kind === 'node' || x.kind === 'group') ? { ok: true, reason: '' } : { ok: false, reason: 'Select boxes or groups to group' };
      if (M.type === 'sequence') {
        const ps = sel.filter((x) => x.kind === 'participant');
        if (!ps.length) return { ok: false, reason: 'Select participants to group them into a box' };
        if (ps.some((x) => M.participants.find((p) => p.id === x.id)?.box)) return { ok: false, reason: 'A participant is already in a box — ungroup it first' };
        return { ok: true, reason: '' };
      }
      return { ok: false, reason: '' };
    };

    /** The new group's name: typed in place on the canvas, else asked in a dialog (never a native prompt). */
    const nameGroup = async (it: Sel): Promise<void> => {
      if (core.run('inlineEdit', it)) return;
      const name = await core.dialogs.prompt('Group name', { value: 'Group', label: 'Name' });
      if (!name || name === 'Group') return;
      const M = core.model;
      const res = it.kind === 'group' && M.type === 'flowchart' ? relabelGroup(core.code, M, it.id, name)
        : it.kind === 'box' && M.type === 'sequence' ? relabelBox(core.code, M, it.id, name) : null;
      if (res) core.applyCode(res, 'Rename group', { select: [it] });
    };

    const groupSelection = async (): Promise<void> => {
      const g = canGroup();
      if (!g.ok) {
        if (g.reason) core.toast(g.reason);
        return;
      }
      const sel = core.selection(), M = core.model;
      const res = M.type === 'flowchart' ? groupFlow(core.code, M, sel.filter((x) => x.kind === 'node' || x.kind === 'group'), 'Group')
        : M.type === 'sequence' ? boxParticipants(core.code, M, sel.filter((x) => x.kind === 'participant').map((x) => x.id), 'Group') : null;
      if (!res || !core.applyCode(res, 'Group', res.select ? { select: [res.select] } : {})) return;
      core.toast('Grouped — type a name');
      const p = core.primary();
      if (p && (p.kind === 'group' || p.kind === 'box')) await nameGroup(p);
    };

    const ungroupSelection = (): void => {
      const it = core.selection()[0];
      const M = core.model;
      if (!it || (it.kind !== 'group' && it.kind !== 'box')) {
        core.toast('Select a group to ungroup');
        return;
      }
      const meta = cloneMeta(core.meta);
      let ok = false;
      if (it.kind === 'group' && M.type === 'flowchart') {
        const members: Sel[] = (M.groups.get(it.id)?.children ?? []).map((c) => ({ kind: M.groups.has(c) ? 'group' : 'node', id: c }));
        delete meta.groups?.[it.id];
        ok = core.applyCode({ code: ungroupFlow(core.code, M, it.id).code, meta }, 'Ungroup', { select: members });
      } else if (it.kind === 'box' && M.type === 'sequence') {
        const members: Sel[] = (M.boxes.find((b) => b.id === it.id)?.members ?? []).map((id) => ({ kind: 'participant', id }));
        delete meta.boxes?.[it.id];
        ok = core.applyCode({ code: unboxParticipants(core.code, M, it.id).code, meta }, 'Ungroup', { select: members });
      }
      if (ok) core.toast('Ungrouped');
    };

    // ---- copy / paste / duplicate (§8.2 clipboard) -------------------------------------------------------------

    const copySelection = (): boolean => {
      const data = copyItems(core.model, core.meta, core.selection());
      if (!data) {
        core.toast(core.model.type === 'sequence' ? 'Copy works for flowchart shapes / groups and ER tables' : 'Nothing to copy');
        return false;
      }
      clip = data;
      core.toast(`Copied ${nItems(data.items.length)}`);
      const json = JSON.stringify({ format: 'mmdx-items', version: 1, type: data.type, items: data.items, source: core.store.source() });
      void writeSystemClipboard(mermaidFragment(core.model, core.code, data.items), json);
      return true;
    };

    const canPaste = (): boolean => !!pasteable(core.model, clip);

    const pasteAt = (at?: { x: number; y: number }): void => {
      const res = pasteItems(core.code, core.meta, core.model, core.geom, clip, at ?? null, core.snap);
      if (!res) return;
      core.applyCode({ code: res.code, meta: res.meta }, 'Paste', { select: res.selection ?? [] });
    };

    const duplicateSelection = (): void => {
      const res = duplicateItems(core.code, core.meta, core.model, core.geom, core.selection());
      if (!res) {
        core.toast('Duplicate works for flowchart shapes / groups and ER tables');
        return;
      }
      core.applyCode({ code: res.code, meta: res.meta }, 'Duplicate', { select: res.selection ?? [] });
    };

    // ---- unlock all, arrange, order ----------------------------------------------------------------------------

    const unlockAll = (): void => {
      const res = unlockAllOp(core.meta);
      core.change('Unlock all', () => core.store.meta.set(res.meta));
      core.toast(`Unlocked ${nItems(res.count)}`);
    };

    const arrange = (op: Parameters<EditorActions['arrange']>[0]): void => {
      const meta = core.meta;
      const res = alignItems(core.model, meta, core.geom, core.selection(), ALIGN[op] ?? (op as AlignOp));
      if (res.meta === meta) return;
      core.change(op.endsWith('dist') ? 'Distribute' : 'Align', () => core.store.meta.set(res.meta));
    };

    const moveSelection = (dir: -1 | 1): void => {
      const sel = core.selection();
      if (sel.length !== 1) {
        core.toast('Select one item to move it');
        return;
      }
      const res = moveOrder(core.code, core.meta, core.model, core.geom, sel[0]!, dir);
      if (res.reason) {
        core.toast(res.reason);
        return;
      }
      core.applyCode({ code: res.code, meta: res.meta }, 'Move in order', { select: res.selection ?? sel });
    };

    // ---- right-click on the board ------------------------------------------------------------------------------

    const showContextMenu = (clientX: number, clientY: number, at: { x: number; y: number }): void => {
      const entries: [string, string, (() => void) | null][] = [];
      if (canPaste()) entries.push(['Paste', formatKeys('mod+v'), () => pasteAt(at)]);
      const locked = lockedItems(core.meta).length;
      if (locked) entries.push([`Unlock all (${locked})`, '', unlockAll]);
      if (!entries.length) entries.push(['Nothing to paste', '', null]);
      const m = h('div', { class: 'ctx-menu ds-menu', role: 'menu', 'aria-label': 'Board' });
      for (const [label, keys, fn] of entries) {
        const b = h('button', { type: 'button', class: 'ctx-item', role: 'menuitem' }, h('span', null, label), h('kbd', null, keys));
        b.disabled = !fn;
        b.addEventListener('click', () => {
          core.popovers.close();
          fn?.();
        });
        m.append(b);
      }
      core.dom.wrap.append(m);
      core.popovers.open(m, null, { onClose: () => core.dom.root.focus({ preventScroll: true }) });
      const wr = core.dom.wrap.getBoundingClientRect();
      const x = Math.min(clientX - wr.left, wr.width - m.offsetWidth - 8);
      const y = Math.min(clientY - wr.top, wr.height - m.offsetHeight - 8);
      m.style.left = `${Math.max(0, x)}px`;
      m.style.top = `${Math.max(0, y)}px`;
    };

    core.dom.svg.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      if (!editing() || (ev.target instanceof Element && ev.target.closest('.el'))) return;
      showContextMenu(ev.clientX, ev.clientY, core.toDiagram(ev));
    }, { signal: ac.signal });

    /** Shift+F10 / the context-menu key: the board menu at the selection (or the middle of the canvas). */
    const keyboardMenu = (): boolean => {
      if (!editing()) return false;
      const p = core.primary();
      const b = p ? core.boxOf(p) : null;
      const sr = core.dom.svg.getBoundingClientRect();
      const { w, h: hh } = core.viewport.size;
      const s = b ? core.toScreen({ x: b.x, y: b.y }) : { x: w / 2, y: hh / 2 };
      showContextMenu(sr.left + s.x, sr.top + s.y, core.toDiagram({ clientX: sr.left + s.x, clientY: sr.top + s.y }));
      return true;
    };

    // ---- actions and shortcuts ---------------------------------------------------------------------------------

    offs.push(
      core.provide('deleteSelection', deleteSelection),
      core.provide('groupSelection', groupSelection),
      core.provide('ungroupSelection', ungroupSelection),
      core.provide('copySelection', () => void copySelection()),
      core.provide('pasteAt', pasteAt),
      core.provide('duplicateSelection', duplicateSelection),
      core.provide('arrange', arrange),
      core.provide('unlockAll', unlockAll),
    );
    // ⌘[ / ⌘]: the order slider's module may provide its own; this one is the fallback.
    if (!core.has('moveSelection')) offs.push(core.provide('moveSelection', moveSelection));

    core.shortcuts.add(
      { id: 'copy', keys: ['mod+c'], label: 'Copy', group: 'Edit', editOnly: true, run: () => (core.selection().length ? copySelection() : false) },
      {
        id: 'paste', keys: ['mod+v'], label: 'Paste (at the pointer)', group: 'Edit', editOnly: true,
        run: () => {
          if (!canPaste()) return false;
          pasteAt(core.pointer ? core.toDiagram(core.pointer) : undefined);
          return true;
        },
      },
      { id: 'duplicate', keys: ['mod+d'], label: 'Duplicate', group: 'Edit', editOnly: true, run: () => (core.selection().length ? duplicateSelection() : false) },
      { id: 'group', keys: ['mod+g'], label: 'Group', group: 'Edit', editOnly: true, run: () => void groupSelection() },
      { id: 'ungroup', keys: ['mod+shift+g'], label: 'Ungroup', group: 'Edit', editOnly: true, run: () => ungroupSelection() },
      { id: 'delete', keys: ['delete'], label: 'Delete', group: 'Edit', editOnly: true, run: () => (core.selection().length ? deleteSelection() : false) },
      { id: 'order-back', keys: ['mod+['], label: 'Move back in the code order', group: 'Edit', editOnly: true, run: () => (core.selection().length ? void core.run('moveSelection', -1) : false) },
      { id: 'order-forward', keys: ['mod+]'], label: 'Move forward in the code order', group: 'Edit', editOnly: true, run: () => (core.selection().length ? void core.run('moveSelection', 1) : false) },
      { id: 'board-menu', keys: ['shift+f10', 'contextmenu'], label: 'Open the context menu', group: 'Edit', editOnly: true, run: () => keyboardMenu() },
    );

    return () => {
      ac.abort();
      for (const off of offs) off();
      clip = null;
    };
  },
};
