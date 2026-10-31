// <mmdx-diff> chrome and canvas styles (§9, §10). Every colour comes from a token: the `--mmdx-*` chrome tokens
// (ui/styles/base.ts) and the `--mmdx-diff-*` highlight tokens below, light and dark. Hosts override any of them on
// the element (`mmdx-diff { --mmdx-diff-add: … }`).

export const DIFF_TOKENS = /* css */ `
:host {
  --mmdx-diff-add: #1a7f37; --mmdx-diff-add-bg: #dafbe1;
  --mmdx-diff-del: #cf222e; --mmdx-diff-del-bg: #ffebe9;
  --mmdx-diff-content: #b35900; --mmdx-diff-content-bg: #fff1e0;
  --mmdx-diff-layout: #0969da; --mmdx-diff-layout-bg: #ddf4ff;
  --mmdx-diff-style: #8250df; --mmdx-diff-style-bg: #fbefff;
  --mmdx-diff-dim: .28;
  --mmdx-diff-run-ins: #aff5b4; --mmdx-diff-run-del: #ffd2cf;
  --mmdx-diff-blend: multiply;
  --mmdx-diff-tip: #1d2330; --mmdx-diff-tip-ink: #fff;
}
:host([data-ui="dark"]) {
  --mmdx-diff-add: #3fb950; --mmdx-diff-add-bg: rgba(46,160,67,.22);
  --mmdx-diff-del: #f85149; --mmdx-diff-del-bg: rgba(248,81,73,.22);
  --mmdx-diff-content: #e3a33b; --mmdx-diff-content-bg: rgba(227,163,59,.2);
  --mmdx-diff-layout: #58a6ff; --mmdx-diff-layout-bg: rgba(56,139,253,.2);
  --mmdx-diff-style: #bc8cff; --mmdx-diff-style-bg: rgba(163,113,247,.2);
  --mmdx-diff-dim: .35;
  --mmdx-diff-run-ins: rgba(46,160,67,.35); --mmdx-diff-run-del: rgba(248,81,73,.35);
  /* multiply would darken a dark canvas: translucent fills instead */
  --mmdx-diff-blend: normal;
  --mmdx-diff-tip: #e6e8ee; --mmdx-diff-tip-ink: #1d2330;
}
`;

