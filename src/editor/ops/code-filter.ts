// The code panel's filter (A.1 rows 3–4), pure: the items and the Mermaid lines a query finds (each token an element
// id, or text), and the filtered view with `%% - N hidden` folds whose edits are written back into the full file.
import { activationsOf } from '../../core/ids.js';
import { relatedLines } from '../../core/item-lines.js';
import type { DiagramModel } from '../../core/model.js';
import type { ItemKind, ItemRef } from '../../core/types.js';

/** The element whose id is exactly `tok` (any kind in the current diagram). */
function findElement(M: DiagramModel, tok: string): ItemRef | null {
  if (M.type === 'flowchart') {
    if (M.nodes.has(tok)) return { kind: 'node', id: tok };
    if (M.groups.has(tok)) return { kind: 'group', id: tok };
    if (M.edges.some((e) => e.id === tok)) return { kind: 'edge', id: tok };
  } else if (M.type === 'er') {
    if (M.entities.has(tok)) return { kind: 'entity', id: tok };
    if (M.rels.some((r) => r.id === tok)) return { kind: 'rel', id: tok };
  } else if (M.type === 'sequence') {
    if (M.participants.some((p) => p.id === tok)) return { kind: 'participant', id: tok };
    if (M.boxes.some((b) => b.id === tok)) return { kind: 'box', id: tok };
    const it = M.items.find((x) => (x.kind === 'message' || x.kind === 'note' || x.kind === 'blockStart') && x.id === tok);
    if (it) return { kind: it.kind === 'blockStart' ? 'block' : (it.kind as 'message' | 'note'), id: tok };
    if (activationsOf(M).some((a) => a.id === tok)) return { kind: 'activation', id: tok };
  }
  return null;
}

/**
 * The items a code filter query finds (selected while filtering): per token, the element with exactly that id, else
 * every item whose id or text contains it (case-insensitive) — node, group, participant, box and table ids and labels,
 * node classes, connector labels, message / note text, block conditions, table attributes. Model order; null = no
 * filter.
 */
export function filterItems(M: DiagramModel, query: string): ItemRef[] | null {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  // every item with the text it is found by
  const all: { ref: ItemRef; text: string }[] = [];
  const add = (kind: ItemKind, id: string, ...parts: (string | undefined)[]): void => void all.push({ ref: { kind, id }, text: parts.filter(Boolean).join('\n').toLowerCase() });
  if (M.type === 'flowchart') {
    for (const n of M.nodes.values()) add('node', n.id, n.id, n.label, ...n.classes);
    for (const g of M.groups.values()) add('group', g.id, g.id, g.label, ...(g.classes ?? []));
    for (const e of M.edges) add('edge', e.id, e.label);
  } else if (M.type === 'er') {
    for (const e of M.entities.values()) add('entity', e.id, e.id, e.label, ...e.attrs.map((a) => `${a.type} ${a.name} ${a.comment}`));
    for (const r of M.rels) add('rel', r.id, r.label);
  } else if (M.type === 'sequence') {
    for (const p of M.participants) add('participant', p.id, p.id, p.label);
    for (const b of M.boxes) add('box', b.id, b.label);
    for (const it of M.items) {
      if (it.kind === 'message' || it.kind === 'note') add(it.kind, it.id, it.text);
      else if (it.kind === 'blockStart') add('block', it.id, it.label);
    }
  }
  const found = new Set<string>();
  for (const tok of tokens) {
    const el = findElement(M, tok);
    if (el) found.add(`${el.kind}:${el.id}`);
    else {
      const q = tok.toLowerCase();
      for (const x of all) if (x.text.includes(q)) found.add(`${x.ref.kind}:${x.ref.id}`);
    }
  }
  const out = all.filter((x) => found.has(`${x.ref.kind}:${x.ref.id}`)).map((x) => x.ref);
  // exact ids of items without searchable text (processes)
  for (const tok of tokens) {
    const el = findElement(M, tok);
    if (el && !out.some((r) => r.kind === el.kind && r.id === el.id)) out.push(el);
  }
  return out;
}

/** 0-based lines of `code` shown for a filter query (each token: an element id, or text); null = no filter. */
export function filterLines(code: string, M: DiagramModel, query: string): number[] | null {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const L = code.split('\n');
  const set = new Set<number>();
  for (const tok of tokens) {
    const el = findElement(M, tok);
    if (el) for (const li of relatedLines(M, el.kind, el.id)) set.add(li);
    else {
      const q = tok.toLowerCase();
      L.forEach((l, i) => {
        if (l.toLowerCase().includes(q)) set.add(i);
      });
    }
  }
  return [...set].filter((i) => i < L.length).sort((a, b) => a - b);
}

// ---- filtered views: `%% - N hidden` folding ----------------------------------------------------------------------

export interface Segment {
  hidden: boolean;
  start: number;
  len: number;
}

const HIDDEN_MARKER = /^%% - (\d+) hidden$/;

/** Visible lines → segments (runs of shown and hidden lines) of a file with `total` lines. */
export function buildSegments(lines: readonly number[], total: number): Segment[] {
  const segs: Segment[] = [];
  let pos = 0;
  for (const li of lines) {
    if (li > pos) segs.push({ hidden: true, start: pos, len: li - pos });
    const last = segs[segs.length - 1];
    if (last && !last.hidden && last.start + last.len === li) last.len++;
    else segs.push({ hidden: false, start: li, len: 1 });
    pos = li + 1;
  }
  if (pos < total) segs.push({ hidden: true, start: pos, len: total - pos });
  return segs;
}

/** The filtered view text of `L` for these segments. */
export function viewOf(L: readonly string[], segs: readonly Segment[]): string {
  return segs.flatMap((sg) => (sg.hidden ? [`%% - ${sg.len} hidden`] : L.slice(sg.start, sg.start + sg.len))).join('\n');
}

/**
 * Filtered view (visible lines + `%% - N hidden` markers) + the full lines it was made from → the full text with the
 * edits applied, and the updated segments. null when hidden markers were damaged ("Keep the hidden lines").
 */
export function mergeFilteredView(view: string, segs: readonly Segment[], L: readonly string[]): { text: string; segments: Segment[] } | null {
  const groups: string[][] = [[]];
  let markers = 0;
  for (const l of view.split('\n')) {
    if (HIDDEN_MARKER.test(l.trim())) {
      markers++;
      groups.push([]);
    } else groups[groups.length - 1]!.push(l);
  }
  if (markers !== segs.filter((s) => s.hidden).length) return null;
  // groups[i] is the visible text between the (i-1)th and the i-th marker
  const out: string[] = [];
  const next: Segment[] = [];
  let gi = 0;
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i]!;
    if (sg.hidden) {
      const prev = segs[i - 1];
      if ((!prev || prev.hidden) && groups[gi]!.length) return null; // text where no visible block exists
      next.push({ hidden: true, start: out.length, len: sg.len });
      out.push(...L.slice(sg.start, sg.start + sg.len));
      gi++;
    } else {
      const g = groups[gi]!;
      next.push({ hidden: false, start: out.length, len: g.length });
      out.push(...g);
    }
  }
  if (segs[segs.length - 1]?.hidden && groups[gi]?.length) return null;
  return { text: out.join('\n'), segments: next };
}
