// Lightweight code editor (A.1 rows 2–4, 6): a transparent <textarea> over a syntax-highlighted <pre>, with line
// numbers, `%% - N hidden` folds (filtered views keep the real line numbers) and `!` issue markers in the gutter.
// Ported from prototype/editor.js without innerHTML: highlighting produces tokens that become text nodes and spans.
// The design names CodeMirror; v1 keeps this dependency-free editor behind a small API so it can be swapped later.

/** One highlighted piece of a line: a `t-*` class (null = plain text) and its text. */
export type Token = readonly [cls: string | null, text: string];
export type LineHighlighter = (line: string) => Token[];

const KEYWORDS = new RegExp(
  '^(flowchart|graph|subgraph|end|direction|classDef|class|style|linkStyle|click|sequenceDiagram|erDiagram|participant|actor|create|destroy|' +
  'activate|deactivate|autonumber|title|loop|alt|else|opt|par|and|critical|option|break|rect|box|Note|note)\\b',
);
const RULES: readonly (readonly [string, RegExp])[] = [
  ['str', /"[^"\n]*"?/y],
  ['card', /(?:\|o|\|\||\}o|\}\|)(?:--|\.\.)(?:o\||\|\||o\{|\|\{)/y],
  ['arrow', /<<-->>|<<->>|<-->|<-\.->|<==>|-->>|->>|-\.+->|-\.+-|={2,}>|={3,}|-{2,}>|-{3,}|--[xo](?![\w])|--\)|-x(?![\w])|-\)|->|--(?=\s)/y],
  ['label', /\|[^|\n]*\|/y],
  ['cls', /:::[\w-]+/y],
  ['dir', /\b(?:TB|TD|BT|LR|RL)\b/y],
  ['key', /\b(?:PK|FK|UK)\b/y],
  ['pos', /\b(?:left of|right of|over|as)\b/y],
  ['punct', /[[\](){}>\\/,&;]+/y],
  ['word', /[\wÀ-￿.#]+(?:-(?=[\wÀ-￿])[\wÀ-￿.#]+)*/y],
  ['space', /\s+/y],
];

const HIDDEN_LINE = /^%% - (\d+) hidden$/;

/** Mermaid line → tokens (flowchart, sequence and ER keywords, arrows, labels, classes…). */
export function highlightLine(line: string): Token[] {
  const t = line.trimStart();
  if (t.startsWith('%% ⋯') || HIDDEN_LINE.test(t)) return [['t-fold', line]];
  if (t.startsWith('%%@')) return [['t-meta', line]];
  if (t.startsWith('%%')) return [['t-comment', line]];
  const out: Token[] = [];
  const lead = /^\s*/.exec(line)?.[0] ?? '';
  if (lead) out.push([null, lead]);
  let i = lead.length;
  const kw = KEYWORDS.exec(line.slice(i));
  if (kw) {
    out.push(['t-kw', kw[0]]);
    i += kw[0].length;
  }
  let sawArrow = false;
  const isNote = /^\s*note\b/i.test(line);
  while (i < line.length) {
    // message / relationship text after ":" once an arrow was seen (sequence, ER) or after Note targets
    if (line[i] === ':' && line[i + 1] !== ':' && (sawArrow || isNote)) {
      out.push(['t-punct', ':'], ['t-text', line.slice(i + 1)]);
      break;
    }
    let cls = 'plain';
    let txt = line[i]!;
    for (const [c, re] of RULES) {
      re.lastIndex = i;
      const m = re.exec(line);
      if (m && m[0].length) {
        cls = c;
        txt = m[0];
        break;
      }
    }
    if (cls === 'arrow' || cls === 'card') sawArrow = true;
    out.push([cls === 'space' || cls === 'plain' || cls === 'word' ? null : `t-${cls}`, txt]);
    i += txt.length;
  }
  return out;
}

// Metadata line: `%%@ kind id {json}` with the same colours as the Mermaid code.
const META_RE = /^(\s*)(%%@)(\s+)([\w.]+)?(\s+)?([^\s{]+)?(\s*)(.*)$/;
const JSON_TOKENS = /("(?:[^"\\]|\\.)*"?)(\s*:)?|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])|(\s+)|([^\s"{}[\],:]+)/gi;

