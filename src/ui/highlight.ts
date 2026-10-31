// Syntax highlighting of Mermaid and `%%@` metadata lines (dependency-free tokenizers): a line becomes tokens, each a
// `t-*` class (coloured by styles/code-tokens.ts) and its text, which callers turn into spans and text nodes (never
// markup). Shared by the code editor (ui/code-editor.ts) and the read-only CodeView block, which loads only this.

/** One highlighted piece of a line: a `t-*` class (null = plain text) and its text. */
export type Token = readonly [cls: string | null, text: string];
export type LineHighlighter = (line: string) => Token[];

const KEYWORDS = new RegExp(
  '^(flowchart|graph|subgraph|end|direction|classDef|class|style|linkStyle|click|sequenceDiagram|erDiagram|participant|actor|create|destroy|' +
  'activate|deactivate|autonumber|title|loop|alt|else|opt|par|and|critical|option|break|rect|box|Note|note)\\b',
);
const RULES: readonly (readonly [string, RegExp])[] = [
  ['str', /"[^"\n]*"?/y],
  ['card', /(?:\|o|\|\||\}o|\}\|)(?:--|\.\.)(?:o\||\|\||o\{|\|\{)/y],
  ['arrow', /<<-->>|<<->>|<-->|<-\.->|<==>|-->>|->>|-\.+->|-\.+-|={2,}>|={3,}|-{2,}>|-{3,}|--[xo](?![\w])|--\)|-x(?![\w])|-\)|->|--(?=\s)/y],
  ['label', /\|[^|\n]*\|/y],
  ['cls', /:::[\w-]+/y],
  ['dir', /\b(?:TB|TD|BT|LR|RL)\b/y],
  ['key', /\b(?:PK|FK|UK)\b/y],
  ['pos', /\b(?:left of|right of|over|as)\b/y],
  ['punct', /[[\](){}>\\/,&;]+/y],
  ['word', /[\wÀ-￿.#]+(?:-(?=[\wÀ-￿])[\wÀ-￿.#]+)*/y],
  ['space', /\s+/y],
];

/** A `%% - N hidden` line of a filtered code view. */
export const HIDDEN_LINE = /^%% - (\d+) hidden$/;

/** Mermaid line → tokens (flowchart, sequence and ER keywords, arrows, labels, classes…). */
export function highlightLine(line: string): Token[] {
  const t = line.trimStart();
  if (t.startsWith('%% ⋯') || HIDDEN_LINE.test(t)) return [['t-fold', line]];
  if (t.startsWith('%%@')) return [['t-meta', line]];
  if (t.startsWith('%%')) return [['t-comment', line]];
  const out: Token[] = [];
  const lead = /^\s*/.exec(line)?.[0] ?? '';
  if (lead) out.push([null, lead]);
  let i = lead.length;
  const kw = KEYWORDS.exec(line.slice(i));
  if (kw) {
    out.push(['t-kw', kw[0]]);
    i += kw[0].length;
  }
  let sawArrow = false;
  const isNote = /^\s*note\b/i.test(line);
  while (i < line.length) {
    // message / relationship text after ":" once an arrow was seen (sequence, ER) or after Note targets
    if (line[i] === ':' && line[i + 1] !== ':' && (sawArrow || isNote)) {
      out.push(['t-punct', ':'], ['t-text', line.slice(i + 1)]);
      break;
    }
    let cls = 'plain';
    let txt = line[i]!;
    for (const [c, re] of RULES) {
      re.lastIndex = i;
      const m = re.exec(line);
      if (m && m[0].length) {
        cls = c;
        txt = m[0];
        break;
      }
    }
    if (cls === 'arrow' || cls === 'card') sawArrow = true;
    out.push([cls === 'space' || cls === 'plain' || cls === 'word' ? null : `t-${cls}`, txt]);
    i += txt.length;
  }
  return out;
}

// Metadata line: `%%@ kind id {json}` with the same colours as the Mermaid code.
const META_RE = /^(\s*)(%%@)(\s+)([\w.]+)?(\s+)?([^\s{]+)?(\s*)(.*)$/;
const JSON_TOKENS = /("(?:[^"\\]|\\.)*"?)(\s*:)?|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])|(\s+)|([^\s"{}[\],:]+)/gi;

/** `%%@` metadata line → tokens. */
export function highlightMetaLine(line: string): Token[] {
  const m = META_RE.exec(line);
  if (!m) return highlightLine(line);
  const [, lead = '', at = '', s1 = '', kind = '', s2 = '', id = '', s3 = '', rest = ''] = m;
  const out: Token[] = [[null, lead], ['t-punct', at], [null, s1], ['t-kw', kind], [null, s2]];
  if (id) out.push(['t-cls', id]);
  out.push([null, s3]);
  for (const t of rest.matchAll(JSON_TOKENS)) {
    const [all, str, colon, num, lit, punct] = t;
    if (str) {
      if (colon) out.push(['t-label', str], ['t-punct', colon]);
      else out.push(['t-str', str]);
    } else if (num) out.push(['t-key', num]);
    else if (lit) out.push(['t-dir', lit]);
    else if (punct) out.push(['t-punct', punct]);
    else out.push([null, all]);
  }
  return out.filter(([, s]) => s !== '');
}
