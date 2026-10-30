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
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type {
  DiagramModel, Entity, ErModel, FlowEdge, FlowNode, FlowchartModel, MermaidStyle, Participant, SeqBlockStart,
  SeqMessage, SeqNote, SequenceModel,
} from '../model.js';
import { parse } from '../parse/index.js';
import type { DiagramType, ItemKind } from '../types.js';

export type ChangeFacet = 'content' | 'layout' | 'style';
export type ChangeStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export const FACETS: readonly ChangeFacet[] = ['content', 'layout', 'style'];

export interface FieldChange {
  facet: ChangeFacet;
  /** Human-readable field name (`label`, `position`, `fill`, `attribute email`…). */
  field: string;
  before?: unknown;
  after?: unknown;
}

export interface ItemChange {
  kind: ItemKind;
  /** Id in the after version (the before id for removed items). */
  id: string;
  /** Id in the before version, when it differs (renamed node, shifted sequence message). */
  beforeId?: string;
  /** Short human-readable name of the item. */
  label: string;
  status: ChangeStatus;
  /** Facets with at least one change (empty for added / removed / unchanged). */
  facets: ChangeFacet[];
  fields: FieldChange[];
}

export interface DiagramDiff {
  type: DiagramType | null;
  /** The two versions are different diagram types (the item lists are then added / removed wholesale). */
  typeChanged: boolean;
  items: ItemChange[];
  /** Diagram-wide changes: theme, page settings, local presets, `classDef`, direction. */
  doc: FieldChange[];
  counts: Record<Exclude<ChangeStatus, 'unchanged'>, number> & Record<ChangeFacet, number>;
}

export interface DiffIgnore {
  content?: boolean;
  layout?: boolean;
  style?: boolean;
}

// ---- facet of a metadata key ------------------------------------------------------------------------------------

const LAYOUT_KEYS = new Set(['x', 'y', 'w', 'h', 'points', 'fromSide', 'toSide', 'fromAt', 'toAt', 'labelDx', 'labelDy', 'dy', 'layer']);
const CONTENT_KEYS = new Set(['link']);
const IGNORED_KEYS = new Set(['locked']);

const metaFacet = (k: string): ChangeFacet | null =>
  IGNORED_KEYS.has(k) ? null : LAYOUT_KEYS.has(k) ? 'layout' : CONTENT_KEYS.has(k) ? 'content' : 'style';

// ---- helpers ----------------------------------------------------------------------------------------------------

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const isEmpty = (o: object | undefined): boolean => !o || Object.keys(o).length === 0;

function field(out: FieldChange[], facet: ChangeFacet, name: string, before: unknown, after: unknown): void {
  if (same(before, after)) return;
  const f: FieldChange = { facet, field: name };
  if (before !== undefined) f.before = before;
  if (after !== undefined) f.after = after;
  out.push(f);
}

/** Position, size and the other geometry keys are grouped so a moved node reads as one change, not two. */
function metaFields(out: FieldChange[], a: ItemMeta | undefined, b: ItemMeta | undefined, presetDefsChanged: ReadonlySet<string>): void {
  const A = a ?? {}, B = b ?? {};
  const pick = (o: ItemMeta, ks: string[]) => (ks.some((k) => o[k] !== undefined) ? Object.fromEntries(ks.map((k) => [k, o[k]])) : undefined);
  field(out, 'layout', 'position', pick(A, ['x', 'y']), pick(B, ['x', 'y']));
  field(out, 'layout', 'size', pick(A, ['w', 'h']), pick(B, ['w', 'h']));
  const grouped = new Set(['x', 'y', 'w', 'h']);
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (grouped.has(k)) continue;
    const facet = metaFacet(k);
    if (facet) field(out, facet, k === 'points' ? 'bend points' : k, A[k], B[k]);
  }
  const preset = typeof B.preset === 'string' ? B.preset : undefined;
  if (preset && A.preset === preset && presetDefsChanged.has(preset)) field(out, 'style', `preset "${preset}" definition`, 'old', 'new');
}

function mermaidStyleOf(classes: readonly string[] | undefined, own: MermaidStyle | undefined, defs: Record<string, MermaidStyle>): MermaidStyle | undefined {
  const s: MermaidStyle = {};
  for (const c of classes ?? []) Object.assign(s, defs[c]);
  Object.assign(s, own);
  return isEmpty(s) ? undefined : s;
}

