// The one table that says what a `%%@` metadata key is (B7, X5, audit decision G12/G14/G15): how its value is
// cleaned, what class of information it holds, and the lists that follow from that. Every other list of metadata keys
// (the sanitizer's cleaners, the diff's facets, "Reset style", "Style off", Auto layout, Copy style, the media keys,
// the colour keys) is derived from META_KEYS; a key is added here once, with its class, or not at all.
//
// Each key's value type (a colour, a number, a dash…) comes from its cleaner, so the renderer's validation, the
// colour resolution and the style picks read the same table (X6, task 4.1).
//
// Classes: `layout` (where and how big: positions, sizes, ports, waypoints, layer, the image frame), `content` (what
// it shows: picture, icon, link, names), `look` (style), `state` (folding, locks, hiding). Fail closed: a key with no
// entry is 'unknown' — the sanitizer keeps it as written (a newer writer's data) and every operation keeps it too.
import { cleanDash, cleanFontFamily, isColorValue, isFiniteNumber } from '../validate.js';
import { ROUTINGS } from '../style.js';

/** Returned by a cleaner when the value is not acceptable. */
export const DROP: unique symbol = Symbol('drop');
export type Cleaner = ((v: unknown) => unknown) & { readonly type?: ValueType };

/** What a key's value is, for the renderer's validation (render/common.ts) and the style editors. */
export type ValueType = 'color' | 'number' | 'dash' | 'weight' | 'font' | 'bool' | 'stack' | 'enum' | 'text';

/** A cleaner that says what it accepts. */
const typed = (type: ValueType, f: (v: unknown) => unknown): Cleaner => Object.assign(f, { type });

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

const num = (min: number, max: number): Cleaner => typed('number', (v) => (isFiniteNumber(v) && v >= min && v <= max ? v : DROP));
const int = (min: number, max: number): Cleaner => typed('number', (v) => (Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? v : DROP));
export const bool: Cleaner = typed('bool', (v) => (typeof v === 'boolean' ? v : DROP));
const oneOf = (...xs: string[]): Cleaner => typed('enum', (v) => (typeof v === 'string' && xs.includes(v) ? v : DROP));
export const color: Cleaner = typed('color', (v) => (isColorValue(v) ? v : DROP));
// Plain text (names, preset and layer ids): any string, minus control characters.
const text = (max: number): Cleaner => typed('text', (v) => (typeof v === 'string' && v.length <= max ? v.replace(CONTROL, '') : DROP));
// Names that select a shape or an arrow marker (and may end up in a marker id): identifier-like only.
const ident: Cleaner = typed('text', (v) => (typeof v === 'string' && /^[A-Za-z][\w-]{0,39}$/.test(v) ? v : DROP));
// Keep the stored spelling ("6,4" stays "6,4") once it is known to be numbers only; renderers normalise it.
const dash: Cleaner = typed('dash', (v) => (cleanDash(v) !== undefined ? v : DROP));
const font: Cleaner = typed('font', (v) => (cleanFontFamily(v) !== undefined ? v : DROP));
const weight: Cleaner = typed('weight', (v) =>
  (isFiniteNumber(v) && v >= 1 && v <= 1000) ||
  (typeof v === 'string' && /^(?:normal|bold|bolder|lighter|[1-9]\d{0,2}|1000)$/.test(v))
    ? v
    : DROP);
const stack: Cleaner = typed('stack', (v) => (typeof v === 'boolean' || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10) ? v : DROP));
const ratio: Cleaner = typed('text', (v) => (typeof v === 'string' && (v === '' || /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(v)) ? v : DROP));
const points: Cleaner = (v) =>
  Array.isArray(v) &&
  v.length <= 200 &&
  v.every((p) => Array.isArray(p) && p.length === 2 && isFiniteNumber(p[0]) && isFiniteNumber(p[1]) && Math.abs(p[0]) <= 1e6 && Math.abs(p[1]) <= 1e6)
    ? v
    : DROP;

const COORD = num(-1e6, 1e6);
const SIZE = num(0, 1e5);
const FONT_SIZE = num(0, 1000);
const UNIT = num(0, 1);

const SIDE = oneOf('t', 'b', 'l', 'r');

export type KeyClass = 'layout' | 'content' | 'look' | 'state';

export interface KeyDef {
  /** The accept check: the value, or DROP (ranges are what files may hold, never a UI slider's bounds, G15). */
  clean: Cleaner;
  class: KeyClass;
  /** The class on the page (`canvas`) when it differs: `pad`, `gap`, `margin`, `rowH` place the page there. */
  canvas?: KeyClass;
  /** A page setting only (background, border, sequence spacing…): never an item's look to copy. */
  page?: true;
  /** A manual position or size that Auto layout forgets. */
  place?: true;
  /** One of an image or icon item's keys (core/ops/meta-media.ts). */
  media?: true;
  /** Copy style copies it (the format painter's look; core/ops/style-ops.ts). */
  copy?: true;
  /** Not a change a reviewer sees: the diff skips it (a lock, the format version). */
  diffIgnore?: true;
  /** A style property (`StyleProps`): the renderer picks it from an item's metadata (`pickStyle`). */
  style?: true;
}

