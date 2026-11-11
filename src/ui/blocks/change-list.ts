// ChangeList (§5.2): the diff's change rows (mark icons in their highlight colours, kind, label) as a listbox, with
// the diagram-wide field changes above them. Selecting a row calls `onSelect(key)` (the selected row again: null);
// `select(key)` (or a `selected` signal) moves the selection in place, without re-rendering, so the keyboard focus
// stays where it is. Arrow keys, Home and End move along the rows; the selected row (else the first) is the list's
// one tab stop. The change keys come from the host (`keyOf`, core/diff's `changeKey`), so the block needs no diff code. Replaces `changeList`, `describeChange`, `kindLabel` and `fieldRow`
// of elements/diff/panels.ts (same DOM and classes). The change colours come from the `--mmdx-diff-*` tokens: the
// host adopts `DIFF_TOKENS` (ui/styles/diff.ts).
import type { Mark } from '../../core/diff/annotate.js';
import type { FieldChange, ItemChange } from '../../core/diff/index.js';
import { h, icon } from '../h.js';
import { registerMessages } from '../../i18n.js';
import { BLOCK_MESSAGES_DIFF } from '../messages/blocks-diff.js';
import { read, Scope, type BlockHandle, type Translate, type Value } from './block.js';
import { FILTER_ICONS } from './filter-toggles.js';
import { keepFocus, rovingKeys } from './focus.js';

export const kindLabel = (t: Translate, kind: string): string => t(`diff.kind.${kind}`);

/** One line describing a change, for tooltips and the live region. */
export function describeChange(t: Translate, c: ItemChange): string {
  const facets = c.facets.join(', ');
  const what = c.status !== 'changed' ? t(`diff.status.${c.status}`)
    : c.fields.length ? t('diff.status.changedFields', { facets, fields: c.fields.map((f) => f.field).join(', ') }) : t('diff.status.changed', { facets });
  return t('diff.announce', { kind: kindLabel(t, c.kind), name: c.label, what });
}

// the highlight colours of a change (core/diff/annotate's `marksOf`, kept here so the block does not load the annotator)
const marksOf = (c: ItemChange): Mark[] => (c.status === 'added' ? ['added'] : c.status === 'removed' ? ['removed'] : c.facets.length ? [...c.facets] : ['content']);

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

/** One field change: name, then the before → after values (colour fields with a swatch). */
export function fieldRow(f: FieldChange, colorBefore: (v: unknown) => string | undefined, colorAfter: (v: unknown) => string | undefined): HTMLElement {
  return h('div', { class: `field m-${f.facet}` },
    h('span', { class: 'fname' }, f.field),
    h('span', { class: 'fvals' }, valueCell(f.before, f, colorBefore), h('span', { class: 'arrow' }, '→'), valueCell(f.after, f, colorAfter)));
}

export interface ChangeListProps {
  /** The diagram-wide field changes (the diff's `doc`), listed above the rows. */
  doc: readonly FieldChange[];
  /** The rows to show (the diff's items after filtering). */
  changes: readonly ItemChange[];
  /** The key of a change (core/diff's `changeKey`, `kind:id`): `selected` and `onSelect` use it. */
  keyOf: (c: ItemChange) => string;
  /** Key of the selected change; a signal moves the selection in place. */
  selected: Value<string | null>;
  /** CSS colour of a colour value in the before / after version (palette names resolve per version). */
  colorBefore: (v: unknown) => string | undefined;
  colorAfter: (v: unknown) => string | undefined;
  onSelect: (key: string | null) => void;
  t: Translate;
  /** `part` of the element (default none). */
  part?: string;
}

export interface ChangeListHandle extends BlockHandle<ChangeListProps> {
  /** Moves the selection in place (no re-render, the focus stays) and scrolls the row into view. */
  select(key: string | null): void;
}

