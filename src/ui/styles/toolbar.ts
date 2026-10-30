// Floating style toolbar (`ui/style-toolbar`), page toolbar (`ui/page-toolbar`) and preset pickers, ported from the
// prototype's styles.css (`.mtb*`, `.pp-*`, `.page-mtb`). Uses the prototype variable names through ALIASES, so it
// must be adopted after TOKENS + ALIASES. Shared by <mmdx-editor> and <mmdx-theme-editor>.
export const TOOLBAR_CSS = /* css */ `
.mtb { position: absolute; left: 0; top: 0; z-index: 35; display: flex; align-items: stretch; background: var(--float); border: 1px solid var(--float-line);
  border-radius: 16px; box-shadow: 0 6px 24px rgba(20, 30, 60, .14), 0 1px 3px rgba(20, 30, 60, .08); height: 52px; padding: 0 4px; user-select: none; color: var(--ink); }
.mtb[hidden] { display: none; }
.mtb-seg { display: flex; align-items: center; gap: 2px; padding: 0 6px; }
.mtb-seg + .mtb-seg { border-left: 1px solid var(--float-line); }
.mtb-btn { border: 0; background: none; border-radius: 10px; width: 40px; height: 40px; display: grid; place-items: center; color: var(--ink); padding: 0; }
.mtb .mtb-btn:hover:not(:disabled) { background: var(--float-2); }
.mtb-btn.on { background: var(--accent-2); box-shadow: inset 0 0 0 2px var(--accent); color: var(--accent); }
.mtb-btn.active { background: var(--accent-2); color: var(--accent); }
.mtb-btn.wide { width: auto; padding: 0 12px; }
.mtb-btn.danger:hover { color: var(--danger); background: var(--danger-bg); }
.mtb-btn:disabled { opacity: .35; cursor: not-allowed; }
.mtb-btn svg { display: block; }
.mtb-font { font-size: 15px; white-space: nowrap; max-width: 130px; overflow: hidden; text-overflow: ellipsis; }
.mtb-size { display: flex; align-items: center; gap: 2px; padding: 0 4px; }
.mtb-num { width: 38px; border: 0; text-align: center; font-size: 15px; color: var(--ink); background: none; border-radius: 6px; padding: 4px 0; }
.mtb-num:hover, .mtb-num:focus { background: var(--float-2); outline: none; }
.mtb-steps { display: flex; flex-direction: column; }
.mtb-steps button { border: 0; background: none; padding: 0; height: 18px; width: 22px; display: grid; place-items: center; color: var(--ink-2); }
.mtb-steps button svg { width: 16px; height: 16px; }
.mtb-steps button:hover { color: var(--accent); }
.mtb-dot { width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid var(--dot-ring); display: block; }
.checker, .mtb-sw.none { background: repeating-conic-gradient(#dcdfe5 0 25%, #fff 0 50%) 50% / 8px 8px; }
.mtb-pop { position: absolute; top: 60px; left: 0; width: 220px; overflow: auto; background: var(--float); border: 1px solid var(--float-line); border-radius: 14px; padding: 12px;
  box-shadow: 0 10px 34px rgba(20, 30, 60, .18); cursor: default; z-index: 1; }
.mtb-label { color: var(--ink-2); font-size: 12px; margin: 8px 0 6px; }
.mtb-label:first-child { margin-top: 0; }
.mtb-colors { display: grid; grid-template-columns: repeat(6, 26px); gap: 7px; }
.mtb-sw { width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); padding: 0; position: relative; }
.mtb-sw:hover { transform: scale(1.12); }
.mtb-sw.on::after { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid var(--accent); }
.mtb-sw.none::before { content: ''; position: absolute; left: 50%; top: 3px; bottom: 3px; border-left: 1.5px solid var(--faint); transform: rotate(45deg); }
.mtb-sw.mtb-add { display: grid; place-items: center; background: none; border: 1.5px dashed var(--faint); color: var(--muted); cursor: pointer; }
.mtb-sw.mtb-add:hover, .mtb-sw.mtb-add:focus-within { border-color: var(--accent); color: var(--accent); }
.mtb-sw.mtb-add input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.mtb-custom { display: flex; align-items: center; gap: 6px; margin-top: 10px; color: var(--accent); font-size: 12px; cursor: pointer; }
.mtb-custom input { width: 22px; height: 22px; border: 0; padding: 0; background: none; }
.mtb-slider { margin: 2px 0 8px; }
.mtb-slider input { width: 100%; accent-color: var(--ink-2); }
.mtb-slabel { display: flex; justify-content: space-between; color: var(--ink-2); font-size: 12px; }
.mtb-val { color: var(--muted); }
.mtb-choices { display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
.mtb-choice { border: 0; background: none; border-radius: 8px; padding: 6px 8px; color: var(--ink-2); display: grid; place-items: center; }
.mtb-choice:hover { background: var(--float-2); }
.mtb-choice.on { background: var(--accent-2); color: var(--accent); }
.mtb-shapes { display: grid; grid-template-columns: repeat(5, 36px); gap: 4px; }
.mtb-shape { border: 0; background: none; border-radius: 8px; width: 36px; height: 36px; display: grid; place-items: center; color: var(--ink-2); padding: 0; }
.mtb-shape svg { width: 26px; height: 26px; display: block; }
.mtb-shape:hover { background: var(--float-2); }
.mtb-shape.on { background: var(--accent-2); color: var(--accent); }
.mtb-list { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow: auto; }
.mtb-item { border: 0; background: none; text-align: left; padding: 6px 8px; border-radius: 8px; font-size: 13px; }
.mtb-item:hover:not(:disabled), .mtb-item:focus-visible { background: var(--float-2); }
.mtb-item.on { background: var(--accent-2); color: var(--accent); font-weight: 600; }
.mtb-row { display: flex; gap: 6px; align-items: center; margin-top: 10px; }
.mtb-row .mtb-btn { width: 32px; height: 32px; flex: none; border-radius: 8px; }
.mtb-btn.mtb-ok { background: var(--accent); color: #fff; }
.mtb-btn.mtb-ok:hover { background: var(--accent); filter: brightness(1.1); }
.mtb-input { flex: 1; min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; background: var(--surface); }
:host([data-ui="dark"]) .mtb-pop input[type=text], :host([data-ui="dark"]) .mtb-input { background: var(--float-2); }
.mtb-stacks { display: flex; gap: 4px; margin-bottom: 6px; }
.mtb-stack { flex: 1; border: 0; background: none; border-radius: 8px; padding: 6px 2px; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 11px; color: var(--ink-2); }
.mtb-stack:hover { background: var(--float-2); }
.mtb-stack.on { background: var(--accent-2); color: var(--accent); font-weight: 600; }
.mtb-pop.narrow { width: auto; padding: 8px; }
.mtb-align { display: flex; gap: 4px; }
.mtb-align .mtb-choice { width: 44px; height: 40px; padding: 0; }
.mtb-wrap { display: flex; align-items: center; gap: 8px; width: 100%; justify-content: flex-start; padding: 6px 10px; }
.mtb-layout { width: auto !important; display: flex !important; gap: 6px; padding: 0 10px !important; font-size: 12px; }
.mtb-check { width: 16px; height: 16px; border: 1.5px solid var(--faint); border-radius: 4px; display: grid; place-items: center; font-size: 11px; line-height: 1; flex: none; }
.mtb-wrap.on .mtb-check { background: var(--accent); border-color: var(--accent); color: #fff; }
.mtb-hr { border: 0; border-top: 1px solid var(--line-2); margin: 6px 4px; }
.mtb-layer { display: flex; align-items: center; gap: 8px; }
.mtb-layer .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
.mtb-layer .dot.off { background: var(--faint); }
.mtb-layer em { margin-left: auto; font-size: 11px; color: var(--muted); font-style: normal; }
.mtb-range { width: 100%; margin: 6px 0 2px; accent-color: #4262ff; cursor: ew-resize; }
.mtb-note { font-size: 12px; color: var(--muted); line-height: 1.4; }
.mtb-arrange { display: flex; gap: 6px; }
.mtb-arrange-grid { display: grid; grid-template-columns: repeat(3, 40px); gap: 2px; }
.mtb-arrange-dist { display: grid; gap: 2px; align-content: start; padding-left: 6px; border-left: 1px solid var(--line); }
.mtb-pop button.link { border: 0; background: none; padding: 4px 0; color: var(--accent); font-size: 12px; margin-top: 6px; }
.mtb-pop > .mtb-reset-curve { display: block; width: 100%; margin-top: 6px; text-align: left; color: var(--accent); }
.mtb-pop > .mtb-reset-curve:disabled { color: var(--faint); background: none; cursor: default; }
/* selection counter and its type filter */
.mtb-count { display: flex; align-items: center; gap: 4px; font-size: 14px; }
.mtb-count b { font-weight: 600; font-variant-numeric: tabular-nums; }
.mtb-type { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.mtb-type input { margin: 0; accent-color: var(--accent); }
.mtb-type span { flex: 1; }
.mtb-type em { font-style: normal; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.mtb-type.off span { color: var(--muted); }
.mtb-type:has(input:disabled) { cursor: default; }
/* ⋮ item actions */
.mtb-actions .mtb-item { display: flex; align-items: center; gap: 10px; }
.mtb-actions .mtb-item svg { width: 18px; height: 18px; flex: none; }
.mtb-actions .mtb-item span { flex: 1; }
.mtb-actions .mtb-item kbd { border: 0; background: none; color: var(--muted); font-size: 11px; }
.mtb-actions .mtb-item:disabled { opacity: .4; cursor: default; background: none; }
.mtb-actions .mtb-item.danger { color: var(--danger); }
.mtb-actions .mtb-sep { height: 1px; background: var(--float-line); margin: 4px 2px; }
/* preset pickers: previews instead of names */
.pp-grid { display: grid; grid-template-columns: repeat(var(--pp-cols, 2), minmax(0, 1fr)); gap: 6px; margin: 4px 0 8px; }
.pp-item { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 4px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); text-align: left; min-width: 0; }
.pp-item:hover { border-color: var(--accent); }
.pp-item.on { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-2); }
.pp-item.local { border-style: dashed; }
.pp-item.modified { border-color: #f59e0b; box-shadow: 0 0 0 2px rgba(245,158,11,.25); }
.pp-item.modified .pp-name { color: #b45309; }
.pp-pic { height: 52px; overflow: hidden; border-radius: 5px; }
.pp-pic svg { display: block; }
.pp-name { font-size: 11.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-item.on .pp-name { color: var(--accent); font-weight: 600; }
.pp-sep { grid-column: 1 / -1; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-top: 6px; }
.pp-del { position: absolute; top: -6px; right: -6px; width: 17px; height: 17px; border-radius: 50%; background: var(--float); box-shadow: 0 1px 3px rgba(0,0,0,.3);
  display: none; place-items: center; font-size: 12px; line-height: 1; color: var(--ink-2); border: 0; padding: 0; }
.pp-item:hover .pp-del, .pp-item:focus-within .pp-del { display: grid; }
.pp-del:hover { color: var(--danger); }
.pp-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pp-head .mtb-label { margin-bottom: 4px; }
.pp-acts { display: flex; gap: 2px; margin: 0; }
.pp-act { border: 0; background: none; width: 28px; height: 26px; padding: 0; display: grid; place-items: center; border-radius: 7px; color: var(--ink-2); }
.pp-act:hover:not(:disabled) { background: var(--float-2); color: var(--accent); }
.pp-act:disabled { opacity: .35; cursor: default; }
/* preset submenus: --cols / --rows (2–5) are set by fitPresetGrid() */
.mtb-pop.mtb-sub { --pp-tile: 74px; width: calc(var(--cols, 4) * var(--pp-tile) + (var(--cols, 4) - 1) * 6px + 26px);
  height: calc(var(--rows, 4) * 64px + (var(--rows, 4) - 1) * 6px + 56px); max-height: none; overflow-y: auto; overflow-x: hidden; }
.mtb-sub .pp-grid { grid-template-columns: repeat(var(--cols, 4), var(--pp-tile)); grid-auto-rows: 64px; margin: 0; }
.mtb-sub .pp-pic { height: 40px; }
.mtb-sub .pp-name { font-size: 10.5px; }
/* page toolbar */
.page-mtb { --pmtb-halo: rgba(0,0,0,.3); }
:host([data-ui="dark"]) .page-mtb { --pmtb-halo: rgba(255,255,255,.28); }
.page-mtb .mtb-pop > .mtb-item { display: block; width: 100%; margin-top: 8px; color: var(--muted); }
.page-mtb .mtb-pop:has(.mtb-slider) { width: 250px; }
`;
