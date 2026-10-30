// Text alternative (§13): an outline of the diagram for screen readers and copying.
import type { DiagramModel } from './model.js';

export { summarize, type Summary } from './summary.js';

export interface OutlineItem {
  text: string;
  children?: OutlineItem[];
}

const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

/** Nodes with their outgoing connections; messages in order; tables with columns and relationships. */
export function outline(model: DiagramModel): OutlineItem[] {
  if (model.type === 'flowchart') {
    const label = (id: string): string => one(model.nodes.get(id)?.label ?? model.groups.get(id)?.label ?? id);
    const out: OutlineItem[] = [];
    for (const n of model.nodes.values()) {
      const edges = model.edges.filter((e) => e.from === n.id);
      const item: OutlineItem = { text: label(n.id) + (n.parent ? ` (in ${label(n.parent)})` : '') };
      if (edges.length) item.children = edges.map((e) => ({ text: `→ ${label(e.to)}${e.label ? `: ${one(e.label)}` : ''}` }));
      out.push(item);
    }
    return out;
  }
  if (model.type === 'sequence') {
    const name = new Map(model.participants.map((p) => [p.id, one(p.label)]));
    const out: OutlineItem[] = [];
    let n = 0;
    for (const it of model.items) {
      if (it.kind === 'message')
        out.push({ text: `${model.autonumber ? `${++n}. ` : ''}${name.get(it.from) ?? it.from} → ${name.get(it.to) ?? it.to}${it.text ? `: ${one(it.text)}` : ''}` });
      else if (it.kind === 'note') out.push({ text: `Note (${it.targets.map((t) => name.get(t) ?? t).join(', ')}): ${one(it.text)}` });
      else if (it.kind === 'blockStart') out.push({ text: `${it.block}${it.label ? ` ${one(it.label)}` : ''}` });
      else if (it.kind === 'blockElse') out.push({ text: `else${it.label ? ` ${one(it.label)}` : ''}` });
      else if (it.kind === 'blockEnd') out.push({ text: 'end' });
    }
    return out;
  }
  if (model.type === 'er') {
    const out: OutlineItem[] = [];
    for (const e of model.entities.values()) {
      const rels = model.rels.filter((r) => r.from === e.id);
      const children: OutlineItem[] = e.attrs.map((a) => ({ text: `${a.name}: ${a.type}${a.keys.length ? ` (${a.keys.join(', ')})` : ''}` }));
      for (const r of rels) children.push({ text: `${r.fromCard} to ${r.toCard} ${model.entities.get(r.to)?.label ?? r.to}${r.label ? `: ${one(r.label)}` : ''}` });
      const item: OutlineItem = { text: one(e.label) };
      if (children.length) item.children = children;
      out.push(item);
    }
    return out;
  }
  return [];
}
