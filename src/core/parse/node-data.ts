// Mermaid node data (`A@{ shape: doc, label: "Report" }`, T02.4): a strict reader for the flow mapping Mermaid hands to
// js-yaml (JSON schema), and a writer that changes values in place. The reader keeps every entry with its offsets in
// the code — unknown keys included — so an edit rewrites only the values it changes, keeping quotes, spacing and order.
// As in Mermaid, only double quotes protect a `}` or `,`; entries are separated by commas or newlines (multi-line blocks).

import type { DataEntry, DataValue, NodeDataBlock } from '../model.js';

const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?$/;
const SPACE = /[ \t\r]/;

/** A plain scalar as js-yaml's JSON schema types it. */
function plain(s: string): DataValue {
  if (s === '' || s === 'null' || s === '~') return null;
  if (s === 'true' || s === 'false') return s === 'true';
  if (NUMBER.test(s)) return Number(s);
  return s;
}

const ESC: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', '0': '\0', b: '\b', f: '\f' };

/**
 * Reads the node data whose `{` is at `s[brace]`; `base` is the code offset of `s[0]`. Null when the block is not
 * closed in `s` (the caller reports it).
 */
export function readNodeData(s: string, brace: number, base: number): NodeDataBlock | null {
  const entries: DataEntry[] = [];
  let i = brace + 1;
  const n = s.length;
  const skip = (seps: boolean): void => {
    while (i < n && (SPACE.test(s[i]!) || (seps && (s[i] === ',' || s[i] === '\n')))) i++;
  };
  /** A double-quoted string from `i` (at the quote): its value and the index after it; unterminated → null. */
  const dq = (): { v: string; to: number } | null => {
    let v = '';
    for (let j = i + 1; j < n; j++) {
      const c = s[j]!;
      if (c === '"') return { v, to: j + 1 };
      if (c === '\\' && j + 1 < n) {
        const e = s[++j]!;
        if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(s.slice(j + 1, j + 5))) {
          v += String.fromCharCode(parseInt(s.slice(j + 1, j + 5), 16));
          j += 4;
        } else v += ESC[e] ?? e;
      } else v += c;
    }
    return null;
  };
  /** A single-quoted string ('' is a quote); it cannot hold `}` (Mermaid's lexer ends the block there). */
  const sq = (): { v: string; to: number } | null => {
    let v = '';
    for (let j = i + 1; j < n; j++) {
      const c = s[j]!;
      if (c === '}' || c === '\n') return null;
      if (c === "'") {
        if (s[j + 1] === "'") {
          v += "'";
          j++;
          continue;
        }
        return { v, to: j + 1 };
      }
      v += c;
    }
    return null;
  };
  for (;;) {
    skip(true);
    if (i >= n) return null;
    if (s[i] === '}') break;
    const at = i;
    let key: string;
    const quotedKey = s[i] === '"' || s[i] === "'";
    if (quotedKey) {
      const q = s[i] === '"' ? dq() : sq();
      if (!q) return null;
      key = q.v;
      i = q.to;
      skip(false);
    } else {
      const k0 = i;
      while (i < n && !':,}\n'.includes(s[i]!)) i++;
      key = s.slice(k0, i).trim();
    }
    if (s[i] !== ':') {
      // `key` alone or garbage up to the next separator: kept as a key without a value (YAML reads it as null)
      const k1 = i;
      while (i < n && !',}\n'.includes(s[i]!)) i++;
      if (key || quotedKey) entries.push({ key, value: null, at: base + at, valueAt: base + k1, valueEnd: base + i, bare: true });
      continue;
    }
    i++;
    skip(false);
    const v0 = i;
    let value: DataValue;
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i] === '"' ? dq() : sq();
      // an unclosed double quote runs on in Mermaid's lexer: the block is not closed
      if (!q && s[i] === '"') return null;
      if (q) {
        value = q.v;
        i = q.to;
      } else {
        // unterminated: the rest of the line as written (Mermaid would fail here)
        while (i < n && !',}\n'.includes(s[i]!)) i++;
        value = s.slice(v0, i);
      }
    } else {
      while (i < n && !',}\n'.includes(s[i]!)) i++;
      let e = i;
      while (e > v0 && SPACE.test(s[e - 1]!)) e--;
      value = plain(s.slice(v0, e));
      entries.push({ key, value, at: base + at, valueAt: base + v0, valueEnd: base + e });
      continue;
    }
    // text after a closing quote (invalid YAML) belongs to the value as written: an edit replaces it too
    let j = i;
    while (j < n && SPACE.test(s[j]!)) j++;
    if (j < n && !',}\n'.includes(s[j]!)) {
      while (j < n && !',}\n'.includes(s[j]!)) j++;
      while (j > i && SPACE.test(s[j - 1]!)) j--;
      i = j;
    }
    entries.push({ key, value, at: base + at, valueAt: base + v0, valueEnd: base + i });
  }
  return { open: base + brace, end: base + i + 1, entries, multiline: s.slice(brace, i).includes('\n') };
}

