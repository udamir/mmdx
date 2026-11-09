// Inline text editing (A.3 row 32): a text box over the item's label, styled like it. Enter applies (Shift+Enter =
// new line where Mermaid allows several lines), Esc cancels, clicking away applies. Writes through the ops'
// relabel functions (`labelSpec`, shared with Properties). Ported from prototype app.js (`inlineEdit`, `focusLabel`).
// ⌘/Ctrl+; opens the emoji picker (T05 §4.5) under the text box, which inserts at the caret (the Properties panel's
// label fields have the picker's button; the canvas shows none over the text). A label
// that can be a markdown string is rich text (T06 §3.4): the toolbar's text format menu and ⌘/Ctrl+B, I, U and ⇧⌘/Ctrl+X
// format the selected words, or the whole text when nothing is selected (ops/format.ts), and the label is written as a
// markdown string once it has formatting.
import type { Sel, TextEditSession } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { formatsAt, hasMarkup, toggleFormat, type TextFormat } from '../../ops/format.js';
import { labelSpec } from '../../ops/label.js';
import { itemEls } from './shared.js';

export const INLINE_EDIT_CSS = /* css */ `
.inline-edit { position: absolute; z-index: 30; box-sizing: border-box; resize: none; overflow: hidden; margin: 0;
  padding: 0; line-height: 1.25; border: 0; border-radius: 0; background: transparent; box-shadow: none; outline: none;
  caret-color: var(--accent); white-space: pre-wrap; }
.inline-edit, .inline-edit:focus, .inline-edit:focus-visible { outline: none; border: 0; box-shadow: none; }
.inline-edit::selection { background: rgba(66, 98, 255, .22); }
.text-editing text { visibility: hidden; }
`;

/** ⌘/Ctrl + these keys format the selected words (⇧: with Shift). */
const FORMAT_KEYS: Readonly<Record<string, TextFormat>> = { b: 'b', i: 'i', u: 'u', '⇧x': 's' };

export const canvasInlineEditModule: EditorModule = {
  id: 'canvas-inline-edit',
  css: [INLINE_EDIT_CSS],
  install(scope) {
    const core = scope.core;
    let close: ((apply: boolean) => void) | null = null;
    const wrap = core.dom.wrap;

    const inlineEdit = (item: Sel): boolean => {
      close?.(true);
      const spec = labelSpec(core, item.kind, item.id);
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
      ta.setAttribute('aria-label', core.i18n.t(spec.title));
      Object.assign(ta.style, {
        left: `${cx - wr.left - width / 2}px`, width: `${width}px`,
        fontSize: `${fs}px`, lineHeight: `${lhPx}px`, fontFamily: text?.getAttribute('font-family') || core.result.theme.font,
        fontWeight: text?.getAttribute('font-weight') || '400', color: text?.getAttribute('fill') || '#1f1f1f',
        textAlign: anchor === 'start' ? 'left' : anchor === 'end' ? 'right' : 'center',
      });
      wrap.append(ta);
      // ⌘/Ctrl+; opens the emoji picker (when its module is installed) under the text box
      let picking = false;
      const pickEmoji = (): void => {
        picking = true;
        core.run('pickEmoji', ta, (e: string) => {
          ta.setRangeText(e, ta.selectionStart, ta.selectionEnd, 'end');
          fit();
        }, () => {
          picking = false;
          if (!closed) ta.focus();
        });
      };
      // rich text (T06): the toolbar's text format menu and the keys format the selected words, else the whole text
      const rich = spec.markdown || spec.canMarkdown;
      let formatted = false;
      const format = (f: TextFormat): void => {
        const r = toggleFormat(ta.value, ta.selectionStart, ta.selectionEnd, f);
        ta.setRangeText(r.text, 0, ta.value.length);
        ta.setSelectionRange(r.a, r.b);
        formatted = true;
        fit();
        changed();
      };
      const session: TextEditSession = {
        rich,
        // some words selected, not all of them (the editor opens with the whole text selected)
        partial: () => {
          const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
          return v.slice(a, b).trim() !== '' && (v.slice(0, a).trim() !== '' || v.slice(b).trim() !== '');
        },
        formats: () => formatsAt(ta.value, ta.selectionStart, ta.selectionEnd),
        format,
      };
      // the toolbar follows the selection: what it formats, and the controls that only style a whole label
      let shown = '';
      const changed = (): void => {
        const f = session.formats();
        const key = `${session.partial()}|${f.b}${f.i}${f.u}${f.s}`;
        if (key === shown) return;
        shown = key;
        if (core.has('refreshToolbar')) core.run('refreshToolbar');
      };
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
      core.textEdit = rich ? session : null;
      core.drawOverlay();
      for (const e of els) e.classList.add('text-editing');
      let closed = false;
      const done = (apply: boolean): void => {
        if (closed) return;
        closed = true;
        const hadFocus = core.dom.shadow.activeElement === ta;
        core.inlineEditing = null;
        if (core.textEdit === session) core.textEdit = null;
        close = null;
        ta.remove();
        if (picking) core.popovers.close();
        const v = spec.multi ? ta.value.replace(/\s+$/, '') : ta.value.replace(/\s*\n\s*/g, ' ').trim();
        // formatted words make the label a markdown string; one already is stays one
        const md = spec.markdown || (formatted && hasMarkup(v));
        if (!apply || (v === spec.value && md === spec.markdown) || !core.applyCode(spec.apply(v, md), 'Edit text', { select: [item] })) core.draw();
        if (core.has('refreshToolbar')) core.run('refreshToolbar');
        // back to the canvas (Enter / Esc), but never pull focus away from where a click went
        if (hadFocus) core.dom.root.focus({ preventScroll: true });
      };
      close = done;
      ta.addEventListener('input', () => {
        fit();
        changed();
      });
      for (const ev of ['select', 'keyup', 'pointerup'] as const) ta.addEventListener(ev, changed);
      ta.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === ';' && (ev.metaKey || ev.ctrlKey) && core.has('pickEmoji')) {
          ev.preventDefault();
          pickEmoji();
        } else if (rich && (ev.metaKey || ev.ctrlKey) && !ev.altKey && FORMAT_KEYS[`${ev.shiftKey ? '⇧' : ''}${ev.key.toLowerCase()}`]) {
          ev.preventDefault();
          format(FORMAT_KEYS[`${ev.shiftKey ? '⇧' : ''}${ev.key.toLowerCase()}`]!);
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          done(false);
        } else if (ev.key === 'Enter' && !(ev.shiftKey && spec.multi)) {
          ev.preventDefault();
          done(true);
        }
      });
      // the emoji picker takes the focus for a while: the text stays open
      ta.addEventListener('blur', () => {
        if (!picking) done(true);
      });
      ta.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      ta.focus();
      ta.select();
      return true;
    };

    // pressing on the canvas applies the open editor first (prototype: S.inlineClose?.(true) on pointerdown)
    scope.listen(core.dom.svg, 'pointerdown', () => close?.(true), { capture: true });
    const off = core.provide('inlineEdit', inlineEdit);
    // suspended (History opens): the open editor is cancelled — the document is not written in History (§8.2)
    scope.register({ set: (on) => void (on || close?.(false)), dispose: () => undefined });
    return () => {
      off();
      close?.(false);
    };
  },
};
