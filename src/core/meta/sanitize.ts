// Value validation for `%%@` metadata and theme style objects (§12).
// Every value read from a `%%@` line, a legacy sidecar or a theme file goes through `sanitizeStyleObject` before
// anything can render it. Known keys are checked by key; a value that fails is dropped and reported. Unknown keys
// are kept as they are: no renderer reads them, so they never reach the SVG, and a newer writer's data survives.
import { cleanDash, cleanFontFamily, isColorValue, isFiniteNumber } from '../validate.js';
import { diag } from '../types.js';
import type { Diagnostic } from '../types.js';
import { COLLECTIONS, emptyMeta } from './types.js';
import type { Collection, DiagramMeta } from './types.js';

/** Returned by a cleaner when the value is not acceptable. */
const DROP: unique symbol = Symbol('drop');
type Cleaner = (v: unknown) => unknown;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

const num = (min: number, max: number): Cleaner => (v) => (isFiniteNumber(v) && v >= min && v <= max ? v : DROP);
const int = (min: number, max: number): Cleaner => (v) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? v : DROP);
const bool: Cleaner = (v) => (typeof v === 'boolean' ? v : DROP);
const oneOf = (...xs: string[]): Cleaner => (v) => (typeof v === 'string' && xs.includes(v) ? v : DROP);
const color: Cleaner = (v) => (isColorValue(v) ? v : DROP);
// Plain text (names, preset and layer ids): any string, minus control characters.
const text = (max: number): Cleaner => (v) => (typeof v === 'string' && v.length <= max ? v.replace(CONTROL, '') : DROP);
// Names that select a shape or an arrow marker (and may end up in a marker id): identifier-like only.
const ident: Cleaner = (v) => (typeof v === 'string' && /^[A-Za-z][\w-]{0,39}$/.test(v) ? v : DROP);
// Keep the stored spelling ("6,4" stays "6,4") once it is known to be numbers only; renderers normalise it.
const dash: Cleaner = (v) => (cleanDash(v) !== undefined ? v : DROP);
const font: Cleaner = (v) => (cleanFontFamily(v) !== undefined ? v : DROP);
const weight: Cleaner = (v) =>
  (isFiniteNumber(v) && v >= 1 && v <= 1000) ||
  (typeof v === 'string' && /^(?:normal|bold|bolder|lighter|[1-9]\d{0,2}|1000)$/.test(v))
    ? v
    : DROP;
const stack: Cleaner = (v) => (typeof v === 'boolean' || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10) ? v : DROP);
const ratio: Cleaner = (v) => (typeof v === 'string' && (v === '' || /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(v)) ? v : DROP);
const points: Cleaner = (v) =>
  Array.isArray(v) &&
  v.length <= 200 &&
  v.every((p) => Array.isArray(p) && p.length === 2 && isFiniteNumber(p[0]) && isFiniteNumber(p[1]) && Math.abs(p[0]) <= 1e6 && Math.abs(p[1]) <= 1e6)
    ? v
    : DROP;

/** Keys whose value is a colour (literal or palette reference). Theme resolution and the colour resolver use it too. */
export const COLOR_KEYS: ReadonlySet<string> = new Set([
  'fill', 'stroke', 'text', 'color', 'labelColor', 'titleColor', 'attrColor', 'background', 'border', 'grid',
]);

const COORD = num(-1e6, 1e6);
const SIZE = num(0, 1e5);
const FONT_SIZE = num(0, 1000);
const UNIT = num(0, 1);

const CLEANERS: Record<string, Cleaner> = {
  // colours (labelColor may be null: "no own colour, follow the line")
  fill: color, stroke: color, text: color, color, titleColor: color, attrColor: color,
  background: color, border: color, grid: color,
  labelColor: (v) => (v === null ? v : color(v)),
  // geometry
  x: COORD, y: COORD, labelDx: COORD, labelDy: COORD, dy: COORD,
  w: SIZE, h: SIZE, minW: SIZE, minH: SIZE, maxW: SIZE, padX: SIZE, padY: SIZE, pad: SIZE, padTop: SIZE,
  radius: SIZE, margin: SIZE, gap: SIZE, rowH: SIZE, top: SIZE, blockGapTop: SIZE, blockGapBottom: SIZE, blockPad: SIZE,
  lineH: num(0, 10),
  strokeWidth: num(0, 100), width: num(0, 100),
  fontSize: FONT_SIZE, titleSize: FONT_SIZE, labelSize: FONT_SIZE, attrSize: FONT_SIZE,
  fillOpacity: UNIT, strokeOpacity: UNIT, fromAt: UNIT, toAt: UNIT, labelAt: UNIT,
  curve: num(-100, 100),
  v: int(0, 1000),
  points,
  // text style
  dash, replyDash: dash,
  fontFamily: font,
  fontWeight: weight, titleWeight: weight,
  align: oneOf('left', 'center', 'right'), titleAlign: oneOf('left', 'center', 'right'),
  valign: oneOf('top', 'middle', 'bottom'),
  // enums and flags
  routing: oneOf('curved', 'orthogonal', 'straight'),
  fromSide: oneOf('t', 'b', 'l', 'r'), toSide: oneOf('t', 'b', 'l', 'r'),
  mode: oneOf('compact', 'table'),
  blockSpan: oneOf('full', 'touched'),
  stack,
  locked: bool, hidden: bool, mirror: bool, labelOnLine: bool, showTag: bool, showTypes: bool, showComments: bool,
  pkUnderline: bool, wrap: bool,
  arrow: ident, startArrow: ident, endArrow: ident, shape: ident, for: ident,
  ratio,
  // names; `link` stays a string here — the renderer applies the link policy (safeUrl)
  preset: text(200), layer: text(200), theme: text(200), name: text(200), label: text(200),
  link: text(2048),
};

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
      const c = ATTR_CLEANERS[k];
      const r = c ? c(x) : x;
      if (r === DROP) dropped.push(`attrs.${name}.${k}`);
      else o[k] = r;
    }
    out[name] = o;
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
      r = c ? c(v) : v;
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
        if (c) out[name] = c;
      }
      meta.styles[kind] = out;
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
      if (c) out[id] = c;
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