/** Whether a node data block opens at `s[from…]` without closing on the same text (a multi-line block continues). */
export function openBlock(s: string): boolean {
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') q = !q;
    else if (!q && c === '@' && s[i + 1] === '{') {
      const close = closeAt(s, i + 2);
      if (close < 0) return true;
      i = close;
    }
  }
  return false;
}

/** Index of the `}` that closes a block whose body starts at `from` (outside double quotes), else -1. */
function closeAt(s: string, from: number): number {
  let q = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === '"') q = !q;
    else if (c === '}' && !q) return i;
  }
  return -1;
}

const BARE = /^[A-Za-z_][\w-]*$/;

/**
 * A value written the way Mermaid reads it back: a bare word when it stays a string (not `true`, a number…), else
 * double-quoted. Mermaid's lexer ends a quoted value at the next `"` (no backslash escapes), so a `"` inside is written
 * as Mermaid's `#quot;`.
 */
export function formatValue(v: DataValue): string {
  if (v === null) return 'null';
  if (typeof v !== 'string') return String(v);
  if (BARE.test(v) && plain(v) === v) return v;
  return `"${v.replace(/"/g, '#quot;').replace(/\r?\n/g, '<br>')}"`;
}

/** One replacement in the code: [from, to) becomes `text`. */
export interface Splice {
  from: number;
  to: number;
  text: string;
}

/** Applies replacements given against the same code (they must not overlap). */
export function applySplices(code: string, splices: readonly Splice[]): string {
  let out = code;
  for (const s of [...splices].sort((a, b) => b.from - a.from || b.to - a.to)) out = out.slice(0, s.from) + s.text + out.slice(s.to);
  return out;
}

/**
 * The splices that set keys of a block: a changed value is rewritten in place (its other entries, quotes and
 * spacing stay), a new key is appended, a key set to `undefined` is removed with its separator. `raw` values are
 * written as given (already formatted).
 */
export function editBlock(code: string, block: NodeDataBlock, patch: Readonly<Record<string, DataValue | undefined>>, raw: ReadonlySet<string> = new Set()): Splice[] {
  const out: Splice[] = [];
  const text = (k: string, v: DataValue): string => (raw.has(k) && typeof v === 'string' ? v : formatValue(v));
  const added: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    // the last entry of a key is the one Mermaid keeps (js-yaml: a later duplicate wins)
    const e = [...block.entries].reverse().find((x) => x.key === k);
    if (v === undefined) {
      if (!e) continue;
      for (const x of block.entries) if (x.key === k) out.push(removal(code, block, x));
    } else if (e) {
      if (e.value !== v || raw.has(k) || e.bare) out.push({ from: e.valueAt, to: e.valueEnd, text: (e.bare ? ': ' : '') + text(k, v) });
    } else added.push(`${k}: ${text(k, v)}`);
  }
  if (added.length) {
    // after the last entry, or right after `{` in an empty block
    const last = block.entries[block.entries.length - 1];
    const close = block.end - 1;
    if (block.multiline) {
      const indent = last ? (/(^|\n)([ \t]*)[^\n]*$/.exec(code.slice(0, last.at))?.[2] ?? '  ') : '  ';
      const at = last ? last.valueEnd : block.open + 1;
      out.push({ from: at, to: at, text: added.map((a) => `\n${indent}${a}`).join('') + (last || code[at] === '\n' ? '' : '\n') });
    } else if (last) out.push({ from: last.valueEnd, to: last.valueEnd, text: added.map((a) => `, ${a}`).join('') });
    else out.push({ from: block.open + 1, to: close, text: ` ${added.join(', ')} ` });
  }
  return out;
}

/** Removes an entry with the separator before it (or after it, for the first). */
function removal(code: string, block: NodeDataBlock, e: DataEntry): Splice {
  const i = block.entries.indexOf(e);
  const prev = block.entries[i - 1], next = block.entries[i + 1];
  if (prev) return { from: prev.valueEnd, to: e.valueEnd, text: '' };
  if (next) return { from: e.at, to: next.at, text: '' };
  // the only entry: `{ }` stays
  return { from: block.open + 1, to: block.end - 1, text: code.slice(block.open + 1, block.end - 1).includes('\n') ? '\n' : ' ' };
}
