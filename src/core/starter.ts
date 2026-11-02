// Starter sources: what a new diagram of each type starts from (the studio's New menu; hosts that create diagrams).

export type StarterType = 'flowchart' | 'sequence' | 'er';

const STARTERS: Readonly<Record<StarterType, string>> = { flowchart: 'flowchart TB\n', sequence: 'sequenceDiagram\n', er: 'erDiagram\n' };

/** The source a new, empty diagram of the type starts from. */
export function starterSource(type: StarterType): string {
  const s = STARTERS[type];
  if (s === undefined) throw new Error(`Unknown diagram type "${String(type)}"`);
  return s;
}
