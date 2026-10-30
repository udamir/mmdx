// Inline text editing (A.3 row 32): a text box over the item's label, styled like it. Enter applies (Shift+Enter =
// new line where Mermaid allows several lines), Esc cancels, clicking away applies. Writes through the ops'
// relabel functions. Ported from prototype app.js (`labelSpec`, `inlineEdit`, `focusLabel`).
import type { CodeResult } from '../../../core/ops/index.js';
import { relabelBox, relabelFlowEdge, relabelFlowNode, relabelGroup, relabelSeq, updateEntity, updateRel } from '../../../core/ops/index.js';
import type { ItemRef } from '../../../core/types.js';
import type { EditorCore, Sel } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { itemEls } from './shared.js';

export interface LabelSpec {
  value: string;
  /** Several lines allowed (flowchart nodes). */
  multi: boolean;
  title: string;
  apply(v: string): CodeResult;
}

/** How an item's text is read and written back to Mermaid (prototype `labelSpec`). */
export function labelSpec(core: EditorCore, { kind, id }: ItemRef): LabelSpec | null {
  const M = core.model, code = core.code;
  if (M.type === 'flowchart') {
    if (kind === 'node') return { value: M.nodes.get(id)?.label ?? '', multi: true, title: 'Text', apply: (v) => relabelFlowNode(code, M, id, v) };
    if (kind === 'group') return { value: M.groups.get(id)?.label ?? '', multi: false, title: 'Title', apply: (v) => relabelGroup(code, M, id, v) };
    if (kind === 'edge') return { value: M.edges.find((e) => e.id === id)?.label ?? '', multi: false, title: 'Label', apply: (v) => relabelFlowEdge(code, M, id, v) };
  } else if (M.type === 'sequence') {
    const seqItem = M.items.find((x) => 'id' in x && x.id === id && (x.kind === 'message' || x.kind === 'note' || x.kind === 'blockStart'));
    const rel = (v: string): CodeResult => relabelSeq(code, M, { kind, id }, v);
    if (kind === 'participant') return { value: M.participants.find((p) => p.id === id)?.label ?? '', multi: false, title: 'Name', apply: rel };
    if (kind === 'message' || kind === 'note') return { value: seqItem && 'text' in seqItem ? seqItem.text : '', multi: false, title: 'Text', apply: rel };
    if (kind === 'block') {
      const b = seqItem?.kind === 'blockStart' ? seqItem : null;
      return { value: b?.label ?? '', multi: false, title: `${b?.block ?? 'Block'} condition`, apply: rel };
    }
    if (kind === 'box') return { value: M.boxes.find((b) => b.id === id)?.label ?? '', multi: false, title: 'Title', apply: (v) => relabelBox(code, M, id, v) };
  } else if (M.type === 'er') {
    if (kind === 'rel') return { value: M.rels.find((r) => r.id === id)?.label ?? '', multi: false, title: 'Label', apply: (v) => updateRel(code, M, id, { label: v }) };
    if (kind === 'entity') return { value: M.entities.get(id)?.label ?? '', multi: false, title: 'Name', apply: (v) => updateEntity(code, M, id, { label: v }) };
  }
  return null;
}

export const INLINE_EDIT_CSS = /* css */ `
.inline-edit { position: absolute; z-index: 30; box-sizing: border-box; resize: none; overflow: hidden; margin: 0;
  padding: 0; line-height: 1.25; border: 0; border-radius: 0; background: transparent; box-shadow: none; outline: none;
  caret-color: var(--accent); white-space: pre-wrap; }
.inline-edit, .inline-edit:focus, .inline-edit:focus-visible { outline: none; border: 0; box-shadow: none; }
.inline-edit::selection { background: rgba(66, 98, 255, .22); }
.text-editing text { visibility: hidden; }
`;

