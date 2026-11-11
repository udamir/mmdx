// The draft of the theme being edited, on signals. Edits go through the path setter (`set`), which records an undo
// patch (the smallest subtree the edit can create or delete, before and after) and keeps the set of changed paths
// against the saved copy up to date by comparing only that subtree — no edit serialises or diffs the whole theme.
// A burst of edits (a slider drag, typing) is one undo step. The resolved theme, the parent's merged theme, effective
// styles and the contrast check are derived from it.
import { BASELINE, deepMerge, type ThemeRegistry } from '../core/theme/registry.js';
import { resolveColor } from '../core/theme/colors.js';
import { contrastRatio } from '../core/theme/contrast.js';
import type { ResolvedTheme, ThemeFile } from '../core/theme/types.js';
import type { DiagramType } from '../core/types.js';
import { batch, computed, signal, type Computed, type ReadSignal } from '../ui/signal.js';
import { TEXT_ON_FILL } from './constants.js';
import type { TileSel } from './types.js';
import { changedPaths, clone, getPath, isObj, obj, related, type Obj } from './util.js';

/** One recorded change: the subtree at `path` before and after it. */
interface Patch {
  path: readonly string[];
  before: unknown;
  after: unknown;
}

const EMPTY: ReadonlySet<string> = new Set();
const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((x) => b.has(x));
const HISTORY = 200;

/** Writes `v` at `path` (undefined deletes), creating the objects on the way. */
function put(root: Obj, path: readonly string[], v: unknown): void {
  let o = root;
  for (const k of path.slice(0, -1)) {
    if (!isObj(o[k])) o[k] = {};
    o = o[k] as Obj;
  }
  const last = path[path.length - 1]!;
  if (v === undefined) delete o[last];
  else o[last] = v;
}

export class Draft {
  /** Id of the theme being edited. */
  readonly id = signal(BASELINE);
  /** Bumps on every change of the draft. */
  readonly version = signal(0);
  /** Bumps when the draft is replaced as a whole (a theme opened, undo, redo, discard): its views are rebuilt. */
  readonly epoch = signal(0);
  /** Paths (dotted) where the draft differs from the saved copy. */
  readonly changed = signal<ReadonlySet<string>>(EMPTY, sameSet);
  /** The draft differs from the saved copy. */
  readonly dirty = signal(false);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  /** Validation errors by path (shown per field). */
  readonly errors = signal<ReadonlyMap<string, string>>(new Map());
  /** The draft resolved against its parents (what tiles and the preview draw with). */
  readonly resolved: Computed<ResolvedTheme>;
  /** The merged theme the draft extends (null for the baseline). */
  readonly parent: Computed<Obj | null>;
  /** The draft merged onto what it extends, once per change (P19: per tile and toolbar read). Read only. */
  readonly merged: Computed<Obj>;

  private file: Obj | null = null;
  private saved: Obj = {};
  private hist: Patch[][] = [];
  private fut: Patch[][] = [];
  private group: Patch[] | null = null;
  private groupT: ReturnType<typeof setTimeout> | undefined;
  private touched = new Set<string>();

  constructor(private readonly reg: ReadSignal<ThemeRegistry>, private readonly editable: () => boolean) {
    this.resolved = computed(() => {
      this.version();
      return this.reg().resolveDraft((this.file ?? { id: this.id() }) as unknown as ThemeFile);
    });
    this.parent = computed(() => {
      this.epoch();
      const reg = this.reg();
      if (this.isBase()) return null;
      const ext = typeof this.file?.['extends'] === 'string' ? this.file['extends'] : BASELINE;
      return (reg.merged(ext) as unknown as Obj | null) ?? {};
    });
    this.merged = computed(() => {
      this.version();
      const parent = this.parent();
      return this.isBase() ? obj(this.file) : deepMerge(parent, this.file);
    });
  }

  /** The draft itself (read only: change it through `set`), or null before a theme is open. */
  current(): Readonly<Obj> | null {
    return this.file;
  }

  /** A copy of the draft. */
  snapshot(): ThemeFile | null {
    return this.file ? (clone(this.file) as unknown as ThemeFile) : null;
  }

  get(path: readonly string[]): unknown {
    return getPath(this.file, path);
  }

  isBase(): boolean {
    return this.id.peek() === BASELINE;
  }

  name(): string {
    const n = this.file?.['name'];
    return typeof n === 'string' && n ? n : this.id.peek();
  }

