// <mmdx-editor> layout (§10): the canvas fills the element; the side panels float over it in the panel stacks
// (chrome/panes.ts; prototype layout). Feature modules add their own CSS (EditorModule.css).
export const EDITOR_CSS = /* css */ `
:host { display: block; position: relative; height: 100%; min-height: 360px; contain: strict; }
:host([height="auto"]) { contain: content; }
.ed { position: absolute; inset: 0; overflow: hidden; background: var(--mmdx-bg); color: var(--mmdx-text); outline: none; }
.mode-view .edit-only { display: none !important; }
.canvas-wrap {
  position: absolute; inset: 0; overflow: hidden;
  background: var(--mmdx-bg) radial-gradient(var(--mmdx-dots) 1px, transparent 1px) 0 0 / 22px 22px;
}
svg.canvas { width: 100%; height: 100%; display: block; cursor: default; user-select: none; touch-action: none; outline: none; }
svg.canvas.panning { cursor: grabbing; }
.ed.tool-hand svg.canvas, .ed.space-pan svg.canvas, .mode-view svg.canvas { cursor: grab; }
.ed.tool-hand svg.canvas.panning, .mode-view svg.canvas.panning { cursor: grabbing; }
.mode-edit .canvas .el.node, .mode-edit .canvas .el.entity, .mode-edit .canvas .el.participant { cursor: move; }
.mode-edit .canvas .el.group > :first-child, .mode-edit .canvas .el.block > rect:first-child { cursor: move; }
.mode-edit .canvas .el.message, .mode-edit .canvas .el.note { cursor: ns-resize; }
.mode-edit .canvas .el.elabel { cursor: move; }
.canvas .el.edge, .canvas .el.rel { cursor: pointer; }
.mode-view .canvas .el[data-link] { cursor: pointer; }
.canvas .el.edge:hover .line, .canvas .el.rel:hover path:nth-child(2) { filter: drop-shadow(0 0 2px rgba(79,70,229,.6)); }
.canvas .el.edge.selected .hit, .canvas .el.rel.selected .hit, .canvas .el.message.selected .hit { stroke: rgba(79,70,229,.32); stroke-linecap: round; }
.ed.group-edit .canvas .el { transition: opacity .15s; }
.ed.group-edit .canvas .el:not(.in-edit) { opacity: .15; }
.canvas .el.text-editing.selected .hit { stroke: transparent; }
.page-layer.page-shadow { filter: drop-shadow(0 2px 10px rgba(20,30,60,.13)); }
.overlay { pointer-events: none; }
.overlay [data-handle], .overlay .hit-on { pointer-events: all; }
.ed.dragging .mtb { opacity: 0; pointer-events: none; }
.ed:focus-visible { box-shadow: inset var(--mmdx-focus); }
@media print { .tool-dock, .bottom-bar, .view-params { display: none !important; } }
`;
