// Canvas selection and structure (§9 `controllers/select`, `move`, `resize`, `nudge`, `paint-style`, `ui/inline-edit`,
// `ui/empty-state`, the board menu): the editor's canvas modules, in install order.
import type { EditorModule } from '../../module.js';
import { canvasEmptyModule } from './empty.js';
import { canvasInlineEditModule } from './inline-edit.js';
import { canvasPaintModule } from './paint.js';
import { canvasSelectModule } from './select.js';
import { canvasStructureModule } from './structure.js';
import { hoverHighlightModule, linksModule } from '../../../view/modules/canvas.js';

export { canvasEmptyModule, canvasInlineEditModule, canvasPaintModule, canvasSelectModule, canvasStructureModule };

/** Paint first: its Esc link comes before the rest of the chain (A.11). View mode's links and hover highlight are the viewer's (A16). */
export const CANVAS_MODULES: readonly EditorModule[] = [
  canvasPaintModule, canvasSelectModule, canvasStructureModule, canvasInlineEditModule, canvasEmptyModule,
  linksModule as unknown as EditorModule, hoverHighlightModule as unknown as EditorModule, // the view modules run on the editor's kernel as on the viewer's
];
