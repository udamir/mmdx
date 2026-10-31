// Activation balance of sequence code, apart from the sequence ops so that the line reordering (reorder.ts) can check it without importing them (sequence.ts imports reorder.ts).

const MSG_MARK = /^(.+?)\s*(?:<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-])?\s*([^:]+?)\s*:/;

/** Mermaid rejects a deactivation (`-` or `deactivate X`) of a participant that is not active. */
export function activationsBalanced(code: string): boolean {
  const active = new Map<string, number>();
  const on = (p: string): void => void active.set(p, (active.get(p) ?? 0) + 1);
  const off = (p: string): boolean => {
    const n = active.get(p) ?? 0;
    if (!n) return false;
    active.set(p, n - 1);
    return true;
  };
  for (const raw of code.split('\n')) {
    const t = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^activate\s+(.+)$/.exec(t))) {
      on((m[1] ?? '').trim());
      continue;
    }
    if ((m = /^deactivate\s+(.+)$/.exec(t))) {
      if (!off((m[1] ?? '').trim())) return false;
      continue;
    }
    m = MSG_MARK.exec(t);
    if (!m) continue;
    const [, from = '', mark, to = ''] = m;
    if (mark === '+') on(to.trim());
    if (mark === '-' && !off(from.trim())) return false;
  }
  return true;
}