export const CHANGE_LIST_CSS = /* css */ `
.mmdx-change-list { display: flex; flex-direction: column; min-height: 0; }
.mmdx-change-list .empty { padding: 24px 12px; color: var(--mmdx-muted); text-align: center; }
.mmdx-change-list .doc-changes { padding: 8px 12px; border-bottom: 1px solid var(--mmdx-border); }
.mmdx-change-list .doc-changes summary { cursor: pointer; font-weight: 600; margin-bottom: 4px; }
.mmdx-change-list .field { display: grid; grid-template-columns: 110px 1fr; gap: 8px; font-size: 12px; border-left: 3px solid var(--c); padding-left: 6px; margin: 3px 0; }
.mmdx-change-list .fname { color: var(--mmdx-muted); overflow-wrap: anywhere; }
.mmdx-change-list .fvals { display: flex; flex-wrap: wrap; gap: 4px; align-items: baseline; min-width: 0; }
.mmdx-change-list .val { font: 11.5px var(--mmdx-mono); overflow-wrap: anywhere; }
.mmdx-change-list .fvals .val:first-child { color: var(--mmdx-diff-del); text-decoration: line-through; }
.mmdx-change-list .fvals .val:last-child { color: var(--mmdx-diff-add); }
.mmdx-change-list .fvals .val.none { color: var(--mmdx-muted); text-decoration: none; }
.mmdx-change-list .fvals .arrow { color: var(--mmdx-muted); }
.mmdx-change-list .val .sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; border: 1px solid var(--mmdx-swatch-ring); margin-right: 3px; vertical-align: -1px; }
.mmdx-change-list .changes { display: flex; flex-direction: column; }
.mmdx-change-list .change {
  width: 100%; border: 0; border-bottom: 1px solid var(--mmdx-border-2); border-radius: 0; background: none; text-align: left; padding: 6px 12px;
  display: grid; grid-template-columns: auto auto minmax(0, 1fr); gap: 8px; align-items: center; color: var(--mmdx-text);
}
.mmdx-change-list .change:hover:not(:disabled) { background: var(--mmdx-surface-2); }
.mmdx-change-list .change[aria-selected=true] { background: var(--mmdx-accent-2); box-shadow: inset 3px 0 0 var(--mmdx-accent); }
.mmdx-change-list .change:focus-visible { box-shadow: inset 0 0 0 2px var(--mmdx-accent); }
.mmdx-change-list .cicons { display: inline-flex; gap: 2px; }
.mmdx-change-list .cicon { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 5px; color: var(--c); background: var(--c-bg); }
.mmdx-change-list .change .kind { font-size: 11px; color: var(--mmdx-muted); text-transform: uppercase; letter-spacing: .03em; }
.mmdx-change-list .change .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.mmdx-change-list .change.st-removed .label { text-decoration: line-through; color: var(--mmdx-muted); }
.mmdx-change-list .m-added { --c: var(--mmdx-diff-add); --c-bg: var(--mmdx-diff-add-bg); }
.mmdx-change-list .m-removed { --c: var(--mmdx-diff-del); --c-bg: var(--mmdx-diff-del-bg); }
.mmdx-change-list .m-content { --c: var(--mmdx-diff-content); --c-bg: var(--mmdx-diff-content-bg); }
.mmdx-change-list .m-layout { --c: var(--mmdx-diff-layout); --c-bg: var(--mmdx-diff-layout-bg); }
.mmdx-change-list .m-style { --c: var(--mmdx-diff-style); --c-bg: var(--mmdx-diff-style-bg); }
`;

export function createChangeList(props: ChangeListProps): ChangeListHandle {
  registerMessages(BLOCK_MESSAGES_DIFF);
  let p = { ...props };
  const scope = new Scope();
  const el = h('div', { class: 'mmdx-change-list' });
  const rows = (): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('.change')];
  /** The selected key as last applied (`p.selected` may be a signal). */
  let selected = read(p.selected);

  // one listener for every row: the current selection decides between selecting and clearing
  scope.on(el, 'click', (ev: MouseEvent) => {
    const row = (ev.target as Element).closest<HTMLElement>('.change');
    const key = row && el.contains(row) ? row.dataset['key'] : undefined;
    if (key !== undefined) p.onSelect(selected === key ? null : key);
  });
  const keys = rovingKeys(el, { orientation: 'vertical', selector: '.change', wrap: false, roving: true, current: (list) => list.find((b) => b.getAttribute('aria-selected') === 'true') });
  scope.add(() => keys.destroy());

  const render = (): void => {
    const t = p.t;
    if (p.part) el.setAttribute('part', p.part);
    else el.removeAttribute('part');
    const out: HTMLElement[] = [];
    if (p.doc.length)
      out.push(h('details', { class: 'doc-changes', open: true }, h('summary', null, t('diff.panel.docWide', { n: p.doc.length })), ...p.doc.map((f) => fieldRow(f, p.colorBefore, p.colorAfter))));
    if (!p.changes.length) out.push(h('div', { class: 'empty' }, t('diff.empty.noChanges')));
    else {
      const list = h('div', { class: 'changes', role: 'listbox', 'aria-label': t('diff.panel.changes') });
      for (const c of p.changes) {
        const key = p.keyOf(c);
        list.append(h('button', { type: 'button', class: `change st-${c.status}`, role: 'option', 'aria-selected': String(selected === key), 'data-key': key, 'data-f': key, title: describeChange(t, c) },
          h('span', { class: 'cicons' }, ...marksOf(c).map((m) => h('span', { class: `cicon m-${m}`, 'aria-hidden': 'true' }, icon(FILTER_ICONS[m], 14)))),
          h('span', { class: 'kind' }, kindLabel(t, c.kind)),
          h('span', { class: 'label' }, c.label)));
      }
      out.push(list);
    }
    el.replaceChildren(...out);
  };
  render();
  keys.sync();

  const select = (key: string | null): void => {
    selected = key;
    let row: HTMLElement | null = null;
    for (const b of rows()) {
      const on = b.dataset['key'] === key;
      b.setAttribute('aria-selected', String(on));
      if (on) row = b;
    }
    keys.sync();
    row?.scrollIntoView?.({ block: 'nearest' });
  };
  // a `selected` signal moves the selection in place
  let fx = new Scope();
  const follow = (): void => {
    fx.dispose();
    fx = new Scope();
    const v = p.selected;
    if (typeof v === 'function') fx.effect(() => select(v()));
  };
  follow();

  return {
    el,
    select,
    update(next) {
      p = { ...p, ...next };
      if (next && 'selected' in next) {
        selected = read(p.selected);
        follow();
      }
      keepFocus(el, render);
      keys.sync();
    },
    destroy() {
      fx.dispose();
      scope.dispose();
      el.remove();
    },
  };
}
