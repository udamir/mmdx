// Shortcut registry (A.11): one table drives key handling, the help popup (row 20) and the a11y hints. Scoped to
// the component that owns it (§8.2): it handles keydown events from its own shadow root only.
import { isMac } from './i18n.js';

export interface Shortcut {
  id: string;
  /** e.g. `mod+z`, `mod+shift+z`, `shift+arrowup`, `v`, `?`, `delete`. `mod` = ⌘ on Apple, Ctrl elsewhere. */
  keys: readonly string[];
  /** Help text. */
  label: string;
  group: string;
  /** Hidden in View mode (help and handling). */
  editOnly?: boolean;
  /** Shown in help only (gestures like Space+drag, Alt-drag). */
  hintOnly?: boolean;
  run?: (ev: KeyboardEvent) => boolean | void;
  /** Allowed while typing in an input / textarea / contenteditable. */
  inText?: boolean;
}

const norm = (ev: KeyboardEvent): string => {
  const parts: string[] = [];
  const mod = isMac() ? ev.metaKey : ev.ctrlKey;
  if (mod) parts.push('mod');
  if (ev.altKey) parts.push('alt');
  if (ev.shiftKey && ev.key.length > 1) parts.push('shift');
  else if (ev.shiftKey && /^[a-z]$/i.test(ev.key) && (mod || ev.altKey)) parts.push('shift');
  // Alt changes ev.key on macOS (⌥C = ç): use the physical key for letters and digits
  const k = (ev.altKey || mod) && /^Key[A-Z]$/.test(ev.code) ? ev.code.slice(3).toLowerCase()
    : (ev.altKey || mod) && /^Digit\d$/.test(ev.code) ? ev.code.slice(5)
    : ev.key === ' ' ? 'space' : ev.key.toLowerCase();
  parts.push(k === 'backspace' ? 'delete' : k);
  return parts.join('+');
};

export const isTextTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable || !!el.closest?.('.cm-editor');
};

export class ShortcutRegistry {
  private readonly items: Shortcut[] = [];

  add(...s: Shortcut[]): void {
    this.items.push(...s);
  }

  list(editing: boolean): Shortcut[] {
    return this.items.filter((s) => editing || !s.editOnly);
  }

  /** Handles a keydown; returns true when a shortcut ran (the event is then prevented). */
  handle(ev: KeyboardEvent, editing: boolean): boolean {
    if (ev.isComposing) return false;
    const key = norm(ev);
    const text = isTextTarget(ev.composedPath()[0] ?? ev.target);
    for (const s of this.items) {
      if (!s.run || s.hintOnly || (s.editOnly && !editing) || (text && !s.inText)) continue;
      if (!s.keys.includes(key)) continue;
      if (s.run(ev) === false) continue;
      ev.preventDefault();
      ev.stopPropagation();
      return true;
    }
    return false;
  }
}

/** `mod+shift+z` → `⇧⌘Z` / `Ctrl+Shift+Z`. */
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
