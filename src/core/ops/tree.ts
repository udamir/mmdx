// Group trees (X7, task 4.7): what a group holds at any depth, and the groups around an item, walked iteratively
// (nesting depth is user input) with one cycle guard — a group seen again ends the walk — for every diagram type.

/** The leaves and groups inside a group, at any depth, depth-first in child order; `isLeaf` says which ids are items. */
export function descendantsIn(groups: ReadonlyMap<string, { readonly children: readonly string[] }>, isLeaf: (id: string) => boolean, gid: string): { nodes: string[]; groups: string[] } {
  const nodes: string[] = [], inner: string[] = [];
  const seen = new Set<string>([gid]);
  const stack = [...(groups.get(gid)?.children ?? [])].reverse();
  while (stack.length) {
    const c = stack.pop()!;
    const g = groups.get(c);
    if (g) {
      if (seen.has(c)) continue;
      seen.add(c);
      inner.push(c);
      for (let i = g.children.length - 1; i >= 0; i--) stack.push(g.children[i]!);
    } else if (isLeaf(c)) nodes.push(c);
  }
  return { nodes, groups: inner };
}

/** The groups around an item, innermost first; a group seen again (a broken tree) ends the walk. */
export function* groupChain(parentOf: (id: string) => string | null | undefined, id: string): Generator<string> {
  const seen = new Set<string>([id]);
  for (let p = parentOf(id); p && !seen.has(p); p = parentOf(p)) {
    seen.add(p);
    yield p;
  }
}
