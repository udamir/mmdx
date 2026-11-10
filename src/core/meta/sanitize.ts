// Value validation for `%%@` metadata and theme style objects (§12).
// Every value read from a `%%@` line, a legacy sidecar or a theme file goes through `sanitizeStyleObject` before
// anything can render it. Known keys are checked by key; a value that fails is dropped and reported. Unknown keys
// are kept as they are: no renderer reads them, so they never reach the SVG, and a newer writer's data survives.
import { bool, CLEANERS, color, DROP, type Cleaner } from './keys.js';
import { setOwn } from '../own.js';
import { diag } from '../types.js';
import type { Diagnostic } from '../types.js';
import { COLLECTIONS, emptyMeta } from './types.js';
import type { Collection, DiagramMeta } from './types.js';

const ATTR_CLEANERS: Record<string, Cleaner> = { color, bold: bool, underline: bool };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export interface SanitizeResult<T> {
  value: T;
  /** Key paths of the dropped values (`fill`, `attrs.state.color`). */
  dropped: string[];
}

function cleanAttrs(v: unknown, dropped: string[]): unknown {
  if (!isObj(v)) {
    dropped.push('attrs');
    return DROP;
  }
  const out: Record<string, unknown> = {};
  for (const [name, a] of Object.entries(v)) {
    if (!isObj(a)) {
      dropped.push(`attrs.${name}`);
      continue;
    }
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(a)) {
      const c = Object.hasOwn(ATTR_CLEANERS, k) ? ATTR_CLEANERS[k] : undefined;
      const r = k === '__proto__' ? DROP : c ? c(x) : x;
      if (r === DROP) dropped.push(`attrs.${name}.${k}`);
      else o[k] = r;
    }
    setOwn(out, name, o);
  }
  return out;
}

/**
 * Checks every known key of a style / item / canvas / layer object. Returns a new object without the values that
 * failed; unknown keys are copied unchanged.
 */
export function sanitizeStyleObject(obj: Record<string, unknown>): SanitizeResult<Record<string, unknown>> {
  const dropped: string[] = [];
  const value: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    let r: unknown;
    if (k === 'attrs') r = cleanAttrs(v, dropped);
    else {
      const c = Object.hasOwn(CLEANERS, k) ? CLEANERS[k] : undefined;
      // a copy never takes a `__proto__` key (core/own.ts)
      r = k === '__proto__' ? DROP : c ? c(v) : v;
      if (r === DROP) dropped.push(k);
    }
    if (r !== DROP) value[k] = r;
  }
  return { value, dropped };
}

/** One value by key (theme editor fields): the cleaned value, or undefined when it is not acceptable. */
export function cleanStyleValue(key: string, v: unknown): unknown {
  if (key === 'attrs') {
    const r = cleanAttrs(v, []);
    return r === DROP ? undefined : r;
  }
  const c = Object.hasOwn(CLEANERS, key) ? CLEANERS[key] : undefined;
  if (!c) return v;
  const r = c(v);
  return r === DROP ? undefined : r;
}

export const badValueDiagnostic = (path: string, line?: number): Diagnostic =>
  diag('warning', 'meta.bad-value', `invalid value for "${path}" — ignored`, line, { source: 'meta', params: { key: path } });

/**
 * Structural normalisation plus value validation of a whole metadata object (sidecar JSON, values handed over by
 * an embedder). Non-object collections and entries are dropped; `unknown` keeps only strings.
 */
export function sanitizeMeta(input: unknown): { meta: DiagramMeta; diagnostics: Diagnostic[] } {
  const meta = emptyMeta();
  const diagnostics: Diagnostic[] = [];
  if (!isObj(input)) return { meta, diagnostics };
  const clean = (o: unknown, where: string): Record<string, unknown> | null => {
    if (!isObj(o)) {
      diagnostics.push(badValueDiagnostic(where));
      return null;
    }
    const r = sanitizeStyleObject(o);
    for (const p of r.dropped) diagnostics.push(badValueDiagnostic(`${where}.${p}`));
    return r.value;
  };
  if (input['canvas'] !== undefined) meta.canvas = clean(input['canvas'], 'canvas') ?? {};
  const styles = input['styles'];
  if (isObj(styles)) {
    for (const [kind, presets] of Object.entries(styles)) {
      if (!isObj(presets)) continue;
      const out: Record<string, Record<string, unknown>> = {};
      for (const [name, s] of Object.entries(presets)) {
        const c = clean(s, `style.${kind}.${name}`);
        if (c) setOwn(out, name, c);
      }
      setOwn(meta.styles, kind, out);
    }
  }
  for (const coll of COLLECTIONS) {
    const src = input[coll];
    if (src === undefined) continue;
    if (!isObj(src)) {
      diagnostics.push(badValueDiagnostic(coll));
      continue;
    }
    const out: Record<string, Record<string, unknown>> = {};
    for (const [id, v] of Object.entries(src)) {
      const c = clean(v, `${coll}.${id}`);
      if (c) setOwn(out, id, c);
    }
    setCollection(meta, coll, out);
  }
  const unknown = input['unknown'];
  if (Array.isArray(unknown)) {
    const lines = unknown.filter((l): l is string => typeof l === 'string' && !l.includes('\n'));
    if (lines.length) meta.unknown = lines;
  }
  return { meta, diagnostics };
}

/** Typed write into one of the id-keyed collections (entries are validated `ItemMeta` / `LayerMeta`). */
export function setCollection(meta: DiagramMeta, coll: Collection, value: Record<string, Record<string, unknown>>): void {
  (meta as unknown as Record<Collection, Record<string, Record<string, unknown>>>)[coll] = value;
}
