// The text outline of a flowchart (the core's `outline`: for screen readers and copying).
import type { FlowchartModel } from '../model.js';
import type { OutlineItem } from './types.js';

const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

export function outlineFlowchart(model: FlowchartModel): OutlineItem[] {
  // an icon or image node without a caption is named by its id
  const label = (id: string): string => one(model.nodes.get(id)?.label || model.groups.get(id)?.label || id);
  const out: OutlineItem[] = [];
  for (const n of model.nodes.values()) {
    const edges = model.edges.filter((e) => e.from === n.id);
    const item: OutlineItem = { text: label(n.id) + (n.parent ? ` (in ${label(n.parent)})` : '') };
    if (edges.length) item.children = edges.map((e) => ({ text: `→ ${label(e.to)}${e.label ? `: ${one(e.label)}` : ''}${e.line === 'invisible' ? ' (invisible link)' : ''}` }));
    out.push(item);
  }
  return out;
}
