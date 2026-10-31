// Highlight colours of Mermaid and metadata tokens (`t-*` classes from the ui/highlight.ts highlighters): the one
// source of the code colours, shared by the code editor and the CodeView block. The colours are the `--mmdx-code-*`
// tokens (light and dark in styles/base.ts), so hosts restyle them like every other token.
export const CODE_TOKENS_CSS = /* css */ `
.t-kw { color: var(--mmdx-code-kw); font-weight: 600; }
.t-arrow, .t-card { color: var(--mmdx-code-arrow); font-weight: 600; }
.t-str { color: var(--mmdx-code-str); }
.t-label { color: var(--mmdx-code-label); }
.t-text { color: var(--mmdx-code-text); }
.t-cls { color: var(--mmdx-code-cls); }
.t-dir, .t-pos { color: var(--mmdx-code-dir); }
.t-key { color: var(--mmdx-code-key); font-weight: 600; }
.t-punct { color: var(--mmdx-code-punct); }
.t-comment { color: var(--mmdx-code-comment); font-style: italic; }
.t-meta { color: var(--mmdx-code-meta); }
.t-fold { color: var(--mmdx-warn); background: var(--mmdx-warn-bg); border-radius: 3px; font-style: italic; }
`;
