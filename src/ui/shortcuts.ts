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
  /** Active only in these modes / stages (component architecture §13; `editOnly` is `{ mode: ['edit'] }`). */
  when?: { mode?: readonly string[]; stage?: readonly string[] };
  /** False while the module that registered it is suspended (set by the kernel). */
  active?: () => boolean;
}

/** Where key handling happens: the component's mode and stage. A boolean is the older "editing" flag. */
export type KeyContext = boolean | { mode: string; stage?: string };

const applies = (s: Shortcut, c: KeyContext): boolean => {
  if (s.active && !s.active()) return false;
  const mode = typeof c === 'boolean' ? (c ? 'edit' : 'view') : c.mode;
  const stage = typeof c === 'boolean' ? 'document' : c.stage ?? 'document';
  if (s.editOnly && mode !== 'edit') return false;
  if (s.when?.mode && !s.when.mode.includes(mode)) return false;
  if (s.when?.stage && !s.when.stage.includes(stage)) return false;
  return true;
};

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
  /** Set by the kernel while a module installs: decorates and records what the module registers. */
  hook: ((s: Shortcut, remove: () => void) => Shortcut) | null = null;

  /** Adds shortcuts; returns a function that removes them. */
  add(...s: Shortcut[]): () => void {
    const added = s.map((x) => (this.hook ? this.hook(x, () => this.remove(x)) : x));
    this.items.push(...added);
    return () => {
      for (const x of added) this.remove(x);
    };
  }

  remove(s: Shortcut): void {
    const i = this.items.indexOf(s);
    if (i >= 0) this.items.splice(i, 1);
    else {
      // a hooked copy of `s`
      const j = this.items.findIndex((x) => x.id === s.id && x.run === s.run && x.keys === s.keys);
      if (j >= 0) this.items.splice(j, 1);
    }
  }

  list(c: KeyContext): Shortcut[] {
    return this.items.filter((s) => applies(s, c));
  }

  /** Handles a keydown; returns true when a shortcut ran (the event is then prevented). */
  handle(ev: KeyboardEvent, c: KeyContext): boolean {
    if (ev.isComposing) return false;
    const key = norm(ev);
    const text = isTextTarget(ev.composedPath()[0] ?? ev.target);
    for (const s of this.items) {
      if (!s.run || s.hintOnly || !applies(s, c) || (text && !s.inText)) continue;
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
