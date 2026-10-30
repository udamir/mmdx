// The editor's default feature modules, in install order. Each Appendix A group maps to one module (§9).
import type { EditorModule } from '../module.js';
import { CANVAS_MODULES } from './canvas/index.js';
import { erTableModule } from './er-table/index.js';
import { connectModule } from './connect/index.js';
import { sequenceModule } from './sequence/index.js';
import { shapesModule } from './shapes/index.js';
import { CHROME_MODULES, LAYOUT_MODULES } from './chrome/index.js';
import { PANEL_MODULES } from './panels/index.js';

export const DEFAULT_MODULES: readonly EditorModule[] = [
  // first: while a table is edited its rows take the keys (Esc, Delete, ⌘A, Enter, arrows) before the canvas does
  erTableModule,
  ...CANVAS_MODULES,
  connectModule,
  sequenceModule,
  shapesModule,
  ...LAYOUT_MODULES,
  ...PANEL_MODULES,
  ...CHROME_MODULES,
];
