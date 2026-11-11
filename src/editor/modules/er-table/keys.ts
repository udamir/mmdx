// The keys of the ER table being edited (A.11): Esc clears the rows, then leaves the table; Delete removes the
// selected rows, ⌘A selects them all, Enter edits one, ⌥↑ / ⌥↓ move them, ↑ / ↓ (Shift: extend) select along.
import type { Shortcut } from '../../../ui/kit/keys.js';
import { stepGap, stepRow } from './rows.js';
import type { TableContext } from './state.js';

export interface TableKeysHost extends TableContext {
  /** The attribute toolbar's popover is open (Esc closes it first). */
  popoverOpen(): boolean;
  closePopover(): void;
  exit(): void;
  editRow(i: number): void;
  reorder(rows: readonly number[], gap: number): void;
}

export function tableShortcuts(c: TableKeysHost): Shortcut[] {
  const { st, attrs, refresh } = c;
  return [
    {
      id: 'table-escape', keys: ['escape'], label: 'Clear the attribute selection, then leave the table', group: 'Edit', editOnly: true,
      run: () => {
        if (!st.table) return false;
        if (c.popoverOpen()) c.closePopover();
        else if (st.sel.length) {
          st.sel = [];
          refresh();
        } else c.exit();
        return true;
      },
    },
    { id: 'table-delete', keys: ['delete'], label: 'Delete the selected attributes', group: 'Edit', editOnly: true, run: () => (st.table && st.sel.length ? c.deleteRows(st.sel) : false) },
    {
      id: 'table-select-all', keys: ['mod+a'], label: 'Select every attribute of the table', group: 'Edit', editOnly: true,
      run: () => {
        if (!st.table) return false;
        st.sel = attrs().map((_, i) => i);
        refresh();
        return true;
      },
    },
    {
      id: 'table-edit-row', keys: ['enter'], label: 'Edit the selected attribute (the empty row: a new one)', group: 'Edit', editOnly: true,
      run: () => {
        if (!st.table) return false;
        c.editRow(st.sel[0] ?? -1);
        return true;
      },
    },
    {
      id: 'table-move-rows', keys: ['alt+arrowup', 'alt+arrowdown'], label: 'Move the selected attributes up / down', group: 'Edit', editOnly: true,
      run: (ev) => {
        if (!st.table) return false;
        if (st.sel.length) c.reorder(st.sel, stepGap(st.sel, attrs().length, ev.key === 'ArrowUp' ? -1 : 1));
        return true;
      },
    },
    {
      id: 'table-rows', keys: ['arrowup', 'arrowdown', 'shift+arrowup', 'shift+arrowdown'], label: 'Select the previous / next attribute', group: 'Edit', editOnly: true,
      run: (ev) => {
        if (!st.table) return false;
        const n = attrs().length;
        if (!n) return true;
        st.sel = stepRow(st.sel, n, ev.key === 'ArrowUp' ? -1 : 1, ev.shiftKey);
        refresh();
        return true;
      },
    },
  ];
}
