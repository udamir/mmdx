// Layout/style metadata (§5.1, §5.4, A.10).
//
// Inline form: Mermaid comment lines (ignored by every Mermaid renderer):
//   %%@ canvas {"v":1,"theme":"studio"}
//   %%@ style.node mine {"fill":"@lime","stack":true}   local preset of this diagram (added to the theme's presets)
//   %%@ node webProxy {"x":650,"y":324,"w":720,"h":72,"preset":"client"}
//   %%@ edge cbUI->webProxy {"preset":"rest"}
// Legacy sidecar form: the same object as JSON (<file>.layout.json), read only.
//
// Lines this version cannot use (unknown kinds, invalid JSON, bad id encoding) are kept verbatim in `meta.unknown`
// and written back after the known lines, so a newer writer's data survives a round-trip. Nothing here throws.
import { diag } from '../types.js';
import type { Diagnostic } from '../types.js';
import { isFiniteNumber } from '../validate.js';
import { migrate } from './migrations.js';
import { badValueDiagnostic, sanitizeMeta, sanitizeStyleObject, setCollection } from './sanitize.js';
import { COLLECTIONS, KIND_TO_COLL, META_VERSION, emptyMeta } from './types.js';
import type { Collection, DiagramMeta, MetaKind } from './types.js';

export * from './types.js';
export { migrate } from './migrations.js';
export { COLOR_KEYS, cleanStyleValue, sanitizeMeta, sanitizeStyleObject } from './sanitize.js';

export const META_HEADER = '%% ---- diagram-studio layout (safe to keep: Mermaid ignores %% comments) ----';
const LINE = /^\s*%%@\s+([\w.]+)(?:\s+(\S+))?\s+(\{.*\})\s*$/;

const COLL_TO_KIND = Object.fromEntries(Object.entries(KIND_TO_COLL).map(([k, v]) => [v, k])) as Record<Collection, MetaKind>;
const isKnownKind = (k: string): k is MetaKind => Object.hasOwn(KIND_TO_COLL, k);

export interface DiagramDocument {
  /** Mermaid only, no `%%@` lines. */
  readonly code: string;
  readonly meta: DiagramMeta;
}

