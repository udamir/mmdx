// The flowchart edit kind.
import type { FlowchartModel } from '../../core/model.js';
import { addFlowEdge, edgeText, nodeDef, reconnectFlow } from '../../core/ops/connect.js';
import { deleteFlow, groupFlow, relabelFlowEdge, relabelFlowNode, relabelGroup, setFlowShape, ungroupFlow } from '../../core/ops/flowchart.js';
import type { FlowGeometry } from '../../core/render/types.js';
import type { Sel } from '../core.js';
import { cloneMeta, ensure as ensureIn } from '../../core/ops/meta-util.js';
import { addFlowNode } from '../../core/ops/flowchart.js';
import { fixIdClash } from '../../core/ops/meta-ops.js';
import { flowPresets } from '../../core/render/flow-presets.js';
import type { Point } from '../../core/types.js';
import type { EditorCore } from '../core.js';
import { focusLabel } from '../modules/shapes/drop.js';
import { applyDoc } from '../ops/doc.js';
import { metaOnlyShapes, shapeDoc } from '../ops/shape.js';
import { shapeIcon, type PaletteItem } from './palette.js';
import { shapeById, type ShapeDef } from '../../core/shapes/catalog.js';
import { SHAPE_MENU } from '../../core/shapes/menu.js';
import { addFlowMediaNode, flowMedia, IMAGE_NODE_SIZE, setFlowIconNode, setFlowImage, setFlowMedia, type IsIconToken } from '../../core/ops/flow-media.js';
import type { SelectResult } from '../../core/ops/types.js';
import { flowEdgeAnimation, setFlowEdgeAnimation } from '../../core/ops/flow-edge.js';
import type { ItemRef } from '../../core/types.js';
import type { EditKind } from './types.js';

const one = (s: string): string => s.replace(/\n/g, ' ');

/** The innermost visible group around a point (a dropped shape joins it). */
function groupAt(core: EditorCore, pt: Point): string | null {
  const gm = core.geom;
  if (gm.type !== 'flowchart') return null;
  let best: { id: string; a: number } | null = null;
  gm.groups.forEach((b, id) => {
    if (b.hidden) return;
    if (Math.abs(pt.x - b.x) <= b.w / 2 && Math.abs(pt.y - b.y) <= b.h / 2 && (!best || b.w * b.h < best.a)) best = { id, a: b.w * b.h };
  });
  return (best as { id: string } | null)?.id ?? null;
}

/** A catalogue shape as a palette item: its name, the words search finds it by, its tooltip. */
const shapeItem = (def: ShapeDef): PaletteItem => ({
  key: def.id,
  label: def.menu?.[1] ?? def.name,
  icon: shapeIcon(def.id),
  terms: [def.id, def.name, def.title ?? '', def.mermaid ?? '', ...def.aliases].filter(Boolean),
  tip: `${def.name}${def.title && def.title !== def.name ? ` (${def.title})` : ''} · ${def.mermaid ?? 'mmdx only'}`,
});

/** The Shapes menu: Mermaid Chart's sections (shared with the toolbar's shape picker). */
const SECTIONS = SHAPE_MENU.map(({ cat, ids }) => ({
  title: `shapes.cat.${cat}`,
  items: ids.map(shapeById).filter((d): d is ShapeDef => !!d).map(shapeItem),
}));

/** The registry's view of label tokens (registered packs and Font Awesome's form are icons). */
const isIconOf = (core: EditorCore): IsIconToken => (t) => core.ctx.icons.resolve(t, 'token') !== null;

/** A new node from an op placed at a point: positioned (and in the group there), its label opened for typing. */
function placeNew(core: EditorCore, res: SelectResult & { select: ItemRef; metaShape?: string }, pt: Point, label: string, preset?: string, edit = true): boolean {
  const meta = cloneMeta(core.meta);
  const m = ensureIn(meta, 'node', res.select.id);
  Object.assign(m, { x: pt.x, y: pt.y }, res.metaShape ? { shape: res.metaShape } : {}, preset ? { preset } : {});
  const ok = core.applyCode({ code: res.code, meta }, label, { select: [res.select] });
  if (ok && edit) focusLabel(core, res.select);
  return ok;
}

