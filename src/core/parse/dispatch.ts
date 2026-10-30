// Parse dispatch: the type from the header, then the parser for that type. Parsers are passed in (ParserSet), so a
// bundle can include only the diagram types it loads (the viewer loads them per type, §R5).
import type { DiagramModel, SupportedModel, UnsupportedModel } from '../model.js';
import type { DiagramType } from '../types.js';
import { diag } from '../types.js';
import { MAX_SOURCE_LENGTH, tooLargeDiagnostic } from './limits.js';

export interface TypeParser {
  parse(code: string): SupportedModel;
  /** The model of a source over the size limit: the right type, no items. */
  empty(): SupportedModel;
}

export type ParserSet = Partial<Record<DiagramType, TypeParser>>;

/** First header line, skipping blank lines, `%%` comments and leading front matter; scans line by line without splitting the whole source. */
function headerLine(code: string): string | null {
  let pos = 0, first = true, inFront = false;
  while (pos <= code.length) {
    let nl = code.indexOf('\n', pos);
    if (nl < 0) nl = code.length;
    const t = code.slice(pos, nl).trim();
    pos = nl + 1;
    if (inFront) { if (t.startsWith('---')) inFront = false; continue; }
    if (!t || t.startsWith('%%')) continue;
    if (first && t.startsWith('---')) { inFront = true; first = false; continue; }
    return t;
  }
  return null;
}

const typeOf = (t: string): DiagramType | null =>
  /^(flowchart|graph)\b/i.test(t) ? 'flowchart' : /^sequenceDiagram\b/.test(t) ? 'sequence' : /^erDiagram\b/.test(t) ? 'er' : null;

export function detectType(code: string): DiagramType | null {
  if (typeof code !== 'string') return null;
  const h = headerLine(code);
  return h === null ? null : typeOf(h);
}

function unsupported(code: string): UnsupportedModel {
  const m: UnsupportedModel = {
    type: null,
    diagnostics: [diag('error', 'type.unsupported', 'Unsupported diagram: start with "flowchart", "sequenceDiagram" or "erDiagram".')],
  };
  const kw = /^[A-Za-z][\w-]*/.exec(headerLine(code) ?? '');
  if (kw) m.keyword = kw[0];
  return m;
}

export function parseWith(code: string, parsers: ParserSet): DiagramModel {
  if (typeof code !== 'string') code = '';
  const type = detectType(code);
  if (code.length > MAX_SOURCE_LENGTH) {
    // the right type, but no items: the viewer shows "Diagram too large"
    const d = tooLargeDiagnostic(code.length);
    const p = type ? parsers[type] : undefined;
    const m: DiagramModel = p ? p.empty() : unsupported(code);
    if (m.type === null) m.diagnostics = [d];
    else m.diagnostics.push(d);
    return m;
  }
  const p = type ? parsers[type] : undefined;
  return p ? p.parse(code) : unsupported(code);
}
