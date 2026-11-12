// The mindmap edit kind (T08 §3.7): node text in its delimiters, the seven Mermaid shapes from the Shapes menu and the
// toolbar (other catalogue shapes stay in metadata), icons as label tokens, images in metadata, colour by branch or by
// depth in Page properties. New nodes from the dock and the menu join the selected node (else the node nearest the
// point, else the root) as its last child. The outline gestures (Tab, Enter, drag to re-parent…) are the mindmap
// module's (editor/modules/mindmap).
import type { MindmapModel, MindShape } from '../../../core/model.js';
import { reparse } from '../../../core/parse/dispatch.js';
import { addMindChild, addMindRoot, deleteMind, mindFragment, mindNodeAt, MIND_NEW, relabelMind, remapMindMeta, setMindColorBy, setMindShape } from '../../../core/kinds/mindmap/ops.js';
import { NEW_IMAGE } from '../../../core/ops/media.js';
import { metaMediaSource } from '../../../core/media/meta-source.js';
import { metaItemMedia } from '../meta-media.js';
import { cloneMeta, ensure as ensureIn } from '../../../core/ops/meta-util.js';
import { MIND_SHAPES } from '../../../core/kinds/mindmap/parse.js';
import { registerExtendedShapes } from '../../../core/extras.js';
import type { MindmapGeometry } from '../../../core/render/types.js';
import type { Point } from '../../../core/types.js';
import type { EditorCore, Sel } from '../../core.js';
import { focusLabel } from '../../lib/shape-drop.js';
import { shapeIcon, type PaletteItem } from '../palette.js';
import type { EditKind } from '../types.js';

// the editor draws bang, cloud and the default node's catalogue entry, icons and rich labels at once (as its
// flowchart does through the catalogue), so this chunk registers the geometry and the media kit statically
registerExtendedShapes();

const one = (s: string): string => s.replace(/\n/g, ' ');

/** Mermaid's names of the shapes, as the menu shows them. */
const SHAPE_NAMES: Readonly<Record<MindShape, string>> = {
  'mm-default': 'Default — underlined text', rect: 'Square', rounded: 'Rounded square', circle: 'Circle', bang: 'Bang', cloud: 'Cloud', hexagon: 'Hexagon',
};
const SHAPE_CODE: Readonly<Record<MindShape, string>> = {
  'mm-default': 'text', rect: '[text]', rounded: '(text)', circle: '((text))', bang: '))text((', cloud: ')text(', hexagon: '{{text}}',
};
const ITEMS: PaletteItem[] = MIND_SHAPES.map((s) => ({ key: s, label: SHAPE_NAMES[s], icon: shapeIcon(s), terms: [s, SHAPE_NAMES[s], SHAPE_CODE[s]], tip: `${SHAPE_NAMES[s]} · ${SHAPE_CODE[s]}` }));


/** Where new nodes go: the selected node, else the node nearest the point, else the root. */
function parentFor(core: EditorCore, M: MindmapModel, at: Point | null): string | null {
  const s = core.primary();
  if (s?.kind === 'node' && M.nodes.has(s.id)) return s.id;
  const g = core.geom.type === 'mindmap' ? core.geom : null;
  if (at && g) {
    let best: { id: string; d: number } | null = null;
    for (const [id, b] of g.nodes) {
      if (b.hidden) continue;
      const d = Math.hypot(b.x - at.x, b.y - at.y);
      if (!best || d < best.d) best = { id, d };
    }
    if (best) return best.id;
  }
  return M.root;
}

