// The extras every render may need beyond the 17 shapes: the other shapes' geometry (shapes/extended.ts) and the media
// kit (T06: rich labels, icons, images; core/media/kit.ts), which renders need on the same occasions. Every kind
// registers them statically (core/kinds/all.ts, the catalogue the editor's flowchart and the theme editor read); the
// viewer and the diff load this module the first time a render draws one of these shapes or needs the kit
// (view/kinds.ts).
import { MEDIA_KIT } from './media/kit-impl.js';
import { registerMediaKit } from './media/kit.js';
import { EXTENDED } from './shapes/extended.js';
import { registerShapes } from './shapes/registry.js';

/** Makes the shapes drawable and the media kit available (idempotent). */
export function registerExtendedShapes(): void {
  registerShapes(EXTENDED);
  registerMediaKit(MEDIA_KIT);
}
