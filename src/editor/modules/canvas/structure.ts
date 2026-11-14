// Canvas structure (A.3 rows 29, 33, 35, 36, 37, 39): delete, group / ungroup, copy / paste / duplicate with the
// clipboard of §8.2, align / distribute, unlock all, ⌘[ / ⌘] and the board's right-click menu (Paste, Unlock all,
// disabled "Nothing to paste"; on a group whose type offers it, "Reset positions in this group" of T07). Ported from
// prototype app.js (`deleteSelection`, `canGroup`, `groupSelection`, `ungroupSelection`, `copySelection`, `pasteable`,
// `pasteAt`, `duplicateSelection`, `arrangeSelection`, `moveSelection`, `showContextMenu`).
import { POSITIONAL_KINDS } from '../../../core/ids.js';
import { KIND_TO_COLL } from '../../../core/meta/types.js';
import type { DiagramModel } from '../../../core/model.js';
import { withKind } from '../../../core/kinds/registry.js';
import { reparse } from '../../../core/parse/dispatch.js';
import {
  alignItems, cloneMeta, copyItems, duplicateItems, groupHasPositions, lockedItems, pasteable, pasteItems, remapMeta, unlockAll as unlockAllOp, type AlignOp,
} from '../../../core/ops/index.js';
import type { ItemRef } from '../../../core/types.js';
import { MENU_CSS, openMenu, type MenuItem } from '../../../ui/blocks/menu.js';
import type { EditorActions, Sel } from '../../core.js';
import { withEdit } from '../../kinds/registry.js';
import type { EditorModule } from '../../module.js';
import { canGroup as canGroupSel, groupResetState, resettableGroup, resetSelectedGroup } from '../../ops/group.js';
import { moveSelection } from '../../ops/order.js';
import { sameRef } from '../../lib/refs.js';
import { items as nItems } from '../../lib/canvas.js';

/** The board's right-click menu is the Menu block. */
const STRUCTURE_CSS = MENU_CSS;

/** Clipboard MIME type of the editor's own format (§8.2); `web ` prefix = custom format of the async clipboard API. */
const MMDX_CLIPBOARD_TYPE = 'web application/x-mmdx+json';