export const DIFF_CSS = /* css */ `
:host { display: block; position: relative; height: 640px; min-height: 360px; contain: content; }
:host(:fullscreen) { height: 100%; }
.root {
  container: diff / size;
  position: absolute; inset: 0; overflow: hidden; background: var(--mmdx-surface); outline: none; border-radius: inherit;
  --left-w: 420px; --right-w: 320px; --inset-l: 0px; --inset-r: 0px;
}
.root.left-open { --inset-l: calc(var(--left-w) + 24px); }
.root.right-open { --inset-r: calc(var(--right-w) + 24px); }
.area { container: area / size; position: absolute; top: 0; bottom: 0; left: var(--inset-l); right: var(--inset-r); transition: left .24s cubic-bezier(.2,.8,.2,1), right .24s cubic-bezier(.2,.8,.2,1); }
.root.resizing-panes .area { transition: none; }
.root.resizing-panes, .root.resizing-panes * { cursor: col-resize !important; user-select: none !important; }

/* ---- canvases ---- */
.stage { position: absolute; inset: 0; display: flex; gap: 1px; background: var(--mmdx-border); }
.stage.single { background: transparent; }
.pane { position: relative; flex: 1; min-width: 0; overflow: hidden; background: var(--mmdx-surface); }
.pane > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; }
.pane > svg.panning { cursor: grabbing; }
.root.tool-pen .pane > svg { cursor: crosshair; }
.pane-title { position: absolute; top: 8px; left: 8px; right: 200px; display: flex; gap: 6px; align-items: baseline; pointer-events: none; z-index: 2; min-width: 0; }
.pane-title b { background: var(--mmdx-surface); border: 1px solid var(--mmdx-border); border-radius: 5px; padding: 1px 8px; font-size: 12px; flex: none; }
.pane-title span { color: var(--mmdx-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pane.before .pane-title b { color: var(--mmdx-diff-del); }
.pane.after .pane-title b { color: var(--mmdx-diff-add); }
.banner { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 5; max-width: calc(100% - 32px); background: var(--mmdx-warn-bg); color: var(--mmdx-warn); border: 1px solid var(--mmdx-warn-line); border-radius: var(--mmdx-radius); padding: 5px 12px; font-size: 12px; }
.msg { position: absolute; inset: 0; display: grid; place-items: center; color: var(--mmdx-muted); pointer-events: none; }
.msg .error { pointer-events: auto; max-width: 560px; padding: 12px 14px; background: var(--mmdx-danger-bg); color: var(--mmdx-text); border: 1px solid var(--mmdx-danger); border-radius: var(--mmdx-radius); }
.msg .error button { margin-top: 8px; }

.host-actions { position: absolute; top: 10px; right: 12px; z-index: 7; display: flex; gap: 6px; }
.host-actions button { box-shadow: var(--mmdx-shadow); }

/* ---- tool panel (left, the viewer's bar style, vertical) ---- */
.vbar-wrap { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); z-index: 6; display: flex; align-items: center; gap: 8px; pointer-events: none; }
.vbar-wrap > * { pointer-events: auto; }
.vbar, .dbar { display: flex; gap: 2px; align-items: center; padding: 3px; }
.vbar { flex-direction: column; }
.vbar button, .dbar button { position: relative; border: 0; background: transparent; padding: 4px 7px; border-radius: 5px; min-width: 28px; min-height: 28px; display: inline-flex; align-items: center; justify-content: center; color: var(--mmdx-text); }
.vbar button:hover:not(:disabled), .dbar button:hover:not(:disabled) { background: var(--mmdx-float-2); }
.vbar button.on, .dbar button.on { background: var(--mmdx-accent-2); color: var(--mmdx-accent); }
.vbar .sep { height: 1px; align-self: stretch; margin: 3px 4px; background: var(--mmdx-border); }
.dbar .sep { width: 1px; align-self: stretch; margin: 3px 4px; background: var(--mmdx-border); }
[data-tip]:hover::after {
  content: attr(data-tip); position: absolute; z-index: 60; pointer-events: none; width: max-content; max-width: 280px; white-space: normal; text-align: left;
  background: var(--mmdx-diff-tip); color: var(--mmdx-diff-tip-ink); font-size: 12px; font-weight: 500; line-height: 1.4; padding: 4px 8px; border-radius: 6px; box-shadow: var(--mmdx-shadow);
}
.vbar [data-tip]:hover::after { left: calc(100% + 10px); top: 50%; transform: translateY(-50%); white-space: nowrap; }
.dbar [data-tip]:hover::after { left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%); }
.vbar-wrap:has(.pen-opts) .vbar [data-tip]:hover::after { display: none; }
@media (hover: none) { [data-tip]:hover::after { display: none; } }

/* ---- bottom diff bar: views, change filters, dim ---- */
.dbar { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 6; white-space: nowrap; max-width: calc(100% - 24px); }
/* no change list: the zoom bar sits in the canvas corner, the diff bar keeps clear of it */
.root:not(.right-open) .dbar { left: calc(50% - 90px); max-width: calc(100% - 220px); }
.dbar button.view { padding: 4px 10px; }
.dbar button.view.on { font-weight: 600; }
.dbar select.views { display: none; border: 0; background: transparent; padding: 4px 6px; }
.dbar .flt { color: var(--c); }
.dbar .flt.on { background: var(--c-bg); color: var(--c); }
.dbar .flt.off { color: var(--mmdx-faint); }
.dbar .flt.off::before { content: ''; position: absolute; left: 6px; right: 6px; top: 50%; height: 1.5px; background: var(--mmdx-faint); transform: rotate(-45deg); }
.dbar .cnt { position: absolute; right: -3px; bottom: -2px; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 7px; background: var(--c, var(--mmdx-muted)); color: var(--mmdx-surface); font-size: 9px; font-weight: 700; line-height: 14px; text-align: center; }
.dbar .flt.off .cnt { background: var(--mmdx-faint); }
.flt-added, .dx-added, .m-added { --c: var(--mmdx-diff-add); --c-bg: var(--mmdx-diff-add-bg); }
.flt-removed, .dx-removed, .m-removed { --c: var(--mmdx-diff-del); --c-bg: var(--mmdx-diff-del-bg); }
.flt-content, .dx-content, .m-content { --c: var(--mmdx-diff-content); --c-bg: var(--mmdx-diff-content-bg); }
.flt-layout, .dx-layout, .m-layout { --c: var(--mmdx-diff-layout); --c-bg: var(--mmdx-diff-layout-bg); }
.flt-style, .dx-style, .m-style { --c: var(--mmdx-diff-style); --c-bg: var(--mmdx-diff-style-bg); }

/* ---- pen options (the viewer's) ---- */
.pen-opts { position: static; display: flex; flex-direction: column; gap: 8px; padding: 6px 8px; min-width: 0; }
.pen-opts .line { display: flex; gap: 6px; align-items: center; }
.pen-opts .mmdx-sect { padding: 0 4px 0 0; }
.pen-opts .swatch { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; padding: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }
.pen-opts .swatch[aria-pressed=true] { border-color: var(--mmdx-text); }
.pen-opts .size { width: 26px; height: 26px; display: inline-grid; place-items: center; padding: 0; }
.pen-opts .size i { display: block; border-radius: 50%; background: currentColor; }
.pen-opts .size[aria-pressed=true], .pen-opts .fade[aria-pressed=true] { background: var(--mmdx-accent-2); color: var(--mmdx-accent); border-color: transparent; }

.help-pop.mmdx-pop { width: 460px; }
.help-pop .help-row { grid-template-columns: minmax(0, 96px) minmax(0, 1fr); }

/* ---- zoom bar: the editor's, in the bottom right corner (under the change list) ---- */
.root > .bottom-bar { z-index: 32; }
.vbar-wrap > .mmdx-pop { position: static; }

/* ---- side panels: the editor's floating cards ---- */
.pane-side {
  position: absolute; top: 12px; bottom: 12px; z-index: 30; display: flex; flex-direction: column; min-height: 0;
  background: var(--mmdx-surface); border: 1px solid var(--mmdx-border); border-radius: 14px; overflow: hidden;
  box-shadow: 0 10px 30px rgba(20,30,60,.16), 0 1px 3px rgba(20,30,60,.08);
  transition: transform .24s cubic-bezier(.2,.8,.2,1), opacity .24s, visibility .24s;
}
.pane-side.left { left: 12px; width: var(--left-w); }
.pane-side.right { right: 12px; bottom: 60px; width: var(--right-w); }
.pane-side.left:not(.open) { transform: translateX(calc(-100% - 24px)); opacity: .4; visibility: hidden; pointer-events: none; }
.pane-side.right:not(.open) { transform: translateX(calc(100% + 24px)); opacity: .4; visibility: hidden; pointer-events: none; }
/* the left column: History on top, Code below, each a card of its own (the editor's Properties / Layers stack) */
.pane-side.left-stack { background: none; border: 0; border-radius: 0; box-shadow: none; overflow: visible; gap: 0; }
.lpanel { display: flex; flex-direction: column; min-height: 0; flex: 1 1 0; background: var(--mmdx-surface); border: 1px solid var(--mmdx-border); border-radius: 14px; overflow: hidden;
  box-shadow: 0 10px 30px rgba(20,30,60,.16), 0 1px 3px rgba(20,30,60,.08); }
.lp-split { flex: none; height: 10px; cursor: row-resize; position: relative; touch-action: none; }
.lp-split::after { content: ''; position: absolute; left: 50%; top: 4px; width: 36px; height: 3px; margin-left: -18px; border-radius: 2px; background: var(--mmdx-faint); opacity: 0; transition: opacity .12s; }
.lp-split:hover::after, .lp-split.dragging::after { opacity: 1; background: var(--mmdx-accent); }
.left-stack:not(.both) .lp-split { display: none; }
.left-stack.both.sized .lpanel.code { flex: 0 0 var(--code-h); }
.root.resizing-rows, .root.resizing-rows * { cursor: row-resize !important; user-select: none !important; }
.dbar .changes-btn .cnt { background: var(--mmdx-muted); }
.dbar .changes-btn.on .cnt { background: var(--mmdx-accent); }
.pane-resizer { position: absolute; top: 14px; bottom: 14px; width: 7px; z-index: 31; cursor: col-resize; touch-action: none; }
.pane-resizer::after { content: ''; position: absolute; top: 0; bottom: 0; left: 3px; width: 1px; background: transparent; transition: background .12s; }
.pane-resizer:hover::after, .pane-resizer.dragging::after { background: var(--mmdx-accent); width: 2px; left: 2px; }
.pane-side.left .pane-resizer { right: 0; }
.pane-side.right .pane-resizer { left: 0; }
.tabs { display: flex; align-items: center; border-bottom: 1px solid var(--mmdx-border); flex-shrink: 0; }
.tabs [role=tab] { border: 0; border-radius: 0; padding: 9px 12px; color: var(--mmdx-muted); border-bottom: 2px solid transparent; background: none; }
.tabs [role=tab][aria-selected=true] { color: var(--mmdx-text); border-bottom-color: var(--mmdx-accent); font-weight: 600; }
.tabs .head-title { padding: 9px 14px; font-weight: 600; }
.tabs-spacer { flex: 1; }
.collapse-btn { border: 0; background: none; padding: 2px 10px; color: var(--mmdx-muted); font-size: 18px; line-height: 1; border-radius: 6px; margin-right: 4px; }
.collapse-btn:hover:not(:disabled) { color: var(--mmdx-text); background: var(--mmdx-surface-2); }
.pane-body { flex: 1 1 auto; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
.empty { padding: 24px 12px; color: var(--mmdx-muted); text-align: center; }

/* change list */
.doc-changes { padding: 8px 12px; border-bottom: 1px solid var(--mmdx-border); }
.doc-changes summary { cursor: pointer; font-weight: 600; margin-bottom: 4px; }
.field { display: grid; grid-template-columns: 110px 1fr; gap: 8px; font-size: 12px; border-left: 3px solid var(--c); padding-left: 6px; margin: 3px 0; }
.fname { color: var(--mmdx-muted); overflow-wrap: anywhere; }
.fvals { display: flex; flex-wrap: wrap; gap: 4px; align-items: baseline; min-width: 0; }
.val { font: 11.5px var(--mmdx-mono); overflow-wrap: anywhere; }
.fvals .val:first-child { color: var(--mmdx-diff-del); text-decoration: line-through; }
.fvals .val:last-child { color: var(--mmdx-diff-add); }
.fvals .val.none { color: var(--mmdx-muted); text-decoration: none; }
.fvals .arrow { color: var(--mmdx-muted); }
.val .sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(0,0,0,.2); margin-right: 3px; vertical-align: -1px; }
.changes { display: flex; flex-direction: column; }
.change { width: 100%; border: 0; border-bottom: 1px solid var(--mmdx-border-2); border-radius: 0; background: none; text-align: left; padding: 6px 12px; display: grid; grid-template-columns: auto auto minmax(0, 1fr); gap: 8px; align-items: center; }
.change:hover:not(:disabled) { background: var(--mmdx-surface-2); }
.change[aria-selected=true] { background: var(--mmdx-accent-2); box-shadow: inset 3px 0 0 var(--mmdx-accent); }
.cicons { display: inline-flex; gap: 2px; }
.cicon { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 5px; color: var(--c); background: var(--c-bg); }
.change .kind { font-size: 11px; color: var(--mmdx-muted); text-transform: uppercase; letter-spacing: .03em; }
.change .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.change.st-removed .label { text-decoration: line-through; color: var(--mmdx-muted); }

/* code diff */
.code-head { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--mmdx-border); flex: none; }
.stat { font-weight: 700; }
.stat.add { color: var(--mmdx-diff-add); } .stat.del { color: var(--mmdx-diff-del); }
.muted { color: var(--mmdx-muted); }
.code-note { margin-left: auto; font-size: 11px; padding: 1px 8px; border-radius: 10px; background: var(--mmdx-diff-layout-bg); color: var(--mmdx-diff-layout); }
.code-filter { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--mmdx-border); background: var(--mmdx-accent-2); font-size: 12px; flex: none; }
.code-filter span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.code-filter button { padding: 1px 8px; font-size: 11.5px; }
.code-scroll { flex: 1; overflow: auto; min-height: 0; }
table.code { border-collapse: collapse; width: 100%; font: 11.5px/1.6 var(--mmdx-mono); }
table.code td { padding: 0 8px; white-space: pre; vertical-align: top; }
table.code td.num { width: 1%; color: var(--mmdx-muted); text-align: right; user-select: none; }
table.code td.sign { width: 1%; user-select: none; }
table.code td.txt { white-space: pre-wrap; word-break: break-all; }
.ln-add { background: var(--mmdx-diff-add-bg); } .ln-add .sign { color: var(--mmdx-diff-add); }
.ln-del { background: var(--mmdx-diff-del-bg); } .ln-del .sign { color: var(--mmdx-diff-del); }
tr.skip td, tr.gap td { background: var(--mmdx-surface-2); padding: 0; }
tr.gap td { color: var(--mmdx-faint); text-align: center; line-height: 1.2; }
tr.skip button { border: 0; border-radius: 0; background: none; color: var(--mmdx-accent); width: 100%; text-align: left; padding: 3px 12px; font: 12px var(--mmdx-font); }

/* history */
.versions { display: flex; flex-direction: column; padding: 6px; gap: 2px; }
.version { position: relative; display: flex; align-items: center; border-radius: 8px; }
.version:hover { background: var(--mmdx-surface-2); }
.version.viewing { background: var(--mmdx-accent-2); }
.version.after { background: var(--mmdx-diff-add-bg); }
.version.before { background: var(--mmdx-diff-del-bg); }
.version-main { flex: 1; min-width: 0; display: grid; gap: 2px; text-align: left; border: 0; background: none; padding: 7px 8px 7px 12px; border-radius: 8px; }
.version-main:hover:not(:disabled) { background: none; }
.vmsg { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vmeta { display: flex; align-items: baseline; gap: 8px; color: var(--mmdx-muted); font-size: 11.5px; white-space: nowrap; min-width: 0; }
.vwho { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.vmeta > .vstats, .vmeta > .vcount { margin-left: auto; flex: none; }
.vid { font: 11px var(--mmdx-mono); color: var(--mmdx-text); }
.vstats { display: inline-flex; gap: 5px; font-variant-numeric: tabular-nums; font-weight: 600; }
.vstats .add { color: var(--mmdx-diff-add); } .vstats .del { color: var(--mmdx-diff-del); } .vstats .chg { color: var(--mmdx-diff-content); }
.vstats.skeleton { width: 54px; height: 10px; border-radius: 4px; background: var(--mmdx-surface-2); }
.vtag { font-size: 10.5px; font-weight: 600; border-radius: 4px; padding: 0 5px; line-height: 16px; margin-left: 4px; background: var(--mmdx-surface-2); color: var(--mmdx-text); box-shadow: inset 0 0 0 1px var(--mmdx-border); }
.vpick { display: flex; gap: 3px; padding-right: 8px; flex: none; }
.pick { padding: 1px 6px; font-size: 11px; color: var(--mmdx-muted); }
.pick-before.on { background: var(--mmdx-diff-del-bg); border-color: var(--mmdx-diff-del); color: var(--mmdx-diff-del); font-weight: 600; }
.pick-after.on { background: var(--mmdx-diff-add-bg); border-color: var(--mmdx-diff-add); color: var(--mmdx-diff-add); font-weight: 600; }
.more { margin: 6px; }

/* ---- inside the canvases ---- */
.dx-ins { fill: var(--mmdx-diff-add); font-weight: 700; }
.dx-del { fill: var(--mmdx-diff-del); text-decoration: line-through; }
.dx-runs { pointer-events: none; }
.dx-runs rect { mix-blend-mode: var(--mmdx-diff-blend); fill-opacity: 1; }
.dx-runs .run-ins { fill: var(--mmdx-diff-run-ins); }
.dx-runs .run-del { fill: var(--mmdx-diff-run-del); }
.dx-gone { opacity: .6; }
.dx-dim { opacity: var(--mmdx-diff-dim); transition: opacity .2s; }
.dx-hl { pointer-events: visiblePainted; cursor: pointer; }
.dx-outline { fill: var(--c-bg); fill-opacity: .6; stroke: var(--c); stroke-width: 2.5px; vector-effect: non-scaling-stroke; mix-blend-mode: var(--mmdx-diff-blend); }
.dx-stroke { fill: none; stroke: var(--c); stroke-width: 9; stroke-opacity: .35; mix-blend-mode: var(--mmdx-diff-blend); }
.dx-badge { transform: scale(var(--dx-inv, 1)); }
.dx-badge rect { fill: var(--c); stroke: var(--mmdx-surface); }
.dx-badge text { fill: var(--mmdx-surface); }
.dx-hl.dx-selected .dx-outline { stroke-width: 4.5px; fill-opacity: .9; animation: dx-pulse 1.2s ease-in-out 2; }
.dx-hl.dx-selected .dx-stroke { stroke-opacity: .6; stroke-width: 13; }
@keyframes dx-pulse { 50% { stroke-width: 9px; } }
.dx-was { stroke: var(--mmdx-diff-layout); }
.dx-arrow { stroke: var(--mmdx-diff-layout); }
.dx-arrowhead { fill: var(--mmdx-diff-layout); }
.mx-flip { transform-box: fill-box; transform-origin: center; }
.ink { pointer-events: none; }
.ink path { fill: none; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; opacity: .9; transition: opacity .6s; }
.ink path.fading { opacity: 0; }

/* ---- small screens (§9.7) ---- */
@container diff (max-width: 720px) {
  .area { left: 0; right: 0; }
  .pane-side.left, .pane-side.right { left: 8px; right: 8px; width: auto; }
}
/* a narrow canvas: the views become a select, side by side stacks */
@container area (max-width: 620px) {
  .dbar button.view { display: none; }
  .dbar select.views { display: block; }
}
@container area (max-width: 480px) {
  .stage.side { flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) { .pane-side, .area { transition: none !important; } }
@media print { .vbar-wrap, .dbar, .bottom-bar, .pane-side { display: none !important; } }
`;
