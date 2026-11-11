// The text outline of a state diagram (the core's `outline`: for screen readers and copying): each state with its
// outgoing transitions, composites with their contents, notes.
import type { StateModel } from '../model.js';
import type { OutlineItem } from '../kind/types.js';
import type { ExtrasKind } from '../kind/extras-types.js';

const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

export function outlineState(model: StateModel): OutlineItem[] {
  const name = (id: string): string => {
    const n = model.nodes.get(id);
    if (n?.kind === 'start') return 'start';
    if (n?.kind === 'end') return 'end';
    return one(n?.label || model.groups.get(id)?.label || id);
  };
  const item = (id: string, depth = 0): OutlineItem => {
    const n = model.nodes.get(id);
    const kind = n && n.kind !== 'state' ? ` (${n.kind})` : '';
    const out: OutlineItem = { text: name(id) + kind + (n?.descriptions.length ? `: ${n.descriptions.map(one).join('; ')}` : '') };
    const children: OutlineItem[] = model.edges.filter((e) => e.from === id).map((e) => ({ text: `→ ${name(e.to)}${e.label ? `: ${one(e.label)}` : ''}` }));
    for (const note of model.notes) if (note.target === id) children.push({ text: `note: ${one(note.text)}` });
    const g = model.groups.get(id);
    // nesting depth is user input: contents below 64 levels are left out
    if (g && depth < 64) children.push(...g.children.map((c) => item(c, depth + 1)));
    if (children.length) out.children = children;
    return out;
  };
  // composites nest as written (the parser cut cycles)
  const top = [...[...model.nodes.values()].filter((n) => !n.parent).map((n) => ({ id: n.id, order: n.order })), ...[...model.groups.values()].filter((g) => !g.parent).map((g) => ({ id: g.id, order: g.order }))];
  return top.sort((a, b) => a.order - b.order).map((x) => item(x.id));
}

export const EXTRAS: ExtrasKind<StateModel> = { type: 'state', outline: outlineState };
