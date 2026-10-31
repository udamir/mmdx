// <mmdx-viewer> layout. The chrome (tool dock, zoom bar, view params, panel stacks) comes from the kernel's modules;
// on a docs page it shows while the pointer or the focus is in the viewer (or a panel or the pen is in use).
export const VIEWER_CSS = /* css */ `
:host { display: block; position: relative; contain: content; min-height: 60px; }
:host([fit="contain"]) { height: 100%; }
.root { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: inherit; outline: none; }
:host([fit="width"]) .root, :host(:not([fit])) .root { height: auto; }
.stage { position: relative; width: 100%; height: 100%; }
:host([fit="width"]) .stage, :host(:not([fit])) .stage { aspect-ratio: var(--mmdx-aspect, 16 / 9); height: auto; }
svg.scene { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; user-select: none; }
:host([interactive="false"]) svg.scene { touch-action: auto; }
.root.can-pan svg.scene { cursor: grab; }
.root.can-pan svg.scene.panning { cursor: grabbing; }
.el[data-link] { cursor: pointer; }
.root .tool-dock, .root .bottom-bar, .root .view-params { transition: opacity .15s; }
.root:not(:hover):not(:focus-within):not(.pinned) .tool-dock,
.root:not(:hover):not(:focus-within):not(.pinned) .bottom-bar,
.root:not(:hover):not(:focus-within):not(.pinned) .view-params { opacity: 0; }
:host([data-touch]) .root .tool-dock, :host([data-touch]) .root .bottom-bar, :host([data-touch]) .root .view-params { opacity: 1; }
.code-view { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.error {
  padding: 12px 14px; background: var(--mmdx-danger-bg); color: var(--mmdx-text); border: 1px solid var(--mmdx-danger);
  border-radius: var(--mmdx-radius); font-size: 12.5px;
}
.error h2 { margin: 0 0 6px; font-size: 13px; color: var(--mmdx-danger); }
.error ul { margin: 0 0 8px; padding-left: 18px; }
.error pre { margin: 0; max-height: 240px; overflow: auto; background: var(--mmdx-surface); border: 1px solid var(--mmdx-border); border-radius: 6px; padding: 8px; font: 12px/1.5 var(--mmdx-mono); white-space: pre; counter-reset: ln; }
.error pre span { display: block; }
.error pre span::before { counter-increment: ln; content: counter(ln); display: inline-block; width: 2.5em; color: var(--mmdx-faint); text-align: right; margin-right: 1em; user-select: none; }
.error pre span.bad { background: var(--mmdx-danger-bg); }
.error .actions { margin-top: 8px; }
.loading { display: grid; place-items: center; color: var(--mmdx-muted); min-height: 80px; height: 100%; }
.fallback { width: 100%; overflow: auto; }
.fallback svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
/* History (§8.2): a docs-page viewer grows to room for the panels */
.root[data-stage=history] .stage { aspect-ratio: auto; height: max(560px, 100%); }
:host(:fullscreen), .root:fullscreen { background: var(--mmdx-bg); }
:host(:fullscreen) .stage { height: 100vh; aspect-ratio: auto; }
@media print {
  .tool-dock, .bottom-bar, .view-params, .mmdx-stack { display: none !important; }
  .stage { aspect-ratio: var(--mmdx-aspect, 16 / 9) !important; height: auto !important; }
}
`;
