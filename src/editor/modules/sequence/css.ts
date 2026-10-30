// Sequence handles in the overlay (prototype styles.css: lifeline / message-end circles, block / note / process edge
// handles, participant ◀ ▶ arrows, previews).
export const SEQUENCE_CSS = /* css */ `
.overlay .ll-dot { cursor: crosshair; }
.overlay .act-dot { cursor: ns-resize; }
.overlay .ll-dot-c, .overlay .act-dot-c { fill: #fff; stroke: var(--accent); }
.overlay .ll-dot:hover .ll-dot-c, .overlay .act-dot:hover .act-dot-c { fill: var(--accent); }
.overlay .act-preview { fill: color-mix(in srgb, var(--accent) 25%, transparent); stroke: var(--accent); pointer-events: none; }
.overlay .link-preview { fill: none; stroke: var(--accent); pointer-events: none; }
.overlay .link-tip { fill: var(--accent); pointer-events: none; }
.overlay .link-hint { fill: var(--accent); font-weight: 600; pointer-events: none; }
.overlay .bedge { fill: #fff; stroke: var(--accent); cursor: ns-resize; }
.overlay .bedge:hover { fill: var(--accent); }
.overlay .nedge { fill: #fff; stroke: var(--accent); cursor: ew-resize; }
.overlay .nedge:hover { fill: var(--accent); }
.overlay .pmove { cursor: pointer; }
.overlay .pmove circle { fill: #fff; stroke: var(--accent); }
.overlay .pmove path { fill: var(--accent); }
.overlay .pmove:hover circle { fill: var(--accent); }
.overlay .pmove:hover path { fill: #fff; }
.overlay .pmove.off { opacity: .3; pointer-events: none; }
.mode-edit .canvas .lifeline-hit { cursor: crosshair; }
`;