/** `%%@` metadata line → tokens. */
export function highlightMetaLine(line: string): Token[] {
  const m = META_RE.exec(line);
  if (!m) return highlightLine(line);
  const [, lead = '', at = '', s1 = '', kind = '', s2 = '', id = '', s3 = '', rest = ''] = m;
  const out: Token[] = [[null, lead], ['t-punct', at], [null, s1], ['t-kw', kind], [null, s2]];
  if (id) out.push(['t-cls', id]);
  out.push([null, s3]);
  for (const t of rest.matchAll(JSON_TOKENS)) {
    const [all, str, colon, num, lit, punct] = t;
    if (str) {
      if (colon) out.push(['t-label', str], ['t-punct', colon]);
      else out.push(['t-str', str]);
    } else if (num) out.push(['t-key', num]);
    else if (lit) out.push(['t-dir', lit]);
    else if (punct) out.push(['t-punct', punct]);
    else out.push([null, all]);
  }
  return out.filter(([, s]) => s !== '');
}

/**
 * Line numbers for an editor view. `%% - N hidden` lines (filtered view) get `⋯` and advance the counter by N, so
 * visible lines keep their real line numbers from the full file.
 */
export function lineLabels(text: string): string[] {
  const out: string[] = [];
  let n = 0;
  for (const l of text.split('\n')) {
    const m = HIDDEN_LINE.exec(l.trim());
    if (m) {
      out.push('⋯');
      n += Number(m[1]);
    } else out.push(String(++n));
  }
  return out;
}

export interface CodeEditorOptions {
  value?: string;
  lineNumbers?: boolean;
  highlightLine?: LineHighlighter;
  /** Accessible name of the text area. */
  label?: string;
  /** Grow with the content up to `maxHeight` (theme editor snippets). */
  autoHeight?: boolean;
  maxHeight?: number;
  onInput?: (value: string) => void;
  onKeyDown?: (ev: KeyboardEvent) => void;
  onBlur?: () => void;
  /** Positioning context for the gutter tooltip (an absolutely / relatively positioned ancestor). */
  tipHost?: () => HTMLElement | null;
}