/** A Mermaid fragment for the copied items, so pasting into other apps produces useful text (§8.2). */
export function mermaidFragment(model: DiagramModel, code: string, refs: readonly ItemRef[]): string {
  return withEdit(model, (k, m) => k.fragment?.(m, code, refs)) ?? '';
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
  css: [STRUCTURE_CSS],
  install(scope) {
    const core = scope.core;
    /** The copy buffer is the core's (`core.clipboard`, UI state, never saved): the source of truth for paste. */
    const editing = (): boolean => core.mode.peek() === 'edit';

    // ---- delete ------------------------------------------------------------------------------------------------

    const deleteSelection = (): void => {
      const sel = core.selection();
      if (!sel.length) return;
      const M = core.model;
      if (sel.length === 1 && withEdit(M, (k, m) => k.removeOne?.(core, m, sel[0]!))) return;
      const res = withEdit(M, (k, m) => k.remove(core.code, m, sel));
      if (!res) return;
      const reason = (res as { reason?: string }).reason;
      if (reason) {
        core.toast(reason);
        return;
      }
      const meta = cloneMeta(core.meta);
      const nodes = new Set(sel.filter((x) => x.kind === 'node' || x.kind === 'entity').map((x) => x.id));
      // positional ids (messages, notes, blocks, boxes, processes): the code change carries their metadata over
      for (const it of sel) if (!POSITIONAL_KINDS.has(it.kind)) delete meta[KIND_TO_COLL[it.kind]]?.[it.id];
      for (const c of withKind(M, (k, m) => k.connectors(m)) ?? []) if (nodes.has(c.from.id) || nodes.has(c.to.id)) delete meta[KIND_TO_COLL[c.ref.kind]]?.[c.ref.id];
      // positional ids (mindmap nodes without a written id) move with the code: their metadata follows
      const kept = remapMeta(M, core.code, reparse(res.code), res.code, meta);
      if (core.applyCode({ code: res.code, meta: kept }, 'Delete', { select: null })) core.toast(`Deleted ${nItems(sel.length)} — ⌘/Ctrl+Z to undo`);
    };

    // ---- group / ungroup ---------------------------------------------------------------------------------------

    const canGroup = (): { ok: boolean; reason: string } => canGroupSel(core);

    /** The new group's name: typed in place on the canvas, else asked in a dialog (never a native prompt). */
    const nameGroup = async (it: Sel): Promise<void> => {
      if (core.run('inlineEdit', it)) return;
      const name = await core.dialogs.prompt('Group name', { value: 'Group', label: 'Name' });
      if (!name || name === 'Group') return;
      const res = withEdit(core.model, (k, m) => k.renameContainer?.(core.code, m, it, name));
      if (res) core.applyCode(res, 'Rename group', { select: [it] });
    };

    const groupSelection = async (): Promise<void> => {
      const g = canGroup();
      if (!g.ok) {
        if (g.reason) core.toast(g.reason);
        return;
      }
      const sel = core.selection();
      const res = withEdit(core.model, (k, m) => k.group?.(core.code, m, sel, 'Group'));
      if (!res || !core.applyCode(res, 'Group', res.select ? { select: [res.select] } : {})) return;
      core.toast('Grouped — type a name');
      const p = core.primary();
      if (p && (p.kind === 'group' || p.kind === 'box')) await nameGroup(p);
    };

    const ungroupSelection = async (): Promise<void> => {
      const it = core.selection()[0];
      const M = core.model;
      if (!it || (it.kind !== 'group' && it.kind !== 'box')) {
        core.toast('Select a group to ungroup');
        return;
      }
      const ask = withEdit(M, (k, m) => k.ungroupConfirm?.(m, it));
      if (ask && !(await core.dialogs.confirm(ask.title, ask.message, { ok: ask.ok }))) return;
      if (core.model !== M) return;
      const meta = cloneMeta(core.meta);
      const res = withEdit(M, (k, m) => k.ungroup?.(core.code, m, it));
      if (!res) return;
      delete meta[KIND_TO_COLL[it.kind]]?.[it.id];
      if (core.applyCode({ code: res.code, meta }, 'Ungroup', { select: res.members })) core.toast('Ungrouped');
    };

    // ---- copy / paste / duplicate (§8.2 clipboard) -------------------------------------------------------------

    const copySelection = (): boolean => {
      const data = copyItems(core.model, core.meta, core.selection(), { code: core.code, geom: core.geom });
      if (!data) {
        core.toast(withEdit(core.model, (k) => k.noCopy) ?? 'Nothing to copy');
        return false;
      }
      core.uiState.clipboard.set(data);
      core.toast(`Copied ${nItems(data.items.length)}`);
      const json = JSON.stringify({ format: 'mmdx-items', version: 2, type: data.type, items: data.items, content: data.content, source: core.shownSource() });
      void writeSystemClipboard(mermaidFragment(core.model, core.code, data.items), json);
      return true;
    };

    const canPaste = (): boolean => !!pasteable(core.model, core.clipboard);

    const pasteAt = (at?: { x: number; y: number }): void => {
      const res = pasteItems(core.code, core.meta, core.model, core.geom, core.clipboard, at ?? null, core.snap);
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
      core.setMeta('Unlock all', res.meta);
      core.toast(`Unlocked ${nItems(res.count)}`);
    };

    const arrange = (op: Parameters<EditorActions['arrange']>[0]): void => {
      const meta = core.meta;
      const res = alignItems(core.model, meta, core.geom, core.selection(), ALIGN[op] ?? (op as AlignOp));
      if (res.meta === meta) return;
      core.setMeta(op.endsWith('dist') ? 'Distribute' : 'Align', res.meta);
    };

    // ---- right-click on the board ------------------------------------------------------------------------------

    const showContextMenu = (clientX: number, clientY: number, at: { x: number; y: number }): void => {
      const entries: MenuItem[] = [];
      if (canPaste()) entries.push({ label: 'Paste', keys: 'mod+v', run: () => pasteAt(at) });
      const locked = lockedItems(core.meta).length;
      if (locked) entries.push({ label: `Unlock all (${locked})`, run: unlockAll });
      // a selected group whose type offers it: "Reset positions in this group" (T07)
      const g = resettableGroup(core);
      if (g) entries.push({ label: core.i18n.t('history.resetGroup'), disabled: !groupHasPositions(core.model, core.meta, g), run: () => void resetSelectedGroup(core) });
      if (!entries.length) entries.push({ label: 'Nothing to paste', disabled: true, run: () => undefined });
      openMenu({
        popovers: core.popovers, opener: null, label: 'Board', entries, within: core.overlayHost, at: { clientX, clientY }, class: 'ctx-menu',
        onClose: () => core.focusEditor(),
      });
    };

    /** A right-clicked group the board menu has an entry for (selected first); null for any other item. */
    const menuGroup = (target: EventTarget | null): ItemRef | null => {
      const el = target instanceof Element ? target.closest('.el') : null;
      const kind = el?.getAttribute('data-kind'), id = el?.getAttribute('data-id');
      if (kind !== 'group' || !id) return null;
      const ref: ItemRef = { kind, id };
      if (groupResetState(core, ref) === null) return null;
      const sel = core.selection();
      if (sel.length !== 1 || !sameRef(sel[0], ref)) core.select([ref]);
      return ref;
    };

    scope.canvas('contextmenu', (ev) => {
      ev.preventDefault();
      if (!editing() || core.version.peek()) return;
      if (ev.target instanceof Element && ev.target.closest('.el') && !menuGroup(ev.target)) return;
      showContextMenu(ev.clientX, ev.clientY, core.toDiagram(ev));
    });

    /** Shift+F10 / the context-menu key: the board menu at the selection (or the middle of the canvas). */
    const keyboardMenu = (): boolean => {
      if (!editing() || core.version.peek()) return false;
      const p = core.primary();
      const b = p ? core.boxOf(p) : null;
      const sr = core.canvasRect();
      const { w, h: hh } = core.viewport.size;
      const s = b ? core.toScreen({ x: b.x, y: b.y }) : { x: w / 2, y: hh / 2 };
      showContextMenu(sr.left + s.x, sr.top + s.y, core.toDiagram({ clientX: sr.left + s.x, clientY: sr.top + s.y }));
      return true;
    };

    // ---- actions and shortcuts ---------------------------------------------------------------------------------

    for (const off of [
      core.provide('deleteSelection', deleteSelection),
      core.provide('groupSelection', groupSelection),
      core.provide('ungroupSelection', ungroupSelection),
      core.provide('resetGroupPositions', () => void resetSelectedGroup(core)),
      core.provide('copySelection', () => void copySelection()),
      core.provide('pasteAt', pasteAt),
      core.provide('duplicateSelection', duplicateSelection),
      core.provide('arrange', arrange),
    ]) scope.onDispose(off);
    // ⌘[ / ⌘]: the order slider's module may provide its own; this one is the fallback.
    scope.onDispose(core.provideDefault('moveSelection', (dir) => moveSelection(core, dir)));

    core.shortcuts.add(
      { id: 'copy', keys: ['mod+c'], label: 'Copy', group: 'Edit', editOnly: true, readOnly: true, run: () => (core.selection().length ? copySelection() : false) },
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
      { id: 'ungroup', keys: ['mod+shift+g'], label: 'Ungroup', group: 'Edit', editOnly: true, run: () => void ungroupSelection() },
      { id: 'delete', keys: ['delete'], label: 'Delete', group: 'Edit', editOnly: true, run: () => (core.selection().length ? deleteSelection() : false) },
      { id: 'order-back', keys: ['mod+['], label: 'Move back in the code order', group: 'Edit', editOnly: true, run: () => (core.selection().length ? void core.run('moveSelection', -1) : false) },
      { id: 'order-forward', keys: ['mod+]'], label: 'Move forward in the code order', group: 'Edit', editOnly: true, run: () => (core.selection().length ? void core.run('moveSelection', 1) : false) },
      { id: 'board-menu', keys: ['shift+f10', 'contextmenu'], label: 'Open the context menu', group: 'Edit', editOnly: true, run: () => keyboardMenu() },
    );
  },
};
