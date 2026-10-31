// Side panels of <mmdx-diff> (§9.3–9.5): the change list, the code / metadata diff narrowed to the selected change,
// and the version history rows. Pure DOM builders: the element owns the state and passes callbacks in.
import { marksOf, type Mark } from '../../core/diff/annotate.js';
import type { DiagramDiff, FieldChange, ItemChange } from '../../core/diff/index.js';
import { changeKey } from '../../core/diff/merge.js';
import type { VersionInfo } from '../../core/diff/report.js';
import { diffLines, hunks, type LineOp } from '../../core/diff/text.js';
import { encodeId } from '../../core/meta/index.js';
import type { DiagramModel } from '../../core/model.js';
import type { ItemKind } from '../../core/types.js';
import { h, icon } from '../../ui/h.js';
import type { I18n } from '../../ui/i18n.js';
import { I_palette } from '../../ui/icons.js';

type T = I18n['t'];

/** Icons of the change filters (each drawn in its highlight colour). */
export const FILTER_ICONS: Record<Mark | 'dim', string> = {
  added: 'M5 5h14v14H5zM12 8.5v7M8.5 12h7',
  removed: 'M5 5h14v14H5zM8.5 12h7',
  content: 'M5 6h14M12 6v13M9 19h6',
  layout: 'M12 4v16M4 12h16M9.5 6.5L12 4l2.5 2.5M9.5 17.5L12 20l2.5-2.5M6.5 9.5L4 12l2.5 2.5M17.5 9.5L20 12l-2.5 2.5',
  style: I_palette,
  dim: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M12 7h6M12 11h8.5M12 15h7.5',
};

export const I_history = 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3 4.5V9h4.5M12 7.5V12l3 2';

export const kindLabel = (t: T, kind: string): string => t(`diff.kind.${kind}`);

/** One line describing a change, for tooltips and the live region. */
export function describeChange(t: T, c: ItemChange): string {
  const what = c.status === 'changed' ? t('diff.status.changed', { facets: c.facets.join(', ') }) + (c.fields.length ? ` (${c.fields.map((f) => f.field).join(', ')})` : '') : t(`diff.status.${c.status}`);
  return t('diff.announce', { kind: kindLabel(t, c.kind), name: c.label, what });
}

// ---- change list ----------------------------------------------------------------------------------------------------

const fmtVal = (v: unknown): string => {
  if (v === undefined) return '—';
  if (typeof v === 'string') return v === '' ? '""' : v;
  return JSON.stringify(v).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ');
};

const COLOURISH = /^(fill|stroke|color|colour|background|text colour|page background)$|palette colour/;

function valueCell(v: unknown, f: FieldChange, color: (v: unknown) => string | undefined): HTMLElement {
  const css = COLOURISH.test(f.field) && typeof v === 'string' ? color(v) : undefined;
  return h('span', { class: `val${v === undefined ? ' none' : ''}` }, css ? h('i', { class: 'sw', style: { background: css } }) : null, fmtVal(v));
}

export function fieldRow(f: FieldChange, colorBefore: (v: unknown) => string | undefined, colorAfter: (v: unknown) => string | undefined): HTMLElement {
  return h('div', { class: `field m-${f.facet}` },
    h('span', { class: 'fname' }, f.field),
    h('span', { class: 'fvals' }, valueCell(f.before, f, colorBefore), h('span', { class: 'arrow' }, '→'), valueCell(f.after, f, colorAfter)));
}

export interface ChangeListInput {
  diff: DiagramDiff;
  changes: readonly ItemChange[];
  selected: string | null;
  colorBefore: (v: unknown) => string | undefined;
  colorAfter: (v: unknown) => string | undefined;
  onSelect: (key: string | null) => void;
}

export function changeList(t: T, x: ChangeListInput): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (x.diff.doc.length)
    out.push(h('details', { class: 'doc-changes', open: true }, h('summary', null, t('diff.panel.docWide', { n: x.diff.doc.length })), ...x.diff.doc.map((f) => fieldRow(f, x.colorBefore, x.colorAfter))));
  if (!x.changes.length) {
    out.push(h('div', { class: 'empty' }, t('diff.empty.noChanges')));
    return out;
  }
  const list = h('div', { class: 'changes', role: 'listbox', 'aria-label': t('diff.panel.changes') });
  for (const c of x.changes) {
    const key = changeKey(c);
    const on = x.selected === key;
    list.append(h('button', {
      type: 'button', class: `change st-${c.status}`, role: 'option', 'aria-selected': String(on), 'data-key': key, 'data-f': key, title: describeChange(t, c),
      onclick: () => x.onSelect(on ? null : key),
    },
    h('span', { class: 'cicons' }, ...marksOf(c).map((m) => h('span', { class: `cicon m-${m}`, 'aria-hidden': 'true' }, icon(FILTER_ICONS[m], 14)))),
    h('span', { class: 'kind' }, kindLabel(t, c.kind)),
    h('span', { class: 'label' }, c.label)));
  }
  out.push(list);
  return out;
}

