// The Metadata tab of the code panel (A.1 row 4): the `%%@` lines of the document as text, with the same filter as
// the code (edits in a filtered view keep the hidden lines), each line checked as it is typed, applied as you type
// (invalid lines skipped and flagged, and kept at the end of the text when the metadata is written again).
import { metaToLines, splitSource } from '../../../core/meta/index.js';
import type { EditorCore } from '../../core.js';
import { buildSegments, mergeFilteredView, viewOf, type Segment } from '../../ops/code-filter.js';
import { metaError, type Issue } from './code-problems.js';
import type { FilteredEditor } from './filtered-editor.js';

export class MetaSync {
  /** The metadata's problems (each line's check; damaged hidden-line markers). */
  issues: Issue[] = [];
  /** The `%%@` lines last written into the text (a draw writes them again when they changed). */
  key = '';
  private text = '';
  private filter: Segment[] | null = null;
  private broken = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** `f`: the tab's editor (null: no Metadata tab, the metadata is only checked); `onIssues`: the problems changed. */
  constructor(private readonly core: EditorCore, private readonly f: FilteredEditor | null, private readonly onIssues: () => void) {}

  /** An edit waits to be applied. */
  get typing(): boolean {
    return this.timer !== undefined;
  }

  /** Rebuilds the text from the store; invalid lines (not in the metadata) are kept at the end. */
  write(force = false): void {
    if (!force && this.f && this.core.shadow.activeElement === this.f.ed.textarea) return;
    const lines = metaToLines(this.core.meta);
    const known = new Set(lines);
    const bad = this.text.split('\n').filter((l) => !known.has(l) && metaError(l) !== null);
    const next = [...lines, ...bad].join('\n');
    if (next === this.text && !force) return;
    this.text = next;
    this.sync();
  }

  /** Shows the text in the editor: all of it, or the lines the filter finds. */
  sync(): void {
    const f = this.f, t = this.core.i18n.t;
    if (!f) {
      this.check();
      return;
    }
    const L = this.text.split('\n');
    const tokens = f.input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const lines = tokens.length ? L.map((l, i) => (tokens.some((tk) => l.toLowerCase().includes(tk)) ? i : -1)).filter((i) => i >= 0) : null;
    f.count.textContent = lines ? t(lines.length === 1 ? 'code.lines1' : 'code.linesN', { n: lines.length }) : '';
    if (!lines) {
      this.filter = null;
      f.ed.readOnly = false;
      f.bar.hidden = true;
      if (f.ed.value !== this.text) f.ed.value = this.text;
    } else {
      const segments = buildSegments(lines, L.length);
      this.filter = segments;
      f.ed.readOnly = !lines.length;
      f.bar.hidden = false;
      f.info.textContent = lines.length ? t('code.metaShowing', { n: lines.length, total: L.length }) : t('code.noMatch');
      const view = viewOf(L, segments);
      if (f.ed.value !== view) f.ed.value = view;
    }
    this.check();
  }

  /** The filter changed: what was typed is kept, then the editor shows the new view. */
  resyncFilter(): void {
    if (this.read()) this.sync();
  }

  /** Typed: applied after a pause. */
  input(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.apply(), 250);
  }

  /** Leaving the editor applies what waits and writes the text again. */
  blur(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.apply();
    }
    this.write();
  }

  /** Shows line n (1-based) of the text, clearing a filter that hides it. */
  goto(n: number): void {
    const f = this.f;
    if (!f || f.ed.gotoLine(n)) return;
    f.input.value = '';
    this.sync();
    f.ed.gotoLine(n);
  }

  destroy(): void {
    clearTimeout(this.timer);
  }

  /** Editor text → the text (false when the hidden-line markers of a filtered view were damaged). */
  private read(): boolean {
    const f = this.f;
    if (!f) return true;
    if (!this.filter) {
      this.text = f.ed.value;
      return true;
    }
    const r = mergeFilteredView(f.ed.value, this.filter, this.text.split('\n'));
    if (!r) return false;
    this.filter = r.segments;
    this.text = r.text;
    return true;
  }

  private check(): void {
    const out: Issue[] = [];
    if (this.broken) out.push({ line: null, msg: this.core.i18n.t('code.keepHiddenMeta') });
    this.text.split('\n').forEach((l, i) => {
      const error = metaError(l);
      if (error !== null) out.push({ line: i + 1, msg: error });
    });
    this.issues = out;
    this.onIssues();
  }

  private apply(): void {
    this.timer = undefined;
    this.broken = !this.read();
    if (this.broken) {
      this.check();
      return;
    }
    // applied as you type, like the Mermaid code; invalid lines are skipped (and flagged)
    const next = splitSource(this.text).doc.meta;
    this.check();
    if (JSON.stringify(next) === JSON.stringify(this.core.meta)) return;
    this.core.setMeta(this.core.i18n.t('history.editMeta'), next);
  }
}
