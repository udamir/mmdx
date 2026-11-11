// The text outline of a er (the core's `outline`: for screen readers and copying).
import type { ErModel } from '../model.js';
import type { OutlineItem } from '../kind/types.js';

const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

export function outlineEr(model: ErModel): OutlineItem[] {
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
