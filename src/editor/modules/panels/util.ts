// Helpers shared by the panel and chrome modules: the style environment of the current render, metadata ops
// applied as one history step, related Mermaid lines (code filter), item descriptions and text specs (Properties),
// and coalesced live edits for fields and sliders.
import { activationsOf } from '../../../core/ids.js';
import type { DiagramMeta } from '../../../core/meta/types.js';
import type { DiagramModel } from '../../../core/model.js';
import {
  relabelBox, relabelFlowEdge, relabelFlowNode, relabelGroup, relabelSeq, updateEntity, updateRel,
} from '../../../core/ops/index.js';
import type { StyleEnv } from '../../../core/ops/style-env.js';
import type { CodeResult, MetaResult } from '../../../core/ops/types.js';
import type { ItemKind, ItemRef } from '../../../core/types.js';
import type { EditorCore, Sel } from '../../core.js';

/** The style environment (model, metadata, active theme, colour resolver) of the current document. */
export function styleEnv(core: EditorCore): StyleEnv {
  const r = core.result;
  return { model: core.model, meta: core.meta, theme: r.theme, rawTheme: core.ctx.themes.merged(r.themeId), color: r.rctx.color };
}

/** Applies a metadata op as one history step; a refused op (reason) shows a toast and changes nothing. */
export function applyMeta(core: EditorCore, label: string, res: MetaResult): boolean {
  if (res.reason) {
    core.toast(res.reason);
    return false;
  }
  if (res.meta === core.meta) return false;
  core.change(label, () => core.store.meta.set(res.meta));
  return true;
}

/** Replaces the code and metadata together without the core's sequence remap (the op remapped already). */
export function applyDoc(core: EditorCore, label: string, doc: { code: string; meta: DiagramMeta }, select: Sel[] | null): boolean {
  if (doc.code === core.code && JSON.stringify(doc.meta) === JSON.stringify(core.meta)) return false;
  if (!core.emit('ds-op', { type: label, code: doc.code }, true)) return false;
  core.store.begin();
  try {
    core.store.meta.set(doc.meta);
    core.store.code.set(doc.code);
    if (select) core.select(select.filter((r) => core.store.exists(r)));
  } finally {
    core.store.commit(label);
  }
  core.afterChange();
  return true;
}

/**
 * Coalesced live edits (fields typed into, sliders dragged): the first change opens a transaction, each change
 * redraws, and the run is committed as one history step after `idle` ms or on `flush()` (change / blur).
 */
export class LiveEdit {
  private open = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private label = '';
  constructor(private readonly core: EditorCore, private readonly idle = 400) {}

  /** Runs `f` (which mutates `core.meta` in place) inside the open transaction and redraws. */
  run(label: string, f: () => void): void {
    if (!this.open) {
      this.core.begin();
      this.open = true;
    }
    this.label = label;
    try {
      f();
    } finally {
      this.core.store.preview();
      this.core.draw();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), this.idle);
    }
  }

  flush(): void {
    clearTimeout(this.timer);
    if (!this.open) return;
    this.open = false;
    this.core.commit(this.label);
  }

  get pending(): boolean {
    return this.open;
  }
}

// ---- related Mermaid lines (code filter) --------------------------------------------------------------------------

/** 0-based code lines that define or mention an item (the code filter shows these for an element id). */
export function relatedLines(M: DiagramModel, kind: ItemKind, id: string): number[] {
  const set = new Set<number>();
  const add = (x: number | null | undefined): void => {
    if (x != null) set.add(x);
  };
  const range = (a: number | null | undefined, b: number | null | undefined): void => {
    if (a == null) return;
    for (let i = a; i <= (b ?? a); i++) set.add(i);
  };
  if (M.type === 'flowchart') {
    if (kind === 'node') {
      M.nodes.get(id)?.lines.forEach(add);
      for (const e of M.edges) if (e.from === id || e.to === id) add(e.src);
    } else if (kind === 'group') {
      const g = M.groups.get(id);
      g?.lines.forEach(add);
      range(g?.line, g?.endLine); // the whole subgraph block, nested content included
      for (const e of M.edges) if (e.from === id || e.to === id) add(e.src);
    } else if (kind === 'edge') add(M.edges.find((e) => e.id === id)?.src);
  } else if (M.type === 'sequence') {
    if (kind === 'activation') {
      const a = activationsOf(M).find((x) => x.id === id);
      if (a) {
        add(a.start.src);
        add(a.end?.src);
      }
    } else if (kind === 'participant') M.participants.find((p) => p.id === id)?.lines.forEach(add);
    else if (kind === 'message' || kind === 'note') add(M.items.find((i) => i.kind === kind && i.id === id)?.src);
    else if (kind === 'block') {
      const it = M.items.find((i) => i.kind === 'blockStart' && i.id === id);
      if (it?.kind === 'blockStart') range(it.src, it.lines[it.lines.length - 1]);
    } else if (kind === 'box') {
      const b = M.boxes.find((x) => x.id === id);
      range(b?.line, b?.endLine);
    }
  } else if (M.type === 'er') {
    if (kind === 'entity') {
      const e = M.entities.get(id);
      range(e?.defLine, e?.endLine);
      for (const r of M.rels) if (r.from === id || r.to === id) add(r.src);
      if (e?.defLine == null) e?.lines.forEach(add);
    } else if (kind === 'rel') add(M.rels.find((r) => r.id === id)?.src);
  }
  return [...set].sort((a, b) => a - b);
}

