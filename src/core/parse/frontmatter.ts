// The frontmatter reader (`---` … `---` before the header): a small reader for the YAML Mermaid files use, shared by
// the parsers that read settings from it (flowchart: title, curve, wrapping; mindmap: colorBy, maxNodeWidth; ER: title),
// and the fix that moves a `title` statement into it.

/**
 * The frontmatter's and `%%{init}%%`'s settings that change what the content means: `title`, and in `config`
 * `flowchart.curve`, `htmlLabels`, `markdownAutoWrap`, `flowchart.wrappingWidth`. A small reader for the YAML Mermaid
 * files use (nested keys by indentation, plain or quoted scalars); everything else is kept in the code and ignored.
 */
export function frontmatterValues(lines: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const path: { indent: number; key: string }[] = [];
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const m = /^(\s*)([\w.-]+)\s*:\s*(.*)$/.exec(raw);
    if (!m) continue;
    const indent = m[1]!.length;
    while (path.length && path[path.length - 1]!.indent >= indent) path.pop();
    const key = [...path.map((p) => p.key), m[2]!].join('.');
    const v = m[3]!.replace(/\s+#.*$/, '').trim();
    if (v) out.set(key, v.replace(/^(["'])(.*)\1$/, '$2'));
    else path.push({ indent, key: m[2]! });
  }
  return out;
}

/** The frontmatter's `---` lines (indexes), when the first non-blank line opens one and a later line closes it. */
export function frontmatterAt(lines: readonly string[]): { start: number; end: number } | null {
  let start = 0;
  while (start < lines.length && !lines[start]!.trim()) start++;
  if (start >= lines.length || !/^\s*---\s*$/.test(lines[start]!)) return null;
  for (let end = start + 1; end < lines.length; end++) if (/^\s*---\s*$/.test(lines[end]!)) return { start, end };
  return null;
}

/**
 * The fix of a `title` statement (`flow.title-statement`, `er.title-statement`): the statement on line `li` becomes
 * the frontmatter's `title:` (added to the frontmatter there is, else a new one before the header).
 */
export function titleToFrontmatter(code: string, li: number): string {
  const L = code.split('\n');
  const m = /^\s*title\s+(.+?)\s*$/.exec(L[li] ?? '');
  if (!m) return code;
  const v = m[1]!;
  const yaml = /^[\w ,.()!?'-]+$/.test(v) && !/^['-]/.test(v) ? v : JSON.stringify(v);
  L.splice(li, 1);
  const first = L.findIndex((l) => l.trim() !== '');
  if (first >= 0 && /^---\s*$/.test(L[first]!)) {
    const close = L.findIndex((l, i) => i > first && /^---\s*$/.test(l));
    const at = L.findIndex((l, i) => i > first && i < close && /^title\s*:/.test(l));
    if (at >= 0) L[at] = `title: ${yaml}`;
    else L.splice(first + 1, 0, `title: ${yaml}`);
    return L.join('\n');
  }
  return ['---', `title: ${yaml}`, '---', ...L].join('\n');
}
