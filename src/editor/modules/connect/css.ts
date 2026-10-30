// Overlay handles of connections and bend points (prototype styles.css). Prototype variable names work through the
// aliases in src/ui/styles/base.ts.
export const CONNECT_CSS = /* css */ `
.overlay .end-handle { fill: #fff; stroke: var(--accent); cursor: grab; }
.overlay .end-handle.fixed { fill: var(--accent); }
.overlay .end-handle:hover { r: 8; }
.overlay .magnet { fill: #fff; stroke: var(--accent); pointer-events: none; opacity: .9; }
.overlay .magnet.on { fill: var(--accent); }
.overlay .conn-dot { cursor: crosshair; }
.overlay .conn-dot-c { fill: #fff; stroke: var(--accent); }
.overlay .conn-dot path { stroke: var(--accent); stroke-linecap: round; }
.overlay .conn-dot:hover .conn-dot-c { fill: var(--accent); }
.overlay .conn-dot:hover path { stroke: #fff; }
.overlay .link-preview { fill: none; stroke: var(--accent); pointer-events: none; }
.overlay .link-tip { fill: var(--accent); pointer-events: none; }
.overlay .link-hint { fill: var(--accent); font-weight: 600; pointer-events: none; }
.overlay .bend-new { fill: #fff; stroke: var(--accent); fill-opacity: .9; cursor: grab; pointer-events: all; }
.overlay .bend-new:hover { fill: var(--accent-2); }
.overlay .bend-pt { fill: var(--accent); stroke: #fff; cursor: move; pointer-events: all; }
.overlay .bend-pt:hover { stroke: var(--accent-2); }
`;
