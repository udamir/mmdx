// Highlight colours of Mermaid and metadata tokens (`t-*` classes from the ui/code-editor highlighters), light and dark.
export const CODE_TOKENS_CSS = /* css */ `
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
