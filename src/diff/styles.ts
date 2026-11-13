// <mmdx-diff> styles (§9, §10): the highlight tokens, the host box, the stage of a DiffScene (panes, titles, messages)
// and the diff marks inside the canvases. The chrome is the blocks' own CSS (adopted by the modules that use them).
// Every colour comes from a token: the `--mmdx-*` chrome tokens (ui/kit/base.ts) and the `--mmdx-diff-*` highlight
// tokens below, light and dark, made from core's DIFF_COLORS (the colours of exported diffs).
// Hosts override any of them on the element (`mmdx-diff { --mmdx-diff-add: … }`).
import { DIFF_COLORS, MARKS, type DiffColors, type Mark } from '../core/diff/annotate.js';

/** The token name of each mark's colour. */
const TOKEN: Record<Mark, string> = { added: 'add', removed: 'del', content: 'content', layout: 'layout', style: 'style' };

/** A scheme's mark tokens, from the colours exports draw with (one source). */
const markTokens = (c: DiffColors): string =>
  MARKS.map((m) => `--mmdx-diff-${TOKEN[m]}: ${c.marks[m].c}; --mmdx-diff-${TOKEN[m]}-bg: ${c.marks[m].bg};`).join('\n  ') + `\n  --mmdx-diff-dim: ${c.dim};`;

export const DIFF_TOKENS = /* css */ `
:host {
  ${markTokens(DIFF_COLORS.light)}
  --mmdx-diff-run-ins: #aff5b4; --mmdx-diff-run-del: #ffd2cf;
  --mmdx-diff-blend: multiply;
  --mmdx-diff-tip: #1d2330; --mmdx-diff-tip-ink: #fff;
}
:host([data-ui="dark"]) {
  ${markTokens(DIFF_COLORS.dark)}
  --mmdx-diff-run-ins: rgba(46,160,67,.35); --mmdx-diff-run-del: rgba(248,81,73,.35);
  /* multiply would darken a dark canvas: translucent fills instead */
  --mmdx-diff-blend: normal;
  --mmdx-diff-tip: #e6e8ee; --mmdx-diff-tip-ink: #1d2330;
}
`;

/** The `<mmdx-diff>` element's own box (not adopted by the hosts that show History in place). */
export const DIFF_HOST_CSS = /* css */ `
:host { display: block; position: relative; height: 640px; min-height: 360px; contain: content; }
:host(:fullscreen) { height: 100%; }
.root { position: absolute; inset: 0; overflow: hidden; background: var(--mmdx-surface); outline: none; border-radius: inherit; }
.area { container: area / size; position: absolute; inset: 0; }
@media print { .tool-dock, .bottom-bar, .view-params { display: none !important; } }
`;

/** The stage of a DiffScene and the marks in its canvases (every selector scoped to the stage). */
export const DIFF_CSS = /* css */ `
.mmdx-area { container: area / size; }

/* ---- the stage: one pane, or two side by side; inset by the open panel stacks ---- */
.dx-stage { position: absolute; top: 0; bottom: 0; left: var(--inset-l, 0px); right: var(--inset-r, 0px); display: flex; gap: 1px; background: var(--mmdx-border);
  transition: left .24s cubic-bezier(.2,.8,.2,1), right .24s cubic-bezier(.2,.8,.2,1); }
.dx-stage.single { background: transparent; }
.resizing-panes .dx-stage { transition: none; }
.dx-stage .pane { position: relative; flex: 1; min-width: 0; overflow: hidden; background: var(--mmdx-surface); }
.dx-stage .pane > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; }
.dx-stage .pane > svg.panning { cursor: grabbing; }
.dx-stage .pane-title { position: absolute; top: 8px; left: 8px; right: 200px; display: flex; gap: 6px; align-items: baseline; pointer-events: none; z-index: 2; min-width: 0; }
.dx-stage .pane-title b { background: var(--mmdx-surface); border: 1px solid var(--mmdx-border); border-radius: 5px; padding: 1px 8px; font-size: 12px; flex: none; }
.dx-stage .pane-title span { color: var(--mmdx-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dx-stage .pane.before .pane-title b { color: var(--mmdx-diff-del); }
.dx-stage .pane.after .pane-title b { color: var(--mmdx-diff-add); }
.dx-stage > .mmdx-banner { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 5; max-width: calc(100% - 32px); }
.dx-stage .msg { position: absolute; inset: 0; display: grid; place-items: center; color: var(--mmdx-muted); pointer-events: none; }
.dx-stage .msg .error { pointer-events: auto; }
.dx-stage .el[data-link] { cursor: pointer; }

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
.dx-added { --c: var(--mmdx-diff-add); --c-bg: var(--mmdx-diff-add-bg); }
.dx-removed { --c: var(--mmdx-diff-del); --c-bg: var(--mmdx-diff-del-bg); }
.dx-content { --c: var(--mmdx-diff-content); --c-bg: var(--mmdx-diff-content-bg); }
.dx-layout { --c: var(--mmdx-diff-layout); --c-bg: var(--mmdx-diff-layout-bg); }
.dx-style { --c: var(--mmdx-diff-style); --c-bg: var(--mmdx-diff-style-bg); }
.dx-outline { fill: var(--c-bg); fill-opacity: .6; stroke: var(--c); stroke-width: 2.5px; vector-effect: non-scaling-stroke; mix-blend-mode: var(--mmdx-diff-blend); }
.dx-stroke { fill: none; stroke: var(--c); stroke-width: 9; stroke-opacity: .35; mix-blend-mode: var(--mmdx-diff-blend); }
.dx-badge { transform: scale(var(--dx-inv, 1)); }
.dx-badge rect { fill: var(--c); stroke: var(--mmdx-surface); }
.dx-badge .dx-icon { stroke: var(--mmdx-surface); }
.dx-hl.dx-selected .dx-outline { stroke-width: 4.5px; fill-opacity: .9; animation: dx-pulse 1.2s ease-in-out 2; }
.dx-hl.dx-selected .dx-stroke { stroke-opacity: .6; stroke-width: 13; }
@keyframes dx-pulse { 50% { stroke-width: 9px; } }
.dx-was { stroke: var(--mmdx-diff-layout); }
.dx-arrow { stroke: var(--mmdx-diff-layout); }
.dx-arrowhead { fill: var(--mmdx-diff-layout); }
.mx-flip { transform-box: fill-box; transform-origin: center; }

/* ---- small screens (§9.7): side by side stacks ---- */
@container area (max-width: 480px) {
  .dx-stage.side { flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) { .dx-stage { transition: none !important; } }
`;