function finish(kind: ItemKind, id: string, label: string, fields: FieldChange[], beforeId?: string): ItemChange {
  const facets = FACETS.filter((f) => fields.some((x) => x.facet === f));
  const c: ItemChange = { kind, id, label, status: facets.length ? 'changed' : 'unchanged', facets, fields };
  if (beforeId !== undefined && beforeId !== id) c.beforeId = beforeId;
  return c;
}

const added = (kind: ItemKind, id: string, label: string): ItemChange => ({ kind, id, label, status: 'added', facets: [], fields: [] });
const removed = (kind: ItemKind, id: string, label: string): ItemChange => ({ kind, id, label, status: 'removed', facets: [], fields: [] });

/** Local presets (`%%@ style.<kind> <name>`) whose definition differs, per kind. */
function changedPresets(a: DiagramMeta, b: DiagramMeta, kind: string): Set<string> {
  const A = a.styles[kind] ?? {}, B = b.styles[kind] ?? {};
  return new Set([...Object.keys(A), ...Object.keys(B)].filter((n) => n in A && n in B && !same(A[n], B[n])));
}

/** Longest common subsequence of two key lists: index pairs, in order. */
export function lcs<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): [number, number][] {
  const n = a.length, m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) t[i]![j] = eq(a[i]!, b[j]!) ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (eq(a[i]!, b[j]!)) out.push([i++, j++]);
    else if (t[i + 1]![j]! >= t[i]![j + 1]!) i++;
    else j++;
  }
  return out;
}

/**
 * Aligns two ordered lists: exact matches first (LCS on `key`), then, between two anchors, items that are `similar`
 * are paired in order (an edited message). Returns pairs plus what is left on each side.
 */
function align<T>(a: readonly T[], b: readonly T[], key: (x: T) => string, similar: (x: T, y: T) => boolean): { pairs: [T, T][]; onlyA: T[]; onlyB: T[] } {
  const anchors = lcs(a.map(key), b.map(key));
  const pairs: [T, T][] = [], onlyA: T[] = [], onlyB: T[] = [];
  let pi = 0, pj = 0;
  const gap = (i1: number, j1: number) => {
    const ga = a.slice(pi, i1), gb = b.slice(pj, j1);
    const used = new Set<number>();
    for (const x of ga) {
      const k = gb.findIndex((y, idx) => !used.has(idx) && similar(x, y));
      if (k >= 0) {
        used.add(k);
        pairs.push([x, gb[k]!]);
      } else onlyA.push(x);
    }
    gb.forEach((y, idx) => used.has(idx) || onlyB.push(y));
  };
  for (const [i, j] of anchors) {
    gap(i, j);
    pairs.push([a[i]!, b[j]!]);
    pi = i + 1;
    pj = j + 1;
  }
  gap(a.length, b.length);
  return { pairs, onlyA, onlyB };
}

// ---- flowchart --------------------------------------------------------------------------------------------------

const edgeName = (e: FlowEdge, m: FlowchartModel): string => {
  const n = (id: string) => m.nodes.get(id)?.label || m.groups.get(id)?.label || id;
  return `${n(e.from)} → ${n(e.to)}${e.label ? ` (${e.label})` : ''}`;
};

/** Removed + added nodes with the same label and shape (one candidate each way) are a rename. */
function renames<T>(goneIds: string[], newIds: string[], sig: (side: 'a' | 'b', id: string) => string): Map<string, string> {
  const bySig = (ids: string[], side: 'a' | 'b') => {
    const m = new Map<string, string[]>();
    for (const id of ids) m.set(sig(side, id), [...(m.get(sig(side, id)) ?? []), id]);
    return m;
  };
  const A = bySig(goneIds, 'a'), B = bySig(newIds, 'b');
  const out = new Map<string, string>();
  for (const [s, ids] of A) {
    const other = B.get(s);
    if (ids.length === 1 && other?.length === 1) out.set(ids[0]!, other[0]!);
  }
  return out;
}

