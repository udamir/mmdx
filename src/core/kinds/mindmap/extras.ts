// The text outline of a mindmap (the core's `outline`: for screen readers and copying): its tree.
import type { MindmapModel } from '../../model.js';
import type { OutlineItem } from '../../kind/types.js';
import type { ExtrasKind } from '../../kind/extras-types.js';

const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

function outlineMindmap(model: MindmapModel): OutlineItem[] {
  const root = model.root ? model.nodes.get(model.root) : undefined;
  if (!root) return [];
  const top: OutlineItem = { text: one(root.label) };
  // iterative: the depth is user input
  const stack: [string, OutlineItem][] = [[root.id, top]];
  const seen = new Set<string>();
  while (stack.length) {
    const [id, item] = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const kids = model.nodes.get(id)?.children ?? [];
    if (!kids.length) continue;
    item.children = [];
    for (const c of kids) {
      const n = model.nodes.get(c);
      if (!n) continue;
      const child: OutlineItem = { text: one(n.label) };
      item.children.push(child);
      stack.push([c, child]);
    }
  }
  return [top];
}

export const EXTRAS: ExtrasKind<MindmapModel> = { type: 'mindmap', outline: outlineMindmap };
