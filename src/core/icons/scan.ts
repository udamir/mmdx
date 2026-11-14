// Which icons a diagram references (T04 §4.5): source text or a parsed model scanned for label tokens, icon node values
// and mindmap `::icon(…)`, as canonical names. SSR loads them before rendering (`renderToSvg`, the markdown plugins);
// the render worker's client resolves them on the main thread and sends them with the request.
import { ICON_TOKEN, isIconToken, parseIconRef } from './names.js';

const NODE_VALUE = /\bicon\s*:\s*(["']?)([^"'\s,}]+)\1/g;
const CLASS_VALUE = /::icon\(([^)]*)\)/g;
type Scan = { has(pack: string): boolean };

function scanText(s: string, reg: Scan, out: Set<string>): void {
  for (const m of s.matchAll(ICON_TOKEN)) {
    const t = m[2]!;
    if (isIconToken(t, (p) => reg.has(p))) out.add(parseIconRef(t)!);
  }
  for (const m of s.matchAll(NODE_VALUE)) {
    const n = parseIconRef(m[2]!, 'node');
    if (n) out.add(n);
  }
  for (const m of s.matchAll(CLASS_VALUE)) {
    const n = parseIconRef(m[1]!, 'class');
    if (n) out.add(n);
  }
}

function scanValue(v: unknown, key: string, reg: Scan, out: Set<string>, seen: WeakSet<object>, depth: number): void {
  if (typeof v === 'string') {
    if (key === 'icon') {
      const n = parseIconRef(v, 'node') ?? parseIconRef(v, 'class');
      if (n) out.add(n);
    } else scanText(v, reg, out);
    return;
  }
  if (!v || typeof v !== 'object' || depth > 32 || seen.has(v)) return;
  seen.add(v);
  if (v instanceof Map) {
    for (const [k, x] of v) scanValue(x, typeof k === 'string' ? k : '', reg, out, seen, depth + 1);
    return;
  }
  if (Array.isArray(v) || v instanceof Set) {
    for (const x of v) scanValue(x, '', reg, out, seen, depth + 1);
    return;
  }
  for (const [k, x] of Object.entries(v)) if (k !== 'diagnostics') scanValue(x, k, reg, out, seen, depth + 1);
}

/**
 * Every icon a diagram references, as canonical names: in source text (label tokens, `icon: "…"` node data,
 * `::icon(…)`), in a parsed model (every string it holds; an `icon` field as a node value or classes) or in labels.
 * Over-approximates (a token in a comment counts): it decides what to load, not what is drawn.
 */
export function iconNamesOf(input: string | object | Iterable<string>, reg: Scan): string[] {
  const out = new Set<string>();
  if (typeof input === 'string') scanText(input, reg, out);
  else scanValue(input, '', reg, out, new WeakSet(), 0);
  return [...out];
}
