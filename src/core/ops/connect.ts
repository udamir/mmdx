// Rewrites Mermaid source when connections are re-attached or created on the canvas (prototype connect.js).
// Pure functions: (code, model, …) → new code plus where the change landed. The caller re-parses afterwards.
import type { EdgeHead, EdgeLine, FlowNode, FlowchartModel, NodeShape } from '../model.js';
import { encodeLabel, labelText } from '../parse/label.js';
import { applySplices } from '../parse/node-data.js';
import { resolveShape } from '../shapes/registry.js';
import { lineOf, rewriteStatement, statementSplice } from './flow-statements.js';
import type { ConnectResult, LineResult } from './types.js';
import { indentOf } from './lines.js';

export interface NodeDefInput {
  id: string;
  label: string;
  shape?: NodeShape | string;
  inlineClass?: string | null | undefined;
  /** The label is a markdown string (written back as one). */
  md?: true | undefined;
}

/** `id["label"]` in the node's bracket shape (shapes Mermaid has no brackets for are written as rectangles). */
export function nodeDef(n: NodeDefInput): string {
  const [o, c] = resolveShape(n.shape)?.names.bracket ?? ['[', ']'];
  return `${n.id}${o}${labelText(n.label, !!n.md)}${c}${n.inlineClass ? `:::${n.inlineClass}` : ''}`;
}

/**
 * The node data a copy of a node is written with (`id@{ … }`, Mermaid Chart's separate statement): its `@{…}` entries
 * as written (the last of each key), without the label (its bracket holds it), and its shape when no bracket can
 * hold it. Null when there is nothing to write.
 */
export function nodeDataOf(code: string, n: FlowNode, id: string): string | null {
  const entries = new Map<string, string>();
  let written: string | undefined;
  for (const b of n.blocks ?? [])
    for (const e of b.entries) {
      if (e.key === 'shape') written = code.slice(e.valueAt, e.valueEnd);
      else if (e.key !== 'label') entries.set(e.key, code.slice(e.valueAt, e.valueEnd));
    }
  // an icon or image node is one by its `icon` / `img` key: a shape written with it is copied as written
  const media = n.data?.img != null || !!n.data?.icon;
  const def = resolveShape(n.shape)?.names;
  if (media) {
    if (written !== undefined) entries.set('shape', written);
  } else if (def && !def.bracket && def.mermaid) entries.set('shape', def.mermaid);
  if (!entries.size) return null;
  return `${id}@{ ${[...entries].map(([k, v]) => `${/^[\w-]+$/.test(k) ? k : JSON.stringify(k)}: ${v}`).join(', ')} }`;
}

export interface EdgeTextInput {
  start: EdgeHead;
  end: EdgeHead;
  line: EdgeLine;
  label: string;
  md?: true | undefined;
}

/** Mermaid link text for an edge with the given endpoints. */
export function edgeText(e: EdgeTextInput, from: string, to: string): string {
  const mk = (t: EdgeHead, atStart: boolean): string => (t === 'arrow' ? (atStart ? '<' : '>') : t === 'cross' ? 'x' : t === 'circle' ? 'o' : '');
  const s = mk(e.start, true), en = mk(e.end, false);
  const arrow = e.line === 'invisible' ? '~~~' : e.line === 'dotted' ? `${s}-.-${en}` : e.line === 'thick' ? `${s}==${en || '='}` : `${s}--${en || '-'}`;
  const label = e.label ? `|${labelText(e.label, !!e.md)}|` : '';
  return `${from} ${arrow}${label} ${to}`;
}

/**
 * Re-attach one end (`a` = from, `b` = to) of a flowchart edge. Only the edge's own tokens change: an edge alone in its
 * link gets the new end in place (the old end's definition stays, as its own statement); an edge of a chain or of an
 * `&` group is split out of its statement, the rest of it kept as written.
 */
export function reconnectFlow(code: string, model: FlowchartModel, edgeId: string, which: 'a' | 'b', newId: string): ConnectResult {
  const edge = model.edges.find((e) => e.id === edgeId);
  if (!edge || edge.stmt === undefined) return { code };
  const st = model.statements[edge.stmt]!;
  const from = which === 'a' ? newId : edge.from, to = which === 'b' ? newId : edge.to;
  // Inside a subgraph, Mermaid would move a newly mentioned node into that subgraph,
  // so the re-attached edge goes to the end of the file (top level) instead.
  const inGroup = [...model.groups.values()].some((g) => g.line < st.line && st.line < (g.endLine ?? Infinity));
  if (inGroup) {
    const link = code.slice(st.links[edge.seg!]!.start, st.links[edge.seg!]!.end);
    const r = rewriteStatement(code, model, edge.stmt, { take: edge.id });
    let out = r ? applySplices(code, [statementSplice(code, st, r.text)]) : code;
    out = `${out.trimEnd()}\n  ${from} ${link} ${to}\n`;
    return { code: out, from, to, line: out.split('\n').length - 2 };
  }
  const r = rewriteStatement(code, model, edge.stmt, { change: { id: edge.id, from, to } });
  if (!r) return { code };
  const out = applySplices(code, [statementSplice(code, st, r.text)]);
  return { code: out, from, to, line: lineOf(out, st.start + Math.max(0, r.changedAt)) };
}

/** `from --> to` at the end of the code. */
export function addFlowEdge(code: string, from: string, to: string): LineResult {
  const t = code.trimEnd();
  return { code: `${t}\n  ${from} --> ${to}\n`, line: t.split('\n').length };
}

// ---- ER: core/ops/er.ts (relText, reconnectER, addERRel)

/** Sequence: a new message at the end. */
export function addSeqMessage(code: string, from: string, to: string): LineResult {
  const t = code.trimEnd();
  return { code: `${t}\n  ${from}->>${to}: message\n`, line: t.split('\n').length };
}