  /** Opens a theme: the draft and the saved copy are `file`, the history is empty. */
  open(id: string, file: Obj): void {
    clearTimeout(this.groupT);
    batch(() => {
      this.file = clone(file);
      this.saved = clone(file);
      this.hist = [];
      this.fut = [];
      this.group = null;
      this.touched.clear();
      this.errors.set(new Map());
      this.id.set(id);
      this.setChanged(EMPTY);
      this.syncUndo();
      this.bump(true);
    });
  }

  /** The path setter: `v` at `path` (undefined resets it); objects a reset leaves empty are removed. */
  set(path: readonly string[], v: unknown): void {
    const file = this.file;
    if (!file || !this.editable() || !path.length) return;
    const root = this.patchRoot(path);
    const before = clone(getPath(file, root));
    put(file, path, v);
    // tidy objects left empty by a reset (deepest first)
    for (let i = path.length - 1; i > 0; i--) {
      const parent = getPath(file, path.slice(0, i - 1));
      const key = path[i - 1]!;
      const child = isObj(parent) ? parent[key] : undefined;
      if (isObj(parent) && isObj(child) && !Object.keys(child).length) delete parent[key];
      else break;
    }
    if (!this.group) {
      this.group = [];
      this.hist.push(this.group);
      if (this.hist.length > HISTORY) this.hist.shift();
      this.fut = [];
    }
    this.group.push({ path: root, before, after: clone(getPath(file, root)) });
    clearTimeout(this.groupT);
    this.groupT = setTimeout(() => this.endGroup(), 500);
    batch(() => {
      const key = path.join('.');
      if (this.errors.peek().has(key)) {
        const errors = new Map(this.errors.peek());
        errors.delete(key);
        this.errors.set(errors);
      }
      this.track(root);
      // what was edited (objects created or removed around it hold nothing else)
      this.touched.add(key);
      this.syncUndo();
      this.bump(false);
    });
  }

  /** Ends the current undo step (a slider released, a pause in typing). */
  endGroup(): void {
    clearTimeout(this.groupT);
    this.group = null;
  }

  undo(): void {
    this.endGroup();
    const g = this.hist.pop();
    if (!g) return;
    this.fut.push(g);
    this.apply([...g].reverse(), 'before');
  }

  redo(): void {
    this.endGroup();
    const g = this.fut.pop();
    if (!g) return;
    this.hist.push(g);
    this.apply(g, 'after');
  }

  /** Back to the saved copy; the history is dropped. */
  discard(): void {
    if (!this.file) return;
    this.endGroup();
    batch(() => {
      this.file = clone(this.saved);
      this.hist = [];
      this.fut = [];
      this.setChanged(EMPTY);
      this.syncUndo();
      this.bump(true);
    });
  }

  /** `file` was saved: it is the saved copy now (the draft takes its schema version). */
  markSaved(file: Obj): void {
    if (!this.file) return;
    this.saved = clone(file);
    if (file['schemaVersion'] !== undefined) this.file['schemaVersion'] = file['schemaVersion'];
    this.setChanged(new Set(changedPaths(this.saved, this.file)));
  }

  /** Paths edited since the last call (the views catching up redraw only what they show of them). */
  takeTouched(): Set<string> {
    const out = this.touched;
    this.touched = new Set();
    return out;
  }

  /** True when `path` (dotted) has unsaved changes: it, something under it, or something it lies under changed. */
  isChanged(path: string): boolean {
    for (const c of this.changed.peek()) if (related(c, path)) return true;
    return false;
  }

  dispose(): void {
    clearTimeout(this.groupT);
    this.resolved.dispose();
    this.parent.dispose();
  }

  // ---- effective values (theme editor §8.3: the theme's own value vs the inherited one) ------------------------------

  /** The value shown for a colour: palette names resolved. */
  show(v: unknown): string {
    const d = this.resolved.peek();
    const r = resolveColor(v, d.palette, d.basePalette);
    return typeof r === 'string' ? r : '';
  }

  palette(): Record<string, string> {
    return { ...this.resolved.peek().palette };
  }

  /** The presets of `<type>.<key>`: inherited, then the draft's own. */
  allPresets(type: DiagramType, key: string): Obj {
    return { ...obj(obj(this.merged.peek()[type])[key]) };
  }