// Ids with whitespace or `%` are URI-encoded so the line stays `kind id {json}`.
export const encodeId = (id: string): string => (/[\s%]/.test(id) ? encodeURIComponent(id) : id);
/** URI-decodes an id; null when the encoding is malformed (the prototype threw here). */
export function decodeId(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export type MetaLineCheck =
  | { error: string; code: string }
  | {
      kind: string;
      id?: string;
      data: Record<string, unknown>;
      /** false for kinds this version does not know (kept verbatim). */
      known: boolean;
      /** Key paths whose values failed validation and are ignored. */
      dropped: string[];
    };

function parseMatch(m: RegExpExecArray): MetaLineCheck {
  const [, kind = '', rawId, json = ''] = m;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { error: `invalid JSON — ${e instanceof Error ? e.message : String(e)}`, code: 'meta.bad-json' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'the {json} part must be an object', code: 'meta.bad-json' };
  const obj = data as Record<string, unknown>;
  if (kind === 'canvas') {
    const r = sanitizeStyleObject(obj);
    return { kind, data: r.value, known: true, dropped: r.dropped };
  }
  const known = kind.startsWith('style.') ? kind.length > 6 : isKnownKind(kind);
  if (!known) return { kind, ...(rawId !== undefined ? { id: rawId } : {}), data: obj, known: false, dropped: [] };
  if (!rawId) return { error: `${kind} needs ${kind.startsWith('style.') ? 'a preset' : 'an element'} id`, code: 'meta.bad-id' };
  const id = decodeId(rawId);
  if (id === null || id === '') return { error: `invalid id "${rawId}"`, code: 'meta.bad-id' };
  const r = sanitizeStyleObject(obj);
  return { kind, id, data: r.value, known: true, dropped: r.dropped };
}

/** One metadata line → error | parsed line | null (blank line, plain `%%` comment or the header). */
export function checkMetaLine(raw: string): MetaLineCheck | null {
  const line = raw.trim();
  if (!line || (line.startsWith('%%') && !line.startsWith('%%@')) || line === META_HEADER) return null;
  if (!line.startsWith('%%@')) return { error: 'not a metadata line — expected %%@ kind id {json}', code: 'meta.syntax' };
  const m = LINE.exec(line);
  if (!m) return { error: /\{/.test(line) ? 'expected %%@ kind id {json}' : 'missing the {json} part', code: 'meta.syntax' };
  return parseMatch(m);
}

const collOf = (meta: DiagramMeta, coll: Collection): Record<string, Record<string, unknown>> => {
  const c = meta[coll] as Record<string, Record<string, unknown>> | undefined;
  if (c) return c;
  const fresh: Record<string, Record<string, unknown>> = {};
  setCollection(meta, coll, fresh);
  return fresh;
};

export function splitSource(src: string): { doc: DiagramDocument; hadMeta: boolean; diagnostics: Diagnostic[] } {
  const meta = emptyMeta();
  const code: string[] = [];
  const unknown: string[] = [];
  const diagnostics: Diagnostic[] = [];
  let hadMeta = false;
  String(src)
    .split('\n')
    .forEach((raw, i) => {
      const line = raw.replace(/\r$/, '');
      if (line.trim() === META_HEADER) {
        hadMeta = true;
        return;
      }
      const m = LINE.exec(line);
      if (!m) {
        code.push(line);
        return;
      }
      hadMeta = true;
      const r = parseMatch(m);
      if ('error' in r) {
        unknown.push(line);
        diagnostics.push(diag('warning', r.code, r.error, i, { source: 'meta' }));
        return;
      }
      if (!r.known) {
        unknown.push(line);
        diagnostics.push(diag('info', 'meta.unknown-kind', `unknown metadata kind "${r.kind}" — kept as is`, i, { source: 'meta', params: { kind: r.kind } }));
        return;
      }
      for (const p of r.dropped) diagnostics.push(badValueDiagnostic(p, i));
      if (r.kind === 'canvas') Object.assign(meta.canvas, r.data);
      else if (r.kind.startsWith('style.')) (meta.styles[r.kind.slice(6)] ??= {})[r.id ?? ''] = r.data;
      else if (isKnownKind(r.kind)) collOf(meta, KIND_TO_COLL[r.kind])[r.id ?? ''] = r.data;
    });
  while (code.length && code[code.length - 1]!.trim() === '') code.pop();
  if (unknown.length) meta.unknown = unknown;

  const v = meta.canvas.v;
  const from = isFiniteNumber(v) ? v : 1;
  if (from > META_VERSION)
    diagnostics.push(diag('info', 'meta.newer-version', `metadata version ${from} is newer than this component (${META_VERSION}); unknown parts are kept`, undefined, { source: 'meta', params: { version: from } }));
  else delete meta.canvas.v; // the writer adds the current version
  return { doc: { code: code.join('\n'), meta: migrate(meta, from) }, hadMeta, diagnostics };
}

const isEmpty = (o: object | null | undefined): boolean => !o || Object.keys(o).length === 0;

/**
 * Metadata as `%%@` lines, in the fixed write order (canvas → style → layers → … → rels), then the kept unknown
 * lines. `%%@ canvas` carries the format version and is written only when there is at least one line at all, so a
 * pure Mermaid file stays pure Mermaid.
 */
export function metaToLines(meta: DiagramMeta): string[] {
  const body: string[] = [];
  for (const [k, presets] of Object.entries(meta.styles ?? {}))
    for (const [id, v] of Object.entries(presets ?? {})) if (!isEmpty(v)) body.push(`%%@ style.${k} ${encodeId(id)} ${JSON.stringify(v)}`);
  for (const coll of COLLECTIONS)
    for (const [id, v] of Object.entries(meta[coll] ?? {})) if (!isEmpty(v)) body.push(`%%@ ${COLL_TO_KIND[coll]} ${encodeId(id)} ${JSON.stringify(v)}`);
  const unknown = meta.unknown ?? [];
  const { v, ...canvas } = meta.canvas ?? {};
  if (isEmpty(canvas) && !body.length && !unknown.length) return [];
  // a newer version read from the file is kept: its data is still shaped that way
  const version = isFiniteNumber(v) && v > META_VERSION ? v : META_VERSION;
  return [`%%@ canvas ${JSON.stringify({ v: version, ...canvas })}`, ...body, ...unknown];
}

/** Always inline `%%@` lines after the code, under META_HEADER. */
export function joinSource(doc: DiagramDocument): string {
  const lines = metaToLines(doc.meta);
  if (!lines.length) return doc.code.trimEnd() + '\n';
  return `${doc.code.trimEnd()}\n\n${META_HEADER}\n${lines.join('\n')}\n`;
}

/** Ids that exist in the model, per collection. Collections without a set are left alone. */
export type MetaIds = Partial<Record<Collection, ReadonlySet<string>>>;

/** Drops metadata of elements that no longer exist; only known collections are touched, `unknown` lines stay. */
export function pruneMeta(meta: DiagramMeta, ids: MetaIds): DiagramMeta {
  const out: DiagramMeta = { ...meta };
  for (const coll of COLLECTIONS) {
    const src = meta[coll];
    const keep = ids[coll];
    if (!src || !keep) continue;
    setCollection(out, coll, Object.fromEntries(Object.entries(src).filter(([id]) => keep.has(id))) as Record<string, Record<string, unknown>>);
  }
  return out;
}

/** Any object → well-formed, validated DiagramMeta (`canvas` and `styles` always present). */
export function normalizeMeta(m: unknown): DiagramMeta {
  return sanitizeMeta(m).meta;
}

/**
 * Legacy `.mmd` + `.mmd.layout.json` import (never written). The sidecar is validated like inline metadata and its
 * entries win over inline lines with the same id (the prototype replaced inline metadata wholesale).
 */
export function mergeLegacySidecar(code: string, sidecarJson: string): { doc: DiagramDocument; diagnostics: Diagnostic[] } {
  const inline = splitSource(code);
  const diagnostics = [...inline.diagnostics];
  let parsed: unknown;
  try {
    parsed = JSON.parse(sidecarJson);
  } catch (e) {
    diagnostics.push(diag('warning', 'meta.bad-json', `invalid layout JSON — ${e instanceof Error ? e.message : String(e)}`, undefined, { source: 'meta' }));
    return { doc: inline.doc, diagnostics };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    diagnostics.push(diag('warning', 'meta.bad-json', 'the layout JSON must be an object', undefined, { source: 'meta' }));
    return { doc: inline.doc, diagnostics };
  }
  const raw = parsed as Record<string, unknown>;
  const side = sanitizeMeta(raw);
  diagnostics.push(...side.diagnostics);
  const v = side.meta.canvas.v;
  const from = isFiniteNumber(v) ? v : 1;
  if (from <= META_VERSION) delete side.meta.canvas.v;
  const sm = migrate(side.meta, from);

  const base = inline.doc.meta;
  const meta: DiagramMeta = { ...base, canvas: { ...base.canvas, ...sm.canvas }, styles: { ...base.styles } };
  for (const [k, presets] of Object.entries(sm.styles)) meta.styles[k] = { ...meta.styles[k], ...presets };
  for (const coll of COLLECTIONS) {
    const add = sm[coll];
    if (add) setCollection(meta, coll, { ...(base[coll] ?? {}), ...add } as Record<string, Record<string, unknown>>);
  }
  for (const k of Object.keys(raw))
    if (k !== 'canvas' && k !== 'styles' && k !== 'unknown' && !(COLLECTIONS as readonly string[]).includes(k))
      diagnostics.push(diag('info', 'meta.sidecar-unknown', `unknown layout key "${k}" — ignored`, undefined, { source: 'meta', params: { key: k } }));
  return { doc: { code: inline.doc.code, meta }, diagnostics };
}
