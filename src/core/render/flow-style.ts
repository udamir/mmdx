// The style layers mmdx puts under a flowchart item's Mermaid classes and `style` statements, theme first: the theme's
// default, the shape's default (nodes), the diagram's `_base` and the item's preset. One definition for the renderer
// and the portable export, so the exported Mermaid looks like the picture (B14).
import { str } from './graph-kit.js';
import type { DiagramMeta, ItemMeta } from '../meta/types.js';
import type { FlowNode } from '../model.js';
import { byShapeId, shapeDef } from '../shapes/registry.js';
import type { StyleProps } from '../style.js';
import type { ResolvedTheme } from '../theme/types.js';
import { baseStyle, presetOf } from './common.js';
import type { FlowPresets } from './flow-presets.js';

type Layer = StyleProps | object | undefined;
type Flow = ResolvedTheme['flowchart'];


const shapeStylesOf = new WeakMap<object, Record<string, StyleProps> | undefined>();
/** The theme's per-shape node defaults by catalogue id (computed once per theme). */
function shapeStyles(F: Flow): Record<string, StyleProps> | undefined {
  if (!F.nodeShapes) return undefined;
  if (!shapeStylesOf.has(F.nodeShapes)) shapeStylesOf.set(F.nodeShapes, byShapeId(F.nodeShapes));
  return shapeStylesOf.get(F.nodeShapes);
}

/** The catalogue shape a node is drawn as: its metadata's, its preset's, its code's, else the theme's. */
export const flowNodeShape = (n: FlowNode, nm: ItemMeta, pst: StyleProps | undefined, F: Flow): string =>
  shapeDef(str(nm.shape) || pst?.shape || (n.shape !== 'rect' ? n.shape : F.node.shape || 'rect')).id;

/** A node's layers: theme node, the shape's default (`image` / `icon` for media nodes), `_base`, the preset. */
export const nodeStyleLayers = (T: ResolvedTheme, meta: DiagramMeta, P: FlowPresets, shape: string, preset: string): Layer[] => [
  T.flowchart.node, shapeStyles(T.flowchart)?.[shape], baseStyle(meta, 'node'), presetOf(P.node, preset),
];

/** A subgraph's layers: theme group, `_base`, the preset. */
export const groupStyleLayers = (T: ResolvedTheme, meta: DiagramMeta, P: FlowPresets, preset: string): Layer[] => [
  T.flowchart.group, baseStyle(meta, 'group'), presetOf(P.group, preset),
];

/** An edge's layers: theme edge, `_base`, the preset. */
export const edgeStyleLayers = (T: ResolvedTheme, meta: DiagramMeta, P: FlowPresets, preset: string): Layer[] => [
  T.flowchart.edge, baseStyle(meta, 'edge'), presetOf(P.edge, preset),
];
