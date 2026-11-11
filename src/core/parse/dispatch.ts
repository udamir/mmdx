// Parse dispatch: the type from the header, then the parser of that type's kind. Kinds are passed in, so a bundle can
// include only the diagram types it loads (the viewer loads them per type, §R5).
import type { Kinds } from '../kind/types.js';
import type { DiagramModel, UnsupportedModel } from '../model.js';
import type { DiagramType } from '../types.js';
import { diag } from '../types.js';
import { KIND_INFO, typeOfHeader } from '../kinds/info.js';
import { MAX_SOURCE_LENGTH, tooLargeDiagnostic } from './limits.js';
import { registeredKinds } from '../kinds/registry.js';


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

export function detectType(code: string): DiagramType | null {
  if (typeof code !== 'string') return null;
  const h = headerLine(code);
  return h === null ? null : typeOfHeader(h);
}

/** `"flowchart", "sequenceDiagram" or "erDiagram"`: the headers of every type, for the unsupported message. */
const HEADERS = ((names: string[]): string => `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`)(
  Object.values(KIND_INFO).map((k) => `"${k.starter.trim().split(/\s/)[0]}"`),
);

function unsupported(code: string): UnsupportedModel {
  const m: UnsupportedModel = {
    type: null,
    diagnostics: [diag('error', 'type.unsupported', `Unsupported diagram: start with ${HEADERS}.`)],
  };
  const kw = /^[A-Za-z][\w-]*/.exec(headerLine(code) ?? '');
  if (kw) m.keyword = kw[0];
  return m;
}

export function parseWith(code: string, kinds: Kinds): DiagramModel {
  if (typeof code !== 'string') code = '';
  const type = detectType(code);
  if (code.length > MAX_SOURCE_LENGTH) {
    // the right type, but no items: the viewer shows "Diagram too large"
    const d = tooLargeDiagnostic(code.length);
    const p = type ? kinds[type] : undefined;
    const m: DiagramModel = p ? p.empty() : unsupported(code);
    if (m.type === null) m.diagnostics = [d];
    else m.diagnostics.push(d);
    return m;
  }
  const p = type ? kinds[type] : undefined;
  return p ? p.parse(code) : unsupported(code);
}

/** A model of the code, parsed with the kinds registered so far (the ops re-parse their results with it). */
export const reparse = (code: string): DiagramModel => parseWith(code, registeredKinds());
