// Diff reports (§7.6): a JSON change report, a Markdown summary for merge request descriptions and bot comments,
// and a unified source diff (`git apply`-able when no facet is ignored).
import { joinSource, splitSource } from '../meta/index.js';
import type { DiagramDiff, DiffIgnore, FieldChange, ItemChange } from './types.js';
import { withLayoutOf, withoutStyle } from './transform.js';
import { diffLines, type LineOp } from './text.js';
import { safeUrl } from '../validate.js';

export interface VersionInfo {
  /** Commit SHA, revision id or content hash. */
  id: string;
  message?: string;
  author?: string;
  /** ISO date. */
  date?: string;
  url?: string;
}

/** Schema version of the JSON report. */
export const REPORT_VERSION = 1;

export interface ReportOptions {
  format: 'json' | 'markdown';
  before?: VersionInfo;
  after?: VersionInfo;
  /** Link of one change (e.g. into a hosted diff view), or null. */
  links?: (c: ItemChange) => string | null;
  /** Diagram name in the Markdown title. */
  name?: string;
}

const KIND: Record<string, string> = {
  node: 'node', group: 'group', edge: 'edge', participant: 'participant', message: 'message', note: 'note', block: 'block', box: 'box', entity: 'table', rel: 'relation',
};

const COLOR = /^(#[0-9a-f]{3,8}|@[\w-]+(~[^\s]*)?)$/i;

/** Markdown-safe inline text (no markup from diagram content). */
const md = (s: string): string => s.replace(/[\\`*_{}[\]<>()#+!|~]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');

/** A value as an inline code span (colours and structured values) or escaped text. */
function mdValue(v: unknown): string {
  if (v === undefined) return '—';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s === '') return '""';
  if (typeof v !== 'string' || COLOR.test(s) || s.length > 60) {
    const t = s.length > 120 ? `${s.slice(0, 117)}…` : s;
    const ticks = t.includes('`') ? '``' : '`';
    return `${ticks}${ticks.length > 1 ? ' ' : ''}${t.replace(/\r?\n/g, ' ')}${ticks.length > 1 ? ' ' : ''}${ticks}`;
  }
  return md(s);
}

const fieldLine = (f: FieldChange): string => `${md(f.field)} (${f.facet}): ${mdValue(f.before)} → ${mdValue(f.after)}`;

const versionText = (v: VersionInfo | undefined, fallback: string): string => {
  if (!v) return fallback;
  const id = `\`${v.id.replace(/`/g, '')}\``;
  // a version's URL comes from the history adapter: only an allowed link (the link policy), with the characters that
  // would end a Markdown link target escaped (old D7)
  const url = safeUrl(v.url);
  const ref = url ? `[${id}](<${url.replace(/[<>]/g, (c) => encodeURIComponent(c))}>)` : id;
  return [ref, v.message ? md(v.message) : '', v.author ? `by ${md(v.author)}` : ''].filter(Boolean).join(' ');
};

/** A change report of a diff: JSON (schema-versioned) or Markdown. */
export function diffReport(diff: DiagramDiff, o: ReportOptions): string {
  if (o.format === 'json') {
    const out: Record<string, unknown> = { version: REPORT_VERSION, type: diff.type, typeChanged: diff.typeChanged, counts: diff.counts };
    if (o.before) out['before'] = o.before;
    if (o.after) out['after'] = o.after;
    out['doc'] = diff.doc;
    out['items'] = diff.items.filter((c) => c.status !== 'unchanged');
    return JSON.stringify(out, null, 2);
  }
  const c = diff.counts;
  const lines: string[] = [];
  lines.push(`### Diagram changes${o.name ? `: ${md(o.name)}` : ''}`);
  lines.push('');
  if (o.before || o.after) lines.push(`${versionText(o.before, 'before')} → ${versionText(o.after, 'after')}`, '');
  lines.push(`**${c.added}** added · **${c.removed}** removed · **${c.changed}** changed (content ${c.content}, layout ${c.layout}, style ${c.style})`);
  if (diff.typeChanged) lines.push('', '> The diagram type changed.');
  if (diff.doc.length) {
    lines.push('', '#### Diagram-wide', '');
    for (const f of diff.doc) lines.push(`- ${fieldLine(f)}`);
  }
  const section = (title: string, status: ItemChange['status']): void => {
    const items = diff.items.filter((x) => x.status === status);
    if (!items.length) return;
    lines.push('', `#### ${title} (${items.length})`, '');
    for (const it of items) {
      const link = o.links?.(it);
      const name = `${KIND[it.kind] ?? it.kind} ${status === 'removed' ? `~~${md(it.label)}~~` : `**${md(it.label)}**`}`;
      lines.push(`- ${link ? `[${name}](${link})` : name}`);
      if (status === 'changed') for (const f of it.fields) lines.push(`  - ${fieldLine(f)}`);
    }
  };
  section('Added', 'added');
  section('Removed', 'removed');
  section('Changed', 'changed');
  if (!c.added && !c.removed && !c.changed && !diff.doc.length) lines.push('', 'No changes.');
  return lines.join('\n') + '\n';
}