export const canvasInlineEditModule: EditorModule = {
  id: 'canvas-inline-edit',
  css: INLINE_EDIT_CSS,
  install(core) {
    const ac = new AbortController();
    let close: ((apply: boolean) => void) | null = null;
    const wrap = core.dom.wrap;

    const inlineEdit = (item: Sel): boolean => {
      close?.(true);
      const spec = labelSpec(core, item);
      if (!spec || core.mode.peek() !== 'edit') return false;
      const els = itemEls(core, item);
      const main = els.find((e) => !e.hasAttribute('data-part')), part = els.find((e) => e.getAttribute('data-part') === 'label');
      if (!main && !part) return false;
      // where the text is: an edge label, the item's first text line, or (no text yet) the item itself
      const own = (part ?? main)!;
      const text = own.querySelector('text');
      const shape = item.kind === 'node' || item.kind === 'participant' || item.kind === 'note' ? main?.querySelector('rect, path, polygon, ellipse, circle') ?? null : null;
      const wr = wrap.getBoundingClientRect();
      const tb = text?.getBoundingClientRect();
      const ob = (shape ?? own).getBoundingClientRect();
      const k = core.viewport.state.k;
      const fs = Number(text?.getAttribute('font-size') || 14) * k;
      const anchor = text?.getAttribute('text-anchor') || 'middle';
      const width = Math.max(90, shape ? ob.width - 12 : Math.max(tb?.width ?? 0, 60) + 40);
      // line height of the SVG text: the distance between its lines, else the renderer's default (1.3)
      const spans = text ? Array.from(text.querySelectorAll('tspan')) : [];
      const lhPx = spans.length > 1 ? (Number(spans[1]!.getAttribute('y')) - Number(spans[0]!.getAttribute('y'))) * k : fs * 1.3;
      const cx = tb && tb.width ? (anchor === 'start' ? tb.left + width / 2 : anchor === 'end' ? tb.right - width / 2 : tb.left + tb.width / 2) : ob.left + ob.width / 2;
      const cy = tb && tb.height ? tb.top + tb.height / 2 : ob.top + ob.height / 2;
      const ta = document.createElement('textarea');
      ta.className = 'inline-edit';
      ta.value = spec.value;
      ta.spellcheck = false;
      ta.setAttribute('aria-label', spec.title);
      Object.assign(ta.style, {
        left: `${cx - wr.left - width / 2}px`, width: `${width}px`,
        fontSize: `${fs}px`, lineHeight: `${lhPx}px`, fontFamily: text?.getAttribute('font-family') || core.result.theme.font,
        fontWeight: text?.getAttribute('font-weight') || '400', color: text?.getAttribute('fill') || '#1f1f1f',
        textAlign: anchor === 'start' ? 'left' : anchor === 'end' ? 'right' : 'center',
      });
      wrap.append(ta);
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
      // No jump: put the editor's first line exactly on the SVG's first line. A hidden copy of the editor tells where
      // its first line's glyphs land; the editor is moved so they cover the SVG glyphs (centre to centre, by alignment).
      let midY = cy - wr.top; // vertical centre of the text block, kept while lines are added / removed
      const first = spans[0] ?? text;
      const fr = first?.getBoundingClientRect();
      if (fr && fr.width) {
        const m = document.createElement('div'), cs = getComputedStyle(ta);
        for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'textAlign', 'whiteSpace', 'overflowWrap', 'wordBreak', 'padding', 'boxSizing', 'width', 'tabSize'] as const)
          (m.style as unknown as Record<string, string>)[p] = cs[p];
        Object.assign(m.style, { position: 'absolute', left: '0', top: '0', visibility: 'hidden' });
        const sp = document.createElement('span');
        sp.textContent = ta.value.split('\n')[0] || '\u200b';
        m.append(sp);
        wrap.append(m);
        const mr = m.getBoundingClientRect(), r0 = sp.getClientRects()[0];
        m.remove();
        if (r0) {
          const dx = anchor === 'start' ? fr.left - (r0.left - mr.left) : anchor === 'end' ? fr.right - (r0.right - mr.left) : fr.left + fr.width / 2 - (r0.left + r0.width / 2 - mr.left);
          const top = fr.top + fr.height / 2 - (r0.top + r0.height / 2 - mr.top);
          ta.style.left = `${dx - wr.left}px`;
          ta.style.top = `${top - wr.top}px`;
          midY = top - wr.top + ta.offsetHeight / 2;
        }
      } else ta.style.top = `${midY - ta.offsetHeight / 2}px`;
      // typing new lines grows the box evenly up and down, like the centred SVG text
      const fit = (): void => {
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight}px`;
        ta.style.top = `${midY - ta.offsetHeight / 2}px`;
      };
      core.inlineEditing = { kind: item.kind, id: item.id };
      core.drawOverlay();
      for (const e of els) e.classList.add('text-editing');
      let closed = false;
      const done = (apply: boolean): void => {
        if (closed) return;
        closed = true;
        const hadFocus = core.dom.shadow.activeElement === ta;
        core.inlineEditing = null;
        close = null;
        ta.remove();
        const v = spec.multi ? ta.value.replace(/\s+$/, '') : ta.value.replace(/\s*\n\s*/g, ' ').trim();
        if (!apply || v === spec.value || !core.applyCode(spec.apply(v), 'Edit text', { select: [item] })) core.draw();
        // back to the canvas (Enter / Esc), but never pull focus away from where a click went
        if (hadFocus) core.dom.root.focus({ preventScroll: true });
      };
      close = done;
      ta.addEventListener('input', fit);
      ta.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape') {
          ev.preventDefault();
          done(false);
        } else if (ev.key === 'Enter' && !(ev.shiftKey && spec.multi)) {
          ev.preventDefault();
          done(true);
        }
      });
      ta.addEventListener('blur', () => done(true));
      ta.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      ta.focus();
      ta.select();
      return true;
    };

    // pressing on the canvas applies the open editor first (prototype: S.inlineClose?.(true) on pointerdown)
    core.dom.svg.addEventListener('pointerdown', () => close?.(true), { capture: true, signal: ac.signal });
    const off = core.provide('inlineEdit', inlineEdit);
    return () => {
      ac.abort();
      off();
      close?.(false);
    };
  },
};
