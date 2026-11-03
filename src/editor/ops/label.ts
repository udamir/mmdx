// Item text ops of the editor (no UI): how an item's text is read and written back to Mermaid (the inline editor and
// the Properties panel), and the title / sub line that describes an item.
import type { DiagramModel } from '../../core/model.js';
import type { CodeResult } from '../../core/ops/types.js';
import type { ItemKind } from '../../core/types.js';
import type { EditorCore } from '../core.js';
import { withEdit } from '../kinds/registry.js';

/** Title and sub line of the Properties panel for an item. */
export function describe(M: DiagramModel, kind: ItemKind, id: string): { title: string; sub: string } {
  return withEdit(M, (k, m) => k.describe(m, { kind, id })) ?? { title: id, sub: kind };
}

export interface LabelSpec {
  value: string;
  multi: boolean;
  /** i18n key of the section title. */
  title: string;
  /**
   * Rewrites the code with a new text, against the document as it is when called (an edit typed while a remote update
   * or an undo changed the document applies to the current code); null when the item is gone — or, for the positional
   * ids of sequence items, now names an item whose text is no longer the one being edited.
   */
  apply(v: string): CodeResult | null;
}

interface TextOf {
  value: string;
  multi: boolean;
  title: string;
  write(v: string): CodeResult;
}

/** An item's text in the current document and how to rewrite it there. */
function textOf(core: EditorCore, kind: ItemKind, id: string): TextOf | null {
  const code = core.code;
  const t = withEdit(core.model, (k, m) => k.text(m, { kind, id }));
  return t ? { value: t.value, multi: t.multi, title: t.title, write: (v) => t.write(code, v) } : null;
}

/** Sequence ids are positions (`m3` is the third message): an insertion above moves them to another item. */
const POSITIONAL: ReadonlySet<ItemKind> = new Set(['message', 'note', 'block', 'box']);

/** How an item's text is read and written back to Mermaid (prototype `labelSpec`; the inline editor and Properties). */
export function labelSpec(core: EditorCore, kind: ItemKind, id: string): LabelSpec | null {
  const at = textOf(core, kind, id);
  if (!at) return null;
  return {
    value: at.value, multi: at.multi, title: at.title,
    apply: (v) => {
      if (!core.store.exists({ kind, id })) return null;
      const now = textOf(core, kind, id);
      if (!now || (POSITIONAL.has(kind) && now.value !== at.value)) return null;
      return now.write(v);
    },
  };
}
