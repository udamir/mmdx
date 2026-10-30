// <mmdx-editor> layout (§10): the canvas fills the element; side panels float over it as rounded cards (prototype
// layout). Feature modules add their own CSS (EditorModule.css).
export const EDITOR_CSS = /* css */ `
:host { display: block; position: relative; height: 100%; min-height: 360px; contain: strict; }
:host([height="auto"]) { contain: content; }
.ed {
  position: absolute; inset: 0; overflow: hidden; background: var(--ds-bg); color: var(--ds-text); outline: none;
  --left-w: 360px; --right-w: 340px; --right-vw: 260px;
  --inset-l: calc(var(--left-w) + 12px); --inset-r: calc(var(--right-w) + 12px);
}
.ed.mode-view { --inset-l: 0px; --inset-r: calc(var(--right-vw) + 12px); }
.ed.no-code { --inset-l: 0px; }
.ed.no-right { --inset-r: 0px; }
.ed.mode-view.no-layers { --inset-r: 0px; }
.mode-view .edit-only { display: none !important; }
.canvas-wrap {
  position: absolute; inset: 0; overflow: hidden;
  background: var(--ds-bg) radial-gradient(var(--ds-dots) 1px, transparent 1px) 0 0 / 22px 22px;
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
.page-shadow { filter: drop-shadow(0 2px 10px rgba(20,30,60,.13)); }
.overlay { pointer-events: none; }
.overlay [data-handle], .overlay .hit-on { pointer-events: all; }
.pen-layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; }
.pen-layer.on { pointer-events: auto; cursor: crosshair; }
.pen-layer path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.pane {
  position: absolute; top: 12px; bottom: 12px; z-index: 30; display: flex; flex-direction: column; min-height: 0;
  background: var(--ds-panel); border: 1px solid var(--ds-border); border-radius: 14px; overflow: hidden;
  box-shadow: 0 10px 30px rgba(20, 30, 60, .16), 0 1px 3px rgba(20, 30, 60, .08);
}
.pane.left { left: 12px; width: var(--left-w); }
.pane.right { right: 12px; top: 60px; bottom: 60px; width: var(--right-w); }
.mode-view .pane.right { width: var(--right-vw); }
.no-code .pane.left, .no-right .pane.right { display: none; }
.pane-resizer { position: absolute; top: 14px; bottom: 14px; width: 7px; z-index: 31; cursor: col-resize; touch-action: none; }
.pane-resizer::after { content: ''; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: transparent; transition: background .12s; }
.pane-resizer:hover::after, .pane-resizer.dragging::after { background: var(--ds-accent); width: 2px; left: 2px; }
.pane.left .pane-resizer { right: 0; }
.pane.right .pane-resizer { left: 0; }
.ed.dragging .mtb { opacity: 0; pointer-events: none; }
.ed:focus-visible { box-shadow: inset var(--ds-focus); }
@media (prefers-reduced-motion: reduce) { .pane { transition: none !important; } }
@media print { .pane, .tool-dock, .bottom-bar, .view-params { display: none !important; } }
`;
