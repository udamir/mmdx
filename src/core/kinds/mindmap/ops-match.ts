// Mindmap nodes matched across two versions, for the diff (diff.ts: the changes and the merged picture) and for the metadata of positional ids over a code change (ops.ts remapMindMeta), so the two agree: a written id that both versions have, else the root, else a node's place in the tree (its path of labels and its rank among same-label siblings), else (label, matched parent), else the label alone — a node with the same label under another parent is one that moved (layout), not a removal and an addition.
import type { MindmapModel, MindNode } from '../../model.js';
import { mindKeys } from './parse.js';

// the diff and its merge match the same two models (P11: matched twice per render), and a code change's carry-over the two it was made between
const matched = new WeakMap<MindmapModel, WeakMap<MindmapModel, Map<string, string>>>();

/** Before id → after id of the nodes both versions have. */
export function matchMindNodes(a: MindmapModel, b: MindmapModel): Map<string, string> {
  const inner = matched.get(a) ?? matched.set(a, new WeakMap()).get(a)!;
  return inner.get(b) ?? inner.set(b, matchNodes(a, b)).get(b)!;
}

function matchNodes(a: MindmapModel, b: MindmapModel): Map<string, string> {
  const out = new Map<string, string>(), taken = new Set<string>();
  const pair = (x: string, y: string): void => {
    out.set(x, y);
    taken.add(y);
  };
  // written ids
  for (const n of a.nodes.values()) {
    const m = n.written ? b.nodes.get(n.id) : undefined;
    if (m && m.written === n.written) pair(n.id, m.id);
  }
  // the root is the root
  if (a.root && b.root && !out.has(a.root) && !taken.has(b.root)) pair(a.root, b.root);
  // the same place in the tree
  const ka = mindKeys(a), kb = mindKeys(b);
  const byKey = new Map<string, string>();
  for (const [id, k] of kb) if (!taken.has(id) && !byKey.has(k)) byKey.set(k, id);
  for (const n of a.nodes.values()) {
    if (out.has(n.id)) continue;
    const k = ka.get(n.id);
    const hit = k !== undefined ? byKey.get(k) : undefined;
    if (hit && !taken.has(hit)) pair(n.id, hit);
  }
  // (label, matched parent), then the label alone, in code order; the after nodes bucketed by label (P11: a scan of
  // every node per node)
  const byLabel = new Map<string, MindNode[]>();
  for (const m of b.nodes.values()) (byLabel.get(m.label) ?? byLabel.set(m.label, []).get(m.label)!).push(m);
  const free = (pred: (x: MindNode, y: MindNode) => boolean): void => {
    for (const n of a.nodes.values()) {
      if (out.has(n.id)) continue;
      const hit = byLabel.get(n.label)?.find((m) => !taken.has(m.id) && pred(n, m));
      if (hit) pair(n.id, hit.id);
    }
  };
  free((x, y) => !!x.parent && out.get(x.parent) === y.parent);
  free(() => true);
  return out;
}
