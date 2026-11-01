// Small helpers of the theme editor: plain objects, paths into a theme, ids, and the events it dispatches.
import type { ReadSignal } from '../ui/signal.js';
import { untracked } from '../ui/signal.js';
import type { ThemeEditorEventMap } from './types.js';

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
export const obj = (v: unknown): Obj => (isObj(v) ? v : {});
export const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
export const slug = (s: string): string => s.toLowerCase().trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'theme';
export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
export const getPath = (o: unknown, path: readonly string[]): unknown => path.reduce<unknown>((x, k) => (isObj(x) ? x[k] : undefined), o);
export const fontName = (f: unknown): string => (typeof f === 'string' ? f.split(',')[0]!.replace(/'/g, '').trim() : '');

/** Paths (dotted, under `pre`) where two values differ: objects are compared key by key, anything else as JSON. */
export function changedPaths(a: unknown, b: unknown, pre = '', out: string[] = []): string[] {
  if (!isObj(a) || !isObj(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(pre);
    return out;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) changedPaths(a[k], b[k], pre ? `${pre}.${k}` : k, out);
  return out;
}

/** True when `path` is `p` or lies under it, or the other way round (dotted paths). */
export const related = (path: string, p: string): boolean => path === p || path.startsWith(p + '.') || p.startsWith(path + '.');

export const emit = <K extends keyof ThemeEditorEventMap>(target: EventTarget, type: K, detail: ThemeEditorEventMap[K]['detail'], cancelable = false): boolean =>
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));

/** A read-only signal derived from others without caching (nothing to dispose): blocks take it as a `Value`. */
export function derived<T>(f: () => T): ReadSignal<T> {
  const read = (() => f()) as ReadSignal<T>;
  read.peek = () => untracked(f);
  return read;
}