/** Adds a node (the root of an empty map) and opens its text; `meta` patches the new node's metadata. */
function addNode(core: EditorCore, M: MindmapModel, at: Point | null, label: string, shape: MindShape, history: string, meta?: Record<string, unknown>, edit = true): boolean {
  const parent = parentFor(core, M, at);
  const res = parent ? addMindChild(core.code, M, parent, label, shape) : addMindRoot(core.code, M, label, shape === 'mm-default' ? 'circle' : shape);
  const N = reparse(res.code);
  const n = N.type === 'mindmap' ? mindNodeAt(N, res.line) : undefined;
  if (!n) return false;
  const sel: Sel = { kind: 'node', id: n.id };
  let ok: boolean;
  if (meta) {
    // the new line renumbers the nodes after it: their metadata follows first
    const m = cloneMeta(N.type === 'mindmap' ? remapMindMeta(core.meta, M, N) : core.meta);
    Object.assign(ensureIn(m, 'node', n.id), meta);
    ok = core.applyCode({ code: res.code, meta: m }, history, { select: [sel] });
  } else ok = core.applyCode({ code: res.code }, history, { select: [sel] });
  if (ok && edit) focusLabel(core, sel);
  return ok;
}

export const EDIT: EditKind<MindmapModel, MindmapGeometry> = {
  type: 'mindmap',
  describe(M, { kind, id }) {
    const n = kind === 'node' ? M.nodes.get(id) : undefined;
    if (!n) return null;
    const what = n.parent ? `node · depth ${n.depth}` : 'root';
    return { title: one(n.label) || id, sub: `${what} · id ${id} · ${n.shape === 'mm-default' ? 'default' : n.shape}${n.classes.length ? ' · :::' + n.classes.join(' ') : ''}` };
  },
  text(M, { kind, id }) {
    const n = kind === 'node' ? M.nodes.get(id) : undefined;
    if (!n) return null;
    return { value: n.label, multi: true, title: 'props.text', markdown: n.md, write: (code, v) => relabelMind(code, M, id, v), writeMarkdown: (code, v) => relabelMind(code, M, id, v, true) };
  },
  remove: deleteMind,
  canGroup: () => ({ ok: false, reason: 'group.noMindmap' }),
  fragment: mindFragment,
  noCopy: 'Copy works for mindmap branches (the root stays)',
  setShape: (code, M, ref, shape) => (ref.kind === 'node' ? setMindShape(code, M, ref.id, shape) : null),
  palette: {
    mode: 'menu',
    title: 'Mindmap shapes',
    items: ITEMS,
    layout: 'list',
  },
  // a shape from the menu: a new child of the selected node (or the one nearest the drop)
  drop: (core, M, item, pt) => addNode(core, M, pt, MIND_NEW, (MIND_SHAPES as readonly string[]).includes(item.key) ? (item.key as MindShape) : 'mm-default', 'Add node', item.preset ? { preset: item.preset } : undefined),
  // an empty URL is the placeholder: the node is selected, its picture chosen from the toolbar or Properties
  addImage: (core, M, url, pt) => addNode(core, M, pt, 'Image', 'mm-default', 'Add image', { img: url, ...NEW_IMAGE }, !!url),
  // an image or icon node, as the flowchart's image node, in metadata (core/ops/media.ts); an icon is its image's
  // source, so a node has no Icon button (a `::icon()` or a token already written is still drawn)
  media(M, ref, core) {
    const n = ref.kind === 'node' ? M.nodes.get(ref.id) : undefined;
    return n ? metaItemMedia(metaMediaSource(core.meta.nodes?.[n.id] ?? {})) : null;
  },
  mediaNodesInMeta: true,
  // no connectors to route; colour by branch or by depth (frontmatter) and the layout (page) in Page properties
  straight: true,
  layout: { title: 'page.mindLayout', fields: ['mindLayout'] },
  pageOptions: (M, core) => [{
    label: core.i18n.t('page.colorBy'),
    options: [['branch', core.i18n.t('page.colorByBranch')], ['depth', core.i18n.t('page.colorByDepth')]],
    value: M.colorBy,
    set: (v) => void core.applyCode(setMindColorBy(core.code, v === 'depth' ? 'depth' : 'branch'), core.i18n.t('page.colorBy')),
  }],
  shapesLabel: 'tools.mindShapes',
  orderTitle: 'tb.orderMind',
};

// the type's view and ops kinds: the editor loads all three in one chunk (editor/kinds/loader.ts)
export { VIEW } from '../../../core/kinds/mindmap/view.js';
export { OPS } from '../../../core/kinds/mindmap/ops-kind.js';
export { EXTRAS } from '../../../core/kinds/mindmap/extras.js';
