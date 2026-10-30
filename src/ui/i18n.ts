// i18n (§13): every UI string goes through t(key, params). English is bundled; hosts add catalogs via configure().

export type Messages = Record<string, string>;

const EN: Messages = {
  'zoom.in': 'Zoom in',
  'zoom.out': 'Zoom out',
  'zoom.fit': 'Fit to view',
  'zoom.fitShort': 'Fit',
  'fullscreen.enter': 'Full screen',
  'fullscreen.exit': 'Close full screen',
  'fullscreen.failed': 'Full screen is not available here',
  'layers.title': 'View settings',
  'layers.layers': 'Layers',
  'layers.display': 'Display',
  'layers.labels': 'Connector labels',
  'layers.hover': 'Hover highlight',
  'layers.show': 'Show layer',
  'layers.hide': 'Hide layer',
  'layers.default': 'Default',
  'pen.title': 'Magic pen (P)',
  'pen.erase': 'Erase all strokes',
  'pen.fade': 'Auto erase',
  'pen.keep': 'Keep',
  'export.title': 'Export',
  'export.svg': 'SVG image',
  'export.png': 'PNG image (2×)',
  'export.mmdx': 'Styled Mermaid (.mmdx)',
  'export.mmd': 'Portable Mermaid (.mmd)',
  'alt.show': 'Show as list',
  'alt.hide': 'Show diagram',
  'error.title': 'This diagram cannot be shown',
  'error.copy': 'Copy source',
  'error.copied': 'Copied',
  'error.tooLarge': 'Diagram too large',
  'error.unsupported': 'Unsupported diagram type',
  'label.flowchart': 'Flowchart: {nodes} nodes, {edges} connections',
  'label.sequence': 'Sequence diagram: {participants} participants, {messages} messages',
  'label.er': 'ER diagram: {entities} tables, {rels} relationships',
  'label.empty': 'Empty diagram',
  'label.unsupported': 'Diagram',
  'help.title': 'Shortcuts',
  'loading': 'Loading diagram…',
};

export interface I18n {
  locale: string;
  t(key: string, params?: Readonly<Record<string, string | number>>): string;
}

/**
 * English strings of components loaded later (editor, theme editor, toolbars) are added here when the component is
 * first used, so a page with only viewers ships only the viewer's strings. Static data, never user-specific.
 */
const registered: Messages = {};
const done = new WeakSet<Messages>();

export function registerMessages(m: Messages): void {
  if (done.has(m)) return;
  done.add(m);
  for (const [k, v] of Object.entries(m)) if (!(k in registered)) registered[k] = v;
}

export function createI18n(locale = 'en', extra: Messages = {}): I18n {
  return {
    locale,
    t(key, params) {
      // a host's catalog wins over the bundled English
      const s = extra[key] ?? EN[key] ?? registered[key] ?? key;
      return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] !== undefined ? String(params[k]) : m)) : s;
    },
  };
}

export const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** `⌘` on Apple platforms, `Ctrl` elsewhere (§13). */
export const modKey = (): string => (isMac() ? '⌘' : 'Ctrl+');