// ---- code diff ------------------------------------------------------------------------------------------------------

/** 0-based code lines that define or mention an item (a node's lines include its edges). */
export function relatedLines(m: DiagramModel, kind: ItemKind, id: string): Set<number> {
  const out = new Set<number>();
  const add = (n: number | null | undefined): void => {
    if (n !== null && n !== undefined) out.add(n);
  };
  if (m.type === 'flowchart') {
    if (kind === 'node') m.nodes.get(id)?.lines.forEach(add);
    else if (kind === 'group') {
      const g = m.groups.get(id);
      g?.lines.forEach(add);
      add(g?.line);
      add(g?.endLine);
    } else if (kind === 'edge') add(m.edges.find((e) => e.id === id)?.src);
  } else if (m.type === 'er') {
    if (kind === 'entity') {
      const e = m.entities.get(id);
      e?.lines.forEach(add);
      if (e?.defLine != null) for (let i = e.defLine; i <= (e.endLine ?? e.defLine); i++) add(i);
    } else if (kind === 'rel') add(m.rels.find((r) => r.id === id)?.src);
  } else if (m.type === 'sequence') {
    if (kind === 'participant') m.participants.find((p) => p.id === id)?.lines.forEach(add);
    else
      for (const it of m.items) {
        if (it.kind === 'message' && kind === 'message' && it.id === id) add(it.src);
        else if (it.kind === 'note' && kind === 'note' && it.id === id) add(it.src);
        else if (it.kind === 'blockStart' && kind === 'block' && it.id === id) it.lines.forEach(add);
      }
  }
  return out;
}

/** The `%%@` lines of an item. */
export function metaLines(lines: readonly string[], kind: string, id: string | null): Set<number> {
  const prefix = id === null ? null : `%%@ ${kind} ${encodeId(id)} `;
  return new Set(prefix ? lines.flatMap((l, i) => (l.startsWith(prefix) ? [i] : [])) : []);
}

export interface CodeDiffInput {
  a: readonly string[];
  b: readonly string[];
  tab: 'code' | 'meta';
  /** Lines of the selected change on each side (0-based), or null for the whole file. */
  sel: { a: Set<number>; b: Set<number>; label: string } | null;
  notes: readonly string[];
  onShowAll: () => void;
}

export function codeDiff(t: T, x: CodeDiffInput): HTMLElement[] {
  const all = diffLines(x.a, x.b);
  const sel = x.sel;
  const ops = sel ? all.filter((o) => (o.a !== undefined && sel.a.has(o.a - 1)) || (o.b !== undefined && sel.b.has(o.b - 1))) : all;
  const adds = ops.filter((o) => o.op === 'add').length, dels = ops.filter((o) => o.op === 'del').length;
  const table = h('table', { class: 'code' });
  const row = (o: LineOp): HTMLElement =>
    h('tr', { class: `ln-${o.op}` },
      h('td', { class: 'num' }, o.a ? String(o.a) : ''), h('td', { class: 'num' }, o.b ? String(o.b) : ''),
      h('td', { class: 'sign' }, o.op === 'add' ? '+' : o.op === 'del' ? '−' : ''), h('td', { class: 'txt' }, o.text || ' '));
  if (sel) {
    // runs that are not next to each other in the file are separated by a gap row
    let prev: LineOp | null = null;
    for (const o of ops) {
      const next = prev && ((o.a !== undefined && prev.a !== undefined && o.a === prev.a + 1) || (o.b !== undefined && prev.b !== undefined && o.b === prev.b + 1) || (o.a === undefined && prev.a !== undefined && o.b !== undefined) || (prev.a === undefined && o.a !== undefined));
      if (prev && !next) table.append(h('tr', { class: 'gap' }, h('td', { colSpan: 4 }, '⋯')));
      table.append(row(o));
      prev = o;
    }
  } else
    for (const hk of hunks(ops)) {
      if ('skip' in hk) {
        const btn = h('button', { type: 'button' }, t('diff.panel.unchanged', { n: hk.skip }));
        const tr = h('tr', { class: 'skip' }, h('td', { colSpan: 4 }, btn));
        btn.addEventListener('click', () => tr.replaceWith(...hk.ops.map(row)));
        table.append(tr);
      } else for (const o of hk.ops) table.append(row(o));
    }
  const out: HTMLElement[] = [
    h('div', { class: 'code-head' }, h('span', { class: 'stat add' }, `+${adds}`), h('span', { class: 'stat del' }, `−${dels}`), h('span', { class: 'muted' }, t('diff.panel.lines')),
      x.notes.length ? h('span', { class: 'code-note', title: t('diff.panel.notesTip') }, x.notes.join(' · ')) : null),
  ];
  if (sel)
    out.push(h('div', { class: 'code-filter' }, h('span', null, `${t('diff.panel.linesOf')} `, h('b', null, sel.label)),
      h('button', { type: 'button', title: t('diff.panel.showAllTip'), onclick: x.onShowAll }, t('diff.panel.showAll'))));
  if (sel && !ops.length) out.push(h('div', { class: 'empty' }, x.tab === 'code' ? t('diff.empty.noLines') : t('diff.empty.noMeta')));
  else if (!sel && adds + dels === 0) out.push(h('div', { class: 'empty' }, t('diff.empty.noDiff')));
  else out.push(h('div', { class: 'code-scroll' }, table));
  return out;
}

