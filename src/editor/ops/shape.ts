// Shape changes of the editor (T02.6, no UI): a type that keeps shapes in its Mermaid code (the edit kind's
// `setShape`: a flowchart writes a bracket or `@{ shape }`) gets them there, so the file shows the same shapes in stock
// Mermaid; metadata `shape` stays for shapes the code cannot hold, and where the item's preset draws another shape
// (a preset outranks the code). Shapes older files keep only in metadata move to the code on edit and through the
// `flow.meta-shape` fix — never on a plain save.
import type { DiagramMeta } from '../../core/meta/types.js';
import type { DiagramModel } from '../../core/model.js';
import { reparse } from '../../core/parse/dispatch.js';
import { cloneMeta, ensure, getM, tidy } from '../../core/ops/meta-util.js';
import { currentPreset, presetsFor } from '../../core/ops/style-env.js';
import { shapeIdOf } from '../../core/shapes/registry.js';
import type { ItemRef } from '../../core/types.js';
import type { EditorCore } from '../core.js';
import { withEdit } from '../kinds/registry.js';

export interface ShapeDoc {
  code: string;
  meta: DiagramMeta;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * The document after giving items a shape (`shape`), or after moving the shapes they keep only in metadata into the
 * code (`shape` null). Null when no item's type writes shapes to its code, or nothing changes (the caller edits
 * metadata as before).
 */
export function shapeDoc(core: EditorCore, refs: readonly ItemRef[], shape: string | null, base: ShapeDoc = { code: core.code, meta: core.meta }): ShapeDoc | null {
  let code = base.code;
  const meta = cloneMeta(base.meta);
  let handled = false;
  // each code parsed once (P18: twice per item), the current one not at all
  let parsed: { code: string; model: DiagramModel } | null = base.code === core.code ? { code: core.code, model: core.model } : null;
  const modelOf = (c: string): DiagramModel => {
    if (parsed?.code !== c) parsed = { code: c, model: reparse(c) };
    return parsed.model;
  };
  for (const ref of refs) {
    const want = shape ?? str(getM(meta, ref.kind, ref.id).shape);
    if (!want) continue;
    const model = modelOf(code);
    const res = withEdit(model, (k, m) => k.setShape?.(code, m, ref, want)) ?? null;
    if (!res) {
      // a shape the code cannot hold (or a type that keeps shapes in metadata): metadata, as before
      if (shape !== null) {
        ensure(meta, ref.kind, ref.id).shape = want;
        tidy(meta, ref.kind, ref.id);
      }
      continue;
    }
    handled = true;
    code = res.code;
    // a preset that draws another shape outranks the code: the item keeps the shape in metadata then
    const env = { model: modelOf(code), meta, theme: core.result.theme };
    const ps = str(presetsFor(env, ref.kind)?.[currentPreset(env, ref)]?.shape);
    const m = ensure(meta, ref.kind, ref.id);
    if (ps && shapeIdOf(ps) !== shapeIdOf(want)) m.shape = want;
    else delete m.shape;
    tidy(meta, ref.kind, ref.id);
  }
  return handled && (code !== base.code || JSON.stringify(meta) !== JSON.stringify(base.meta)) ? { code, meta } : null;
}

/** Items of the current diagram whose shape is only in metadata though the code could hold it (the `flow.meta-shape` issue). */
export function metaOnlyShapes(core: EditorCore, refs: readonly ItemRef[]): ItemRef[] {
  return refs.filter((ref) => {
    const s = str(getM(core.meta, ref.kind, ref.id).shape);
    const res = s ? withEdit(core.model, (k, m) => k.setShape?.(core.code, m, ref, s)) : null;
    return !!res && res.code !== core.code;
  });
}

/**
 * A style edit of items as one history step when it touches the code (T02.6): a new `shape` written there, or a shape
 * the items keep only in metadata moved there on the way. `rest` applies the patch's other keys to the new metadata.
 * False when the code stays as it is (a reset to the inherited shape, a type without code shapes): the caller edits
 * metadata as before.
 */
export function styleWithShapes(core: EditorCore, refs: readonly ItemRef[], patch: Readonly<Record<string, unknown>>, label: string, rest: (meta: DiagramMeta) => DiagramMeta): boolean {
  if ('shape' in patch && !str(patch['shape'])) return false;
  const doc = shapeDoc(core, refs, str(patch['shape']) ?? null);
  if (!doc) return false;
  return core.applyCode({ code: doc.code, meta: rest(doc.meta) }, label);
}
