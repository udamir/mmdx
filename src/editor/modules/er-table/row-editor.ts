// Editing a row of the ER table in place: a text box over the row (`type name PK (comment)`). Enter applies it (a new
// attribute goes on to the next empty row), Esc drops it, a blur applies it; an emptied row is deleted, a text that
// does not read as an attribute stays open and marked.
import { attrText } from '../../../core/kinds/er/ops.js';
import { parseAttrLine } from '../../../core/kinds/er/parse.js';
import { h } from '../../../ui/kit/h.js';
import type { TableContext } from './state.js';

export interface RowEditorHost extends TableContext {
  /** Where the text box goes (the canvas wrapper). */
  wrap: HTMLElement;
  /** The open row editor was shown or closed: the attribute toolbar follows. */
  toolbarRefresh(): void;
  /** Opens the editor over another row (Enter on the empty row: the next new attribute). */
  editRow(i: number): void;
}

/** Opens the text box over row i (-1: the empty last row, a new attribute). */
export function openRowEditor(c: RowEditorHost, i: number): void {
  const { core, t, st } = c;
  st.editor?.close(true);
  if (!st.table) return;
  const b = c.box();
  const rows = b?.rows ?? [];
  const ri = i < 0 ? rows.findIndex((r) => r.add) : i;
  const rect = c.rowRect(ri);
  const a = i >= 0 ? c.attrs()[i] : undefined;
  if (!b || !rect || (i >= 0 && !a)) return;
  st.sel = i >= 0 ? [i] : [];
  const inp = h('input', { type: 'text', class: 'attr-edit', spellcheck: 'false', placeholder: t('table.placeholder'), 'aria-label': i < 0 ? t('table.newAttr') : t('table.editAttr') });
  inp.value = a ? attrText(a) : '';
  const k = core.viewport.state.k;
  const size = Number(c.tableValue('attrSize')) || 14;
  Object.assign(inp.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${Math.max(rect.w, 160)}px`, height: `${rect.h}px`, fontSize: `${size * k}px` });
  c.wrap.append(inp);
  c.toolbarRefresh();
  core.drawOverlay();
  let closed = false;
  const finish = (apply: boolean, next = false): boolean => {
    if (closed) return true;
    const v = inp.value.trim();
    let ok = true;
    if (apply) {
      const list = c.attrs();
      if (i < 0) {
        if (v) {
          const na = parseAttrLine(v);
          if (!na) ok = false;
          else c.setAttrs([...list, na], t('history.attrAdd'));
        }
      } else if (!v) {
        // an emptied row is deleted
        closed = true;
        st.editor = null;
        inp.remove();
        c.deleteRows([i]);
        return true;
      } else if (v !== attrText(list[i]!)) {
        const na = parseAttrLine(v);
        if (!na) ok = false;
        else {
          const names = list.map((x, j) => (j === i ? na.name : x.name));
          c.setAttrs(list.map((x, j) => (j === i ? na : x)), t('history.attrEdit'), c.remapHighlights(names));
        }
      }
    }
    if (!ok) {
      core.toast(t('table.badAttr'));
      inp.classList.add('bad');
      if (next) return false; // Enter: stay and fix it
    }
    closed = true;
    st.editor = null;
    inp.remove();
    core.drawOverlay();
    c.refresh();
    // typing into the last row: straight on to the next new attribute
    if (next && i < 0 && v && ok) c.editRow(-1);
    else core.focusEditor();
    return true;
  };
  st.editor = { close: (apply) => void finish(apply) };
  inp.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') {
      ev.preventDefault();
      finish(false);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      finish(true, true);
    }
  });
  inp.addEventListener('input', () => inp.classList.remove('bad'));
  inp.addEventListener('blur', () => void finish(true));
  inp.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  inp.focus();
  inp.select();
}
