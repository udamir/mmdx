// The kernel's keymap (A.11, A5): one table drives key handling, the help popup (row 20) and the a11y hints. Scoped to
// the component that owns it (§8.2): it handles keydown events from its own shadow root only. Key formatting and the
// Shortcut shape are in ui/kit/keys.ts (the blocks show them).
import { isMac } from '../i18n.js';
import { isTextTarget, type Shortcut } from '../ui/kit/keys.js';

export type KeyContext = boolean | { mode: string; stage?: string };

const applies = (s: Shortcut, c: KeyContext): boolean => {
  if (s.active && !s.active()) return false;
  const mode = typeof c === 'boolean' ? (c ? 'edit' : 'view') : c.mode;
  const stage = typeof c === 'boolean' ? 'document' : c.stage ?? 'document';
  if (s.editOnly && (mode !== 'edit' || (stage === 'version' && !s.readOnly))) return false;
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
