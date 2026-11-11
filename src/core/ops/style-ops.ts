// How items look (R9, task 5.7): style overrides (rows 38, 58, 59), Copy style (row 40) and presets (row 60). Pure:
// (meta or style environment, …) → { meta }, the metadata cloned first.
import { LINE_KINDS } from '../item-caps.js';
import { classOf, COPY_KEYS as KEY_COPY } from '../meta/keys.js';
import type { DiagramMeta } from '../meta/types.js';
import { KIND_TO_COLL } from '../meta/types.js';
import { own, setOwn } from '../own.js';
import { type ItemKind, type ItemRef } from '../types.js';
import { cloneJson, cloneMeta, ensure, getM, tidy } from './meta-util.js';
import { baseStyleOf, currentPreset, edgeEndsOf, effectiveValue, isLocalPreset, nodeShapeOf, participantShapeOf, presetOfItem, presetsFor, themePresetsOf, type StyleEnv } from './style-env.js';
import type { MetaResult } from './types.js';


// ---- style overrides (rows 38, 58, 59) ----------------------------------------------------------------------------

/** The same control edits differently named keys per kind in a multi-selection. */
export const SIZE_KEY: Partial<Record<ItemKind, string>> = { group: 'titleSize', entity: 'attrSize', block: 'labelSize', edge: 'labelSize', rel: 'labelSize', message: 'labelSize' };
export const WEIGHT_KEY: Partial<Record<ItemKind, string>> = { group: 'titleWeight', entity: 'titleWeight' };
export const TEXT_KEY: Partial<Record<ItemKind, string>> = { node: 'text', group: 'titleColor', entity: 'text', participant: 'text', note: 'text', block: 'labelColor', edge: 'labelColor', rel: 'labelColor', message: 'labelColor' };

/**
 * Sets (or with undefined / null, removes) own style values of items (prototype `setOverride`). `multi`: the
 * toolbar's text colour / font size / weight map to each kind's own key (an entity's font size also sets its
 * title one larger).
 */
export function setStyle(meta: DiagramMeta, targets: readonly ItemRef[], patch: Readonly<Record<string, unknown>>, { multi = false }: { multi?: boolean } = {}): MetaResult {
  const out = cloneMeta(meta);
  for (const { kind, id } of targets) {
    const m = ensure(out, kind, id) as Record<string, unknown>;
    for (const [k, val] of Object.entries(patch)) {
      let key = k;
      let extra: [string, unknown] | null = null;
      if (multi) {
        if (key === 'text') key = TEXT_KEY[kind] ?? key;
        else if (key === 'fontSize') {
          key = SIZE_KEY[kind] ?? key;
          if (kind === 'entity' && typeof val === 'number') extra = ['titleSize', val + 1];
        } else if (key === 'fontWeight') key = WEIGHT_KEY[kind] ?? key;
      }
      if (val === undefined || val === null) delete m[key];
      else m[key] = val;
      if (extra) m[extra[0]] = extra[1];
    }
    tidy(out, kind, id);
  }
  return { meta: out };
}

/** ⋮ → Reset style: drops every own style value of an item (meta/keys.ts class `look`), keeping its layout, picture, state and unknown keys. */
export function resetItemStyle(meta: DiagramMeta, { kind, id }: ItemRef): MetaResult {
  const out = cloneMeta(meta);
  const m = getM(out, kind, id);
  const keep = Object.fromEntries(Object.entries(m).filter(([k]) => classOf(k) !== 'look'));
  setOwn((out[KIND_TO_COLL[kind]] ??= {}), id, keep);
  tidy(out, kind, id);
  return { meta: out };
}

/** Reset curve: drops a connector's bend points and own curvature. */
export function resetCurve(meta: DiagramMeta, { kind, id }: ItemRef): MetaResult {
  const out = cloneMeta(meta);
  const m = ensure(out, kind, id);
  delete m.points;
  delete m.curve;
  tidy(out, kind, id);
  return { meta: out };
}

// ---- copy style (row 40) ------------------------------------------------------------------------------------------

const SHAPE_KINDS: ReadonlySet<ItemKind> = new Set(['node', 'group', 'entity', 'participant', 'note', 'block']);
/** Everything Copy style copies (meta/keys.ts `copy`): look only, never position, size or links. */
export const COPY_KEYS: readonly string[] = KEY_COPY;
const SHAPE_COMMON = ['fill', 'stroke', 'strokeWidth', 'dash', 'radius', 'stack', 'fillOpacity', 'strokeOpacity', 'fontFamily'];
const LINE_COMMON = ['color', 'width', 'dash', 'strokeOpacity', 'fontFamily', 'labelSize', 'labelColor', 'fontWeight'];
/** Every style property that makes up an element's look (positions, links and attachment points excluded). */
export const LOOK_KEYS: readonly string[] = COPY_KEYS.filter((k) => !['preset', 'startArrow', 'endArrow'].includes(k));
/** What makes up a look in a preset. */
export const PRESET_KEYS: readonly string[] = COPY_KEYS.filter((k) => k !== 'preset');

