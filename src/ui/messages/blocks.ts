// English strings of the UI blocks (component architecture §5.1) that the base table of `ui/i18n.ts` does not have.
// Each block registers its table on creation (registerMessages), so a page ships only the strings of the blocks it
// uses; keys shared with the editor's or the diff's catalogue have the same text.
import type { Messages } from '../i18n.js';

/** Strings of the chrome blocks (tool dock, pen options, zoom bar, help popup, scheme toggle, pill). */
export const BLOCK_MESSAGES_CHROME: Messages = {
  'pen.options': 'Pen options',
  'pen.color': 'Pen colour',
  'pen.size': 'Thickness {n}px',
  'pen.fadeAfter': 'Auto erase strokes {s} seconds after drawing',
  'zoom.bar': 'Zoom',
  'zoom.level': 'Zoom level',
  'help.button': 'Shortcuts and hints',
  'help.close': 'Close',
  'ui.appearance': 'Appearance',
  'ui.light': 'Light',
  'ui.dark': 'Dark',
};

/** Strings of the menu and panel blocks (theme menu, export menu, side panel, panel stack, layer list). */
export const BLOCK_MESSAGES_PANELS: Messages = {
  // ---- theme menu (the editor's keys, plus Follow light / dark)
  'theme.menu': 'Diagram theme', 'theme.current': 'Diagram theme: {name}', 'theme.light': 'Light themes', 'theme.dark': 'Dark themes',
  'theme.follow': 'Follow light / dark', 'theme.edit': 'Edit themes…',
  // ---- export menu
  'export.tip': 'Export the diagram',
  // ---- panel stack (splitters and the width grip)
  'panes.resize': 'Drag to resize · double-click to reset', 'panes.split': 'Drag to resize · double-click to reset',
  // ---- layer list
  'layers.rename': 'Layer name', 'layers.countLabel': '{n} items', 'layers.lock': 'Lock layer', 'layers.unlock': 'Unlock layer',
};

/** Strings of the diff-born blocks (code view, version list, change list, filter toggles), copied from the diff's catalogue. */
export const BLOCK_MESSAGES_DIFF: Messages = {
  // ---- filter toggles
  'diff.filters': 'Change filters',
  'diff.filter.tip': '{label} · {n} — click to {action}',
  'diff.filter.hide': 'hide',
  'diff.filter.show': 'show',
  // ---- change list
  'diff.panel.changes': 'Changes',
  'diff.panel.docWide': 'Diagram-wide ({n})',
  'diff.empty.noChanges': 'No changes with the current filters.',
  'diff.kind.node': 'node',
  'diff.kind.group': 'group',
  'diff.kind.edge': 'edge',
  'diff.kind.participant': 'participant',
  'diff.kind.message': 'message',
  'diff.kind.note': 'note',
  'diff.kind.block': 'block',
  'diff.kind.box': 'box',
  'diff.kind.entity': 'table',
  'diff.kind.rel': 'relation',
  'diff.status.added': 'added',
  'diff.status.removed': 'removed',
  'diff.status.changed': '{facets} changed',
  'diff.announce': '{kind} {name}: {what}',
  // ---- code view (diff mode)
  'diff.panel.linesOf': 'Lines of',
  'diff.panel.showAll': 'Show all',
  'diff.panel.showAllTip': 'Show the whole file',
  'diff.panel.lines': 'lines',
  'diff.panel.unchanged': '⋯ {n} unchanged lines',
  'diff.panel.notesTip': 'Switched-off facets are left out of the diff',
  'diff.empty.noLines': 'No code lines for this item (it lives in the metadata).',
  'diff.empty.noMeta': 'No metadata lines for this item.',
  'diff.empty.noDiff': 'No differences with the current filters.',
  // ---- version list
  'diff.panel.history': 'History',
  'diff.panel.compare': 'Compare',
  'diff.history.current': 'current',
  'diff.history.initial': 'initial',
  'diff.history.noChanges': 'no changes',
  'diff.history.before': 'Before',
  'diff.history.after': 'After',
  'diff.history.useAs': 'Use {id} as {side}',
  'diff.history.sameVersion': '{id} is already the {side} version',
  'diff.history.compareWith': 'Compare {id} with the version before it',
  'diff.history.view': 'View {id}',
  'diff.history.more': 'Load older versions',
};
