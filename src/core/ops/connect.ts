// Rewrites Mermaid source when connections are re-attached or created on the canvas (prototype connect.js).
// Pure functions: (code, model, …) → new code plus where the change landed. The caller re-parses afterwards.
import type { Cardinality, EdgeHead, EdgeLine, ErModel, FlowchartModel, NodeShape } from '../model.js';
import { encodeLabel } from '../parse/label.js';
import type { ConnectResult, LineResult } from './types.js';
import { indentOf } from './lines.js';

const WRAP: Partial<Record<NodeShape, [string, string]>> = {
  rect: ['[', ']'], rounded: ['(', ')'], stadium: ['([', '])'], subroutine: ['[[', ']]'], cylinder: ['[(', ')]'],
  circle: ['((', '))'], doublecircle: ['(((', ')))'], diamond: ['{', '}'], hexagon: ['{{', '}}'],
  parallelogram: ['[/', '/]'], 'parallelogram-alt': ['[\\', '\\]'], trapezoid: ['[/', '\\]'], 'trapezoid-alt': ['[\\', '/]'],
  asymmetric: ['>', ']'],
};

export interface NodeDefInput {
  id: string;
  label: string;
  shape?: NodeShape | string;
  inlineClass?: string | null | undefined;
}

/** `id["label"]` in the node's bracket shape (shapes Mermaid has no brackets for are written as rectangles). */
export function nodeDef(n: NodeDefInput): string {
  const [o, c] = WRAP[n.shape as NodeShape] ?? ['[', ']'];
  return `${n.id}${o}"${encodeLabel(n.label)}"${c}${n.inlineClass ? `:::${n.inlineClass}` : ''}`;
}

export interface EdgeTextInput {
  start: EdgeHead;
  end: EdgeHead;
  line: EdgeLine;
  label: string;
}

/** Mermaid link text for an edge with the given endpoints. */
export function edgeText(e: EdgeTextInput, from: string, to: string): string {
  const mk = (t: EdgeHead, atStart: boolean): string => (t === 'arrow' ? (atStart ? '<' : '>') : t === 'cross' ? 'x' : t === 'circle' ? 'o' : '');
  const s = mk(e.start, true), en = mk(e.end, false);
  const arrow = e.line === 'dotted' ? `${s}-.-${en}` : e.line === 'thick' ? `${s}==${en || '='}` : `${s}--${en || '-'}`;
  const label = e.label ? `|"${encodeLabel(e.label)}"|` : '';
  return `${from} ${arrow}${label} ${to}`;
}

/**
 * Re-attach one end (`a` = from, `b` = to) of a flowchart edge. The edge's source line is regenerated as one
 * statement per edge (chains like `A --> B --> C` are split), keeping inline node definitions.
 */
export function reconnectFlow(code: string, model: FlowchartModel, edgeId: string, which: 'a' | 'b', newId: string): ConnectResult {
  const lines = code.split('\n');
  const edge = model.edges.find((e) => e.id === edgeId);
  if (!edge) return { code };
  const li = edge.src;
  const indent = indentOf(lines[li]);
  const onLine = model.edges.filter((e) => e.src === li);
  const at = onLine.indexOf(edge);
  const next = onLine.map((e) => (e === edge ? { ...e, from: which === 'a' ? newId : e.from, to: which === 'b' ? newId : e.to } : e));
  const out: string[] = [];
  for (const n of model.nodes.values()) {
    if (!n.lines.has(li)) continue;
    const definedHere = n.defLine === li;
    const onlyHere = [...n.lines].every((x) => x === li);
    const stillUsed = next.some((e) => e.from === n.id || e.to === n.id);
    if (definedHere) out.push(indent + nodeDef(n));
    else if (onlyHere && !stillUsed) out.push(indent + n.id); // keep the node alive
  }
  // Inside a subgraph, Mermaid would move a newly mentioned node into that subgraph,
  // so the re-attached edge goes to the end of the file (top level) instead.
  const inGroup = [...model.groups.values()].some((g) => g.line < li && li < (g.endLine ?? Infinity));
  const changed = next[at]!;
  for (const e of next) if (e !== changed || !inGroup) out.push(indent + edgeText(e, e.from, e.to));
  lines.splice(li, 1, ...out);
  if (inGroup) {
    while (lines.length && !(lines[lines.length - 1] ?? '').trim()) lines.pop();
    lines.push('  ' + edgeText(changed, changed.from, changed.to));
    return { code: lines.join('\n') + '\n', from: changed.from, to: changed.to, line: lines.length - 1 };
  }
  return { code: lines.join('\n'), from: changed.from, to: changed.to, line: li + out.length - next.length + at };
}

/** `from --> to` at the end of the code. */
export function addFlowEdge(code: string, from: string, to: string): LineResult {
  const t = code.replace(/\s+$/, '');
  return { code: `${t}\n  ${from} --> ${to}\n`, line: t.split('\n').length };
}

// ---- ER
const LEFT: Record<Cardinality, string> = { 'zero-one': '|o', one: '||', 'zero-many': '}o', 'one-many': '}|' };
const RIGHT: Record<Cardinality, string> = { 'zero-one': 'o|', one: '||', 'zero-many': 'o{', 'one-many': '|{' };
// A single word stays bare; anything else is quoted (with Mermaid's label escapes).
const erLabel = (l: string): string => (l ? (/^[\w-]+$/.test(l) ? l : `"${encodeLabel(l)}"`) : '""');

export interface RelTextInput {
  fromCard: Cardinality;
  toCard: Cardinality;
  identifying: boolean;
  label: string;
}

export function relText(r: RelTextInput, from: string, to: string): string {
  return `${from} ${LEFT[r.fromCard]}${r.identifying ? '--' : '..'}${RIGHT[r.toCard]} ${to} : ${erLabel(r.label)}`;
}

/** Re-attach one end of a relationship; an entity that only lived on that line stays as a bare declaration. */
export function reconnectER(code: string, model: ErModel, relId: string, which: 'a' | 'b', newId: string): ConnectResult {
  const lines = code.split('\n');
  const rel = model.rels.find((r) => r.id === relId);
  if (!rel) return { code };
  const li = rel.src;
  const indent = indentOf(lines[li]);
  const from = which === 'a' ? newId : rel.from, to = which === 'b' ? newId : rel.to;
  const out: string[] = [];
  const old = which === 'a' ? rel.from : rel.to;
  const e = model.entities.get(old);
  if (e && e.defLine == null && [...e.lines].every((x) => x === li)) out.push(indent + old); // keep the entity
  out.push(indent + relText(rel, from, to));
  lines.splice(li, 1, ...out);
  return { code: lines.join('\n'), from, to, line: li + out.length - 1 };
}

export function addERRel(code: string, from: string, to: string): LineResult {
  const t = code.replace(/\s+$/, '');
  return { code: `${t}\n  ${from} ||--o{ ${to} : ""\n`, line: t.split('\n').length };
}

/** Sequence: a new message at the end. */
export function addSeqMessage(code: string, from: string, to: string): LineResult {
  const t = code.replace(/\s+$/, '');
  return { code: `${t}\n  ${from}->>${to}: message\n`, line: t.split('\n').length };
}