function diffFlowchart(a: FlowchartModel, b: FlowchartModel, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void {
  field(doc, 'layout', 'direction', a.direction, b.direction);
  for (const c of new Set([...Object.keys(a.classDefs), ...Object.keys(b.classDefs)])) field(doc, 'style', `classDef ${c}`, a.classDefs[c], b.classDefs[c]);
  const nodePresets = changedPresets(ma, mb, 'node'), edgePresets = changedPresets(ma, mb, 'edge'), groupPresets = changedPresets(ma, mb, 'group');

  const goneNodes = [...a.nodes.keys()].filter((id) => !b.nodes.has(id));
  const newNodes = [...b.nodes.keys()].filter((id) => !a.nodes.has(id));
  const sig = (side: 'a' | 'b', id: string) => {
    const n = (side === 'a' ? a : b).nodes.get(id)!;
    return `${n.label}\u0000${n.shape}`;
  };
  const renamed = renames(goneNodes, newNodes, sig);
  const toAfter = (id: string) => renamed.get(id) ?? id;

  const nodeFields = (na: FlowNode, nb: FlowNode): FieldChange[] => {
    const f: FieldChange[] = [];
    field(f, 'content', 'id', na.id, nb.id);
    field(f, 'content', 'label', na.label, nb.label);
    field(f, 'content', 'shape', na.shape, nb.shape);
    field(f, 'content', 'group', na.parent ? toAfter(na.parent) : null, nb.parent);
    field(f, 'content', 'link', na.link, nb.link);
    field(f, 'style', 'classes', na.classes, nb.classes);
    field(f, 'style', 'Mermaid style', mermaidStyleOf(na.classes, na.style, a.classDefs), mermaidStyleOf(nb.classes, nb.style, b.classDefs));
    metaFields(f, ma.nodes?.[na.id], mb.nodes?.[nb.id], nodePresets);
    return f;
  };

  for (const [id, nb] of b.nodes) {
    const beforeId = [...renamed].find(([, to]) => to === id)?.[0] ?? id;
    const na = a.nodes.get(beforeId);
    items.push(na ? finish('node', id, nb.label || id, nodeFields(na, nb), beforeId) : added('node', id, nb.label || id));
  }
  for (const id of goneNodes) if (!renamed.has(id)) items.push(removed('node', id, a.nodes.get(id)!.label || id));

  for (const [id, gb] of b.groups) {
    const ga = a.groups.get(id);
    if (!ga) {
      items.push(added('group', id, gb.label || id));
      continue;
    }
    const f: FieldChange[] = [];
    field(f, 'content', 'label', ga.label, gb.label);
    field(f, 'content', 'parent group', ga.parent, gb.parent);
    field(f, 'style', 'Mermaid style', mermaidStyleOf(ga.classes, ga.style, a.classDefs), mermaidStyleOf(gb.classes, gb.style, b.classDefs));
    metaFields(f, ma.groups?.[id], mb.groups?.[id], groupPresets);
    items.push(finish('group', id, gb.label || id, f));
  }
  for (const [id, ga] of a.groups) if (!b.groups.has(id)) items.push(removed('group', id, ga.label || id));

  // edges: matched by endpoints (through renames), then in order among parallel edges
  const linkStyle = (m: FlowchartModel, e: FlowEdge) => {
    const s = { ...m.linkStyles['default'], ...m.linkStyles[String(e.index)] };
    return isEmpty(s) ? undefined : s;
  };
  const edgeKey = (e: FlowEdge, map: (id: string) => string) => `${map(e.from)}->${map(e.to)}`;
  const { pairs, onlyA, onlyB } = align(
    a.edges,
    b.edges,
    (e) => `${edgeKey(e, toAfter)}|${e.label}|${e.line}|${e.start}|${e.end}`,
    (x, y) => edgeKey(x, toAfter) === edgeKey(y, (i) => i),
  );
  for (const [ea, eb] of pairs) {
    const f: FieldChange[] = [];
    field(f, 'content', 'label', ea.label, eb.label);
    field(f, 'content', 'line', ea.line, eb.line);
    field(f, 'content', 'arrow heads', `${ea.start}/${ea.end}`, `${eb.start}/${eb.end}`);
    field(f, 'layout', 'min length', ea.minlen, eb.minlen);
    field(f, 'style', 'linkStyle', linkStyle(a, ea), linkStyle(b, eb));
    metaFields(f, ma.edges?.[ea.id], mb.edges?.[eb.id], edgePresets);
    items.push(finish('edge', eb.id, edgeName(eb, b), f, ea.id));
  }
  for (const e of onlyB) items.push(added('edge', e.id, edgeName(e, b)));
  for (const e of onlyA) items.push(removed('edge', e.id, edgeName(e, a)));
}

// ---- ER ---------------------------------------------------------------------------------------------------------

function diffEr(a: ErModel, b: ErModel, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void {
  field(doc, 'layout', 'direction', a.direction, b.direction);
  const presets = changedPresets(ma, mb, 'entity'), relPresets = changedPresets(ma, mb, 'rel');
  const attrFields = (ea: Entity, eb: Entity, f: FieldChange[]) => {
    const A = new Map(ea.attrs.map((x) => [x.name, x])), B = new Map(eb.attrs.map((x) => [x.name, x]));
    for (const [n, x] of B) {
      const y = A.get(n);
      const show = (v: typeof x) => `${v.type} ${v.name}${v.keys.length ? ` ${v.keys.join(',')}` : ''}${v.comment ? ` "${v.comment}"` : ''}`;
      if (!y) field(f, 'content', `attribute ${n}`, undefined, show(x));
      else field(f, 'content', `attribute ${n}`, show(y), show(x));
    }
    for (const [n, y] of A) if (!B.has(n)) field(f, 'content', `attribute ${n}`, `${y.type} ${y.name}`, undefined);
    field(f, 'content', 'attribute order', ea.attrs.map((x) => x.name).filter((n) => B.has(n)), eb.attrs.map((x) => x.name).filter((n) => A.has(n)));
  };
  for (const [id, eb] of b.entities) {
    const ea = a.entities.get(id);
    if (!ea) {
      items.push(added('entity', id, eb.label || id));
      continue;
    }
    const f: FieldChange[] = [];
    field(f, 'content', 'label', ea.label, eb.label);
    attrFields(ea, eb, f);
    metaFields(f, ma.entities?.[id], mb.entities?.[id], presets);
    items.push(finish('entity', id, eb.label || id, f));
  }
  for (const [id, ea] of a.entities) if (!b.entities.has(id)) items.push(removed('entity', id, ea.label || id));

  const relName = (r: ErModel['rels'][number]) => `${r.from} — ${r.to}${r.label ? ` (${r.label})` : ''}`;
  const bRels = new Map(b.rels.map((r) => [r.id, r]));
  for (const rb of b.rels) {
    const ra = a.rels.find((r) => r.id === rb.id);
    if (!ra) {
      items.push(added('rel', rb.id, relName(rb)));
      continue;
    }
    const f: FieldChange[] = [];
    field(f, 'content', 'label', ra.label, rb.label);
    field(f, 'content', 'cardinality', `${ra.fromCard} … ${ra.toCard}`, `${rb.fromCard} … ${rb.toCard}`);
    field(f, 'content', 'identifying', ra.identifying, rb.identifying);
    metaFields(f, ma.rels?.[rb.id], mb.rels?.[rb.id], relPresets);
    items.push(finish('rel', rb.id, relName(rb), f));
  }
  for (const ra of a.rels) if (!bRels.has(ra.id)) items.push(removed('rel', ra.id, relName(ra)));
}

// ---- sequence ---------------------------------------------------------------------------------------------------

function diffSequence(a: SequenceModel, b: SequenceModel, ma: DiagramMeta, mb: DiagramMeta, items: ItemChange[], doc: FieldChange[]): void {
  field(doc, 'content', 'title', a.title, b.title);
  field(doc, 'content', 'autonumber', a.autonumber, b.autonumber);
  const none = new Set<string>();
  const pa = new Map(a.participants.map((p) => [p.id, p]));
  const pb = new Map(b.participants.map((p) => [p.id, p]));
  const boxLabel = (m: SequenceModel, p: Participant) => (p.box ? m.boxes.find((x) => x.id === p.box)?.label ?? p.box : null);
  for (const [id, b1] of pb) {
    const a1 = pa.get(id);
    if (!a1) {
      items.push(added('participant', id, b1.label || id));
      continue;
    }
    const f: FieldChange[] = [];
    field(f, 'content', 'label', a1.label, b1.label);
    field(f, 'content', 'kind', a1.kind, b1.kind);
    field(f, 'content', 'shape', a1.shape, b1.shape);
    field(f, 'content', 'box', boxLabel(a, a1), boxLabel(b, b1));
    field(f, 'content', 'order', a.participants.indexOf(a1), b.participants.indexOf(b1));
    metaFields(f, ma.participants?.[id], mb.participants?.[id], changedPresets(ma, mb, 'participant'));
    items.push(finish('participant', id, b1.label || id, f));
  }
  for (const [id, a1] of pa) if (!pb.has(id)) items.push(removed('participant', id, a1.label || id));

  const msgs = (m: SequenceModel) => m.items.filter((x): x is SeqMessage => x.kind === 'message');
  const msgName = (x: SeqMessage) => `${x.from} → ${x.to}: ${x.text}`;
  const m = align(msgs(a), msgs(b), (x) => `${x.from}|${x.to}|${x.text}|${x.line}|${x.head}`, (x, y) => x.from === y.from && x.to === y.to);
  for (const [x, y] of m.pairs) {
    const f: FieldChange[] = [];
    field(f, 'content', 'text', x.text, y.text);
    field(f, 'content', 'line', x.line, y.line);
    field(f, 'content', 'arrow', x.head, y.head);
    field(f, 'content', 'activation', `${x.activate ? '+' : ''}${x.deactivate ? '-' : ''}`, `${y.activate ? '+' : ''}${y.deactivate ? '-' : ''}`);
    metaFields(f, ma.messages?.[x.id], mb.messages?.[y.id], none);
    items.push(finish('message', y.id, msgName(y), f, x.id));
  }
  for (const x of m.onlyB) items.push(added('message', x.id, msgName(x)));
  for (const x of m.onlyA) items.push(removed('message', x.id, msgName(x)));

  const notes = (s: SequenceModel) => s.items.filter((x): x is SeqNote => x.kind === 'note');
  const n = align(notes(a), notes(b), (x) => `${x.pos}|${x.targets.join(',')}|${x.text}`, (x, y) => x.targets.join(',') === y.targets.join(','));
  for (const [x, y] of n.pairs) {
    const f: FieldChange[] = [];
    field(f, 'content', 'text', x.text, y.text);
    field(f, 'content', 'placement', `${x.pos} ${x.targets.join(',')}`, `${y.pos} ${y.targets.join(',')}`);
    metaFields(f, ma.notes?.[x.id], mb.notes?.[y.id], none);
    items.push(finish('note', y.id, `Note: ${y.text}`, f, x.id));
  }
  for (const x of n.onlyB) items.push(added('note', x.id, `Note: ${x.text}`));
  for (const x of n.onlyA) items.push(removed('note', x.id, `Note: ${x.text}`));

  const blocks = (s: SequenceModel) => s.items.filter((x): x is SeqBlockStart => x.kind === 'blockStart');
  const bl = align(blocks(a), blocks(b), (x) => `${x.block}|${x.label}`, (x, y) => x.block === y.block);
  for (const [x, y] of bl.pairs) {
    const f: FieldChange[] = [];
    field(f, 'content', 'label', x.label, y.label);
    field(f, 'style', 'colour', x.color, y.color);
    metaFields(f, ma.blocks?.[x.id], mb.blocks?.[y.id], none);
    items.push(finish('block', y.id, `${y.block} ${y.label}`.trim(), f, x.id));
  }
  for (const x of bl.onlyB) items.push(added('block', x.id, `${x.block} ${x.label}`.trim()));
  for (const x of bl.onlyA) items.push(removed('block', x.id, `${x.block} ${x.label}`.trim()));
}

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
  field(doc, 'style', 'theme', ma.canvas.theme, mb.canvas.theme);
  const { theme: _ta, v: _va, ...ca } = ma.canvas;
  const { theme: _tb, v: _vb, ...cb } = mb.canvas;
  for (const k of new Set([...Object.keys(ca), ...Object.keys(cb)]))
    field(doc, ['x', 'y', 'w', 'h', 'ratio', 'pad', 'gap', 'rowH', 'margin'].includes(k) ? 'layout' : 'style', `page ${k}`, ca[k], cb[k]);
  for (const kind of new Set([...Object.keys(ma.styles), ...Object.keys(mb.styles)])) {
    const A = ma.styles[kind] ?? {}, B = mb.styles[kind] ?? {};
    for (const n of new Set([...Object.keys(A), ...Object.keys(B)])) field(doc, 'style', `${kind === 'palette' ? 'palette colour' : `${kind} preset`} ${n}`, A[n], B[n]);
  }
  for (const id of new Set([...Object.keys(ma.layers ?? {}), ...Object.keys(mb.layers ?? {})])) field(doc, 'layout', `layer ${id}`, ma.layers?.[id], mb.layers?.[id]);

  const typeChanged = a.type !== b.type;
  if (!typeChanged && a.type === 'flowchart') diffFlowchart(a, b as FlowchartModel, ma, mb, items, doc);
  else if (!typeChanged && a.type === 'er') diffEr(a, b as ErModel, ma, mb, items, doc);
  else if (!typeChanged && a.type === 'sequence') diffSequence(a, b as SequenceModel, ma, mb, items, doc);
  else field(doc, 'content', 'diagram type', a.type, b.type);
  return { type: b.type, typeChanged, items, doc, counts: count(items, doc) };
}

/** Diff of two sources (Mermaid with or without `%%@` lines). Never throws on bad input. */
export function diffDiagrams(before: string, after: string): DiagramDiff {
  const sa = splitSource(before), sb = splitSource(after);
  return diffModels(parse(sa.doc.code), parse(sb.doc.code), sa.doc.meta, sb.doc.meta);
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
