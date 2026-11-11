// CodeView (§5.2): read-only, syntax-highlighted code lines. `plain` is a numbered listing of one source (the
// viewer's code view, History mode's code panel); `diff` is the unified line diff of two sources with line numbers,
// collapsed unchanged runs ("⋯ N unchanged lines", expanded on click), and the narrowing to the lines of one item
// (`sel`, with "Show all"). An optional Copy button copies the listing (diff: the after side). Replaces
// `codeDiff` and `codeListing` of elements/diff/panels.ts (same DOM and classes, now highlighted) and the listing
// of elements/viewer-code.ts. Highlighting is the dependency-free tokenizer of ui/highlight.ts (`highlightLine`,
// `highlightMetaLine`); text goes in as text nodes only. The line diff is core/diff/text's `diffLines` (a small, pure
// Myers diff with no further imports, an L0 value function like the `core/diff` types §5.1 allows), or the host's
// precomputed `ops`. The diff colours come from the `--mmdx-diff-*` tokens: in diff mode the host adopts
// `DIFF_TOKENS` (ui/styles/diff.ts).
import { diffLines, hunks, type LineOp } from '../../core/diff/text.js';
import { h } from '../h.js';
import { highlightLine, highlightMetaLine, tokenNodes } from '../highlight.js';
import { registerMessages } from '../i18n.js';
import { BLOCK_MESSAGES_DIFF } from '../messages/blocks-diff.js';
import { CODE_TOKENS_CSS } from '../styles/code-tokens.js';
import { Scope, type BlockHandle, type Translate } from './block.js';
import { focusedIn, keepFocus } from './focus.js';

/** `mermaid`: Mermaid code; `meta`: `%%@` metadata lines. */
export type CodeLanguage = 'mermaid' | 'meta';

/** Lines of one item on each side (0-based), shown instead of the whole file. */
export interface CodeSelection {
  a: Set<number>;
  b: Set<number>;
  label: string;
}

interface CodeViewCommon {
  t: Translate;
  /** Accessible name of the scrolling listing. */
  label: string;
  language: CodeLanguage;
  /** Show the Copy button. */
  copy?: boolean;
  part?: string;
}

export interface CodeViewPlainProps extends CodeViewCommon {
  mode: 'plain';
  lines: readonly string[];
}

export interface CodeViewDiffProps extends CodeViewCommon {
  mode: 'diff';
  a: readonly string[];
  b: readonly string[];
  /** The line diff of `a` and `b`, when the host has it already (default: `diffLines(a, b)`). */
  ops?: readonly LineOp[];
  /** Narrow the diff to these lines (null / absent: the whole file). */
  sel?: CodeSelection | null;
  /** Short notes in the header (facets left out of the diff). */
  notes?: readonly string[];
  /** "Show all" of a narrowed diff; without it the button is not shown. */
  onShowAll?: () => void;
}

export type CodeViewProps = CodeViewPlainProps | CodeViewDiffProps;

