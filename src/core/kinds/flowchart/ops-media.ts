// Icons and images of flowchart nodes in the Mermaid code (T05, in Mermaid Chart's style): an icon or image node is
// its label in its bracket plus the node data in a separate statement (`n4["User"]` and
// `n4@{ icon: "tabler:user", form: "square", h: 60, pos: "b" }`); an icon on any other node is a `pack:name` token
// at the start of its label (`fa:fa-car Car`, `azure:computer-vision Vision`). Strings are written quoted, as Mermaid
// Chart does; existing node data is changed in place by the node data writer (parse/node-data.ts), so other keys,
// quotes and spacing stay as written.
import type { FlowchartModel, FlowNode } from '../../model.js';
import { applySplices, editBlock, type Splice } from '../../parse/node-data.js';
import { type DataValue, type NodeDataBlock } from '../../model.js';
import { faOnly, leadingIcon, withIconToken, type IsIconToken } from '../../icons/icon-token.js';
import { nodeDef } from '../../ops/connect.js';
import { relabelFlowNode } from './ops.js';
import { parseFlowchart } from './parse.js';
import { uniqueId } from '../../ops/ids.js';
import { append, indentOf, splice } from '../../ops/lines.js';
import { mediaPatch, type MediaChange, type MediaPatch, type MediaValue } from '../../ops/media.js';
import type { CodeResult, SelectResult } from '../../ops/types.js';
import type { ItemRef } from '../../types.js';

export { ICON_FORM, ICON_NODE_H, IMAGE_NODE_SIZE, type MediaPatch, type MediaValue } from '../../ops/media.js';

/** What a flowchart node shows besides its label: its icon (a node's `icon` key or a label token) and its image. */
export interface FlowMedia {
  /** The canonical `pack:name` of its icon (`fa:car` for the token `fa:fa-car`), if any. */
  icon: string | null;
  image: string | null;
  /** An icon node or an image node (its `icon` / `img` key), else a node whose icon is a label token. */
  node: 'icon' | 'image' | null;
  pos?: string;
  form?: string;
  w?: number;
  h?: number;
  constraint?: string;
}

/** Whether a label token is an icon (the registry decides: registered packs and Font Awesome's form). */
export { iconToken, leadingIcon, withIconToken, type IsIconToken } from '../../icons/icon-token.js';

/** A node's icon and image. */
export function flowMedia(model: FlowchartModel, id: string, isIcon: IsIconToken = faOnly): FlowMedia | null {
  const n = model.nodes.get(id);
  if (!n) return null;
  const d = n.data ?? {};
  const keys: Omit<FlowMedia, 'icon' | 'image' | 'node'> = {};
  if (d.pos !== undefined) keys.pos = d.pos;
  if (d.form !== undefined) keys.form = d.form;
  if (typeof d.w === 'number') keys.w = d.w;
  if (typeof d.h === 'number') keys.h = d.h;
  if (d.constraint !== undefined) keys.constraint = d.constraint;
  if (d.img != null) return { icon: null, image: d.img, node: 'image', ...keys };
  if (d.icon) return { icon: d.icon, image: null, node: 'icon', ...keys };
  return { icon: leadingIcon(n.label, isIcon)?.name ?? null, image: null, node: null };
}

/** A string as Mermaid Chart writes node data values (quoted; a URL's quote is percent-encoded). */
const quoted = (s: string): string => `"${s.replace(/"/g, '%22').replace(/[\r\n]/g, '')}"`;
const valueText = (v: string | number): string => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : quoted(v));

/** `k: v, …` of a new node data statement. */
const entriesText = (data: Readonly<Record<string, MediaValue | undefined>>): string =>
  Object.entries(data).filter((e): e is [string, string | number] => e[1] !== null && e[1] !== undefined).map(([k, v]) => `${k}: ${valueText(v)}`).join(', ');

/** The splice that removes a node data block standing alone on its line (`  n4@{ … }`), with the line; else null. */
function dropStatement(code: string, id: string, b: NodeDataBlock): Splice | null {
  const ls = code.lastIndexOf('\n', b.open) + 1;
  const nl = code.indexOf('\n', b.end);
  const le = nl < 0 ? code.length : nl;
  const line = code.slice(ls, le).trim();
  if (line !== `${id}@${code.slice(b.open, b.end)}`.trim()) return null;
  return nl < 0 ? { from: Math.max(0, ls - 1), to: le, text: '' } : { from: ls, to: nl + 1, text: '' };
}

/**
 * Sets node data keys of a node (null removes the key from every block): in its last `@{…}` block, else in a new
 * `id@{ … }` statement after the graph's statements. A block left empty that stands alone on its line is removed.
 */
