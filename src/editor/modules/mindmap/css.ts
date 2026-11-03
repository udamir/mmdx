// Mindmap handles in the overlay: the + handle (add a child), the fold handle, the drop preview while a node is dragged.
export const MINDMAP_CSS = /* css */ `
.overlay .mm-add, .overlay .mm-fold-h { cursor: pointer; }
.overlay .mm-add circle, .overlay .mm-fold-h circle { fill: #fff; stroke: var(--accent); }
.overlay .mm-add path, .overlay .mm-fold-h path { stroke: var(--accent); }
.overlay .mm-add:hover circle, .overlay .mm-fold-h:hover circle { fill: var(--accent); }
.overlay .mm-add:hover path, .overlay .mm-fold-h:hover path { stroke: #fff; }
.overlay .mm-drop-on { fill: color-mix(in srgb, var(--accent) 12%, transparent); stroke: var(--accent); pointer-events: none; }
.overlay .mm-drop-line { stroke: var(--accent); stroke-linecap: round; pointer-events: none; }
.overlay .mm-ghost { fill: color-mix(in srgb, var(--accent) 10%, transparent); stroke: var(--accent); stroke-dasharray: 4 3; pointer-events: none; }
.mode-edit .canvas .mm-fold { cursor: pointer; }
`;