const CODE_VIEW_OWN_CSS = /* css */ `
.mmdx-code { position: relative; display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; color: var(--mmdx-text); }
.mmdx-code .empty { padding: 24px 12px; color: var(--mmdx-muted); text-align: center; }
.mmdx-code .code-head { display: flex; gap: 8px; align-items: center; padding: 8px 10px 0; font-size: 12px; flex: none; }
.mmdx-code .stat { font-weight: 700; }
.mmdx-code .stat.add { color: var(--mmdx-diff-add); }
.mmdx-code .stat.del { color: var(--mmdx-diff-del); }
.mmdx-code .muted { color: var(--mmdx-muted); }
.mmdx-code .code-note { margin-left: auto; font-size: 11px; padding: 1px 8px; border-radius: 10px; background: var(--mmdx-diff-layout-bg); color: var(--mmdx-diff-layout); }
.mmdx-code .code-filter { display: flex; align-items: center; gap: 8px; margin: 8px 8px 0; padding: 3px 8px; border: 1px solid var(--mmdx-warn-line); border-radius: 6px;
  background: var(--mmdx-warn-bg); color: var(--mmdx-warn); font-size: 11.5px; flex: none; }
.mmdx-code .code-filter span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mmdx-code .code-filter button { padding: 1px 8px; font-size: 11.5px; }
/* the editor's code box (ui/code-editor.ts): inset, bordered, the gutter on the left, no wrapping */
.mmdx-code .code-scroll { flex: 1; overflow: auto; min-height: 0; margin: 8px; border: 1px solid var(--mmdx-border); border-radius: 6px; background: var(--mmdx-surface-2); }
.mmdx-code .code-scroll:focus-visible { outline: none; border-color: var(--mmdx-accent); box-shadow: 0 0 0 3px var(--mmdx-accent-2); }
.mmdx-code table.code { border-collapse: collapse; min-width: 100%; font: 12.5px/1.55 var(--mmdx-mono); }
.mmdx-code table.code td { padding: 0 6px; white-space: pre; vertical-align: top; }
.mmdx-code table.code tr:first-child td { padding-top: 8px; }
.mmdx-code table.code tr:last-child td { padding-bottom: 8px; }
.mmdx-code table.code td.num { width: 1%; min-width: 22px; color: var(--mmdx-faint); text-align: right; user-select: none; }
.mmdx-code table.code td.num:has(+ td.txt), .mmdx-code table.code td.num:has(+ td.sign) { border-right: 1px solid var(--mmdx-border); padding-right: 8px; }
.mmdx-code table.code td.sign { width: 1%; user-select: none; }
.mmdx-code table.code td.txt { padding-left: 8px; padding-right: 10px; width: 100%; }
.mmdx-code .ln-add { background: var(--mmdx-diff-add-bg); }
.mmdx-code .ln-add .sign { color: var(--mmdx-diff-add); }
.mmdx-code .ln-del { background: var(--mmdx-diff-del-bg); }
.mmdx-code .ln-del .sign { color: var(--mmdx-diff-del); }
.mmdx-code tr.skip td, .mmdx-code tr.gap td { background: var(--mmdx-surface-2); padding: 0; }
.mmdx-code tr.gap td { color: var(--mmdx-faint); text-align: center; line-height: 1.2; }
.mmdx-code tr.skip button { border: 0; border-radius: 0; background: none; color: var(--mmdx-accent); width: 100%; text-align: left; padding: 3px 12px; font: 12px var(--mmdx-font); }
.mmdx-code > .copy { position: absolute; top: 8px; right: 8px; z-index: 1; box-shadow: var(--mmdx-shadow); }
.mmdx-code .code-head .copy { margin-left: auto; padding: 1px 8px; font-size: 11.5px; }
.mmdx-code .code-head .code-note + .copy { margin-left: 0; }
`;

/** The CodeView's CSS, the shared highlight colours included. */
export const CODE_VIEW_CSS = CODE_VIEW_OWN_CSS + CODE_TOKENS_CSS;

/** One line as highlighted nodes (spans with `t-*` classes and text nodes). */
export function highlighted(line: string, language: CodeLanguage): (HTMLElement | string)[] {
  if (!line) return [' '];
  const tokens = language === 'meta' ? highlightMetaLine(line) : highlightLine(line);
  return tokenNodes(tokens);
}

export interface CodeViewHandle extends BlockHandle<CodeViewProps> {
  /** The text the Copy button copies. */
  text(): string;
}

/** How long the Copy button says "Copied". */
const COPIED_MS = 1500;