/** The element whose id is exactly `tok` (any kind in the current diagram). */
export function findElement(M: DiagramModel, tok: string): ItemRef | null {
  if (M.type === 'flowchart') {
    if (M.nodes.has(tok)) return { kind: 'node', id: tok };
    if (M.groups.has(tok)) return { kind: 'group', id: tok };
    if (M.edges.some((e) => e.id === tok)) return { kind: 'edge', id: tok };
  } else if (M.type === 'er') {
    if (M.entities.has(tok)) return { kind: 'entity', id: tok };
    if (M.rels.some((r) => r.id === tok)) return { kind: 'rel', id: tok };
  } else if (M.type === 'sequence') {
    if (M.participants.some((p) => p.id === tok)) return { kind: 'participant', id: tok };
    if (M.boxes.some((b) => b.id === tok)) return { kind: 'box', id: tok };
    const it = M.items.find((x) => (x.kind === 'message' || x.kind === 'note' || x.kind === 'blockStart') && x.id === tok);
    if (it) return { kind: it.kind === 'blockStart' ? 'block' : (it.kind as 'message' | 'note'), id: tok };
    if (activationsOf(M).some((a) => a.id === tok)) return { kind: 'activation', id: tok };
  }
  return null;
}

/**
 * The items a code filter query finds (selected while filtering): per token, the element with exactly that id, else
 * every item whose id or text contains it (case-insensitive) — node, group, participant, box and table ids and labels,
 * node classes, connector labels, message / note text, block conditions, table attributes. Model order; null = no
 * filter.
 */
export function filterItems(M: DiagramModel, query: string): ItemRef[] | null {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  // every item with the text it is found by
  const all: { ref: ItemRef; text: string }[] = [];
  const add = (kind: ItemKind, id: string, ...parts: (string | undefined)[]): void => void all.push({ ref: { kind, id }, text: parts.filter(Boolean).join('\n').toLowerCase() });
  if (M.type === 'flowchart') {
    for (const n of M.nodes.values()) add('node', n.id, n.id, n.label, ...n.classes);
    for (const g of M.groups.values()) add('group', g.id, g.id, g.label, ...(g.classes ?? []));
    for (const e of M.edges) add('edge', e.id, e.label);
  } else if (M.type === 'er') {
    for (const e of M.entities.values()) add('entity', e.id, e.id, e.label, ...e.attrs.map((a) => `${a.type} ${a.name} ${a.comment}`));
    for (const r of M.rels) add('rel', r.id, r.label);
  } else if (M.type === 'sequence') {
    for (const p of M.participants) add('participant', p.id, p.id, p.label);
    for (const b of M.boxes) add('box', b.id, b.label);
    for (const it of M.items) {
      if (it.kind === 'message' || it.kind === 'note') add(it.kind, it.id, it.text);
      else if (it.kind === 'blockStart') add('block', it.id, it.label);
    }
  }
  const found = new Set<string>();
  for (const tok of tokens) {
    const el = findElement(M, tok);
    if (el) found.add(`${el.kind}:${el.id}`);
    else {
      const q = tok.toLowerCase();
      for (const x of all) if (x.text.includes(q)) found.add(`${x.ref.kind}:${x.ref.id}`);
    }
  }
  const out = all.filter((x) => found.has(`${x.ref.kind}:${x.ref.id}`)).map((x) => x.ref);
  // exact ids of items without searchable text (processes)
  for (const tok of tokens) {
    const el = findElement(M, tok);
    if (el && !out.some((r) => r.kind === el.kind && r.id === el.id)) out.push(el);
  }
  return out;
}

/** 0-based lines of `code` shown for a filter query (each token: an element id, or text); null = no filter. */
export function filterLines(code: string, M: DiagramModel, query: string): number[] | null {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const L = code.split('\n');
  const set = new Set<number>();
  for (const tok of tokens) {
    const el = findElement(M, tok);
    if (el) for (const li of relatedLines(M, el.kind, el.id)) set.add(li);
    else {
      const q = tok.toLowerCase();
      L.forEach((l, i) => {
        if (l.toLowerCase().includes(q)) set.add(i);
      });
    }
  }
  return [...set].filter((i) => i < L.length).sort((a, b) => a - b);
}

