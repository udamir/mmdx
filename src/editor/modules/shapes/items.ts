// The Shapes menu's items come from the edit kind of the diagram type (editor/kinds/<type>.ts `palette`).
import { editKind } from '../../kinds/registry.js';
import { isItem, type PaletteItem } from '../../kinds/palette.js';

/** The palette item of a key in a diagram type (`entity` for ER). */
export function paletteItem(type: string | null, key: string): PaletteItem | null {
  const list = editKind(type as Parameters<typeof editKind>[0])?.palette?.items ?? [];
  return list.filter(isItem).find((x) => x.key === key) ?? null;
}