export function createCodeView(props: CodeViewProps): CodeViewHandle {
  registerMessages(BLOCK_MESSAGES_DIFF);
  let p: CodeViewProps = { ...props };
  let fx = new Scope();
  const scope = new Scope();
  const el = h('div', { class: 'mmdx-code' });
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  scope.add(() => clearTimeout(copiedTimer));

  const text = (): string => (p.mode === 'plain' ? p.lines : p.b).join('\n');

  const copyButton = (): HTMLElement => {
    const t = p.t;
    const b = h('button', { type: 'button', class: 'copy', 'data-f': 'code-copy' }, t('codeView.copy'));
    fx.on(b, 'click', () => {
      void navigator.clipboard?.writeText(text()).then(() => {
        b.textContent = t('codeView.copied');
        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => (b.textContent = t('codeView.copy')), COPIED_MS);
      }, () => undefined);
    });
    return b;
  };

  const scroller = (table: HTMLElement): HTMLElement =>
    h('div', { class: 'code-scroll', tabindex: '0', role: 'region', 'aria-label': p.label, 'data-f': 'code-scroll' }, table);

  const plain = (x: CodeViewPlainProps): HTMLElement[] => {
    const table = h('table', { class: 'code' });
    x.lines.forEach((l, i) => table.append(h('tr', null, h('td', { class: 'num' }, String(i + 1)), h('td', { class: 'txt' }, ...highlighted(l, x.language)))));
    return [scroller(table)];
  };

  const diff = (x: CodeViewDiffProps): HTMLElement[] => {
    const t = x.t;
    const all = x.ops ?? diffLines(x.a, x.b);
    const sel = x.sel ?? null;
    const ops = sel ? all.filter((o) => (o.a !== undefined && sel.a.has(o.a - 1)) || (o.b !== undefined && sel.b.has(o.b - 1))) : all;
    const adds = ops.filter((o) => o.op === 'add').length, dels = ops.filter((o) => o.op === 'del').length;
    const table = h('table', { class: 'code' });
    const row = (o: LineOp): HTMLElement =>
      h('tr', { class: `ln-${o.op}` },
        h('td', { class: 'num' }, o.a ? String(o.a) : ''), h('td', { class: 'num' }, o.b ? String(o.b) : ''),
        h('td', { class: 'sign' }, o.op === 'add' ? '+' : o.op === 'del' ? '−' : ''), h('td', { class: 'txt' }, ...highlighted(o.text, x.language)));
    if (sel) {
      // runs that are not next to each other in the file are separated by a gap row
      let prev: LineOp | null = null;
      for (const o of ops) {
        const next = prev && ((o.a !== undefined && prev.a !== undefined && o.a === prev.a + 1) || (o.b !== undefined && prev.b !== undefined && o.b === prev.b + 1) || (o.a === undefined && prev.a !== undefined && o.b !== undefined) || (prev.a === undefined && o.a !== undefined));
        if (prev && !next) table.append(h('tr', { class: 'gap' }, h('td', { colSpan: 4 }, '⋯')));
        table.append(row(o));
        prev = o;
      }
    } else
      hunks(ops).forEach((hk, i) => {
        if (!('skip' in hk)) {
          for (const o of hk.ops) table.append(row(o));
          return;
        }
        const btn = h('button', { type: 'button', 'data-f': `code-skip-${i}` }, t('diff.panel.unchanged', { n: hk.skip }));
        const tr = h('tr', { class: 'skip' }, h('td', { colSpan: 4 }, btn));
        fx.on(btn, 'click', () => {
          const had = focusedIn(el) === btn;
          tr.replaceWith(...hk.ops.map(row));
          // the button is gone: the focus stays in the listing
          if (had) el.querySelector<HTMLElement>('.code-scroll')?.focus({ preventScroll: true });
        });
        table.append(tr);
      });
    const notes = x.notes ?? [];
    const out: HTMLElement[] = [
      h('div', { class: 'code-head' }, h('span', { class: 'stat add' }, `+${adds}`), h('span', { class: 'stat del' }, `−${dels}`), h('span', { class: 'muted' }, t('diff.panel.lines')),
        notes.length ? h('span', { class: 'code-note', title: t('diff.panel.notesTip') }, notes.join(' · ')) : null,
        x.copy ? copyButton() : null),
    ];
    if (sel) {
      let all: HTMLElement | null = null;
      const onShowAll = x.onShowAll;
      if (onShowAll) {
        all = h('button', { type: 'button', title: t('diff.panel.showAllTip'), 'data-f': 'code-show-all' }, t('diff.panel.showAll'));
        fx.on(all, 'click', () => onShowAll());
      }
      out.push(h('div', { class: 'code-filter' }, h('span', null, `${t('diff.panel.linesOf')} `, h('b', null, sel.label)), all));
    }
    if (sel && !ops.length) out.push(h('div', { class: 'empty' }, x.language === 'mermaid' ? t('diff.empty.noLines') : t('diff.empty.noMeta')));
    else if (!sel && adds + dels === 0) out.push(h('div', { class: 'empty' }, t('diff.empty.noDiff')));
    else out.push(scroller(table));
    return out;
  };

  const render = (): void => {
    fx.dispose();
    fx = new Scope();
    if (p.part) el.setAttribute('part', p.part);
    else el.removeAttribute('part');
    // plain: the Copy button floats over the listing; diff: it ends the header (diff())
    el.replaceChildren(...(p.mode === 'plain' ? [...plain(p), ...(p.copy ? [copyButton()] : [])] : diff(p)));
  };
  render();

  return {
    el,
    text,
    update(next) {
      p = { ...p, ...next } as CodeViewProps;
      keepFocus(el, render);
    },
    destroy() {
      fx.dispose();
      scope.dispose();
      el.remove();
    },
  };
}