/** 'shape' (box-like kinds), 'line' (connectors) or '' (activation, box: no copy style). */
export const styleFamily = (k: ItemKind): 'shape' | 'line' | '' => (SHAPE_KINDS.has(k) ? 'shape' : LINE_KINDS.has(k) ? 'line' : '');

/** The format painter's clipboard (UI state, never saved into the document). */
export interface StyleClip {
  from: ItemRef;
  kind: ItemKind;
  own: Record<string, unknown>;
  preset?: string;
  eff: Record<string, unknown>;
  text: unknown;
  /** The look as rendered, for an exact same-kind paste (presets derived from Mermaid syntax included). */
  look: Record<string, unknown>;
  ends: { start: unknown; end: unknown } | null;
}

/** Copy style (paint roller): null for kinds without a style family. */
export function copyStyle(env: StyleEnv, sel: ItemRef): StyleClip | null {
  const fam = styleFamily(sel.kind);
  if (!fam) return null;
  const own = getM(env.meta, sel.kind, sel.id) as Record<string, unknown>;
  const common = fam === 'shape' ? SHAPE_COMMON : LINE_COMMON;
  const preset = typeof own['preset'] === 'string' ? own['preset']
    : sel.kind === 'node' || sel.kind === 'edge' || sel.kind === 'group' ? currentPreset(env, sel) || undefined : undefined;
  const textKey = TEXT_KEY[sel.kind];
  const clip: StyleClip = {
    from: { kind: sel.kind, id: sel.id },
    kind: sel.kind,
    own: Object.fromEntries(COPY_KEYS.filter((k) => own[k] !== undefined).map((k) => [k, cloneJson(own[k])])),
    eff: Object.fromEntries(common.map((k) => [k, effectiveValue(env, sel, k)]).filter(([, v]) => v !== undefined)),
    text: textKey ? effectiveValue(env, sel, textKey) : undefined,
    look: Object.fromEntries(LOOK_KEYS.map((k) => [k, effectiveValue(env, sel, k)])),
    ends: sel.kind === 'edge' ? edgeEndsOf(env, sel.id) : null,
  };
  if (preset !== undefined) clip.preset = preset;
  return clip;
}

/**
 * Paste style onto an item of the same family. Same kind: the target becomes an exact copy of the source's look
 * (its preset, then every property where the target would still look different). Different kind: only the common
 * visual keys and the text colour. Refused (with a reason) across families; a no-op on the source itself.
 */
export function pasteStyle(env: StyleEnv, clip: StyleClip, target: ItemRef): MetaResult {
  if (styleFamily(target.kind) !== styleFamily(clip.kind) || !styleFamily(target.kind))
    return { meta: env.meta, reason: 'Style can only be pasted onto a similar item (shape ↔ shape, line ↔ line)' };
  if (target.kind === clip.from.kind && target.id === clip.from.id) return { meta: env.meta };
  const out = cloneMeta(env.meta);
  const live: StyleEnv = { ...env, meta: out }; // effective values follow the edits below
  const m = ensure(out, target.kind, target.id) as Record<string, unknown>;
  if (target.kind === clip.kind) {
    for (const k of COPY_KEYS) delete m[k];
    if (clip.preset) m['preset'] = clip.preset;
    // An empty dash means "solid" but is ignored when styles merge, so solid is written as 'none'.
    const norm = (k: string, v: unknown): unknown => (k === 'dash' ? v || 'none' : v);
    for (const k of LOOK_KEYS) {
      const want = norm(k, clip.look[k]);
      if (want === undefined || want === null || want === '') continue;
      if (norm(k, effectiveValue(live, target, k)) !== want) m[k] = cloneJson(want);
    }
    if (clip.ends) {
      const now = edgeEndsOf(live, target.id);
      if (now && now.start !== clip.ends.start) m['startArrow'] = clip.ends.start;
      if (now && now.end !== clip.ends.end) m['endArrow'] = clip.ends.end;
    }
  } else {
    Object.assign(m, cloneJson(clip.eff));
    const tk = TEXT_KEY[target.kind];
    if (clip.text && tk) m[tk] = clip.text;
  }
  tidy(out, target.kind, target.id);
  return { meta: out };
}

