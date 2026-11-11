// Named priorities of the editor's gesture sources and overlay painters (A10h): who wins a pointer press, and who
// paints over whom, by name instead of numbers spread over the modules (a host's module picks a number among them).

/** Gesture source priorities: a higher one is asked first (handles over items over the background). */
export const GESTURE = {
  /** Handles drawn on the overlay: resize, connector ends and waypoints, connection dots. */
  handle: 100,
  /** The ER table being edited (its rows and the new-row field). */
  table: 95,
  /** A diagram type's own gestures (sequence messages and lifelines, mindmap branches). */
  kind: 90,
  /** Copy style: painting the copied style onto items. */
  paint: 60,
  /** Items: select, move, enter groups. */
  item: 50,
  /** The empty canvas: the marquee. */
  background: 10,
} as const;

/** Overlay painter order: a lower one paints first (underneath). */
export const PAINT = {
  /** Selection boxes and resize handles. */
  selection: 10,
  /** The ER table being edited. */
  table: 11,
  /** Connector handles, connection dots and the link preview. */
  connect: 70,
  /** A diagram type's own marks (sequence, mindmap). */
  kind: 80,
} as const;
