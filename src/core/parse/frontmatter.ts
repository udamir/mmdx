// The frontmatter reader (`---` … `---` before the header): a small reader for the YAML Mermaid files use, shared by
// the parsers that read settings from it (flowchart: title, curve, wrapping; mindmap: colorBy, maxNodeWidth).

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

