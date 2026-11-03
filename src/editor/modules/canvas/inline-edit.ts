// Inline text editing (A.3 row 32): a text box over the item's label, styled like it. Enter applies (Shift+Enter =
// new line where Mermaid allows several lines), Esc cancels, clicking away applies. Writes through the ops'
// relabel functions (`labelSpec`, shared with Properties). Ported from prototype app.js (`inlineEdit`, `focusLabel`).
// The emoji button at its end (and ⌘/Ctrl+;) opens the emoji picker (T05 §4.5), which inserts at the caret. Above a
// markdown label, Bold and Italic (⌘/Ctrl+B, ⌘/Ctrl+I) wrap the selection in `**` / `*`; above a plain label that can be
// one, "Make rich text" turns the edit into a markdown string (T06 §3.4).
import type { Sel } from '../../core.js';
import type { EditorModule } from '../../module.js';
import { labelSpec } from '../../ops/label.js';
import { itemEls } from './shared.js';

export const INLINE_EDIT_CSS = /* css */ `
.inline-edit { position: absolute; z-index: 30; box-sizing: border-box; resize: none; overflow: hidden; margin: 0;
  padding: 0; line-height: 1.25; border: 0; border-radius: 0; background: transparent; box-shadow: none; outline: none;
  caret-color: var(--accent); white-space: pre-wrap; }
.inline-edit, .inline-edit:focus, .inline-edit:focus-visible { outline: none; border: 0; box-shadow: none; }
.inline-edit::selection { background: rgba(66, 98, 255, .22); }
.text-editing text { visibility: hidden; }
.inline-emoji { position: absolute; z-index: 31; width: 26px; height: 26px; padding: 0; border-radius: 7px; display: grid; place-items: center;
  font-size: 15px; line-height: 1; background: var(--float); border: 1px solid var(--float-line); box-shadow: 0 2px 8px rgba(20,30,60,.12); }
.inline-md { position: absolute; z-index: 31; display: flex; gap: 2px; padding: 2px; border-radius: 7px; background: var(--float);
  border: 1px solid var(--float-line); box-shadow: 0 2px 8px rgba(20,30,60,.12); }
.inline-md button { min-width: 24px; height: 22px; padding: 0 6px; border: 0; border-radius: 5px; background: transparent; color: inherit;
  font: 13px/1 var(--font, sans-serif); cursor: pointer; }
.inline-md button:hover { background: var(--hover, rgba(0,0,0,.06)); }
.inline-md .md-b { font-weight: 700; }
.inline-md .md-i { font-style: italic; font-family: Georgia, serif; }
`;

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
      // the emoji button (when the picker module is installed) at the editor's end
      const emojiBtn = core.has('pickEmoji') ? document.createElement('button') : null;
      let picking = false;
      const pickEmoji = (): void => {
        if (!emojiBtn) return;
        picking = true;
        core.run('pickEmoji', emojiBtn, (e: string) => {
          ta.setRangeText(e, ta.selectionStart, ta.selectionEnd, 'end');
          fit();
        }, () => {
          picking = false;
          if (!closed) ta.focus();
        });
      };
      if (emojiBtn) {
        emojiBtn.type = 'button';
        emojiBtn.className = 'inline-emoji';
        emojiBtn.textContent = '☺';
        emojiBtn.title = emojiBtn.ariaLabel = core.i18n.t('props.emoji');
        emojiBtn.setAttribute('aria-label', core.i18n.t('props.emoji'));
        // the text box keeps the focus (and its caret) on a press
        emojiBtn.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        });
        emojiBtn.addEventListener('click', pickEmoji);
        wrap.append(emojiBtn);
      }
      // markdown labels (T06): Bold and Italic wrap the selection; a plain label offers "Make rich text"
      let md = spec.markdown;
      const mdBar = spec.markdown || spec.canMarkdown ? document.createElement('div') : null;
      const mdButton = (cls: string, text: string, label: string, run: () => void): HTMLButtonElement => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = text;
        b.title = label;
        b.setAttribute('aria-label', label);
        b.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        });
        b.addEventListener('click', run);
        return b;
      };
      /** `**` / `*` around the selection, or off when it has them already (inside or around it). */
      const emphasis = (mark: string): void => {
        const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value, sel = v.slice(a, b), n = mark.length;
        if (sel.length >= 2 * n && sel.startsWith(mark) && sel.endsWith(mark)) ta.setRangeText(sel.slice(n, -n), a, b, 'select');
        else if (v.slice(a - n, a) === mark && v.slice(b, b + n) === mark) {
          ta.setRangeText(sel, a - n, b + n, 'select');
        } else {
          ta.setRangeText(mark + sel + mark, a, b, 'select');
          ta.setSelectionRange(a + n, b + n);
        }
        fit();
      };
      const fillMdBar = (): void => {
        if (!mdBar) return;
        const t = core.i18n.t;
        mdBar.replaceChildren(
          ...(md
            ? [mdButton('md-b', 'B', t('props.mdBold'), () => emphasis('**')), mdButton('md-i', 'I', t('props.mdItalic'), () => emphasis('*'))]
            : [mdButton('md-rich', t('props.makeRich'), t('props.makeRichTip'), () => {
              md = true;
              fillMdBar();
              ta.focus();
            })]),
        );
      };
      if (mdBar) {
        mdBar.className = 'inline-md';
        fillMdBar();
        wrap.append(mdBar);
      }
      const placeEmoji = (): void => {
        if (mdBar) {
          mdBar.style.left = `${ta.offsetLeft}px`;
          mdBar.style.top = `${ta.offsetTop - 32}px`;
        }
        if (!emojiBtn) return;
        emojiBtn.style.left = `${ta.offsetLeft + ta.offsetWidth + 6}px`;
        emojiBtn.style.top = `${ta.offsetTop + Math.max(0, ta.offsetHeight / 2 - 13)}px`;
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
        placeEmoji();
      };
      placeEmoji();
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
        emojiBtn?.remove();
        mdBar?.remove();
        if (picking) core.popovers.close();
        const v = spec.multi ? ta.value.replace(/\s+$/, '') : ta.value.replace(/\s*\n\s*/g, ' ').trim();
        if (!apply || (v === spec.value && md === spec.markdown) || !core.applyCode(spec.apply(v, md), 'Edit text', { select: [item] })) core.draw();
        // back to the canvas (Enter / Esc), but never pull focus away from where a click went
        if (hadFocus) core.dom.root.focus({ preventScroll: true });
      };
      close = done;
      ta.addEventListener('input', fit);
      ta.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === ';' && (ev.metaKey || ev.ctrlKey) && emojiBtn) {
          ev.preventDefault();
          pickEmoji();
        } else if (md && (ev.metaKey || ev.ctrlKey) && (ev.key === 'b' || ev.key === 'i')) {
          ev.preventDefault();
          emphasis(ev.key === 'b' ? '**' : '*');
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
