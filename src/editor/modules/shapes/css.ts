// Shapes menu (the ShapePalette block brings its own styles), preset submenus and the drag ghost (prototype styles.css `.shapes-menu`, `.pal-*`, `.mtb-sub`, `.pp-*`).
export const SHAPES_CSS = /* css */ `
.shapes-menu { position: absolute; z-index: 22; left: 64px; top: 50%; transform: translateY(-50%); width: 230px;
  max-height: min(560px, calc(100% - 140px)); overflow: auto; box-sizing: border-box;
  background: var(--float); border: 1px solid var(--float-line); border-radius: 14px; padding: 8px; box-shadow: 0 8px 28px rgba(20,30,60,.16); }
.shapes-menu[hidden] { display: none; }
.shapes-menu.grid { width: 276px; }
.shapes-menu .sp-title { padding: 4px 6px 6px; }
.pal-ghost { position: absolute; z-index: 100; pointer-events: none; opacity: .85; transform: translate(-50%, -50%); color: var(--ink-2);
  filter: drop-shadow(0 4px 10px rgba(0,0,0,.18)); }
.shapes-sub { position: absolute; z-index: 23; overflow: auto; background: var(--float); border: 1px solid var(--float-line); border-radius: 14px;
  padding: 12px; box-shadow: 0 10px 34px rgba(20, 30, 60, .18); cursor: default; }
.shapes-sub[hidden] { display: none; }
.shapes-sub .mtb-label { color: var(--ink-2); font-size: 12px; margin: 0 0 6px; }
.shapes-sub.mtb-sub { --pp-tile: 74px; width: calc(var(--cols, 4) * var(--pp-tile) + (var(--cols, 4) - 1) * 6px + 26px);
  height: calc(var(--rows, 4) * 64px + (var(--rows, 4) - 1) * 6px + 56px); max-height: none; overflow-y: auto; overflow-x: hidden; box-sizing: border-box; }
.shapes-sub .pp-grid { display: grid; grid-template-columns: repeat(var(--cols, 4), var(--pp-tile)); grid-auto-rows: 64px; gap: 6px; margin: 0; }
.shapes-sub .pp-item { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 4px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--surface); text-align: left; min-width: 0; cursor: grab; touch-action: none; }
.shapes-sub .pp-item:hover { border-color: var(--accent); }
.shapes-sub .pp-pic { height: 40px; overflow: hidden; border-radius: 5px; pointer-events: none; }
.shapes-sub .pp-pic svg { display: block; }
.shapes-sub .pp-name { font-size: 10.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;