const look = (clean: Cleaner, more: Partial<KeyDef> = {}): KeyDef => ({ clean, class: 'look', ...more });
const lay = (clean: Cleaner, more: Partial<KeyDef> = {}): KeyDef => ({ clean, class: 'layout', ...more });
const copy = (clean: Cleaner, more: Partial<KeyDef> = {}): KeyDef => look(clean, { copy: true, ...more });
const colour = (clean: Cleaner = color, more: Partial<KeyDef> = {}): KeyDef => look(clean, more);
/** A style property (`StyleProps`). */
const sty = (d: KeyDef): KeyDef => ({ ...d, style: true });

/**
 * Every key the sanitizer knows. Copy style's keys come first, in the order it writes them (that order reaches the
 * written `%%@` lines); the rest by topic.
 */
export const META_KEYS = {
  // ---- Copy style's look
  preset: copy(text(200)),
  fill: sty(colour(color, { copy: true })), stroke: sty(colour(color, { copy: true })), strokeWidth: sty(copy(num(0, 100))), text: sty(colour(color, { copy: true })),
  fontSize: sty(copy(FONT_SIZE)), fontWeight: sty(copy(weight)), radius: sty(copy(SIZE)), stack: sty(copy(stack)), dash: sty(copy(dash)), shape: sty(copy(ident)),
  color: sty(colour(color, { copy: true })), width: sty(copy(num(0, 100))), arrow: sty(copy(ident)),
  // labelColor may be null: "no own colour, follow the line"
  labelColor: sty(colour(typed('color', (v) => (v === null ? v : color(v))), { copy: true })),
  labelSize: sty(copy(FONT_SIZE)), curve: sty(copy(num(-100, 100))), titleSize: sty(copy(FONT_SIZE)), titleColor: sty(colour(color, { copy: true })),
  titleAlign: sty(copy(oneOf('left', 'center', 'right'))), titleWeight: sty(copy(weight)), fillOpacity: sty(copy(UNIT)), strokeOpacity: sty(copy(UNIT)),
  fontFamily: sty(copy(font)), align: sty(copy(oneOf('left', 'center', 'right'))), valign: sty(copy(oneOf('top', 'middle', 'bottom'))), wrap: sty(copy(bool)),
  attrSize: sty(copy(FONT_SIZE)), attrColor: sty(colour(color, { copy: true })), mode: copy(oneOf('compact', 'table')), showTypes: copy(bool),
  showComments: copy(bool), pkUnderline: copy(bool), labelOnLine: copy(bool), showTag: copy(bool),
  routing: copy(oneOf(...ROUTINGS)), startArrow: copy(ident), endArrow: copy(ident),

  // ---- more look
  padX: look(SIZE), padY: look(SIZE), padTop: sty(look(SIZE)), lineH: look(num(0, 10)), replyDash: look(dash), for: look(ident),
  pad: sty(look(SIZE, { canvas: 'layout' })), margin: look(SIZE, { canvas: 'layout' }), gap: look(SIZE, { canvas: 'layout' }), rowH: look(SIZE, { canvas: 'layout' }),
  // an item's icon beside its label (render/decorate.ts): where the leading icon token is drawn, its size and colour
  iconPos: look(oneOf('l', 't', 'b')), iconSize: look(num(1, 512)), iconColor: colour(),
  // a mindmap branch's colour (a section of the theme)
  section: look(int(0, 11)),

  // ---- page settings
  background: colour(color, { page: true }), border: colour(color, { page: true }), grid: colour(color, { page: true }),
  theme: look(text(200), { page: true }), blockGapTop: look(SIZE, { page: true }), blockGapBottom: look(SIZE, { page: true }),
  blockPad: look(SIZE, { page: true }), blockSpan: look(oneOf('full', 'touched'), { page: true }), mirror: look(bool, { page: true }),
  blockTags: look(bool, { page: true }), layout: look(oneOf('legacy', 'compound'), { page: true }),
  mindLayout: look(oneOf('both', 'right', 'down'), { page: true }), composites: look(oneOf('single', 'palette'), { page: true }),
  ratio: lay(ratio, { page: true }),

  // ---- layout: positions and sizes (Auto layout forgets them), ports, waypoints, the image frame
  x: lay(COORD, { place: true }), y: lay(COORD, { place: true }), w: lay(SIZE, { place: true, media: true }), h: lay(SIZE, { place: true, media: true }),
  dx: lay(COORD, { place: true }), dy: lay(COORD, { place: true }), points: lay(points, { place: true }),
  // a mindmap first-level branch's side
  side: lay(oneOf('l', 'r'), { place: true }),
  minW: lay(SIZE), minH: lay(SIZE), maxW: lay(SIZE), top: lay(SIZE),
  labelDx: lay(COORD), labelDy: lay(COORD), fromAt: lay(UNIT), toAt: lay(UNIT), labelAt: lay(UNIT), fromSide: lay(SIDE), toSide: lay(SIDE),
  layer: lay(text(200)),
  // the image node's frame (`img` / `icon` below are its source): the caption's side, the icon's frame, the aspect lock, the fit
  pos: lay(oneOf('t', 'b'), { media: true }), form: lay(oneOf('square', 'circle', 'rounded'), { media: true }),
  constraint: lay(oneOf('on', 'off'), { media: true }), imgFit: lay(oneOf('contain', 'cover', 'stretch'), { media: true }),
  imgW: lay(SIZE, { media: true }), imgH: lay(SIZE, { media: true }),

  // ---- content: what the item shows (`link` stays a string here — the renderer applies the link policy)
  img: { clean: text(2048), class: 'content', media: true }, icon: { clean: text(200), class: 'content', media: true },
  link: { clean: text(2048), class: 'content' }, name: { clean: text(200), class: 'content' }, label: { clean: text(200), class: 'content' },

  // ---- state
  locked: { clean: bool, class: 'state', diffIgnore: true }, collapsed: { clean: bool, class: 'state' }, hidden: { clean: bool, class: 'state' },
  // the metadata format version (canvas)
  v: { clean: int(0, 1000), class: 'state', diffIgnore: true },
} as const satisfies Record<string, KeyDef>;