/** An image's file name as its caption (`…/team-photo.png` → "team photo"); "Image" otherwise. */
const imageLabel = (url: string): string => {
  if (!/^https?:/i.test(url)) return 'Image';
  let file = url.split(/[?#]/)[0]!.split('/').pop() ?? '';
  try {
    file = decodeURIComponent(file);
  } catch {
    // keep it as written
  }
  return file.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 60) || 'Image';
};

export const EDIT: EditKind<FlowchartModel, FlowGeometry> = {
  type: 'flowchart',
  describe(M, { kind, id }) {
    if (kind === 'node') {
      const n = M.nodes.get(id);
      // an icon or image node without a caption is named by its id
      if (n) return { title: one(n.label) || id, sub: `node · id ${id} · ${n.shape}${n.classes.length ? ' · :::' + n.classes.join(',') : ''}` };
    } else if (kind === 'group') {
      const g = M.groups.get(id);
      return { title: one(g?.label || id) || id, sub: `subgraph · id ${id}` };
    } else if (kind === 'edge') {
      const e = M.edges.find((x) => x.id === id);
      if (e) return { title: e.label || `${e.from} → ${e.to}`, sub: `edge · ${e.from} → ${e.to} · ${e.line}` };
    }
    return null;
  },
  // markdown labels (T06): the text with its `**` / `*` as typed; a plain label is rewritten as one once it is formatted
  text(M, { kind, id }) {
    if (kind === 'node') {
      const n = M.nodes.get(id);
      return { value: n?.label ?? '', multi: true, title: 'props.text', markdown: !!n?.md, write: (code, v) => relabelFlowNode(code, M, id, v), writeMarkdown: (code, v) => relabelFlowNode(code, M, id, v, true) };
    }
    if (kind === 'group') {
      const g = M.groups.get(id);
      return { value: g?.label ?? '', multi: false, title: 'props.titleText', markdown: !!g?.md, write: (code, v) => relabelGroup(code, M, id, v), writeMarkdown: (code, v) => relabelGroup(code, M, id, v, true) };
    }
    if (kind === 'edge') {
      const e = M.edges.find((x) => x.id === id);
      return { value: e?.label ?? '', multi: false, title: 'props.label', markdown: !!e?.md, write: (code, v) => relabelFlowEdge(code, M, id, v), writeMarkdown: (code, v) => relabelFlowEdge(code, M, id, v, true) };
    }
    return null;
  },
  remove: deleteFlow,
  canGroup: (_M, sel) => (sel.some((x) => x.kind === 'node' || x.kind === 'group') ? { ok: true, reason: '' } : { ok: false, reason: 'group.selectBoxes' }),
  group: (code, M, sel, title) => groupFlow(code, M, sel.filter((x) => x.kind === 'node' || x.kind === 'group'), title),
  ungroup(code, M, it) {
    if (it.kind !== 'group') return null;
    const members: Sel[] = (M.groups.get(it.id)?.children ?? []).map((c) => ({ kind: M.groups.has(c) ? 'group' : 'node', id: c }));
    return { code: ungroupFlow(code, M, it.id).code, members };
  },
  renameContainer: (code, M, it, name) => (it.kind === 'group' ? relabelGroup(code, M, it.id, name) : null),
  fragment(model, _code, refs) {
    const out = [`flowchart ${model.direction}`];
    const ids = new Set<string>();
    const emitNode = (id: string, ind: string): void => {
      const n = model.nodes.get(id);
      if (!n || ids.has(id)) return;
      ids.add(id);
      out.push(ind + nodeDef(n));
    };
    const emitGroup = (gid: string, ind: string, guard: number): void => {
      const g = model.groups.get(gid);
      if (!g || ids.has(gid) || guard > 64) return;
      ids.add(gid);
      out.push(`${ind}subgraph ${gid}["${g.label.replace(/"/g, '#quot;')}"]`);
      for (const c of g.children) {
        if (model.groups.has(c)) emitGroup(c, `${ind}  `, guard + 1);
        else emitNode(c, `${ind}  `);
      }
      out.push(`${ind}end`);
    };
    for (const r of refs) {
      if (r.kind === 'group') emitGroup(r.id, '  ', 0);
      else if (r.kind === 'node') emitNode(r.id, '  ');
    }
    for (const e of model.edges) if (ids.has(e.from) && ids.has(e.to)) out.push(`  ${edgeText(e, e.from, e.to)}`);
    return `${out.join('\n')}\n`;
  },
  altCopy: true,
  connectable: ['node', 'group'],
  connect: addFlowEdge,
  added(M, from, to) {
    const e = [...M.edges].reverse().find((x) => x.from === from && x.to === to);
    return e ? { ref: { kind: 'edge', id: e.id }, ports: true } : null;
  },
  reconnect: (code, M, ref, which, target) => (ref.kind === 'edge' ? reconnectFlow(code, M, ref.id, which, target) : null),
  reconnected: (M, r) => (M.edges.find((e) => e.src === r.line && e.from === r.from && e.to === r.to) ?? [...M.edges].reverse().find((e) => e.from === r.from && e.to === r.to))?.id,
  palette: {
    mode: 'menu',
    title: 'Shapes',
    // Mermaid Chart's sections, compact: no search field, no recently used row
    items: SECTIONS.flatMap((s) => s.items),
    sections: SECTIONS,
    layout: 'grid',
    search: false,
  },
  setShape: (code, M, ref, shape) => (ref.kind === 'node' ? setFlowShape(code, M, ref.id, shape) : null),
  drop(core, M, item, pt) {
    // the shape goes to the code (a bracket, else `n3@{ shape: … }`); one Mermaid lacks stays in metadata
    const res = addFlowNode(core.code, M, { label: item.label.split(' /')[0]!, shape: item.key, group: groupAt(core, pt) });
    return placeNew(core, res, pt, 'Add shape', item.preset);
  },
  // image nodes in Mermaid Chart's style: `n4["Photo"]` and `n4@{ img: "https://…", h: 100, w: 100, pos: "b" }`
  // an empty URL is the placeholder (`img: ""`): the node is selected, its picture chosen from the toolbar or Properties
  addImage: (core, M, url, pt) =>
    placeNew(core, addFlowMediaNode(core.code, M, { label: imageLabel(url), data: { img: url, h: IMAGE_NODE_SIZE, w: IMAGE_NODE_SIZE, pos: 'b', constraint: 'on' }, group: groupAt(core, pt) }), pt, 'Add image', undefined, !!url),
  media(M, ref, core) {
    if (ref.kind !== 'node') return null;
    const m = flowMedia(M, ref.id, isIconOf(core));
    // an icon is the source of an image node instead of its picture: only image and icon nodes take one (a label's icon
    // token stays as written)
    return m ? { ...m, canImage: true, canIcon: m.node !== null } : null;
  },
  // the image tool's Icon tab: an icon as the node's image (a plain node becomes an icon node)
  setIcon: (code, M, ref, icon, core) => (ref.kind === 'node' ? setFlowIconNode(code, M, ref.id, icon, isIconOf(core)) : null),
  setImage: (code, M, ref, url) => (ref.kind === 'node' ? setFlowImage(code, M, ref.id, url) : null),
  setMedia: (code, M, ref, patch, core) => (ref.kind === 'node' ? setFlowMedia(code, M, ref.id, patch, isIconOf(core)) : null),
  // Mermaid 11.10's edge animation: `e1@{ animate: true }`, `e1@{ animation: slow }` (the edge gets an id if it has none)
  animation: (M, ref) => (ref.kind === 'edge' ? flowEdgeAnimation(M, ref.id) : null),
  setAnimation: (code, M, ref, a) => (ref.kind === 'edge' ? setFlowEdgeAnimation(code, M, ref.id, a) : null),
  direction: (M) => M.direction,
  fixOf(core, M, d) {
    if (d.code !== 'flow.id-clash') return null;
    const t = core.i18n.t;
    const id = String(d.params?.['id'] ?? ''), nid = String(d.params?.['newId'] ?? '');
    return {
      label: t('problems.fixRename', { id, newId: nid }),
      run: () => {
        const res = fixIdClash(core.code, core.meta, M, id);
        if (applyDoc(core, t('problems.fixLabel'), res, res.selection ?? null)) core.toast(t('problems.renamed', { id: nid }));
      },
    };
  },
  problems(core, M) {
    const t = core.i18n.t;
    const out: { line: number | null; msg: string; fix?: { label: string; run(): void } }[] = [];
    // files of mmdx 0.1–0.3 kept shapes in metadata: stock Mermaid shows rectangles until they move to the code
    const metaOnly = metaOnlyShapes(core, [...M.nodes.keys()].map((id) => ({ kind: 'node' as const, id })));
    if (metaOnly.length)
      out.push({
        line: null, msg: t(metaOnly.length === 1 ? 'problems.metaShape1' : 'problems.metaShapeN', { n: metaOnly.length }),
        fix: {
          label: t('problems.fixMetaShape'),
          run: () => {
            const doc = shapeDoc(core, metaOnly, null);
            if (doc) applyDoc(core, t('problems.fixMetaShape'), doc, null);
          },
        },
      });
    if (!M.undefinedClasses.length) return out;
    // a class is fine when it names a classDef or a node / subgraph preset
    const P = flowPresets(core.result.theme, core.meta);
    for (const { cls, line } of M.undefinedClasses)
      if (!Object.hasOwn(P.node, cls) && !Object.hasOwn(P.group, cls)) out.push({ line: line + 1, msg: t('problems.undefinedClass', { cls }) });
    return out;
  },
};

// the type's view and ops kinds: the editor loads all three in one chunk (editor/kinds/loader.ts)
export { VIEW } from '../../core/kinds/flowchart.js';
export { OPS } from '../../core/kinds/flowchart-ops.js';