// ---- filtered views: `%% - N hidden` folding ----------------------------------------------------------------------

export interface Segment {
  hidden: boolean;
  start: number;
  len: number;
}

export const HIDDEN_MARKER = /^%% - (\d+) hidden$/;

/** Visible lines → segments (runs of shown and hidden lines) of a file with `total` lines. */
export function buildSegments(lines: readonly number[], total: number): Segment[] {
  const segs: Segment[] = [];
  let pos = 0;
  for (const li of lines) {
    if (li > pos) segs.push({ hidden: true, start: pos, len: li - pos });
    const last = segs[segs.length - 1];
    if (last && !last.hidden && last.start + last.len === li) last.len++;
    else segs.push({ hidden: false, start: li, len: 1 });
    pos = li + 1;
  }
  if (pos < total) segs.push({ hidden: true, start: pos, len: total - pos });
  return segs;
}

/** The filtered view text of `L` for these segments. */
export function viewOf(L: readonly string[], segs: readonly Segment[]): string {
  return segs.flatMap((sg) => (sg.hidden ? [`%% - ${sg.len} hidden`] : L.slice(sg.start, sg.start + sg.len))).join('\n');
}

/**
 * Filtered view (visible lines + `%% - N hidden` markers) + the full lines it was made from → the full text with the
 * edits applied, and the updated segments. null when hidden markers were damaged ("Keep the hidden lines").
 */
export function mergeFilteredView(view: string, segs: readonly Segment[], L: readonly string[]): { text: string; segments: Segment[] } | null {
  const groups: string[][] = [[]];
  let markers = 0;
  for (const l of view.split('\n')) {
    if (HIDDEN_MARKER.test(l.trim())) {
      markers++;
      groups.push([]);
    } else groups[groups.length - 1]!.push(l);
  }
  if (markers !== segs.filter((s) => s.hidden).length) return null;
  // groups[i] is the visible text between the (i-1)th and the i-th marker
  const out: string[] = [];
  const next: Segment[] = [];
  let gi = 0;
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i]!;
    if (sg.hidden) {
      const prev = segs[i - 1];
      if ((!prev || prev.hidden) && groups[gi]!.length) return null; // text where no visible block exists
      next.push({ hidden: true, start: out.length, len: sg.len });
      out.push(...L.slice(sg.start, sg.start + sg.len));
      gi++;
    } else {
      const g = groups[gi]!;
      next.push({ hidden: false, start: out.length, len: g.length });
      out.push(...g);
    }
  }
  if (segs[segs.length - 1]?.hidden && groups[gi]?.length) return null;
  return { text: out.join('\n'), segments: next };
}

// ---- item descriptions and text -----------------------------------------------------------------------------------

/** Title and sub line of the Properties panel for an item. */
export function describe(M: DiagramModel, kind: ItemKind, id: string): { title: string; sub: string } {
  const one = (s: string): string => s.replace(/\n/g, ' ');
  if (M.type === 'flowchart') {
    if (kind === 'node') {
      const n = M.nodes.get(id);
      if (n) return { title: one(n.label), sub: `node · id ${id} · ${n.shape}${n.classes.length ? ' · :::' + n.classes.join(',') : ''}` };
    } else if (kind === 'group') {
      const g = M.groups.get(id);
      return { title: one(g?.label || id) || id, sub: `subgraph · id ${id}` };
    } else if (kind === 'edge') {
      const e = M.edges.find((x) => x.id === id);
      if (e) return { title: e.label || `${e.from} → ${e.to}`, sub: `edge · ${e.from} → ${e.to} · ${e.line}` };
    }
  } else if (M.type === 'sequence') {
    if (kind === 'participant') {
      const p = M.participants.find((x) => x.id === id);
      if (p) return { title: p.label, sub: `${p.kind} · id ${id}` };
    } else if (kind === 'message') {
      const it = M.items.find((x) => x.kind === 'message' && x.id === id);
      if (it?.kind === 'message') return { title: it.text || '(no text)', sub: `message ${id} · ${it.from} → ${it.to}` };
    } else if (kind === 'note') {
      const it = M.items.find((x) => x.kind === 'note' && x.id === id);
      if (it?.kind === 'note') return { title: it.text, sub: `note ${id}` };
    } else if (kind === 'block') {
      const it = M.items.find((x) => x.kind === 'blockStart' && x.id === id);
      if (it?.kind === 'blockStart') return { title: it.label || it.block, sub: `${it.block} block ${id}` };
    } else if (kind === 'activation') {
      const a = activationsOf(M).find((x) => x.id === id);
      return { title: `Process on ${a?.participant ?? '?'}`, sub: `activation · line ${(a?.start.src ?? 0) + 1}${a?.end ? `–${a.end.src + 1}` : ' (never deactivated)'}` };
    } else if (kind === 'box') {
      const b = M.boxes.find((x) => x.id === id);
      return { title: b?.label || 'Box', sub: `participant group · ${b?.members.length ?? 0} participants` };
    }
  } else if (M.type === 'er') {
    if (kind === 'entity') {
      const e = M.entities.get(id);
      if (e) return { title: e.label, sub: `entity · ${e.attrs.length} attributes` };
    } else if (kind === 'rel') {
      const r = M.rels.find((x) => x.id === id);
      if (r) return { title: r.label || id, sub: `relationship · ${r.from} (${r.fromCard}) → ${r.to} (${r.toCard})` };
    }
  }
  return { title: id, sub: kind };
}

