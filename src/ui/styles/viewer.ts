// <mmdx-viewer> chrome.
export const VIEWER_CSS = /* css */ `
:host { display: block; position: relative; contain: content; min-height: 60px; }
:host([fit="contain"]) { height: 100%; }
.root { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: inherit; outline: none; }
:host([fit="width"]) .root, :host(:not([fit])) .root { height: auto; }
.stage { position: relative; width: 100%; height: 100%; }
:host([fit="width"]) .stage, :host(:not([fit])) .stage { aspect-ratio: var(--ds-aspect, 16 / 9); height: auto; }
svg.scene { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; user-select: none; }
:host([interactive="false"]) svg.scene { touch-action: auto; }
.root.can-pan svg.scene { cursor: grab; }
.root.can-pan svg.scene.panning { cursor: grabbing; }
.el[data-link] { cursor: pointer; }
.pen-layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.pen-layer.on { pointer-events: auto; cursor: crosshair; }
.pen-layer path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.bar {
  position: absolute; right: 10px; bottom: 10px; z-index: 2; display: flex; gap: 2px; align-items: center; padding: 3px;
  opacity: 0; transition: opacity .15s;
}
.root:hover .bar, .root:focus-within .bar, .bar.pinned, :host([data-touch]) .bar { opacity: 1; }
.bar button { border: 0; background: transparent; padding: 4px 7px; border-radius: 5px; min-width: 28px; display: inline-flex; align-items: center; justify-content: center; }
.bar button:hover:not(:disabled) { background: var(--ds-float-2); }
.bar button.on { background: var(--ds-accent-2); color: var(--ds-accent); }
.bar .pct { min-width: 44px; text-align: center; color: var(--ds-muted); font-variant-numeric: tabular-nums; font-size: 12px; }
.bar .sep { width: 1px; align-self: stretch; margin: 3px 2px; background: var(--ds-border); }
.pop { right: 10px; bottom: 50px; max-height: calc(100% - 64px); overflow: auto; width: 240px; }
.row { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border-radius: 5px; }
.row .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row.off .name { color: var(--ds-muted); text-decoration: line-through; }
.eye { border: 0; background: transparent; padding: 2px 4px; }
.pen-opts { display: flex; flex-direction: column; gap: 8px; padding: 6px 8px; }
.pen-opts .line { display: flex; gap: 6px; align-items: center; }
.swatch { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; padding: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }
.swatch[aria-pressed=true] { border-color: var(--ds-text); }
.size { width: 26px; height: 26px; display: inline-grid; place-items: center; padding: 0; }
.size i { display: block; border-radius: 50%; background: currentColor; }
.size[aria-pressed=true], .fade[aria-pressed=true] { background: var(--ds-accent-2); color: var(--ds-accent); border-color: transparent; }
.error {
  padding: 12px 14px; background: var(--ds-danger-bg); color: var(--ds-text); border: 1px solid var(--ds-danger);
  border-radius: var(--ds-radius); font-size: 12.5px;
}
.error h2 { margin: 0 0 6px; font-size: 13px; color: var(--ds-danger); }
.error ul { margin: 0 0 8px; padding-left: 18px; }
.error pre { margin: 0; max-height: 240px; overflow: auto; background: var(--ds-surface); border: 1px solid var(--ds-border); border-radius: 6px; padding: 8px; font: 12px/1.5 var(--ds-mono); white-space: pre; counter-reset: ln; }
.error pre span { display: block; }
.error pre span::before { counter-increment: ln; content: counter(ln); display: inline-block; width: 2.5em; color: var(--ds-faint); text-align: right; margin-right: 1em; user-select: none; }
.error pre span.bad { background: var(--ds-danger-bg); }
.error .actions { margin-top: 8px; }
.alt { padding: 10px 14px; font-size: 13px; }
.alt ul { margin: 4px 0; padding-left: 20px; }
.loading { display: grid; place-items: center; color: var(--ds-muted); min-height: 80px; height: 100%; }
.fallback { width: 100%; overflow: auto; }
.fallback svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
:host(:fullscreen), .root:fullscreen { background: var(--ds-bg); }
.root:fullscreen .stage { height: 100%; aspect-ratio: auto; }
@media print {
  .bar, .pop, .pen-layer { display: none !important; }
  .stage { aspect-ratio: var(--ds-aspect, 16 / 9) !important; height: auto !important; }
}
`;