// ---- unified diff -------------------------------------------------------------------------------------------------

export interface UnifiedDiffOptions {
  /** File name in the `---` / `+++` headers (default `diagram.mmdx`). */
  name?: string;
  /** Lines of context around each change (default 3). */
  context?: number;
  /** The whole file, the Mermaid code only, or the `%%@` metadata only. */
  part?: 'all' | 'code' | 'meta';
  /** Facets left out of the diff (style lines removed, old layout replaced). */
  ignore?: DiffIgnore;
}

/** The part of a source a code / metadata view shows. */
export function sourcePart(src: string, part: 'all' | 'code' | 'meta'): string {
  if (part === 'all') return src;
  const { doc } = splitSource(src);
  return part === 'code' ? doc.code : joinSource({ code: '', meta: doc.meta }).replace(/^\s+/, '');
}

const splitLines = (s: string): string[] => (s === '' ? [] : s.replace(/\n$/, '').split('\n'));

/** A standard unified diff (`---` / `+++` / `@@`) of two sources. */
export function unifiedDiff(before: string, after: string, o: UnifiedDiffOptions = {}): string {
  let a = before, b = after;
  if (o.ignore?.style) {
    a = withoutStyle(a);
    b = withoutStyle(b);
  }
  if (o.ignore?.layout) a = withLayoutOf(a, b);
  const part = o.part ?? 'all';
  const pa = sourcePart(a, part), pb = sourcePart(b, part);
  const A = splitLines(pa), B = splitLines(pb);
  const noEolA = pa !== '' && !pa.endsWith('\n'), noEolB = pb !== '' && !pb.endsWith('\n');
  // a last line without a newline differs from the same line with one
  const EOL = '\u0000';
  const mark = (L: string[], noEol: boolean): string[] => (noEol ? [...L.slice(0, -1), L[L.length - 1]! + EOL] : L);
  const ops = diffLines(mark(A, noEolA), mark(B, noEolB)).map((x) => (x.text.endsWith(EOL) ? { ...x, text: x.text.slice(0, -1) } : x));
  const ctx = o.context ?? 3;
  const name = o.name ?? 'diagram.mmdx';
  const out = [`--- a/${name}`, `+++ b/${name}`];
  // hunks: changed lines with `ctx` lines around them, merged when they touch
  const changed = ops.map((x, i) => (x.op === 'same' ? -1 : i)).filter((i) => i >= 0);
  if (!changed.length) return '';
  let i = 0;
  while (i < changed.length) {
    const start = Math.max(0, changed[i]! - ctx);
    let end = Math.min(ops.length - 1, changed[i]! + ctx);
    while (i + 1 < changed.length && changed[i + 1]! - ctx <= end + 1) end = Math.min(ops.length - 1, changed[++i]! + ctx);
    i++;
    const slice = ops.slice(start, end + 1);
    const first = (k: 'a' | 'b'): number => {
      const hit = slice.find((x) => x[k] !== undefined);
      if (hit) return hit[k]!;
      // a hunk with no lines on one side starts after the line before it
      const prev = ops.slice(0, start).reverse().find((x) => x[k] !== undefined);
      return prev ? prev[k]! : 0;
    };
    const na = slice.filter((x) => x.op !== 'add').length, nb = slice.filter((x) => x.op !== 'del').length;
    out.push(`@@ -${first('a')}${na === 1 ? '' : `,${na}`} +${first('b')}${nb === 1 ? '' : `,${nb}`} @@`);
    for (const x of slice) {
      out.push(`${x.op === 'add' ? '+' : x.op === 'del' ? '-' : ' '}${x.text}`);
      if ((x.op !== 'add' && noEolA && x.a === A.length) || (x.op !== 'del' && noEolB && x.b === B.length)) out.push('\\ No newline at end of file');
    }
  }
  return out.join('\n') + '\n';
}

export type { LineOp };
