// English strings of the UI blocks (component architecture §5.1) that the base table of `ui/i18n.ts` does not have:
// the menu and panel blocks (theme menu, export menu, side panel, panel stack, layer list).
// Each block registers its table on creation (registerMessages), so a page ships only the strings of the blocks it
// uses; one file per table keeps the viewer's eager chunk free of the others.
import type { Messages } from '../i18n.js';

export const BLOCK_MESSAGES_PANELS: Messages = {
  // ---- theme menu (the editor's keys, plus Follow light / dark)
  'theme.menu': 'Diagram theme', 'theme.current': 'Diagram theme: {name}', 'theme.light': 'Light themes', 'theme.dark': 'Dark themes',
  'theme.follow': 'Follow light / dark', 'theme.edit': 'Edit themes…',
  // ---- export menu
  'export.tip': 'Export the diagram',
  // ---- side panel (close button) and panel stack (splitters and the width grip)
  'panel.close': 'Close',
  'panes.resize': 'Drag to resize · double-click to reset', 'panes.split': 'Drag to resize · double-click to reset',
  // ---- layer list
  'layers.rename': 'Layer name', 'layers.countLabel': '{n} items', 'layers.lock': 'Lock layer', 'layers.unlock': 'Unlock layer',
};