// ---- presets (row 60) ---------------------------------------------------------------------------------------------

/** The item's own look on top of its preset. */
export const ownLook = (meta: DiagramMeta, { kind, id }: ItemRef): Record<string, unknown> =>
  Object.fromEntries(Object.entries(getM(meta, kind, id)).filter(([k]) => PRESET_KEYS.includes(k)));

function dropOwnLook(meta: DiagramMeta, { kind, id }: ItemRef): void {
  const m = ensure(meta, kind, id) as Record<string, unknown>;
  for (const k of PRESET_KEYS) delete m[k];
  tidy(meta, kind, id);
}

/** A typed preset name made safe: lower case, word characters and dashes. */
export const normalizePresetName = (raw: string | null | undefined): string =>
  (raw ?? '').trim().toLowerCase().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');

/** What the "Save as preset" dialog suggests: `<preset>-2`, else `my-style`. */
export function suggestPresetName(env: StyleEnv, ref: ItemRef): string {
  const base = presetOfItem(env, ref);
  return base ? `${base}-2` : 'my-style';
}

/** Can the item's look become a preset (it has presets and an own look)? */
export const canSavePreset = (env: StyleEnv, ref: ItemRef): boolean => !!presetsFor(env, ref.kind) && Object.keys(ownLook(env.meta, ref)).length > 0;

/**
 * Save as preset: the item's look (its preset + its own changes) becomes a local preset `%%@ style.<kind> <name>`,
 * which the item then uses. `rawName` is what the user typed (the editor asks for it in a dialog). Theme presets are
 * copied with their palette references (`env.rawTheme`). Refused when the name is empty or already taken.
 */
export function saveAsPreset(env: StyleEnv, ref: ItemRef, rawName: string): MetaResult & { name?: string } {
  const name = normalizePresetName(rawName);
  if (!name) return { meta: env.meta, reason: 'The preset needs a name' };
  if (Object.hasOwn(presetsFor(env, ref.kind) ?? {}, name)) return { meta: env.meta, reason: `There already is a preset "${name}"` };
  const { kind } = ref;
  const base = presetOfItem(env, ref);
  const baseLook = isLocalPreset(env, kind, base) ? env.meta.styles[kind]![base]! : themePresetsOf(env, kind, true)[base] ?? {};
  const out = cloneMeta(env.meta);
  const preset: Record<string, unknown> = { ...cloneJson(baseLook), ...cloneJson(ownLook(env.meta, ref)) };
  if (kind === 'node' && !preset['shape']) preset['for'] = nodeShapeOf(env, ref.id);
  if (kind === 'participant' && !preset['shape']) preset['for'] = participantShapeOf(env, ref.id);
  setOwn((out.styles[kind] ??= {}), name, preset);
  dropOwnLook(out, ref);
  ensure(out, kind, ref.id).preset = name;
  return { meta: out, name };
}

/** Update preset: a local preset takes the item's own changes (every item using it changes). */
export function updatePreset(env: StyleEnv, ref: ItemRef): MetaResult & { name?: string } {
  const name = presetOfItem(env, ref);
  if (!name || !isLocalPreset(env, ref.kind, name)) return { meta: env.meta, reason: 'Only presets of this diagram can be updated' };
  const out = cloneMeta(env.meta);
  const presets = out.styles[ref.kind]!;
  setOwn(presets, name, { ...own(presets, name), ...cloneJson(ownLook(env.meta, ref)) });
  dropOwnLook(out, ref);
  return { meta: out, name };
}

/** Items using a local preset (the delete confirmation names how many go back to the default style). */
export function presetUsers(meta: DiagramMeta, kind: ItemKind, name: string): string[] {
  return Object.entries(meta[KIND_TO_COLL[kind]] ?? {}).filter(([, m]) => m.preset === name).map(([id]) => id);
}

/** Deletes a local preset (× in the picker); its users go back to the default style. Confirmation is the editor's. */
export function deleteLocalPreset(meta: DiagramMeta, kind: ItemKind, name: string): MetaResult & { users: number } {
  const out = cloneMeta(meta);
  const users = presetUsers(out, kind, name);
  for (const iid of users) {
    delete ensure(out, kind, iid).preset;
    tidy(out, kind, iid);
  }
  const presets = out.styles[kind];
  if (presets) {
    delete presets[name];
    if (!Object.keys(presets).length) delete out.styles[kind];
  }
  return { meta: out, users: users.length };
}

/** Base style of an item for placeholders (re-exported for the properties panel). */
export { baseStyleOf };