export type MetaKey = keyof typeof META_KEYS;
const DEFS: Readonly<Record<string, KeyDef>> = META_KEYS;
const NAMES = Object.keys(META_KEYS) as MetaKey[];

/** The definition of a known key, or undefined (an unknown key: kept as written, never treated as look). */
export const keyDef = (k: string): KeyDef | undefined => (Object.hasOwn(DEFS, k) ? DEFS[k] : undefined);

/** The class of a key on an item (or, with `canvas`, on the page); 'unknown' for keys not in META_KEYS. */
export function classOf(k: string, where: 'item' | 'canvas' = 'item'): KeyClass | 'unknown' {
  const d = keyDef(k);
  return !d ? 'unknown' : where === 'canvas' ? d.canvas ?? d.class : d.class;
}

/** The keys with a flag set, in table order. */
const flagged = (f: 'page' | 'place' | 'media' | 'copy' | 'style'): readonly MetaKey[] => NAMES.filter((k) => DEFS[k]![f]);

/** A key's value type (from its cleaner); undefined for keys not in META_KEYS and for structured values (points). */
export const valueType = (k: string): ValueType | undefined => keyDef(k)?.clean.type;

/** The keys of a class (on items, or with `canvas` on the page), in table order. */
export const keysOf = (c: KeyClass, where: 'item' | 'canvas' = 'item'): readonly MetaKey[] => NAMES.filter((k) => classOf(k, where) === c);

/**
 * The keys of an ER attribute's highlight (an entity's `attrs`: attribute name → look), each with its cleaner. `attrs`
 * itself is the one structured key outside META_KEYS: the sanitizer cleans it entry by entry with these.
 */
export const ATTR_KEYS = {
  color, bold: bool, italic: bool, underline: bool, fontFamily: font, fontSize: FONT_SIZE, preset: text(200),
} as const satisfies Record<string, Cleaner>;

/** The cleaners by key (meta/sanitize.ts). */
export const CLEANERS: Readonly<Record<string, Cleaner>> = Object.fromEntries(NAMES.map((k) => [k, DEFS[k]!.clean]));
/** Keys whose value is a colour (literal or palette reference). Theme resolution and the colour resolver use it too. */
export const COLOR_KEYS: ReadonlySet<string> = new Set(NAMES.filter((k) => valueType(k) === 'color'));
/** The style properties (`StyleProps`) an item's metadata gives the renderer (render/common.ts `pickStyle`). */
export const STYLE_KEYS: readonly MetaKey[] = flagged('style');
/** Manual positions and sizes: what Auto layout forgets. */
export const PLACE_KEYS: readonly MetaKey[] = flagged('place');
/** Every key of an image or icon item. */
export const MEDIA_KEYS: readonly MetaKey[] = flagged('media');
/** What Copy style copies, in the order it writes them. */
export const COPY_KEYS: readonly MetaKey[] = flagged('copy');
