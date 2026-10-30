// <mmdx-theme-editor> (§8.3), ported from the prototype's styles.css (`.te-*`, the read-only preview viewer) and
// scoped to the element's shadow root. Prototype variable names come from ALIASES (ui/styles/base.ts).
export const THEME_EDITOR_CSS = /* css */ `
:host { display: block; position: relative; height: 100%; min-height: 480px; }
:host([presentation="dialog"]) { display: contents; }
:host([hidden]) { display: none; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; gap: 0; }
.seg button { border: 0; border-radius: 0; padding: 4px 12px; background: var(--surface); }
.seg button.on { background: var(--accent); color: #fff; }
.seg.small button { padding: 2px 8px; font-size: 12px; }
button.link { border: 0; background: none; padding: 2px 0; color: var(--accent); font-size: 12px; align-self: flex-start; }
button.small { padding: 2px 8px; font-size: 12px; }
.te-overlay { position: fixed; inset: 0; z-index: var(--ds-z-popover); background: rgba(20, 26, 40, .35); display: grid; place-items: center; }
.te-dialog { width: min(1320px, 95vw); height: min(880px, 92vh); background: var(--surface); color: var(--ink); border-radius: 16px; box-shadow: 0 20px 60px rgba(20,30,60,.3);
  display: flex; flex-direction: column; overflow: hidden; position: relative; outline: none; }
.te-dialog.inline { width: 100%; height: 100%; border-radius: 12px; border: 1px solid var(--line); box-shadow: none; }
.te-head { display: flex; align-items: baseline; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
.te-head b { font-size: 16px; }
.te-sub { color: var(--muted); font-size: 12px; flex: 1; }
.te-ro-tag { font-size: 11px; color: var(--warn-ink); background: var(--warn-bg); border-radius: 10px; padding: 1px 8px; }
.te-close { border: 0; background: none; font-size: 22px; line-height: 1; color: var(--muted); padding: 0 4px; }
.te-close:hover { color: var(--ink); }
.te-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 230px 1fr 400px; position: relative; }
.te-list { border-right: 1px solid var(--line); padding: 10px; overflow: auto; display: flex; flex-direction: column; gap: 4px; background: var(--surface-2); }
.te-theme { text-align: left; border: 0; background: none; border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
.te-theme:hover { background: var(--surface); }
.te-theme.on { background: var(--accent-2); }
.te-tname { font-weight: 600; font-size: 13px; }
.te-ttag { font-size: 11px; color: var(--muted); }
.te-list-acts { display: flex; flex-direction: column; gap: 5px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.te-list-acts button { text-align: left; }
.te-main { overflow: auto; padding: 14px 18px 30px; position: relative; }
.te-top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; position: sticky; top: -14px; z-index: 6; background: var(--surface);
  margin: -14px -18px 12px; padding: 12px 18px 10px; border-bottom: 1px solid var(--line-2); }
.te-name { font-size: 18px; font-weight: 600; border: 1px solid transparent; border-radius: 6px; padding: 3px 6px; min-width: 220px; background: transparent; }
.te-name:hover, .te-name:focus { border-color: var(--line); outline: none; }
.te-spacer { flex: 1; }
.te-type { margin: 18px 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; }
.te-card { border: 1px solid var(--line); border-radius: 10px; margin-bottom: 6px; background: var(--surface); }
.te-card-head { width: 100%; border: 0; background: none; display: flex; align-items: center; gap: 8px; padding: 9px 12px; font-weight: 600; text-align: left; }
.te-caret { color: var(--muted); width: 12px; }
.te-badge { margin-left: auto; font-size: 11px; font-weight: 500; color: var(--accent); background: var(--accent-2); border-radius: 10px; padding: 1px 8px; }
.te-card-body { padding: 2px 14px 12px 32px; }
.te-hint { color: var(--muted); font-size: 12px; margin: 4px 0 10px; line-height: 1.4; }
.te-hint.warn { color: var(--warn-ink); }
.te-f { display: grid; grid-template-columns: 150px 1fr; align-items: center; gap: 10px; margin: 4px 0; }
.te-f > label { font-size: 12.5px; color: var(--ink-2); }
.te-f.set > label { color: var(--accent); font-weight: 600; }
.te-ctl { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.te-ctl input[type=number], .te-ctl input[type=text], .te-ctl select { width: 170px; }
.te-ctl input[type=range] { width: 170px; }
.te-reset { border: 0; background: none; color: var(--faint); padding: 0 4px; font-size: 15px; }
.te-reset:hover { color: var(--danger); }
.te-chip { width: 26px; height: 22px; border-radius: 6px; border: 1px solid rgba(0,0,0,.18); padding: 0; flex: none; }
.te-chip-label { font-size: 12px; font-family: var(--ds-mono); min-width: 140px; }
.te-chip-label.inherited { color: var(--muted); }
.te-f.invalid > label { color: var(--danger); font-weight: 600; }
.te-f.invalid .te-ctl input, .te-f.invalid .te-ctl select, .te-f.invalid .te-chip { border-color: var(--danger); box-shadow: 0 0 0 1px var(--danger); }
.te-ferr { flex-basis: 100%; color: var(--danger); font-size: 11.5px; }
.te-errors { border: 1px solid var(--danger); background: var(--danger-bg); color: var(--danger); border-radius: 8px; padding: 8px 12px; margin: 0 0 12px; font-size: 12.5px; }
.te-errors ul { margin: 4px 0 0; padding-left: 18px; }
.te-errors code { font-family: var(--ds-mono); font-size: 11.5px; }
/* palette circles */
.te-palette { display: flex; flex-wrap: wrap; gap: 10px; }
.te-dot { position: relative; width: 30px; height: 30px; border-radius: 50%; background: var(--c); cursor: pointer; flex: none;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.14); transition: transform .1s; }
.te-dot:hover { transform: scale(1.12); }
.te-dot:focus-within { box-shadow: inset 0 0 0 1px rgba(0,0,0,.14), var(--ds-focus); }
.te-dot.set { box-shadow: inset 0 0 0 1px rgba(0,0,0,.14), 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }
.te-dot input[type=color] { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; border: 0; padding: 0; }
.te-dot-x { position: absolute; top: -6px; right: -6px; width: 16px; height: 16px; border-radius: 50%; border: 0; padding: 0; line-height: 15px;
  font-size: 12px; background: var(--surface); color: var(--ink-2); box-shadow: 0 1px 3px rgba(0,0,0,.3); display: none; z-index: 1; }
.te-dot:hover .te-dot-x, .te-dot:focus-within .te-dot-x { display: block; }
.te-dot-x:hover { color: var(--danger); }
.te-dot-add { --c: var(--surface); box-shadow: inset 0 0 0 1.5px var(--faint); display: grid; place-items: center; color: var(--muted); }
.toggle { appearance: none; -webkit-appearance: none; flex: none; position: relative; width: 32px; height: 18px; margin: 0; border-radius: 9px;
  background: var(--toggle-off); cursor: pointer; transition: background .15s; }
.toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .25); transition: transform .15s; }
.toggle:checked { background: var(--accent); }
.toggle:checked::after { transform: translateX(14px); }
.toggle.inherited { opacity: .55; }
/* colour chip popover */
.ds-pop.te-pop { position: fixed; z-index: calc(var(--ds-z-popover) + 5); width: 240px; background: var(--float); border: 1px solid var(--float-line); border-radius: 12px; padding: 10px; box-shadow: 0 10px 30px rgba(20,30,60,.2); }
.te-pop-title { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
.te-pop-grid { display: grid; grid-template-columns: repeat(8, 22px); gap: 5px; }
.te-pop-sw { width: 22px; height: 22px; border-radius: 50%; border: 0; padding: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.te-pop-sw.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }
.te-pop-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; }
.te-pop-row input[type=color] { width: 30px; height: 24px; border: 0; padding: 0; background: none; }
.te-pop-row .small { margin-left: auto; }
/* style tiles: the column count follows the panel width; per item type a base tile width (--tm) and height (--th),
   both scaled by the preview zoom (--tz, set on .te-main) */
.te-tiles { --tm: 130px; --th: 90px; --tile-min: calc(var(--tm) * var(--tz, 1)); --tile-h: calc(var(--th) * var(--tz, 1));
  display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--tile-min), 1fr)); gap: 10px; padding: 4px 0 6px; }
.te-tiles[data-kind="node"] { --tm: 175px; --th: 100px; }
.te-tiles[data-kind="participant"] { --tm: 270px; --th: 120px; }
.te-tiles[data-kind="group"] { --tm: 175px; --th: 160px; }
.te-tiles[data-kind="entity"], .te-tiles[data-kind="note"], .te-tiles[data-kind="box"] { --tm: 260px; --th: 160px; }
.te-tiles[data-kind="block"], .te-tiles[data-kind="activation"] { --tm: 260px; --th: 180px; }
.te-tiles[data-kind="edge"], .te-tiles[data-kind="message"], .te-tiles[data-kind="rel"], .te-tiles[data-kind="lifeline"] { --tm: 260px; --th: 110px; }
.te-tiles[data-kind="page"] { --tm: 150px; --th: 84px; }
.te-zoom { display: flex; align-items: center; gap: 2px; margin-left: auto; font-size: 12px; color: var(--muted); }
.te-zoom button { border: 1px solid var(--line); background: var(--surface); width: 26px; height: 24px; border-radius: 6px; padding: 0; }
.te-zoom output { min-width: 42px; text-align: center; font-variant-numeric: tabular-nums; }
.te-tile { position: relative; min-width: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); padding: 6px; display: flex; flex-direction: column;
  gap: 5px; text-align: left; cursor: pointer; }
.te-tile:hover { border-color: var(--accent); }
.te-tile:focus-visible { outline: none; box-shadow: var(--ds-focus); }
.te-tile.on { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(66,98,255,.25); }
.te-tile-pic { height: var(--tile-h); display: block; overflow: hidden; border-radius: 6px; }
.te-tile-pic svg { display: block; border-radius: 6px; }
.te-tile-cap { font-size: 12px; color: var(--ink-2); display: flex; align-items: center; gap: 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.te-dotmark { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex: none; }
.te-warn { margin-left: auto; flex: none; color: var(--warn-ink); background: var(--warn-bg); border: 1px solid var(--warn-line); border-radius: 8px; font-size: 10.5px; padding: 0 5px; line-height: 15px; }
.te-tile-del { position: absolute; top: -7px; right: -7px; width: 18px; height: 18px; border-radius: 50%; background: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,.3);
  display: none; place-items: center; font-size: 13px; line-height: 1; color: var(--ink-2); border: 0; padding: 0; }
.te-tile:hover .te-tile-del, .te-tile:focus-within .te-tile-del { display: grid; }
.te-tile-del:hover { color: var(--danger); }
.te-tile-add { justify-content: center; align-items: center; color: var(--accent); font-weight: 600; min-height: calc(var(--tile-h) + 30px); border-style: dashed; }
.te-page-pic { height: var(--tile-h); border-radius: 6px; position: relative; overflow: hidden; background-color: var(--pg-bg, transparent);
  background-image: linear-gradient(var(--pg-grid, transparent) 1px, transparent 1px), linear-gradient(90deg, var(--pg-grid, transparent) 1px, transparent 1px);
  background-size: 12px 12px; box-shadow: inset 0 0 0 2px var(--pg-border, transparent); }
.te-page-pic.clear { background-color: transparent; outline: 1px dashed var(--line); outline-offset: -1px; }
.te-page-pic span { position: absolute; left: 8px; bottom: 6px; font-size: 10.5px; color: var(--muted); background: var(--surface); border-radius: 4px; padding: 0 4px; }
.te-allprops { margin-top: 6px; }
.te-allprops summary { cursor: pointer; font-size: 12.5px; color: var(--muted); padding: 4px 0; }
/* node shape tabs */
.te-shapes { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 10px; }
.te-shape { position: relative; width: 40px; height: 36px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); padding: 0; color: var(--ink-2); }
.te-shape:hover { border-color: var(--accent); }
.te-shape.on { border-color: var(--accent); background: var(--accent-2); color: var(--accent); }
.te-shape svg { width: 22px; height: 22px; }
.te-shape-n { position: absolute; right: 2px; bottom: 1px; font-size: 9.5px; font-weight: 600; color: var(--muted); }
/* preview: sample diagram */
.te-preview { border-left: 1px solid var(--line); padding: 12px; overflow: auto; background: var(--surface-2); display: flex; flex-direction: column; gap: 10px; }
.te-phead { display: flex; align-items: center; gap: 6px; }
.te-ptabs { display: flex; gap: 4px; }
.te-ptabs button { border: 0; background: none; padding: 5px 10px; border-radius: 7px; font-size: 12.5px; }
.te-ptabs button.on { background: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,.1); font-weight: 600; color: inherit; }
.te-codebtn { margin-left: auto; border: 1px solid var(--line); background: var(--surface); border-radius: 7px; padding: 4px 9px; font-size: 12px; font-family: var(--ds-mono); }
.te-codebtn.on { background: var(--accent-2); border-color: var(--accent); color: var(--accent); }
.te-code { width: 100%; height: 150px; min-height: 90px; resize: vertical; flex: none; font: 12px/1.45 var(--ds-mono); border: 1px solid var(--line); border-radius: 8px; padding: 8px; background: var(--surface); }
.te-perr:empty { display: none; }
.te-perr { color: var(--danger); }
.te-pbox { position: relative; flex: 1; min-height: 320px; background: var(--surface); border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.06); overflow: hidden; }
.vw-svg { display: block; width: 100%; height: 100%; position: absolute; inset: 0; cursor: grab; touch-action: none; user-select: none;
  background: var(--bg) radial-gradient(var(--dots) 1px, transparent 1px) 0 0 / 22px 22px; }
.vw-zoom { position: absolute; right: 8px; bottom: 8px; z-index: 2; display: flex; align-items: center; gap: 2px; padding: 3px; }
.vw-zoom button { border: 0; background: transparent; padding: 2px 6px; }
.vw-zoom button:hover { background: var(--float-2); }
.vw-zoom output { min-width: 40px; text-align: center; font-size: 12px; font-variant-numeric: tabular-nums; }
/* unsaved changes (amber) + header actions */
.te-actions { display: flex; align-items: center; gap: 4px; }
.te-actions .te-undo, .te-actions .te-redo { border: 1px solid var(--line); background: var(--surface); width: 28px; height: 26px; border-radius: 6px; padding: 0; display: grid; place-items: center; }
.te-actions button:disabled { opacity: .35; }
.te-unsaved { font-size: 12px; color: #b45309; margin-right: 4px; }
.te-unsaved[hidden] { display: none; }
.te-type.dirty { color: #b45309; }
.te-type.dirty::after { content: ' •'; }
.te-card.dirty { border-color: #f5b041; box-shadow: inset 3px 0 0 #f59e0b; }
.te-tile.dirty { border-color: #f59e0b; box-shadow: 0 0 0 1px #f59e0b; }
.te-tile.dirty.on { box-shadow: 0 0 0 2px rgba(66,98,255,.25), 0 0 0 1px #f59e0b; }
.te-dot.dirty { box-shadow: inset 0 0 0 1px rgba(0,0,0,.14), 0 0 0 2px var(--surface), 0 0 0 4px #f59e0b; }
.te-f.dirty > label { color: #b45309; font-weight: 600; }
.te-f.dirty > label::before { content: '• '; }
.te-name.dirty { border-color: #f5b041; }
.te-theme.dirty .te-tname::after { content: ' •'; color: #f59e0b; }
.te-shape.dirty { border-color: #f59e0b; box-shadow: 0 0 0 1px #f59e0b; }
.te-body > .mtb { z-index: 40; }
.te-ro .te-main input, .te-ro .te-main select { pointer-events: none; }
.te-file { display: none; }
.te-loading { padding: 24px; color: var(--muted); }
:host([data-ui="dark"]) .te-unsaved, :host([data-ui="dark"]) .te-f.dirty > label, :host([data-ui="dark"]) .te-type.dirty { color: #f0b45b; }
`;