export interface LabelSpec {
  value: string;
  multi: boolean;
  /** i18n key of the section title. */
  title: string;
  apply(v: string): CodeResult;
}

/** How an item's text is read and written back to Mermaid (prototype `labelSpec`). */
export function labelSpec(core: EditorCore, kind: ItemKind, id: string): LabelSpec | null {
  const M = core.model;
  const code = core.code;
  if (M.type === 'flowchart') {
    if (kind === 'node') return { value: M.nodes.get(id)?.label ?? '', multi: true, title: 'props.text', apply: (v) => relabelFlowNode(code, M, id, v) };
    if (kind === 'group') return { value: M.groups.get(id)?.label ?? '', multi: false, title: 'props.titleText', apply: (v) => relabelGroup(code, M, id, v) };
    if (kind === 'edge') return { value: M.edges.find((e) => e.id === id)?.label ?? '', multi: false, title: 'props.label', apply: (v) => relabelFlowEdge(code, M, id, v) };
  } else if (M.type === 'sequence') {
    const it = M.items.find((x) => (x.kind === 'message' || x.kind === 'note' || x.kind === 'blockStart') && x.id === id);
    if (kind === 'participant') return { value: M.participants.find((p) => p.id === id)?.label ?? '', multi: false, title: 'props.name', apply: (v) => relabelSeq(code, M, { kind, id }, v) };
    if ((kind === 'message' || kind === 'note') && it && (it.kind === 'message' || it.kind === 'note'))
      return { value: it.text, multi: false, title: 'props.text', apply: (v) => relabelSeq(code, M, { kind, id }, v) };
    if (kind === 'block' && it?.kind === 'blockStart') return { value: it.label, multi: false, title: 'props.condition', apply: (v) => relabelSeq(code, M, { kind, id }, v) };
    if (kind === 'box') return { value: M.boxes.find((b) => b.id === id)?.label ?? '', multi: false, title: 'props.titleText', apply: (v) => relabelBox(code, M, id, v) };
  } else if (M.type === 'er') {
    if (kind === 'rel') return { value: M.rels.find((r) => r.id === id)?.label ?? '', multi: false, title: 'props.label', apply: (v) => updateRel(code, M, id, { label: v }) };
    if (kind === 'entity') return { value: M.entities.get(id)?.label ?? '', multi: false, title: 'props.name', apply: (v) => updateEntity(code, M, id, { label: v }) };
  }
  return null;
}

/** `#rgb` / `#rrggbb` → `#rrggbb` for colour inputs (anything else → white). */
export function toHex(c: unknown): string {
  if (typeof c !== 'string') return '#ffffff';
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map((x) => x + x).join('');
  return '#ffffff';
}

/** Can the selection be grouped (prototype `canGroup`)? */
export function canGroup(core: EditorCore): { ok: boolean; reason: string } {
  const sel = core.selection(), M = core.model;
  const t = core.i18n.t;
  if (M.type === 'er') return { ok: false, reason: t('group.noEr') };
  if (M.type === 'flowchart')
    return sel.some((x) => x.kind === 'node' || x.kind === 'group') ? { ok: true, reason: '' } : { ok: false, reason: t('group.selectBoxes') };
  if (M.type === 'sequence') {
    const ps = sel.filter((x) => x.kind === 'participant');
    if (!ps.length) return { ok: false, reason: t('group.selectParticipants') };
    if (ps.some((x) => M.participants.find((p) => p.id === x.id)?.box)) return { ok: false, reason: t('group.alreadyBoxed') };
    return { ok: true, reason: '' };
  }
  return { ok: false, reason: '' };
}

/** Dispatches the element's own input event (after setting a value programmatically in tests or helpers). */
export const isEditable = (core: EditorCore): boolean => core.mode.peek() === 'edit' && core.model.type !== null;
