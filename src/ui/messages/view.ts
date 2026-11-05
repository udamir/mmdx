// English strings of the view kernel's standard modules (tool dock, zoom bar keys, pen, view settings, code view,
// History button) that the base table of `ui/i18n.ts` does not have. Registered by the kernel (registerMessages); the
// texts match the editor's catalogue.
import type { Messages } from '../i18n.js';

export const VIEW_MESSAGES: Messages = {
  'tools.title': 'Tools',
  'tools.hand': 'Hand — drag to move around',
  'tools.pen': 'Magic pen — draw; strokes are not saved',
  'tools.viewSettings': 'View settings — layers and display',
  'tools.codeView': 'Mermaid code — show or hide the code panel',
  'tools.versions': 'History — the versions of this diagram and what changed',
  'help.tools': 'Tools',
  'help.view': 'View',
  'help.toggle': 'Shortcuts and hints',
  'help.escClose': 'Close this help',
  'help.hand': 'Hand (pan)',
  'help.pen': 'Pen — draw, fades away',
  'help.escTool': 'Back to the default tool',
  'help.pan': 'Move around',
  'help.viewSettings': 'View settings',
  'help.codeView': 'Mermaid code panel',
  'help.history': 'History of this diagram (when it has one)',
  'viewParams.title': 'View',
  'export.failed': '{kind} export failed: {msg}',
  'export.imagesMissing': '{n} of the images could not be included (blocked by the image host)',
  'panel.close': 'Close',
  'view.links': 'Links',
};
