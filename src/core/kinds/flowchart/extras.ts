// The flowchart's extras kind (A11c): its text outline (the core's `outline`: for screen readers and copying) and the
// style lines of its portable Mermaid (classDef / class / style / linkStyle from the renderer's own style layers).
import type { DiagramMeta } from '../../meta/types.js';
import type { FlowchartModel } from '../../model.js';
import { mergeStyle, pickStyle, presetOf } from '../../render/common.js';
import { edgeMeta, edgePreset, flowPresets, groupPreset, nodePreset } from './presets.js';
import { edgeStyleLayers, flowNodeShape, groupStyleLayers, nodeStyleLayers } from './style.js';
import type { RenderContext } from '../../render/types.js';
import type { StyleProps } from '../../style.js';
import type { ResolvedTheme } from '../../theme/types.js';
import type { OutlineItem } from '../../kind/types.js';
import type { ExtrasKind } from '../../kind/extras-types.js';

const one = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

function outlineFlowchart(model: FlowchartModel): OutlineItem[] {
  // an icon or image node without a caption is named by its id
  const label = (id: string): string => one(model.nodes.get(id)?.label || model.groups.get(id)?.label || id);
  const out: OutlineItem[] = [];
  for (const n of model.nodes.values()) {
    const edges = model.edges.filter((e) => e.from === n.id);
    const item: OutlineItem = { text: label(n.id) + (n.parent ? ` (in ${label(n.parent)})` : '') };
    if (edges.length) item.children = edges.map((e) => ({ text: `→ ${label(e.to)}${e.label ? `: ${one(e.label)}` : ''}${e.line === 'invisible' ? ' (invisible link)' : ''}` }));
    out.push(item);
  }
  return out;
}

// ---- portable Mermaid

const NODE_CSS: readonly [keyof StyleProps, string][] = [['fill', 'fill'], ['stroke', 'stroke'], ['strokeWidth', 'stroke-width'], ['text', 'color']];

// Values are already validated (colour literals, finite numbers), so they cannot break out of the CSS list.
function css(st: StyleProps): string {
  const out: string[] = [];
  for (const [k, prop] of NODE_CSS) {
    const v = st[k];
    if (v === undefined || v === null || v === '') continue;
    out.push(`${prop}:${typeof v === 'number' ? `${v}px` : String(v)}`);
  }
  return out.join(',');
}


function flowchartStyles(model: FlowchartModel, meta: DiagramMeta, theme: ResolvedTheme, ctx: RenderContext): string[] {
  // the renderer's own layers (style.ts): theme, shape default, `_base`, preset, then the item's metadata
  const P = flowPresets(theme, meta);
  const F = theme.flowchart;
  const out: string[] = [];
  /** Nodes that share a look (same preset and shape, no own style): one classDef. */
  const byClass = new Map<string, { preset: string; shape: string; ids: string[] }>();
  for (const n of model.nodes.values()) {
    const preset = nodePreset(n, meta, P);
    const nm = meta.nodes?.[n.id] ?? {};
    const shape = n.data?.img != null ? 'image' : n.data?.icon ? 'icon' : flowNodeShape(n, nm, presetOf(P.node, preset), F);
    const own = pickStyle(nm);
    if (NODE_CSS.some(([k]) => own[k] !== undefined)) {
      const c = css(mergeStyle(ctx, ...nodeStyleLayers(theme, meta, P, shape, preset), own));
      if (c) out.push(`style ${n.id} ${c}`);
    } else {
      const k = `${preset}\u0000${shape}`;
      (byClass.get(k) ?? byClass.set(k, { preset, shape, ids: [] }).get(k)!).ids.push(n.id);
    }
  }
  const names = new Set<string>();
  for (const { preset, shape, ids } of byClass.values()) {
    const c = css(mergeStyle(ctx, ...nodeStyleLayers(theme, meta, P, shape, preset)));
    if (!c) continue;
    // one class per look: the preset's name (studioDefault without one), with the shape when two shapes look different
    let name = preset ? `s_${preset.replace(/\W/g, '_')}` : 'studioDefault';
    if (names.has(name)) name = `${name}_${shape.replace(/\W/g, '_')}`;
    names.add(name);
    out.push(`classDef ${name} ${c}`);
    out.push(`class ${ids.join(',')} ${name}`);
  }
  for (const g of model.groups.values()) {
    const st = mergeStyle(ctx, ...groupStyleLayers(theme, meta, P, groupPreset(g, meta, P)), pickStyle(meta.groups?.[g.id]));
    const { text: _text, ...rest } = st; // a group's text colour is its title colour
    const fill = st.fill === 'none' ? 'transparent' : st.fill;
    const c = css({ ...rest, ...(fill !== undefined ? { fill } : {}), ...(st.titleColor !== undefined ? { text: st.titleColor } : {}) });
    if (c) out.push(`style ${g.id} ${c}`);
  }
  for (const e of model.edges) {
    const st = mergeStyle(ctx, ...edgeStyleLayers(theme, meta, P, edgePreset(e, meta, P)), pickStyle(edgeMeta(e, meta)));
    const parts: string[] = [];
    if (st.color) parts.push(`stroke:${st.color}`);
    if (st.width !== undefined) parts.push(`stroke-width:${st.width}px`);
    const label = st.labelColor || st.color;
    if (label) parts.push(`color:${label}`);
    if (st.dash) parts.push(`stroke-dasharray:${st.dash.replace(/\s+/g, ' ')}`);
    if (parts.length) out.push(`linkStyle ${e.index} ${parts.join(',')}`);
  }
  return out;
}

export const EXTRAS: ExtrasKind<FlowchartModel> = { type: 'flowchart', outline: outlineFlowchart, portableStyles: flowchartStyles };
