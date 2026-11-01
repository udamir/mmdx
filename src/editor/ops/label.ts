// Item text ops of the editor (no UI): how an item's text is read and written back to Mermaid (the inline editor and
// the Properties panel), and the title / sub line that describes an item.
import { activationsOf } from '../../core/ids.js';
import type { DiagramModel } from '../../core/model.js';
import {
  relabelBox, relabelFlowEdge, relabelFlowNode, relabelGroup, relabelSeq, updateEntity, updateRel,
} from '../../core/ops/index.js';
import type { CodeResult } from '../../core/ops/types.js';
import type { ItemKind } from '../../core/types.js';
import type { EditorCore } from '../core.js';

/** Title and sub line of the Properties panel for an item. */
export function describe(M: DiagramModel, kind: ItemKind, id: string): { title: string; sub: string } {
  const one = (s: string): string => s.replace(/\n/g, ' ');
  if (M.type === 'flowchart') {
    if (kind === 'node') {
      const n = M.nodes.get(id);
      if (n) return { title: one(n.label), sub: `node · id ${id} · ${n.shape}${n.classes.length ? ' · :::' + n.classes.join(',') : ''}` };
    } else if (kind === 'group') {
      const g = M.groups.get(id);
      return { title: one(g?.label || id) || id, sub: `subgraph · id ${id}` };
    } else if (kind === 'edge') {
      const e = M.edges.find((x) => x.id === id);
      if (e) return { title: e.label || `${e.from} → ${e.to}`, sub: `edge · ${e.from} → ${e.to} · ${e.line}` };
    }
  } else if (M.type === 'sequence') {
    if (kind === 'participant') {
      const p = M.participants.find((x) => x.id === id);
      if (p) return { title: p.label, sub: `${p.kind} · id ${id}` };
    } else if (kind === 'message') {
      const it = M.items.find((x) => x.kind === 'message' && x.id === id);
      if (it?.kind === 'message') return { title: it.text || '(no text)', sub: `message ${id} · ${it.from} → ${it.to}` };
    } else if (kind === 'note') {
      const it = M.items.find((x) => x.kind === 'note' && x.id === id);
      if (it?.kind === 'note') return { title: it.text, sub: `note ${id}` };
    } else if (kind === 'block') {
      const it = M.items.find((x) => x.kind === 'blockStart' && x.id === id);
      if (it?.kind === 'blockStart') return { title: it.label || it.block, sub: `${it.block} block ${id}` };
    } else if (kind === 'activation') {
      const a = activationsOf(M).find((x) => x.id === id);
      return { title: `Process on ${a?.participant ?? '?'}`, sub: `activation · line ${(a?.start.src ?? 0) + 1}${a?.end ? `–${a.end.src + 1}` : ' (never deactivated)'}` };
    } else if (kind === 'box') {
      const b = M.boxes.find((x) => x.id === id);
      return { title: b?.label || 'Box', sub: `participant group · ${b?.members.length ?? 0} participants` };
    }
  } else if (M.type === 'er') {
    if (kind === 'entity') {
      const e = M.entities.get(id);
      if (e) return { title: e.label, sub: `entity · ${e.attrs.length} attributes` };
    } else if (kind === 'rel') {
      const r = M.rels.find((x) => x.id === id);
      if (r) return { title: r.label || id, sub: `relationship · ${r.from} (${r.fromCard}) → ${r.to} (${r.toCard})` };
    }
  }
  return { title: id, sub: kind };
}

export interface LabelSpec {
  value: string;
  multi: boolean;
  /** i18n key of the section title. */
  title: string;
  /**
   * Rewrites the code with a new text, against the document as it is when called (an edit typed while a remote update
   * or an undo changed the document applies to the current code); null when the item is gone — or, for the positional
   * ids of sequence items, now names an item whose text is no longer the one being edited.
   */
  apply(v: string): CodeResult | null;
}

interface TextOf {
  value: string;
  multi: boolean;
  title: string;
  write(v: string): CodeResult;
}

/** An item's text in the current document and how to rewrite it there. */
function textOf(core: EditorCore, kind: ItemKind, id: string): TextOf | null {
  const M = core.model;
  const code = core.code;
  if (M.type === 'flowchart') {
    if (kind === 'node') return { value: M.nodes.get(id)?.label ?? '', multi: true, title: 'props.text', write: (v) => relabelFlowNode(code, M, id, v) };
    if (kind === 'group') return { value: M.groups.get(id)?.label ?? '', multi: false, title: 'props.titleText', write: (v) => relabelGroup(code, M, id, v) };
    if (kind === 'edge') return { value: M.edges.find((e) => e.id === id)?.label ?? '', multi: false, title: 'props.label', write: (v) => relabelFlowEdge(code, M, id, v) };
  } else if (M.type === 'sequence') {
    const it = M.items.find((x) => (x.kind === 'message' || x.kind === 'note' || x.kind === 'blockStart') && x.id === id);
    if (kind === 'participant') return { value: M.participants.find((p) => p.id === id)?.label ?? '', multi: false, title: 'props.name', write: (v) => relabelSeq(code, M, { kind, id }, v) };
    if ((kind === 'message' || kind === 'note') && it && (it.kind === 'message' || it.kind === 'note'))
      return { value: it.text, multi: false, title: 'props.text', write: (v) => relabelSeq(code, M, { kind, id }, v) };
    if (kind === 'block' && it?.kind === 'blockStart') return { value: it.label, multi: false, title: 'props.condition', write: (v) => relabelSeq(code, M, { kind, id }, v) };
    if (kind === 'box') return { value: M.boxes.find((b) => b.id === id)?.label ?? '', multi: false, title: 'props.titleText', write: (v) => relabelBox(code, M, id, v) };
  } else if (M.type === 'er') {
    if (kind === 'rel') return { value: M.rels.find((r) => r.id === id)?.label ?? '', multi: false, title: 'props.label', write: (v) => updateRel(code, M, id, { label: v }) };
    if (kind === 'entity') return { value: M.entities.get(id)?.label ?? '', multi: false, title: 'props.name', write: (v) => updateEntity(code, M, id, { label: v }) };
  }
  return null;
}

/** Sequence ids are positions (`m3` is the third message): an insertion above moves them to another item. */
const POSITIONAL: ReadonlySet<ItemKind> = new Set(['message', 'note', 'block', 'box']);

/** How an item's text is read and written back to Mermaid (prototype `labelSpec`; the inline editor and Properties). */
export function labelSpec(core: EditorCore, kind: ItemKind, id: string): LabelSpec | null {
  const at = textOf(core, kind, id);
  if (!at) return null;
  return {
    value: at.value, multi: at.multi, title: at.title,
    apply: (v) => {
      if (!core.store.exists({ kind, id })) return null;
      const now = textOf(core, kind, id);
      if (!now || (POSITIONAL.has(kind) && now.value !== at.value)) return null;
      return now.write(v);
    },
  };
}
