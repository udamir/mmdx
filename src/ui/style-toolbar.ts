// The style toolbar's public module (the floating context bar above a selection). The code lives in
// ui/style-toolbar/: types.ts (the host contract), kinds.ts (button sets per kind), icons.ts, controls.ts (the bar's
// buttons), pops/*.ts (one module per popover group) and toolbar.ts (`createStyleToolbar`); the parts it shares with
// the page toolbar are in ui/toolbar-kit.ts.
import { createStyleToolbar } from './style-toolbar/toolbar.js';
import type { StyleToolbarHandle, StyleToolbarOptions } from './style-toolbar/types.js';

export { createStyleToolbar } from './style-toolbar/toolbar.js';
export { bulkSpec, NODE_SHAPES, PARTICIPANT_SHAPES, TOOLBAR_KINDS } from './style-toolbar/kinds.js';
export type {
  ArrangeOp, KindSpec, LayerChoice, PaletteColor, SelectionType, StyleToolbarHandle, StyleToolbarOptions, ToolbarApi, ToolbarControl, ToolbarSelection,
} from './style-toolbar/types.js';
export { fitPresetGrid, shapePreview } from './shape-preview.js';

/** @deprecated The block Toolbar (ui/blocks/toolbar.ts) has this name: use `createStyleToolbar`. */
export const createToolbar = createStyleToolbar;
/** @deprecated Use `StyleToolbarHandle`. */
export type ToolbarHandle = StyleToolbarHandle;
/** @deprecated Use `StyleToolbarOptions`. */
export type ToolbarOptions = StyleToolbarOptions;
