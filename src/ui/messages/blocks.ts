// English strings of the UI blocks (component architecture §5.1) that the base table of `ui/i18n.ts` does not have:
// the chrome blocks (tool dock, pen options, zoom bar, help popup, scheme toggle, pill).
// Each block registers its table on creation (registerMessages), so a page ships only the strings of the blocks it
// uses; one file per table keeps the viewer's eager chunk free of the others.
import type { Messages } from '../i18n.js';

export const BLOCK_MESSAGES_CHROME: Messages = {
  'pen.options': 'Pen options',
  'pen.color': 'Pen colour',
  'pen.colorNamed': 'Pen colour: {name}',
  'pen.colors.red': 'red', 'pen.colors.orange': 'orange', 'pen.colors.yellow': 'yellow', 'pen.colors.green': 'green',
  'pen.colors.blue': 'blue', 'pen.colors.purple': 'purple', 'pen.colors.black': 'black',
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
