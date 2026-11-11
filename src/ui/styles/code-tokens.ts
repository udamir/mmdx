// Highlight colours of Mermaid and metadata tokens (`t-*` classes from the ui/highlight.ts highlighters): the one
// source of the code colours, shared by the code editor and the CodeView block. The colours are `--mmdx-code-*`
// tokens, light and dark, defined here rather than in styles/base.ts's TOKENS so that only components that show code
// carry them; hosts restyle them on the element like every other token.
export const CODE_TOKENS_CSS = /* css */ `
:host {
  --mmdx-code-kw: #7c3aed; --mmdx-code-arrow: #db2777; --mmdx-code-str: #15803d; --mmdx-code-label: #0369a1; --mmdx-code-text: #0f766e;
  --mmdx-code-cls: #c2410c; --mmdx-code-dir: #9333ea; --mmdx-code-key: #b45309; --mmdx-code-punct: #64748b; --mmdx-code-comment: #8a93a6;
  --mmdx-code-meta: #b5bac6; --mmdx-code-fold: #c9a24a;
}
:host([data-ui="dark"]) {
  --mmdx-code-kw: #c4a5ff; --mmdx-code-arrow: #ff7eb6; --mmdx-code-str: #7ee0a1; --mmdx-code-label: #6cc4ff; --mmdx-code-text: #5fd8c9;
  --mmdx-code-cls: #ffa26b; --mmdx-code-dir: #d29bff; --mmdx-code-key: #f0b860; --mmdx-code-punct: #8d97a8; --mmdx-code-comment: #7d8597;
  --mmdx-code-meta: #5b6272; --mmdx-code-fold: #e0c070;
}
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
