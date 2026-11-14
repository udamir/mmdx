// Reading opened files into one document (A.8 row 79; prototype `readFiles`): the editor's Open and drop, and the studio's (R10: a lib, not the document module).
import { joinSource, mergeLegacySidecar } from '../../core/meta/index.js';
import type { Diagnostic } from '../../core/types.js';

const isJson = (f: File): boolean => /\.json$/i.test(f.name);
/** A file that can be a document: a diagram, Markdown or text file, or a `.json` layout sidecar — never an image. */
export const isDocumentFile = (f: File): boolean => /\.(mmdx|mmd|md|markdown|txt|json)$/i.test(f.name) && !/^image\//.test(f.type ?? '');

/** The text of a Markdown file is its first ```mermaid block (other files are taken as they are). */
export function extractMermaid(text: string, fileName: string): string {
  if (!/\.(md|markdown)$/i.test(fileName)) return text;
  const md = /```mermaid[^\n]*\n([\s\S]*?)```/.exec(text);
  return md ? md[1] ?? '' : text;
}

export interface ReadFiles {
  /** The document to load. */
  source: string;
  /** The diagram file's name (absent when only a sidecar was given). */
  name?: string;
  /** A `.json` legacy layout sidecar that was merged, with what merging it reported. */
  sidecar?: { name: string; diagnostics: Diagnostic[] };
}

/**
 * Reads dropped or picked files into one document (A.8 row 79): `.mmdx`, `.mmd`, `.txt`, `.md` (its first mermaid
 * block), plus a `.json` legacy sidecar merged into it (into `current()` when no diagram file came with it). Null when
 * nothing could be opened.
 */
export async function readDocumentFiles(files: FileList | File[], current: () => string): Promise<ReadFiles | null> {
  const list = Array.from(files).filter(isDocumentFile);
  const json = list.find(isJson);
  const src = list.find((f) => !isJson(f));
  if (!json && !src) return null;
  const text = src ? extractMermaid(await src.text(), src.name) : current();
  const out: ReadFiles = { source: text };
  if (src) out.name = src.name;
  if (json) {
    const merged = mergeLegacySidecar(text, await json.text());
    out.source = joinSource(merged.doc);
    out.sidecar = { name: json.name, diagnostics: merged.diagnostics };
  }
  return out;
}
