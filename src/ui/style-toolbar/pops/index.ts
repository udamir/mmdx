// The style toolbar's popovers, by control.
import type { ToolbarControl } from '../types.js';
import { arrangePop, layerPop, orderPop } from './arrange.js';
import type { Filler } from './common.js';
import { strokePop, arrowsPop, routingPop } from './line.js';
import { mediaPop } from './media.js';
import { morePop, selectionPop } from './more.js';
import { presetsPop, tableStylePop } from './presets.js';
import { fillPop, shapePop } from './shape.js';
import { alignPop, fontPop, formatPop, linkPop, textColorPop } from './text.js';

export type { Fill, Filler } from './common.js';

export const POPS: Readonly<Partial<Record<ToolbarControl, Filler>>> = {
  shape: shapePop, fill: fillPop,
  bold: formatPop, align: alignPop, font: fontPop, link: linkPop, textColor: textColorPop,
  border: strokePop, line: strokePop, arrows: arrowsPop, routing: routingPop,
  arrange: arrangePop, order: orderPop, layer: layerPop,
  presets: presetsPop, tableStyle: tableStylePop,
  selection: selectionPop, more: morePop, media: mediaPop,
};
