// Keyboard shortcuts as the UI shows them (A.11): the Shortcut entry, the key names of a platform (⌘ on Apple) and
// what counts as typing. The registry that handles them is the kernel's keymap (view/keymap.ts).
import { isMac } from '../../i18n.js';

export interface Shortcut {
  id: string;
  /** e.g. `mod+z`, `mod+shift+z`, `shift+arrowup`, `v`, `?`, `delete`. `mod` = ⌘ on Apple, Ctrl elsewhere. */
  keys: readonly string[];
  /** Help text. */
  label: string;
  group: string;
  /** Hidden in View mode (help and handling), and while an old version shows read-only (the `version` stage). */
  editOnly?: boolean;
  /** An `editOnly` shortcut that edits nothing (copy, select all, tools, panels): kept while a version shows. */
  readOnly?: boolean;
  /** Shown in help only (gestures like Space+drag, Alt-drag). */
  hintOnly?: boolean;
  run?: (ev: KeyboardEvent) => boolean | void;
  /** Allowed while typing in an input / textarea / contenteditable. */
  inText?: boolean;
  /** Active only in these modes / stages (component architecture §13; `editOnly` is `{ mode: ['edit'] }`). */
  when?: { mode?: readonly string[]; stage?: readonly string[] };
  /** False while the module that registered it is suspended (set by the kernel). */
  active?: () => boolean;
}

/** Where key handling happens: the component's mode and stage. A boolean is the older "editing" flag. */
export const isTextTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

export function formatKeys(keys: string): string {
  const mac = isMac();
  const map: Record<string, string> = mac
    ? { mod: '⌘', shift: '⇧', alt: '⌥', delete: '⌫', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Esc', enter: '↩', space: 'Space' }
    : { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', delete: 'Del', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Esc', enter: 'Enter', space: 'Space' };
  const parts = keys.split('+').map((p) => map[p] ?? (p.length === 1 ? p.toUpperCase() : p));
  if (mac) {
    // macOS order: ⌃⌥⇧⌘ then the key
    const order = ['⌥', '⇧', '⌘'];
    const mods = parts.filter((p) => order.includes(p)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return mods.join('') + parts.filter((p) => !order.includes(p)).join('');
  }
  return parts.join('+');
}
