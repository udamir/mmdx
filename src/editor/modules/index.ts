// The editor's default feature modules, in install order. Each Appendix A group maps to one module (§9).
import type { EditorModule } from '../module.js';
import { CANVAS_MODULES } from './canvas/index.js';
import { lazyModule } from '../../view/module.js';
import type { EditorCore } from '../core.js';
import { mindmapModule } from './mindmap/index.js';
import { connectModule } from './connect/index.js';
import { shapesModule } from './shapes/index.js';
import { insertModule } from './insert/index.js';
import { CHROME_MODULES, LAYOUT_MODULES, versionCopyModule } from './chrome/index.js';
import { PANEL_MODULES } from './panels/index.js';

/**
 * The document stage only (component architecture §8.2): editing gestures, handles, panels, toolbars and editing
 * shortcuts are suspended while History shows a comparison or an old version, with their state kept.
 */
const documentStage = (m: EditorModule): EditorModule => ({ ...m, when: { ...m.when, stage: ['document'] } });

/**
 * Also while an old version shows read-only (the `version` stage): selecting and copying, the panel layout, the Code
 * panel and Layers (read-only there), the editor's dock tools (Shapes, Properties and Undo / Redo hidden) and the
 * exports (of the version).
 */
const versionToo = (m: EditorModule): EditorModule => ({ ...m, when: { ...m.when, stage: ['document', 'version'] } });

// the panel stacks too: the same stacks (and widths) whatever History shows; a comparison's panels go into them
/**
 * A diagram type's own modules (A11d): installed, and their code loaded, only while the document is of that type
 * (`when.kind`); the ER table editing and the sequence gestures are not in the editor's first chunk.
 */
const erTableModule = lazyModule<EditorCore>({ id: 'er-table', when: { kind: ['er'] } }, () => import('./er-table/index.js').then((m) => m.erTableModule));
const sequenceModule = lazyModule<EditorCore>({ id: 'sequence', when: { kind: ['sequence'] } }, () => import('./sequence/index.js').then((m) => m.sequenceModule));

const ALWAYS = new Set(['history', 'tool-dock', 'pan', 'pen', 'zoom-bar', 'view-params', 'panel-stacks']);
const VERSION = new Set(['links', 'hover-highlight', 'canvas-select', 'canvas-structure', 'code-panel', 'right-panels', 'editor-tools', 'editor-params', 'document']);

export const DEFAULT_MODULES: readonly EditorModule[] = ([
  // first: while a table is edited its rows take the keys (Esc, Delete, ⌘A, Enter, arrows) before the canvas does
  erTableModule,
  // the outline keys (Tab, Enter, arrows) of a mindmap come before the canvas's
  mindmapModule,
  ...CANVAS_MODULES,
  connectModule,
  sequenceModule,
  shapesModule,
  insertModule,
  ...LAYOUT_MODULES,
  ...PANEL_MODULES,
  ...CHROME_MODULES,
  versionCopyModule,
] as EditorModule[]).map((m) => (ALWAYS.has(m.id) || m.id === versionCopyModule.id ? m : VERSION.has(m.id) ? versionToo(m) : documentStage(m)));