export interface CodeEditor {
  readonly el: HTMLElement;
  readonly textarea: HTMLTextAreaElement;
  value: string;
  readOnly: boolean;
  /** Re-renders the highlight and the gutter from the textarea. */
  refresh(): void;
  /** Issue markers: real (1-based) line number → messages. */
  setMarkers(m: ReadonlyMap<number, readonly string[]> | null): void;
  /** Puts the caret on real (1-based) line `n`; false when a filtered view hides it. */
  gotoLine(n: number): boolean;
  focus(): void;
  destroy(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Creates the editor (its root is `el`; the caller places it). */
export function createCodeEditor(opts: CodeEditorOptions = {}): CodeEditor {
  const hl = opts.highlightLine ?? highlightLine;
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  const wrap = el('div', 'cm' + (opts.autoHeight ? ' auto' : ''));
  const pre = el('pre', 'cm-hl');
  pre.setAttribute('aria-hidden', 'true');
  const codeEl = el('code');
  pre.append(codeEl);
  const ta = el('textarea', 'cm-ta');
  ta.spellcheck = false;
  ta.setAttribute('autocomplete', 'off');
  ta.setAttribute('autocapitalize', 'off');
  ta.setAttribute('autocorrect', 'off');
  ta.wrap = 'off';
  if (opts.label) ta.setAttribute('aria-label', opts.label);
  wrap.append(pre, ta);
  let gutter: HTMLElement | null = null, gutterInner: HTMLElement | null = null;
  if (opts.lineNumbers) {
    wrap.classList.add('with-gutter');
    gutter = el('div', 'cm-gutter');
    gutter.setAttribute('aria-hidden', 'true');
    gutterInner = el('div');
    gutter.append(gutterInner);
    wrap.prepend(gutter);
  }
  ta.value = opts.value ?? '';

  // the highlighted layer and the gutter follow the textarea's scroll position (both axes)
  const sync = (): void => {
    codeEl.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    if (gutterInner) gutterInner.style.transform = `translateY(${-ta.scrollTop}px)`;
  };

  let markers: ReadonlyMap<number, readonly string[]> = new Map();
  let lastLabels = '';
  const renderGutter = (force = false): void => {
    if (!gutter || !gutterInner) return;
    const labels = lineLabels(ta.value);
    const key = labels.join(',');
    if (key === lastLabels && !force) return;
    lastLabels = key;
    const digits = Math.max(2, ...labels.map((l) => l.length));
    wrap.style.setProperty('--gutter', `${digits * 7.6 + 32}px`);
    const rows = labels.map((l) => {
      if (l === '⋯') return el('div', 'fold', '⋯');
      const msgs = markers.get(Number(l));
      if (!msgs?.length) return el('div', undefined, l);
      const row = el('div', 'has-issue');
      const ic = el('span', 'cm-issue', '!');
      ic.dataset['tip'] = msgs.join('\n');
      row.append(ic, l);
      return row;
    });
    gutterInner.replaceChildren(...rows);
  };

  // tooltip for the gutter icons (the gutter clips overflow, so the tip lives on the tip host)
  let tip: HTMLElement | null = null;
  const hideTip = (): void => {
    tip?.remove();
  };
  if (gutter) {
    gutter.addEventListener('mouseover', (ev) => {
      const ic = (ev.target as Element | null)?.closest?.('.cm-issue') as HTMLElement | null;
      if (!ic) return;
      const host = opts.tipHost?.() ?? wrap.parentElement;
      if (!host) return;
      tip ??= el('div', 'cm-tip');
      tip.setAttribute('role', 'tooltip');
      tip.textContent = ic.dataset['tip'] ?? '';
      host.append(tip);
      const r = ic.getBoundingClientRect(), hr = host.getBoundingClientRect();
      tip.style.left = `${r.right + 6 - hr.left}px`;
      tip.style.top = `${r.top - 4 - hr.top}px`;
    }, sig);
    gutter.addEventListener('mouseout', (ev) => {
      if ((ev.target as Element | null)?.closest?.('.cm-issue')) hideTip();
    }, sig);
    gutter.addEventListener('mousedown', (ev) => {
      const ic = (ev.target as Element | null)?.closest?.('.cm-issue');
      if (!ic || !gutterInner) return;
      ev.preventDefault();
      hideTip();
      gotoView(Array.from(gutterInner.children).indexOf(ic.parentElement as Element));
    }, sig);
  }

  // caret on view line `i` (0-based line of the textarea's text), selected and scrolled into view
  const gotoView = (i: number): void => {
    const lines = ta.value.split('\n');
    i = Math.max(0, Math.min(i, lines.length - 1));
    let start = 0;
    for (let k = 0; k < i; k++) start += lines[k]!.length + 1;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(start, start + lines[i]!.length);
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 19;
    const top = i * lh;
    if (top < ta.scrollTop || top + lh > ta.scrollTop + ta.clientHeight - 16) ta.scrollTop = Math.max(0, top - ta.clientHeight / 3);
    ta.scrollLeft = 0;
    sync();
  };

  const fit = (): void => {
    if (!opts.autoHeight) return;
    ta.style.height = '0px';
    const hgt = Math.min(opts.maxHeight ?? 360, ta.scrollHeight + 2);
    ta.style.height = `${hgt}px`;
    wrap.style.height = `${hgt}px`;
  };

  const renderCode = (): void => {
    const f = document.createDocumentFragment();
    for (const line of ta.value.split('\n')) {
      for (const [cls, text] of hl(line)) {
        if (!cls) f.append(text);
        else {
          const s = document.createElement('span');
          s.className = cls;
          s.textContent = text;
          f.append(s);
        }
      }
      f.append('\n');
    }
    codeEl.replaceChildren(f);
  };
  const render = (): void => {
    renderCode();
    renderGutter();
    fit();
    sync();
  };

  ta.addEventListener('input', () => {
    render();
    opts.onInput?.(ta.value);
  }, sig);
  ta.addEventListener('scroll', sync, sig);
  ta.addEventListener('keydown', (ev) => {
    if (ev.key === 'Tab' && !ev.metaKey && !ev.ctrlKey && !ev.altKey && !ta.readOnly) {
      ev.preventDefault();
      // execCommand keeps the browser's own undo stack; fall back where it is unavailable (jsdom, old engines)
      let ok = false;
      try {
        ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, '  ');
      } catch {
        ok = false;
      }
      if (!ok) {
        ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    opts.onKeyDown?.(ev);
  }, sig);
  if (opts.onBlur) ta.addEventListener('blur', opts.onBlur, sig);
  render();

  return {
    el: wrap,
    textarea: ta,
    get value() {
      return ta.value;
    },
    set value(v: string) {
      ta.value = v;
      render();
    },
    get readOnly() {
      return ta.readOnly;
    },
    set readOnly(v: boolean) {
      ta.readOnly = v;
    },
    refresh: render,
    setMarkers(m) {
      markers = m ?? new Map();
      renderGutter(true);
    },
    gotoLine(n) {
      const i = lineLabels(ta.value).indexOf(String(n));
      if (i < 0) return false;
      gotoView(i);
      return true;
    },
    focus() {
      ta.focus();
    },
    destroy() {
      ac.abort();
      hideTip();
      wrap.remove();
    },
  };
}

/** Code editor CSS (scoped to the component that hosts it). Syntax colours follow the host's `data-ui` scheme. */
export const CODE_EDITOR_CSS = /* css */ `
.cm { position: relative; flex: 1; min-height: 0; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-2); overflow: hidden; }
.cm:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-2); }
.cm-hl, .cm-ta { margin: 0; padding: 8px 10px; font: 12.5px/1.55 var(--ds-mono); white-space: pre; tab-size: 2; letter-spacing: 0; word-wrap: normal; }
.cm-hl { position: absolute; inset: 0; overflow: hidden; pointer-events: none; color: var(--ink); }
.cm-hl code { font: inherit; display: block; will-change: transform; }
.cm-ta { position: relative; display: block; width: 100%; height: 100%; resize: none; border: 0; outline: 0; background: transparent; color: transparent;
  caret-color: var(--ink); overflow: auto; overscroll-behavior: contain; box-shadow: none !important; }
.cm-ta::-webkit-scrollbar { width: 9px; height: 9px; }
.cm-ta::-webkit-scrollbar-thumb { background: var(--scroll); border-radius: 6px; border: 2px solid var(--surface-2); }
.cm-ta::-webkit-scrollbar-corner { background: transparent; }
.cm-ta::selection { background: rgba(79,70,229,.22); color: transparent; }
.cm.auto { flex: none; }
.cm.with-gutter .cm-hl, .cm.with-gutter .cm-ta { padding-left: calc(var(--gutter, 34px) + 8px); }
.cm-gutter { position: absolute; left: 0; top: 0; bottom: 0; width: var(--gutter, 34px); overflow: hidden; pointer-events: none; z-index: 1;
  background: var(--surface-2); border-right: 1px solid var(--line); color: var(--faint); text-align: right;
  font: 12.5px/1.55 var(--ds-mono); padding: 8px 8px 8px 0; box-sizing: border-box; }
.cm-gutter > div { will-change: transform; }
.cm-gutter .fold { color: #c9a24a; }
.cm-gutter .has-issue { position: relative; color: var(--danger); font-weight: 600; }
.cm-issue { position: absolute; left: 4px; top: 50%; transform: translateY(-50%); width: 13px; height: 13px; border-radius: 50%; background: var(--danger); color: #fff;
  font: 800 9px/13px system-ui, sans-serif; text-align: center; pointer-events: auto; cursor: pointer; }
.cm-tip { position: absolute; z-index: var(--ds-z-popover); max-width: 320px; padding: 6px 9px; border-radius: 6px; background: var(--float); color: var(--ink);
  border: 1px solid var(--danger); box-shadow: 0 4px 14px rgba(0,0,0,.18); font-size: 12px; line-height: 1.4; white-space: pre-wrap; pointer-events: none; }
.t-kw { color: #7c3aed; font-weight: 600; }
.t-arrow, .t-card { color: #db2777; font-weight: 600; }
.t-str { color: #15803d; }
.t-label { color: #0369a1; }
.t-text { color: #0f766e; }
.t-cls { color: #c2410c; }
.t-dir, .t-pos { color: #9333ea; }
.t-key { color: #b45309; font-weight: 600; }
.t-punct { color: #64748b; }
.t-comment { color: #8a93a6; font-style: italic; }
.t-meta { color: #b5bac6; }
.t-fold { color: var(--warn-ink); background: var(--warn-bg); border-radius: 3px; font-style: italic; }
:host([data-ui="dark"]) .t-kw { color: #c4a5ff; }
:host([data-ui="dark"]) .t-arrow, :host([data-ui="dark"]) .t-card { color: #ff7eb6; }
:host([data-ui="dark"]) .t-str { color: #7ee0a1; }
:host([data-ui="dark"]) .t-label { color: #6cc4ff; }
:host([data-ui="dark"]) .t-text { color: #5fd8c9; }
:host([data-ui="dark"]) .t-cls { color: #ffa26b; }
:host([data-ui="dark"]) .t-dir, :host([data-ui="dark"]) .t-pos { color: #d29bff; }
:host([data-ui="dark"]) .t-punct { color: #8d97a8; }
:host([data-ui="dark"]) .t-comment { color: #7d8597; }
:host([data-ui="dark"]) .t-meta { color: #5b6272; }
`;