/** A plain listing of one source (History mode). */
export function codeListing(lines: readonly string[]): HTMLElement {
  const table = h('table', { class: 'code' });
  lines.forEach((l, i) => table.append(h('tr', null, h('td', { class: 'num' }, String(i + 1)), h('td', { class: 'txt' }, l || ' '))));
  return h('div', { class: 'code-scroll' }, table);
}

// ---- history ------------------------------------------------------------------------------------------------------

export const ago = (iso: string | undefined, locale: string): string => {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return '';
  const s = (Date.now() - ms) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 86400 * 60) return rtf.format(-Math.round(s / 86400), 'day');
  return rtf.format(-Math.round(s / (86400 * 30)), 'month');
};

export interface HistoryInput {
  versions: readonly VersionInfo[];
  /** Change counts of each version against the one before it (undefined: not computed yet; null: the first). */
  counts: (id: string) => DiagramDiff['counts'] | null | undefined;
  mode: 'compare' | 'history';
  base: string | null;
  head: string | null;
  viewing: string | null;
  locale: string;
  hasMore: boolean;
  onPick: (side: 'before' | 'after', id: string) => void;
  onRow: (id: string) => void;
  onMore: () => void;
}

export function historyRows(t: T, x: HistoryInput): HTMLElement {
  const compare = x.mode === 'compare';
  const rows = x.versions.map((v, i) => {
    const c = x.counts(v.id);
    const n = c ? c.added + c.removed + c.changed : 0;
    const isAfter = compare && v.id === x.head, isBefore = compare && v.id === x.base;
    const pick = (side: 'before' | 'after'): HTMLElement => {
      const on = side === 'after' ? isAfter : isBefore;
      // one version cannot be both sides
      const taken = side === 'after' ? isBefore : isAfter;
      const other = side === 'after' ? t('diff.history.before') : t('diff.history.after');
      const label = side === 'after' ? t('diff.history.after') : t('diff.history.before');
      return h('button', {
        type: 'button', class: `pick pick-${side}${on ? ' on' : ''}`, 'aria-pressed': String(on), disabled: taken,
        title: taken ? t('diff.history.sameVersion', { id: v.id, side: other.toLowerCase() }) : t('diff.history.useAs', { id: v.id, side: label.toLowerCase() }),
        onclick: () => x.onPick(side, v.id),
      }, label);
    };
    const stats = c === undefined
      ? h('span', { class: 'vstats skeleton', 'aria-hidden': 'true' })
      : c === null
        ? h('span', { class: 'vcount' }, t('diff.history.initial'))
        : h('span', { class: 'vstats' },
          c.added ? h('span', { class: 'add' }, `+${c.added}`) : null,
          c.removed ? h('span', { class: 'del' }, `−${c.removed}`) : null,
          c.changed ? h('span', { class: 'chg' }, `~${c.changed}`) : null,
          n ? null : h('span', null, t('diff.history.noChanges')));
    const who = [v.author, ago(v.date, x.locale)].filter(Boolean).join(' ');
    const viewing = !compare && v.id === x.viewing;
    return h('div', { class: `version${viewing ? ' viewing' : ''}${isAfter ? ' after' : ''}${isBefore ? ' before' : ''}`, role: compare ? 'listitem' : 'option', 'aria-selected': compare ? undefined : String(viewing) },
      h('button', { type: 'button', class: 'version-main', title: compare ? t('diff.history.compareWith', { id: v.id }) : t('diff.history.view', { id: v.id }), onclick: () => x.onRow(v.id) },
        h('span', { class: 'vmsg' }, v.message || v.id),
        h('span', { class: 'vmeta' },
          h('span', { class: 'vwho' }, h('code', { class: 'vid' }, v.id), i === 0 ? h('span', { class: 'vtag' }, t('diff.history.current')) : null, who ? ` ${who}` : ''),
          stats)),
      compare ? h('span', { class: 'vpick' }, pick('before'), pick('after')) : null);
  });
  return h('div', null,
    h('div', { class: 'versions', role: compare ? 'list' : 'listbox', 'aria-label': compare ? t('diff.panel.compare') : t('diff.panel.history') }, ...rows),
    x.hasMore ? h('button', { type: 'button', class: 'more', onclick: x.onMore }, t('diff.history.more')) : null);
}