export function writeNodeData(code: string, model: FlowchartModel, id: string, patch: Readonly<Record<string, MediaValue | undefined>>): CodeResult {
  const n = model.nodes.get(id);
  if (!n) return { code };
  const blocks = n.blocks ?? [];
  const sets = Object.entries(patch).filter((e): e is [string, string | number] => e[1] !== null && e[1] !== undefined);
  const removes = new Set(Object.entries(patch).filter(([, v]) => v === null).map(([k]) => k));
  const last = blocks[blocks.length - 1];
  if (!last) return sets.length ? { code: append(code, [`  ${id}@{ ${entriesText(patch)} }`]) } : { code };
  const splices: Splice[] = [];
  for (const b of blocks) {
    const p: Record<string, DataValue | undefined> = {};
    for (const k of removes) if (b.entries.some((e) => e.key === k)) p[k] = undefined;
    if (b === last) for (const [k, v] of sets) p[k] = valueText(v);
    if (!Object.keys(p).length) continue;
    const left = b.entries.filter((e) => !removes.has(e.key)).length + (b === last ? sets.filter(([k]) => !b.entries.some((e) => e.key === k)).length : 0);
    const drop = left ? null : dropStatement(code, id, b);
    if (drop) splices.push(drop);
    else splices.push(...editBlock(code, b, p, new Set(b === last ? sets.map(([k]) => k) : [])));
  }
  return { code: applySplices(code, splices) };
}

export interface AddMediaNodeOpts {
  label: string;
  /** The node data: `icon` or `img` and their layout keys. */
  data: Readonly<Record<string, MediaValue>>;
  /** Subgraph to add the node to (before its `end`). */
  group?: string | null;
}

/** A new icon or image node: `n4["Label"]` at the end of the code (or of a subgraph) and its `n4@{ … }` statement. */
export function addFlowMediaNode(code: string, model: FlowchartModel, { label, data, group = null }: AddMediaNodeOpts): SelectResult & { select: ItemRef } {
  const id = uniqueId(model, 'n');
  const def = nodeDef({ id, label, shape: 'rect' });
  const stmt = `  ${id}@{ ${entriesText(data)} }`;
  const g = group ? model.groups.get(group) : undefined;
  if (g && g.endLine != null) {
    const L = code.split('\n');
    return { code: append(splice(code, g.endLine, 0, [indentOf(L[g.line]) + '  ' + def]), [stmt]), select: { kind: 'node', id } };
  }
  return { code: append(code, ['  ' + def, stmt]), select: { kind: 'node', id } };
}

const nodeOf = (model: FlowchartModel, id: string): FlowNode | undefined => model.nodes.get(id);

/** Writes a media change of a node's node data (the state machine of core/ops/media.ts); null when the node has no such change (a layout change of a node that is neither an icon nor an image node). */
function changeMedia(code: string, model: FlowchartModel, id: string, change: MediaChange): CodeResult | null {
  const p = mediaPatch(nodeOf(model, id)?.data ?? {}, change);
  if (!p) return null;
  return Object.keys(p).length ? writeNodeData(code, model, id, p) : { code };
}

/**
 * Sets a node's icon (`pack:name`) or removes it (null): an icon node's `icon` key; on any other node a token at the
 * start of its label, replacing the leading token it has.
 */
export function setFlowIcon(code: string, model: FlowchartModel, id: string, name: string | null, isIcon: IsIconToken = faOnly): CodeResult | null {
  const n = nodeOf(model, id);
  if (!n) return null;
  // an image node takes an icon as its source instead of the picture (Mermaid draws `img` first: it goes)
  if (n.data?.icon || n.data?.img != null) return changeMedia(code, model, id, { icon: name });
  const label = withIconToken(n.label, name, isIcon);
  return label === n.label ? { code } : relabelFlowNode(code, model, id, label);
}

/**
 * Sets the image of a node to an icon (the image tool's Icon tab): a plain node becomes an icon node — its label the
 * caption, framed in a square, caption below, Mermaid Chart's height — and an image or icon node takes the icon as its
 * source (setFlowIcon); null removes an icon node's icon.
 */
export function setFlowIconNode(code: string, model: FlowchartModel, id: string, name: string | null, isIcon: IsIconToken = faOnly): CodeResult | null {
  const n = nodeOf(model, id);
  if (!n) return null;
  if (n.data?.icon || n.data?.img != null) return setFlowIcon(code, model, id, name, isIcon);
  return changeMedia(code, model, id, { icon: name });
}

/**
 * Sets a node's image (a URL the image policy accepted) or removes it (null). A node without one becomes an image
 * node (its label the caption, Mermaid Chart's default size, caption below); an icon node gives up its icon.
 */
export function setFlowImage(code: string, model: FlowchartModel, id: string, url: string | null): CodeResult | null {
  return nodeOf(model, id) ? changeMedia(code, model, id, { image: url }) : null;
}

/**
 * "Convert to icon node": the leading icon token of a node's label becomes its `icon`, the rest of the label its caption, with a new icon node's defaults (core/ops/media.ts: a square frame, `h: 60`, the caption below); null when the label starts with no icon.
 */
export function toFlowIconNode(code: string, model: FlowchartModel, id: string, isIcon: IsIconToken = faOnly): CodeResult | null {
  const n = nodeOf(model, id);
  const lead = n && !n.data?.icon && n.data?.img == null ? leadingIcon(n.label, isIcon) : null;
  if (!n || !lead) return null;
  const relabelled = relabelFlowNode(code, model, id, lead.rest).code;
  return changeMedia(relabelled, parseFlowchart(relabelled), id, { icon: lead.name });
}

/** Changes an icon or image node's position, frame, size or aspect lock (null: not an icon or image node). */
export function setFlowMedia(code: string, model: FlowchartModel, id: string, patch: MediaPatch, isIcon: IsIconToken = faOnly): CodeResult | null {
  if (patch.node === 'icon') return toFlowIconNode(code, model, id, isIcon);
  return nodeOf(model, id) ? changeMedia(code, model, id, { layout: patch }) : null;
}
