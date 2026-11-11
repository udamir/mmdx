// Semantic diff of two diagram sources (before / after), for reviewing a change in a merge request.
//
// Items are matched by identity (node, group, entity and participant ids; edges and relationships by their
// endpoints; sequence messages, notes and blocks by aligning their content, since their ids are positions). Every
// difference is put into one facet, so a reviewer can hide the noise they do not care about:
//   content — what the diagram says: items, labels, shapes, connections, ER attributes, message text
//   layout  — where things are: position, size, bend points, ports, label offsets, layers
//   style   — how things look: colours, fonts, presets, Mermaid classes and `style` / `classDef` / `linkStyle`
// A node renamed with the same label and shape is reported as one changed item, and its edges follow it.
import { splitSource } from '../meta/index.js';
import { classOf } from '../meta/keys.js';
import type { DiagramMeta } from '../meta/types.js';
import type { DiagramModel } from '../model.js';
import { withDiff } from '../kinds/registry.js';
import type { Kinds } from '../kinds/types.js';
import { parseWith } from '../parse/dispatch.js';
import { diag } from '../types.js';
import { field } from './kit.js';
import type { DiagramDiff, DiffIgnore, FieldChange, ItemChange } from './types.js';

export { lcs } from './kit.js';

export type { ChangeFacet, ChangeStatus, FieldChange, ItemChange, DiagramDiff, DiffIgnore } from './types.js';

export { FACETS } from './kit.js';

// ---- entry points -----------------------------------------------------------------------------------------------

function count(items: readonly ItemChange[], doc: readonly FieldChange[]): DiagramDiff['counts'] {
  const c = { added: 0, removed: 0, changed: 0, content: 0, layout: 0, style: 0 };
  for (const it of items) {
    if (it.status !== 'unchanged') c[it.status]++;
    for (const f of it.facets) c[f]++;
  }
  for (const f of doc) c[f.facet]++;
  return c;
}

/** Diff of two parsed documents (code + metadata). */
export function diffModels(a: DiagramModel, b: DiagramModel, ma: DiagramMeta, mb: DiagramMeta): DiagramDiff {
  const items: ItemChange[] = [];
  const doc: FieldChange[] = [];
  const { theme: _ta, v: _va, ...ca } = ma.canvas;
  const { theme: _tb, v: _vb, ...cb } = mb.canvas;
  for (const k of new Set([...Object.keys(ca), ...Object.keys(cb)]))
    field(doc, classOf(k, 'canvas') === 'layout' ? 'layout' : 'style', `page ${k}`, ca[k], cb[k]);
  for (const kind of new Set([...Object.keys(ma.styles), ...Object.keys(mb.styles)])) {
    const A = ma.styles[kind] ?? {}, B = mb.styles[kind] ?? {};
    for (const n of new Set([...Object.keys(A), ...Object.keys(B)])) field(doc, 'style', `${kind === 'palette' ? 'palette colour' : `${kind} preset`} ${n}`, A[n], B[n]);
  }
  for (const id of new Set([...Object.keys(ma.layers ?? {}), ...Object.keys(mb.layers ?? {})])) field(doc, 'layout', `layer ${id}`, ma.layers?.[id], mb.layers?.[id]);

  const typeChanged = a.type !== b.type;
  const done = !typeChanged && b.type ? withDiff(a, (k, m) => (k.diff(m, b, ma, mb, items, doc), true)) : undefined;
  if (!done) field(doc, 'content', 'diagram type', a.type, b.type);
  const out: DiagramDiff = { type: b.type, typeChanged, items, doc, counts: count(items, doc) };
  // the same type without its diff kind: not "no changes" but "not compared" (B40)
  if (!done && !typeChanged && b.type)
    out.diagnostics = [diag('error', 'kind.not-loaded', `the ${b.type} diff is not loaded — the versions were not compared`, undefined, { params: { type: b.type } })];
  return out;
}

/** Diff of two sources (Mermaid with or without `%%@` lines), parsed with the given diagram kinds (component architecture §9.1): a bundle that loads kinds on demand passes the ones it loaded (a type without its parser diffs as unsupported). Never throws on bad input. `diffDiagrams` (core/diff/all.ts) parses with every kind. */
export function diffDiagramsWith(kinds: Kinds, before: string, after: string): DiagramDiff {
  const sa = splitSource(before), sb = splitSource(after);
  return diffModels(parseWith(sa.doc.code, kinds), parseWith(sb.doc.code, kinds), sa.doc.meta, sb.doc.meta);
}

/**
 * The same diff with some facets ignored: their field changes are dropped, and an item whose every change was
 * ignored becomes unchanged. Facets describe how a kept item changed, so added and removed items always stay.
 */
export function ignoreFacets(diff: DiagramDiff, ignore: DiffIgnore): DiagramDiff {
  const keep = (f: FieldChange) => !ignore[f.facet];
  const items = diff.items.map((it): ItemChange => {
    if (it.status === 'added' || it.status === 'removed') return it;
    const fields = it.fields.filter(keep);
    const facets = it.facets.filter((f) => !ignore[f]);
    return { ...it, fields, facets, status: facets.length ? 'changed' : 'unchanged' };
  });
  const doc = diff.doc.filter(keep);
  return { ...diff, items, doc, counts: count(items, doc) };
}

export { withoutStyle, withLayoutOf } from './transform.js';
export { diffArrays, diffWords, diffLines, mergeText, hunks, words, MARK, hasMarks, stripMarks, markRuns, type DiffRun, type DiffOp, type TextOp, type LineOp, type Hunk, type MarkedRun } from './text.js';
export { mergeDiagrams, changeKey, beforeKey, REMOVED, type Merged } from './merge.js';
export {
  annotate, shapeOf, centreOf, focusRect, markOf, marksOf, badgeOf, DIFF_COLORS, MARKS,
  type Mark, type DiffView, type DiffColors, type ItemShape, type AnnotateInput, type AnnotateOptions, type Annotated,
} from './annotate.js';
export { diffReport, unifiedDiff, sourcePart, REPORT_VERSION, type VersionInfo, type ReportOptions, type UnifiedDiffOptions } from './report.js';
