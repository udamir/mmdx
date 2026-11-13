// The icons of the change marks (24×24 stroke paths), shared by the diff's badges and legend (annotate.ts, render.ts)
// and the UI's filter toggles: plus, minus, edit (a pen), move (four arrows), style (a flat paintbrush).
export const MARK_ICONS: Record<'added' | 'removed' | 'content' | 'layout' | 'style', string> = {
  added: 'M12 5v14M5 12h14',
  removed: 'M5 12h14',
  content: 'M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4zM14.5 6.5l3 3',
  layout: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  style: 'M7.1 9.9L13.4 3.6L16 6.1L14.7 9.3L17.9 8L20.4 10.6L14.1 16.9ZM9 8L16 15M9.3 12.2L3.6 17.9A1.8 1.8 0 0 0 6.1 20.4L11.8 14.7',
};