  /** Where the selected tile's style lives: `<type>.<shapesKey>.<shape>` for a shape's default, else `<type>.<kind>` / `<type>.<presets>.<name>`. */
  stylePath(s: TileSel): string[] {
    return s.preset === null ? (s.shape ? [s.type, s.shapesKey ?? '', s.shape] : [s.type, s.kind]) : [s.type, s.presets ?? '', s.preset];
  }

  /** The effective style of a tile: the item's style, its shape's default and the preset, inherited values included. */
  effectiveFor(s: TileSel): Obj {
    const tt = obj(this.merged.peek()[s.type]);
    const shapeDef = s.shape && s.shapesKey ? obj(obj(tt[s.shapesKey])[s.shape]) : {};
    const base = { ...obj(tt[s.kind]), ...shapeDef };
    return s.preset === null ? base : { ...base, ...obj(obj(tt[s.presets ?? ''])[s.preset]) };
  }

  /** WCAG AA: the contrast of the tile's text on its fill (or the page) when it is below 4.5:1, else null. */
  lowContrast(s: TileSel): number | null {
    const key = TEXT_ON_FILL[s.kind];
    if (!key) return null;
    const st = this.effectiveFor(s);
    if (st[key] === undefined) return null;
    const text = this.show(st[key]);
    let fill = st['fill'] === undefined ? '' : this.show(st['fill']);
    if (!fill || fill === 'none' || fill === 'transparent') {
      const d = this.resolved.peek();
      fill = this.show(d.canvas.background && d.canvas.background !== 'none' && d.canvas.background !== 'transparent' ? d.canvas.background : d.palette['paper'] ?? '#ffffff');
    }
    const r = contrastRatio(text, fill);
    return r !== null && r < 4.5 ? r : null;
  }

  /** A palette colour removed: references to it become its literal value (in the same undo step). */
  replaceRefs(name: string, value: string): void {
    const file = this.file;
    if (!file) return;
    const uses = (v: unknown): v is string => typeof v === 'string' && (v === `@${name}` || v.startsWith(`@${name}~`));
    const found: [string[], string][] = [];
    const walk = (o: Obj, path: string[]): void => {
      for (const [k, v] of Object.entries(o)) {
        if (isObj(v)) walk(v, [...path, k]);
        else if (uses(v)) found.push([[...path, k], String(resolveColor(v, { [name]: value }))]);
      }
    };
    for (const [k, v] of Object.entries(file)) if (k !== 'palette' && isObj(v)) walk(v, [k]);
    batch(() => {
      for (const [path, v] of found) this.set(path, v);
    });
  }

  // ---- internals --------------------------------------------------------------------------------------------------

  /**
   * The root of an edit's patch: the path itself, or the highest ancestor the edit may create or (by tidying) delete
   * — one that is missing or holds only the key on the path.
   */
  private patchRoot(path: readonly string[]): string[] {
    let r = path.length;
    for (let j = path.length - 1; j >= 1; j--) {
      const a = getPath(this.file, path.slice(0, j));
      if (!isObj(a) || Object.keys(a).every((k) => k === path[j])) r = j;
      else break;
    }
    return path.slice(0, r);
  }

  /**
   * The subtree at `root` changed: the changed paths under it are compared again with the saved copy. A changed path
   * above it (a whole object added or removed) is compared instead, since the change may have undone it.
   */
  private track(root: readonly string[]): void {
    const cur = this.changed.peek();
    let r = root.join('.');
    for (const c of cur) if (c.length < r.length && r.startsWith(c + '.')) r = c;
    const next = new Set([...cur].filter((c) => c !== r && !c.startsWith(r + '.')));
    const parts = r.split('.');
    for (const p of changedPaths(getPath(this.saved, parts), getPath(this.file, parts), r)) next.add(p);
    this.setChanged(next);
  }

  private apply(patches: readonly Patch[], side: 'before' | 'after'): void {
    const file = this.file;
    if (!file) return;
    batch(() => {
      for (const p of patches) {
        put(file, p.path, clone(p[side]));
        this.track(p.path);
        this.touched.add(p.path.join('.'));
      }
      this.syncUndo();
      this.bump(true);
    });
  }

  private setChanged(next: ReadonlySet<string>): void {
    batch(() => {
      this.changed.set(next);
      this.dirty.set(next.size > 0);
    });
  }

  private syncUndo(): void {
    this.canUndo.set(this.hist.length > 0);
    this.canRedo.set(this.fut.length > 0);
  }

  private bump(whole: boolean): void {
    this.version.update((n) => n + 1);
    if (whole) this.epoch.update((n) => n + 1);
  }
}
