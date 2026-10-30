// <mmdx-theme-editor> (§8.3, UC3; prototype theme-editor.js): the theme library editor.
//
//   Baseline — every style of every item type, grouped by diagram type, plus the colour palette.
//   Themes   — override only what differs from what they extend (palette colours included); the rest is inherited.
//
// Edits change a draft (tiles and the sample preview follow); Save validates it, writes it through the ThemeStore and
// registers it in the shared ThemeRegistry so open viewers and editors pick it up. Export downloads a .theme.json.
// Behind the element is the ThemeEditor class, which can also be mounted into any element.
import { THEME_EDITOR_MESSAGES } from '../ui/messages/theme-editor.js';
import { TOOLBAR_MESSAGES } from '../ui/messages/toolbar.js';
import { memoryThemeStore, type ThemeSource, type ThemeStore } from '../adapters/themes.js';
import { localStorageAdapter, memoryStorage, type StorageAdapter } from '../adapters/storage.js';
import { getShared, instanceContext, ensureBuiltinThemes } from '../config.js';
import type { CoreContext } from '../core/context.js';
import { splitSource } from '../core/meta/index.js';
import { parse } from '../core/parse/index.js';
import { renderContext } from '../core/pipeline.js';
import { pageScene, participantPresetShape, presetShape, render } from '../core/render/index.js';
import { FIELD_DEFS, THEME_SECTIONS, optionValue, type FieldDef, type FieldOption, type ThemeSectionItem } from '../core/schema/style-fields.js';
import { BUILTIN_THEMES } from '../core/theme/builtin.js';
import { hexToRgb, relativeColor, resolveColor } from '../core/theme/colors.js';
import { BASELINE, deepMerge, ThemeRegistry } from '../core/theme/registry.js';
import { THEME_SCHEMA_VERSION, type ResolvedTheme, type ThemeFile } from '../core/theme/types.js';
import { validateTheme } from '../core/theme/validate.js';
import type { Diagnostic, DiagramType, Rect } from '../core/types.js';
import { isColorLiteral } from '../core/validate.js';
import { download } from '../dom/export.js';
import { patchChildren } from '../dom/patch.js';
import { Viewport } from '../dom/viewport.js';
import { DIALOG_CSS, Dialogs } from '../ui/dialog.js';
import { h, icon } from '../ui/h.js';
import { registerMessages, type I18n } from '../ui/i18n.js';
import { ICONS } from '../ui/icons.js';
import { drawItemPreview, type PreviewKind } from '../ui/item-preview.js';
import { PopoverManager, Toaster } from '../ui/popover.js';
import { formatKeys, ShortcutRegistry } from '../ui/shortcuts.js';
import { createToolbar, shapePreview, type ToolbarApi, type ToolbarControl, type ToolbarHandle } from '../ui/style-toolbar.js';
import { ALIASES, adoptStyles, BASE, resolveUiScheme, TOKENS, watchUiScheme } from '../ui/styles/base.js';
import { THEME_EDITOR_CSS } from '../ui/styles/theme-editor.js';
import { TOOLBAR_CSS } from '../ui/styles/toolbar.js';
import { ElementBase } from './base.js';

const NS = 'http://www.w3.org/2000/svg';

// ---- public types --------------------------------------------------------------------------------------------------

export type ThemeSamples = Partial<Record<DiagramType, string>>;

export interface ThemeEditorOptions {
  /** Where themes are read and saved (default: in memory, with the built-in themes). */
  store?: ThemeStore;
  /** Read-only themes the store's themes may extend (e.g. the shipped theme files). */
  source?: ThemeSource;
  /** Theme selected on open (default: baseline). */
  theme?: string;
  canEdit?: boolean;
  canPublish?: boolean;
  canDelete?: boolean;
  /** Mermaid samples per diagram type for the preview. */
  samples?: ThemeSamples;
  presentation?: 'inline' | 'dialog';
  /** UI preferences: `teSamples` (edited sample code), `teZoom` (tile zoom). */
  storage?: StorageAdapter;
  ui?: 'light' | 'dark' | 'auto';
  ctx?: Partial<CoreContext>;
}

export interface ThemeEditorEventMap {
  /** Before a theme is written to the store; cancelable. */
  'ds-theme-save': CustomEvent<{ theme: ThemeFile }>;
  'ds-theme-saved': CustomEvent<{ theme: ThemeFile; version: string }>;
  /** The draft became dirty or clean. */
  'ds-theme-dirty': CustomEvent<{ id: string; dirty: boolean }>;
  'ds-theme-select': CustomEvent<{ id: string }>;
  /** Dialog presentation closed. */
  'ds-theme-close': CustomEvent<{ id: string }>;
}

// ---- constants -----------------------------------------------------------------------------------------------------

const FONTS: readonly (readonly [string, string])[] = [
  ["'Open Sans', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif", 'Open Sans'], ["Inter, 'Segoe UI', system-ui, sans-serif", 'Inter'],
  ['Roboto, sans-serif', 'Roboto'], ["'Helvetica Neue', Arial, sans-serif", 'Helvetica'], ['Georgia, serif', 'Georgia'],
  ["'JetBrains Mono', 'SF Mono', Menlo, monospace", 'JetBrains Mono'],
];

const DEFAULT_SAMPLES: Readonly<Record<DiagramType, string>> = {
  flowchart: `flowchart TB
  subgraph svc ["Services"]
    api["API gateway"]:::core --> auth["Auth"]:::analytics
    api --> orders["Orders"]:::domain
    orders --> db[("Orders DB")]:::db
  end
  user(["User"]) -->|"HTTPS"| api
  orders -.->|"events"| bus[("Kafka")]:::event-bus
  bus --> mail{{"Mail"}}:::service
  class bus event-bus`,
  sequence: `sequenceDiagram
  participant C as Client
  participant S as Server
  participant D as Storage
  C->>+S: Request
  Note over S: validate
  loop retry
    S->>D: Read
    D-->>S: Data
  end
  S-->>-C: Response`,
  er: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE : contains
  CUSTOMER {
    string id PK
    string name
  }
  ORDER {
    string id PK
    string customer_id FK
  }
  LINE {
    string order_id FK
    int qty
  }`,
};
const TYPES: readonly DiagramType[] = ['flowchart', 'sequence', 'er'];

const NODE_SHAPES: readonly (readonly [string, string])[] = [['rect', 'Rectangle'], ['rounded', 'Rounded'], ['stadium', 'Stadium'], ['circle', 'Circle'], ['doublecircle', 'Double circle'],
  ['diamond', 'Diamond'], ['hexagon', 'Hexagon'], ['parallelogram', 'Parallelogram'], ['trapezoid', 'Trapezoid'], ['asymmetric', 'Flag'],
  ['cylinder', 'Cylinder'], ['hcyl', 'Queue (horizontal cylinder)'], ['document', 'Document'], ['card', 'Card'], ['subroutine', 'Subroutine']];
const PART_SHAPES: readonly (readonly [string, string])[] = [['box', 'Box'], ['rounded', 'Rounded'], ['stadium', 'Stadium'], ['actor', 'Stick figure'], ['database', 'Database'], ['hcyl', 'Queue (horizontal cylinder)']];

interface ShapeTabs {
  key: 'nodeShapes' | 'participantShapes';
  shapes: readonly (readonly [string, string])[];
  def: string;
  of: (p: Obj | undefined) => string;
}
// items whose theme style is split per shape: <type>.<key>.<shape> holds each shape's default
const SHAPE_TABS: Readonly<Record<string, ShapeTabs>> = {
  node: { key: 'nodeShapes', shapes: NODE_SHAPES, def: 'rect', of: (p) => presetShape(p as never) },
  participant: { key: 'participantShapes', shapes: PART_SHAPES, def: 'box', of: (p) => participantPresetShape(p as never) },
};
const LINE_KINDS = new Set(['edge', 'message', 'rel', 'lifeline']);
/** The text colour key of box-like kinds (contrast check on their fill). */
const TEXT_ON_FILL: Readonly<Record<string, string>> = { node: 'text', participant: 'text', note: 'text', entity: 'text', box: 'text', group: 'titleColor', block: 'labelColor' };
const RATIOS = ['16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'];
const ROUTINGS = ['curved', 'orthogonal', 'straight'];
const TOOLBAR_EXCLUDE: readonly ToolbarControl[] = ['link', 'lock', 'paint', 'delete', 'order', 'layer', 'editGroup', 'ungroup', 'group', 'activate', 'arrange', 'more', 'presets'];

// ---- helpers -------------------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const slug = (s: string): string => s.toLowerCase().trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'theme';
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const getPath = (o: unknown, path: readonly string[]): unknown => path.reduce<unknown>((x, k) => (isObj(x) ? x[k] : undefined), o);
const fontName = (f: unknown): string => (typeof f === 'string' ? f.split(',')[0]!.replace(/'/g, '').trim() : '');

/** WCAG relative luminance of a #hex colour (null for anything else). */
function luminance(c: string): number | null {
  const rgb = hexToRgb(c);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Paths (dotted) where two theme objects differ. */
function changedPaths(a: unknown, b: unknown, pre = '', out: string[] = []): string[] {
  const ao = obj(a), bo = obj(b);
  for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
    const p = pre ? `${pre}.${k}` : k;
    if (isObj(ao[k]) && isObj(bo[k])) changedPaths(ao[k], bo[k], p, out);
    else if (JSON.stringify(ao[k]) !== JSON.stringify(bo[k])) out.push(p);
  }
  return out;
}

const emit = <K extends keyof ThemeEditorEventMap>(target: EventTarget, type: K, detail: ThemeEditorEventMap[K]['detail'], cancelable = false): boolean =>
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));

interface Entry {
  file: ThemeFile;
  version?: string;
  inStore: boolean;
  inSource: boolean;
  sourceFile?: ThemeFile;
  usage?: number;
}

/** The selected tile: an item style (default / shape default / preset) or a page preset. */
interface TileSel {
  type: DiagramType;
  kind: string;
  presets?: string;
  preset: string | null;
  fields: readonly string[];
  props: HTMLElement;
  shape?: string;
  shapesKey?: string;
}

interface LocalField {
  label: string;
  type: FieldDef['type'] | 'text';
  step?: number;
  min?: number;
  max?: number;
  options?: readonly FieldOption[];
}

// ---- the editor ----------------------------------------------------------------------------------------------------

export class ThemeEditor {
  readonly ctx: CoreContext;
  /** Resolves when the theme list is loaded and the first theme is open. */
  ready: Promise<void>;
  private o: ThemeEditorOptions;
  private store: ThemeStore;
  private storage: StorageAdapter;
  private readonly i18n: I18n;
  private readonly shadow: ShadowRoot;
  private readonly frame: HTMLElement;
  private readonly dlg: HTMLElement;
  private readonly list: HTMLElement;
  private readonly main: HTMLElement;
  private readonly side: HTMLElement;
  private readonly body: HTMLElement;
  private readonly roTag: HTMLElement;
  private readonly head: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly fileInput: HTMLInputElement;
  private readonly toolbar: ToolbarHandle;
  private readonly dialogs: Dialogs;
  private readonly pops: PopoverManager;
  private readonly toaster: Toaster;
  private readonly keys = new ShortcutRegistry();
  private readonly ac = new AbortController();
  private readonly cleanups: (() => void)[] = [];
  private observers: ResizeObserver[] = [];
  private rebuilds = new Map<HTMLElement, () => void>();
  private reg = new ThemeRegistry(BUILTIN_THEMES);
  private files = new Map<string, Entry>();
  private loadSeq = 0;
  private unsubStore: (() => void) | undefined;
  private destroyed = false;

  // draft state: raw = the draft being edited; saved = the theme as last saved (JSON) — the difference is "unsaved"
  private id = BASELINE;
  private raw: Obj | null = null;
  private saved = '';
  private lastSnap = '';
  private hist: string[] = [];
  private fut: string[] = [];
  private groupOpen = false;
  private groupT: ReturnType<typeof setTimeout> | undefined;
  private viewT: ReturnType<typeof setTimeout> | undefined;
  private draftCache: ResolvedTheme | null = null;
  private parentCache: Obj | null | undefined;
  private lastDirty = false;
  private errors = new Map<string, string>();
  private openCards = new Set<string>(['palette']);
  private tabShape: Record<string, string> = {};
  private sel: TileSel | null = null;
  private propsOpen = false;
  private preview: DiagramType = 'flowchart';
  private refit = true;
  private showCode = false;
  private zoom = 1;
  private samples: Record<string, string> = {};
  private viewer: { box: HTMLElement; svg: SVGSVGElement; defs: SVGDefsElement; vp: SVGGElement; page: SVGGElement; body: SVGGElement; viewport: Viewport; pct: HTMLOutputElement } | null = null;

  constructor(private readonly host: HTMLElement, options: ThemeEditorOptions = {}) {
    registerMessages(THEME_EDITOR_MESSAGES);
    void ensureBuiltinThemes();
    registerMessages(TOOLBAR_MESSAGES);
    this.o = { ...options };
    this.i18n = getShared().i18n;
    this.ctx = instanceContext(options.ctx);
    this.store = options.store ?? memoryThemeStore(BUILTIN_THEMES);
    this.storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorageAdapter() : memoryStorage());
    this.shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    adoptStyles(this.shadow, [TOKENS, ALIASES, BASE, DIALOG_CSS, TOOLBAR_CSS, THEME_EDITOR_CSS]);
    const t = this.i18n.t;
    this.readPrefs();

    this.list = h('div', { class: 'te-list', role: 'navigation', 'aria-label': t('te.list') });
    this.main = h('div', { class: 'te-main' });
    this.side = h('div', { class: 'te-preview', role: 'complementary', 'aria-label': t('te.samplePreview') });
    this.body = h('div', { class: 'te-body' }, this.list, this.main, this.side);
    this.roTag = h('span', { class: 'te-ro-tag' }, t('te.readOnly'));
    this.closeBtn = h('button', { type: 'button', class: 'te-close', title: t('te.close'), 'aria-label': t('te.close'), onclick: () => void this.close() }, '×');
    this.fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'te-file', tabindex: '-1', 'aria-hidden': 'true' });
    const titleId = `te-title-${this.ctx.idPrefix}`;
    // its own title bar only as a dialog: embedded (inline), the host's frame already has a title
    this.head = h('div', { class: 'te-head' }, h('b', { id: titleId }, t('te.title')), h('span', { class: 'te-sub' }, t('te.sub')), this.roTag, this.closeBtn);
    this.dlg = h('div', { class: 'te-dialog', role: 'region', 'aria-labelledby': titleId, tabindex: '-1', part: 'panel' }, this.head, this.body, this.fileInput);
    this.frame = h('div', { class: 'te-overlay' });
    this.shadow.append(this.frame);
    this.dialogs = new Dialogs(this.shadow);
    this.pops = new PopoverManager(this.shadow);
    this.toaster = new Toaster(this.shadow);

    this.layout(); // before the toolbar: it scopes its listeners to the root node of its host
    // the canvas's floating style toolbar, editing the selected tile's style
    this.toolbar = createToolbar(this.body, this.styleApi(), { exclude: TOOLBAR_EXCLUDE, reset: true, i18n: this.i18n });
    const sig = { signal: this.ac.signal };
    this.main.addEventListener('scroll', () => this.toolbar.place(), sig);
    this.main.addEventListener('pointerdown', (ev) => {
      const t0 = ev.composedPath()[0] as Element;
      if (!t0.closest?.('.te-tile, .mtb, .te-props')) this.selectTile(null);
    }, sig);
    this.fileInput.addEventListener('change', () => void this.importFile(), sig);
    this.frame.addEventListener('pointerdown', (ev) => {
      if (ev.target === this.frame && this.presentation() === 'dialog') void this.close();
    }, sig);
    this.wireKeys();
    this.cleanups.push(watchUiScheme(() => this.applyScheme()));
    this.applyScheme();
    this.ready = this.load(options.theme);
  }

  // ---- public API -------------------------------------------------------------------------------------------------

  get options(): Readonly<ThemeEditorOptions> {
    return this.o;
  }

  /** The draft differs from the saved theme. */
  get dirty(): boolean {
    return !!this.raw && this.unsaved();
  }

  /** Id of the theme being edited. */
  get themeId(): string {
    return this.id;
  }

  /** A copy of the draft. */
  get draftTheme(): ThemeFile | null {
    return this.raw ? (clone(this.raw) as unknown as ThemeFile) : null;
  }

  set(patch: Partial<ThemeEditorOptions>): void {
    const prev = this.o;
    this.o = { ...this.o, ...patch };
    if ('ui' in patch) this.applyScheme();
    if ('presentation' in patch && patch.presentation !== prev.presentation) this.layout();
    if ('storage' in patch && patch.storage) {
      this.storage = patch.storage;
      this.readPrefs();
    }
    if (('store' in patch && patch.store && patch.store !== prev.store) || ('source' in patch && patch.source !== prev.source)) {
      if (patch.store) this.store = patch.store;
      this.ready = this.load(this.o.theme ?? this.id);
      return;
    }
    if ('theme' in patch && patch.theme && patch.theme !== this.id && this.files.size) void this.select(patch.theme);
    if ('canEdit' in patch || 'canDelete' in patch || 'canPublish' in patch) {
      this.renderList();
      this.renderMain();
    }
    if ('samples' in patch) this.drawPreview();
  }

  /** Validates and saves the draft. Resolves false when nothing was saved. */
  async save(): Promise<boolean> {
    this.endGroup();
    if (!this.raw || !this.canEdit()) return false;
    if (!this.unsaved()) return true;
    this.raw['schemaVersion'] = THEME_SCHEMA_VERSION;
    this.lastSnap = this.snap();
    const file = clone(this.raw) as unknown as ThemeFile;
    if (!this.checkValid(file)) return false;
    const before = this.files.get(file.id)?.file.counterpart;
    const ok = await this.persist(file);
    if (ok) await this.syncLink(file, before);
    if (ok) {
      this.saved = this.snap();
      this.applyDirty();
      this.syncHeader();
    }
    return ok;
  }

  /**
   * Keeps light / dark links mutual: the newly linked theme links back to this one, and a theme that linked here
   * before is unlinked. Each change is saved through the store like any other edit.
   */
  private async syncLink(file: ThemeFile, before: string | undefined): Promise<void> {
    const now = file.counterpart;
    const write = async (id: string, counterpart: string | undefined): Promise<void> => {
      const e = this.files.get(id);
      if (!e || e.file.counterpart === counterpart) return;
      const next = clone(e.file);
      if (counterpart === undefined) delete next.counterpart;
      else next.counterpart = counterpart;
      next.schemaVersion = THEME_SCHEMA_VERSION;
      await this.persist(next);
    };
    if (now) {
      // the partner's old partner loses its link: a theme has one counterpart
      const prev = this.files.get(now)?.file.counterpart;
      if (prev && prev !== file.id && this.files.get(prev)?.file.counterpart === now) await write(prev, undefined);
      await write(now, file.id);
    }
    if (before && before !== now && this.files.get(before)?.file.counterpart === file.id) await write(before, undefined);
  }

  undo(): void {
    this.endGroup();
    const prev = this.hist.pop();
    if (prev === undefined) return;
    this.fut.push(this.snap());
    this.restore(prev);
  }

  redo(): void {
    this.endGroup();
    const next = this.fut.pop();
    if (next === undefined) return;
    this.hist.push(this.snap());
    this.restore(next);
  }

  /** Switches to another theme (asks about unsaved changes). */
  select(id: string, opts: { force?: boolean } = {}): Promise<boolean> {
    return this.selectTheme(id, opts.force ?? false);
  }

  /** Drops the unsaved changes. */
  discard(): void {
    if (!this.raw) return;
    this.endGroup();
    this.restore(this.saved, true);
  }

  open(): void {
    this.frame.hidden = false;
    queueMicrotask(() => this.dlg.focus());
  }

  /** Dialog presentation: closes after asking about unsaved changes. Resolves false when the user stays. */
  async close(): Promise<boolean> {
    if (this.presentation() !== 'dialog') return true;
    if (!(await this.confirmLeave())) return false;
    this.frame.hidden = true;
    emit(this.host, 'ds-theme-close', { id: this.id });
    return true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this.groupT);
    clearTimeout(this.viewT);
    this.ac.abort();
    this.unsubStore?.();
    for (const o of this.observers) o.disconnect();
    for (const c of this.cleanups) c();
    this.viewer?.viewport.destroy();
    this.toolbar.destroy();
    this.pops.close();
    this.toaster.destroy();
    this.frame.remove();
  }

  // ---- setup ------------------------------------------------------------------------------------------------------

  private presentation(): 'inline' | 'dialog' {
    return this.o.presentation === 'dialog' ? 'dialog' : 'inline';
  }

  private canEdit(): boolean {
    return this.o.canEdit !== false;
  }

  private layout(): void {
    const dialog = this.presentation() === 'dialog';
    this.dlg.classList.toggle('inline', !dialog);
    this.dlg.setAttribute('role', dialog ? 'dialog' : 'region');
    if (dialog) this.dlg.setAttribute('aria-modal', 'true');
    else this.dlg.removeAttribute('aria-modal');
    this.closeBtn.hidden = !dialog;
    this.head.hidden = !dialog;
    if (dialog) {
      this.dlg.removeAttribute('aria-label');
      this.dlg.setAttribute('aria-labelledby', this.head.querySelector('b')!.id);
    } else {
      this.dlg.removeAttribute('aria-labelledby');
      this.dlg.setAttribute('aria-label', this.i18n.t('te.title'));
    }
    if (dialog) {
      this.frame.className = 'te-overlay';
      this.frame.append(this.dlg);
    } else {
      this.frame.className = 'te-inline';
      this.frame.style.height = '100%';
      this.frame.append(this.dlg);
    }
    this.frame.hidden = false;
  }

  private applyScheme(): void {
    const ui = this.o.ui;
    this.host.setAttribute('data-ui', resolveUiScheme(ui === 'auto' || !ui ? null : ui));
  }

  private readPrefs(): void {
    const s = this.storage.get<unknown>('teSamples');
    this.samples = {};
    if (isObj(s)) for (const [k, v] of Object.entries(s)) if (typeof v === 'string') this.samples[k] = v;
    const z = Number(this.storage.get<unknown>('teZoom'));
    this.zoom = Number.isFinite(z) && z > 0 ? Math.min(1.5, Math.max(0.5, z)) : 1;
  }

  private sample(type: DiagramType): string {
    return this.samples[type] ?? this.o.samples?.[type] ?? DEFAULT_SAMPLES[type];
  }

  private wireKeys(): void {
    const t = this.i18n.t;
    this.keys.add(
      { id: 'save', keys: ['mod+s'], label: t('te.saveBtn'), group: 'theme', inText: true, run: () => void this.save() },
      { id: 'undo', keys: ['mod+z'], label: t('te.undo', { keys: formatKeys('mod+z') }), group: 'theme', run: () => this.undo() },
      { id: 'redo', keys: ['mod+shift+z', 'mod+y'], label: t('te.redo', { keys: formatKeys('mod+shift+z') }), group: 'theme', run: () => this.redo() },
      // Esc: colour popover → style toolbar popover → selected tile → the dialog
      {
        id: 'esc', keys: ['escape'], label: 'Esc', group: 'theme', inText: true, run: () => {
          if (this.pops.isOpen) this.pops.close(true);
          else if (this.toolbar.isOpen()) this.toolbar.close(true);
          else if (this.sel) this.selectTile(null);
          else if (this.presentation() === 'dialog') void this.close();
          else return false;
          return true;
        },
      },
    );
    // keys typed in the editor never reach the page behind it
    this.dlg.addEventListener('keydown', (ev) => {
      if (this.shadow.querySelector('.ds-dialog-back')) return;
      this.keys.handle(ev, true);
    }, { signal: this.ac.signal });
  }

  // ---- loading ----------------------------------------------------------------------------------------------------

  private async load(want?: string): Promise<void> {
    const seq = ++this.loadSeq;
    this.unsubStore?.();
    this.unsubStore = this.store.subscribe?.(() => void this.refreshFiles());
    if (!this.files.size) this.main.replaceChildren(h('div', { class: 'te-loading' }, this.i18n.t('te.loading')));
    const files = await this.fetchFiles();
    if (seq !== this.loadSeq || this.destroyed) return;
    this.setFiles(files);
    await this.selectTheme(want && files.has(want) ? want : this.raw && files.has(this.id) ? this.id : files.has(BASELINE) ? BASELINE : [...files.keys()][0] ?? BASELINE, true);
  }

  private async fetchFiles(): Promise<Map<string, Entry>> {
    const files = new Map<string, Entry>();
    const src = this.o.source;
    if (src) {
      const infos = await src.list().catch(() => []);
      await Promise.all(infos.map(async (i) => {
        const f = await src.get(i.id).catch(() => null);
        if (f) files.set(f.id, { file: f, inStore: false, inSource: true, sourceFile: f });
      }));
    }
    const infos = await this.store.list().catch(() => []);
    await Promise.all(infos.map(async (i) => {
      const f = await this.store.get(i.id).catch(() => null);
      if (!f) return;
      const prev = files.get(f.id);
      const e: Entry = { file: f, inStore: true, inSource: !!prev };
      if (i.version !== undefined) e.version = i.version;
      if (prev?.sourceFile) e.sourceFile = prev.sourceFile;
      if (this.store.usage) {
        const n = await this.store.usage(f.id).catch(() => undefined);
        if (n !== undefined) e.usage = n;
      }
      files.set(f.id, e);
    }));
    // baseline first, then the store's / source's order
    const order = [BASELINE, ...infos.map((i) => i.id), ...files.keys()];
    return new Map([...new Set(order)].filter((id) => files.has(id)).map((id) => [id, files.get(id)!]));
  }

  private setFiles(files: Map<string, Entry>): void {
    this.files = files;
    // private registry: built-ins, then the source, then the store (later files win)
    this.reg = new ThemeRegistry([...BUILTIN_THEMES, ...[...files.values()].map((e) => e.file)]);
    this.parentCache = undefined;
    this.draftCache = null;
  }

  private async refreshFiles(): Promise<void> {
    const files = await this.fetchFiles();
    if (this.destroyed) return;
    this.setFiles(files);
    this.renderList();
  }

  // ---- draft, undo / redo, save -----------------------------------------------------------------------------------
  // Edits change the draft only (tiles and preview follow); Save writes it to the store. A burst of changes (a slider
  // drag, typing) is one undo step.

  private snap(): string {
    return JSON.stringify(this.raw);
  }

  private unsaved(): boolean {
    return this.snap() !== this.saved;
  }

  private touch(): void {
    if (!this.groupOpen) {
      this.hist.push(this.lastSnap);
      if (this.hist.length > 200) this.hist.shift();
      this.fut = [];
      this.groupOpen = true;
    }
    clearTimeout(this.groupT);
    this.groupT = setTimeout(() => this.endGroup(), 500);
    this.draftCache = null;
    clearTimeout(this.viewT);
    this.viewT = setTimeout(() => this.refreshView(), 120);
    this.syncHeader();
  }

  private endGroup(): void {
    clearTimeout(this.groupT);
    if (this.groupOpen) {
      this.groupOpen = false;
      this.lastSnap = this.snap();
    }
  }

  private flush(): void {
    this.endGroup();
    this.refreshView();
  }

  private refreshView(): void {
    clearTimeout(this.viewT);
    this.refreshTiles();
    this.drawPreview();
    this.applyDirty();
    this.syncHeader();
  }

  private draft(): ResolvedTheme {
    return (this.draftCache ??= this.reg.resolveDraft((this.raw ?? { id: this.id }) as unknown as ThemeFile));
  }

  private restore(json: string, clearHist = false): void {
    this.raw = JSON.parse(json) as Obj;
    this.lastSnap = this.snap();
    this.draftCache = null;
    if (clearHist) {
      this.hist = [];
      this.fut = [];
    }
    this.selectTile(null);
    this.renderMain();
    this.drawPreview();
    this.syncHeader();
    this.renderListMarks();
  }

  /** Leaving a theme with unsaved changes: save, discard or stay. */
  private async confirmLeave(): Promise<boolean> {
    this.endGroup();
    if (!this.raw || !this.unsaved()) return true;
    const t = this.i18n.t;
    const r = await this.dialogs.choose<'save' | 'discard' | 'cancel'>({
      title: t('te.unsavedTitle'),
      message: t('te.saveChanges', { name: this.name() }),
      cancel: 'cancel',
      buttons: [{ label: t('te.cancel'), value: 'cancel' }, { label: t('te.dontSave'), value: 'discard', danger: true }, ...(this.canEdit() ? [{ label: t('te.save'), value: 'save' as const, primary: true }] : [])],
    });
    if (r === 'cancel') return false;
    if (r === 'save') return this.save();
    this.discard();
    return true;
  }

  private name(): string {
    return typeof this.raw?.['name'] === 'string' && this.raw['name'] ? this.raw['name'] : this.id;
  }

  /** Schema validation; errors are shown per field. */
  private checkValid(file: unknown): boolean {
    const { theme, diagnostics } = validateTheme(file);
    const bad = diagnostics.filter((d) => d.severity !== 'info');
    this.errors = new Map(bad.map((d) => [String(d.params?.['key'] ?? d.code), d.message]));
    this.renderErrors();
    if (!theme || bad.length) {
      this.toaster.show(this.i18n.t('te.saveErrorsTitle'), { error: true });
      return false;
    }
    return true;
  }

  /** Writes a validated file through the store (ds-theme-save first; conflict dialog on a version clash). */
  private async persist(file: ThemeFile, force = false): Promise<boolean> {
    const t = this.i18n.t;
    if (!emit(this.host, 'ds-theme-save', { theme: clone(file) }, true)) {
      this.toaster.show(t('te.saveCancelled'));
      return false;
    }
    const entry = this.files.get(file.id);
    let res;
    try {
      res = await this.store.save(clone(file), !force && entry?.inStore && entry.version !== undefined ? { version: entry.version } : {});
    } catch (e) {
      this.toaster.show(t('te.saveFailed', { msg: e instanceof Error ? e.message : String(e) }), { error: true });
      return false;
    }
    if ('conflict' in res) {
      const theirs = res.conflict;
      const r = await this.dialogs.choose<'overwrite' | 'reload' | 'cancel'>({
        title: t('te.conflictTitle'),
        message: t('te.conflictMsg', { name: file.name ?? file.id }),
        cancel: 'cancel',
        buttons: [{ label: t('te.cancel'), value: 'cancel' }, { label: t('te.reload'), value: 'reload' }, { label: t('te.overwrite'), value: 'overwrite', danger: true }],
      });
      if (r === 'overwrite') return this.persist(file, true);
      if (r === 'reload') {
        const e: Entry = { ...(entry ?? { inStore: true, inSource: false }), file: theirs, inStore: true };
        const info = (await this.store.list().catch(() => [])).find((i) => i.id === theirs.id);
        if (info?.version !== undefined) e.version = info.version;
        this.files.set(theirs.id, e);
        this.setFiles(this.files);
        this.ctx.themes.register(theirs);
        await this.selectTheme(theirs.id, true);
      }
      return false;
    }
    const e: Entry = { ...(entry ?? { inStore: true, inSource: false }), file: clone(file), inStore: true, version: res.version };
    this.files.set(file.id, e);
    this.setFiles(this.files);
    // open viewers and editors pick the saved theme up through the shared registry
    this.ctx.themes.register(clone(file));
    emit(this.host, 'ds-theme-saved', { theme: clone(file), version: res.version });
    this.toaster.show(t('te.saved', { name: file.name ?? file.id }));
    this.renderList();
    return true;
  }

  private emitDirty(): void {
    const d = this.dirty;
    if (d === this.lastDirty) return;
    this.lastDirty = d;
    emit(this.host, 'ds-theme-dirty', { id: this.id, dirty: d });
  }

  private syncHeader(): void {
    const b = this.main.querySelector('.te-actions');
    if (b) {
      const dirty = this.unsaved();
      (b.querySelector('.te-undo') as HTMLButtonElement).disabled = !this.hist.length && !this.groupOpen;
      (b.querySelector('.te-redo') as HTMLButtonElement).disabled = !this.fut.length;
      (b.querySelector('.te-save') as HTMLButtonElement).disabled = !dirty || !this.canEdit();
      (b.querySelector('.te-unsaved') as HTMLElement).hidden = !dirty;
    }
    this.renderListMarks();
    this.emitDirty();
  }

  // ---- unsaved changes are highlighted: elements carry data-dirty="path|path…" (paths into the theme)

  private applyDirty(): void {
    if (!this.raw) return;
    const changed = changedPaths(JSON.parse(this.saved || '{}'), this.raw);
    const hit = (prefix: string): boolean => changed.some((c) => c === prefix || c.startsWith(prefix + '.'));
    this.dlg.querySelectorAll<HTMLElement>('[data-dirty]').forEach((e) => e.classList.toggle('dirty', (e.dataset['dirty'] ?? '').split('|').some(hit)));
    this.renderListMarks();
  }

  private renderListMarks(): void {
    this.list.querySelector('.te-theme.on')?.classList.toggle('dirty', !!this.raw && this.unsaved());
  }

  private renderErrors(): void {
    const box = this.main.querySelector('.te-errors');
    const t = this.i18n.t;
    if (box) {
      box.replaceChildren();
      (box as HTMLElement).hidden = !this.errors.size;
      if (this.errors.size)
        box.append(h('b', null, t('te.saveErrors')), h('ul', null, ...[...this.errors].map(([p, m]) => h('li', null, h('code', null, p), ` — ${m}`))));
    }
    this.dlg.querySelectorAll<HTMLElement>('.te-f[data-dirty]').forEach((row) => {
      const msg = this.errors.get(row.dataset['dirty'] ?? '');
      row.classList.toggle('invalid', !!msg);
      row.querySelector('.te-ferr')?.remove();
      if (msg) row.querySelector('.te-ctl')?.append(h('span', { class: 'te-ferr', role: 'alert' }, msg));
    });
  }

  // ---- theme list ---------------------------------------------------------------------------------------------------

  private renderList(): void {
    const t = this.i18n.t;
    this.list.replaceChildren();
    for (const [id, e] of this.files) {
      // only state worth a glance under the name (no static "light · extends baseline" description)
      const tags: string[] = [];
      if (this.isEdited(e)) tags.push(t('te.tag.edited'));
      if (this.o.source && e.inStore && !e.inSource) tags.push(t('te.tag.notExported'));
      if (e.usage !== undefined) tags.push(t('te.tag.used', { n: e.usage }));
      const row = h('button', { type: 'button', class: 'te-theme' + (id === this.id ? ' on' : ''), 'aria-current': id === this.id ? 'true' : undefined, onclick: () => void this.selectTheme(id, false) },
        h('span', { class: 'te-tname' }, e.file.name || id), tags.length ? h('span', { class: 'te-ttag' }, tags.join(' · ')) : null);
      this.list.append(row);
    }
    const acts = h('div', { class: 'te-list-acts' });
    const btn = (label: string, title: string, fn: () => void, cls = ''): void => {
      acts.append(h('button', { type: 'button', class: cls, title, onclick: fn }, label));
    };
    const edit = this.canEdit();
    if (edit) btn(t('te.new'), t('te.newTitle'), () => void this.createTheme(), 'primary');
    if (edit) btn(t('te.duplicate'), t('te.duplicateTitle'), () => void this.createTheme(this.files.get(this.id)?.file));
    if (edit) btn(t('te.import'), t('te.importTitle'), () => this.fileInput.click());
    btn(t('te.export'), t('te.exportTitle'), () => void this.exportTheme());
    if (edit && this.raw && this.unsaved()) btn(t('te.discard'), t('te.discardTitle'), () => void this.askDiscard(), 'danger');
    const e = this.files.get(this.id);
    if (edit && e && this.isEdited(e) && this.store.delete) btn(t('te.revert'), t('te.revertTitle'), () => void this.revertTheme(), 'danger');
    if (this.o.canPublish && this.store.publish && e?.inStore) btn(t('te.publish'), t('te.publishTitle'), () => void this.publish());
    if (this.o.canDelete && this.store.delete && e?.inStore && !e.inSource && this.id !== BASELINE) btn(t('te.delete'), t('te.deleteTitle'), () => void this.deleteTheme(), 'danger');
    this.list.append(acts);
    this.renderListMarks();
  }

  private isEdited(e: Entry): boolean {
    return e.inStore && !!e.sourceFile && JSON.stringify(e.sourceFile) !== JSON.stringify(e.file);
  }

  private async askDiscard(): Promise<void> {
    if (await this.dialogs.confirm(this.i18n.t('te.discard'), this.i18n.t('te.discardQ', { name: this.name() }), { ok: this.i18n.t('te.discard'), cancel: this.i18n.t('te.cancel'), danger: true })) {
      this.discard();
      this.renderList();
    }
  }

  private async revertTheme(): Promise<void> {
    const t = this.i18n.t;
    if (!(await this.dialogs.confirm(t('te.revert'), t('te.revertQ', { name: this.name() }), { ok: t('te.revert'), cancel: t('te.cancel'), danger: true }))) return;
    await this.store.delete?.(this.id);
    const e = this.files.get(this.id);
    if (e?.sourceFile) this.ctx.themes.register(e.sourceFile);
    this.setFiles(await this.fetchFiles());
    await this.selectTheme(this.files.has(this.id) ? this.id : BASELINE, true);
  }

  private async deleteTheme(): Promise<void> {
    const t = this.i18n.t;
    const id = this.id;
    if (!(await this.dialogs.confirm(t('te.deleteQ', { name: this.name() }), t('te.deleteMsg'), { ok: t('te.delete'), cancel: t('te.cancel'), danger: true }))) return;
    await this.store.delete?.(id);
    this.ctx.themes.unregister(id);
    this.setFiles(await this.fetchFiles());
    await this.selectTheme(BASELINE, true);
  }

  private async publish(): Promise<void> {
    if (this.unsaved() && !(await this.save())) return;
    try {
      await this.store.publish?.(this.id);
      this.toaster.show(this.i18n.t('te.published', { name: this.name() }));
    } catch (e) {
      this.toaster.show(e instanceof Error ? e.message : String(e), { error: true });
    }
  }

  private uniqueId(name: string): string {
    let id = slug(name), n = 2;
    while (this.files.has(id) || id === BASELINE) id = `${slug(name)}-${n++}`;
    return id;
  }

  private async createTheme(from?: ThemeFile): Promise<void> {
    const t = this.i18n.t;
    if (!(await this.confirmLeave())) return;
    const name = await this.dialogs.prompt(t('te.nameTitle'), { label: t('te.nameTitle'), value: from ? t('te.copyName', { name: from.name ?? from.id }) : t('te.nameDefault'), ok: t('te.save') });
    if (!name) return;
    const id = this.uniqueId(name);
    let raw: Obj = from ? { ...clone(from) as unknown as Obj, id, name } : { id, name, extends: BASELINE };
    // a copy of the baseline overrides nothing yet
    if (from && from.id === BASELINE) raw = { id, name, extends: BASELINE };
    // a copy starts unlinked: its source's counterpart stays linked to the source
    delete raw['counterpart'];
    raw['schemaVersion'] = THEME_SCHEMA_VERSION;
    if (!this.checkValid(raw)) return;
    if (await this.persist(raw as unknown as ThemeFile)) await this.selectTheme(id, true);
  }

  private async importFile(): Promise<void> {
    const t = this.i18n.t;
    const f = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (!f) return;
    await this.importText(await f.text());
    void t;
  }

  /** Imports a theme file's text: validated first; an invalid file is reported and nothing is saved. */
  async importText(text: string): Promise<boolean> {
    const t = this.i18n.t;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      await this.showErrors(t('te.invalidTitle'), [t('te.invalidJson', { msg: e instanceof Error ? e.message : String(e) })]);
      return false;
    }
    const { theme, diagnostics } = validateTheme(json);
    const bad = diagnostics.filter((d) => d.severity !== 'info');
    if (!theme || bad.length) {
      await this.showErrors(t('te.invalidTitle'), bad.map(diagText));
      return false;
    }
    if (theme.id !== BASELINE && !theme.extends) theme.extends = BASELINE;
    theme.schemaVersion = THEME_SCHEMA_VERSION;
    if (!(await this.confirmLeave())) return false;
    if (!(await this.persist(theme, true))) return false;
    await this.selectTheme(theme.id, true);
    return true;
  }

  private async showErrors(title: string, lines: readonly string[]): Promise<void> {
    const t = this.i18n.t;
    const body = h('div', null, h('p', null, t('te.importErrors')), h('ul', { class: 'te-import-errors' }, ...lines.slice(0, 30).map((l) => h('li', null, l))));
    await this.dialogs.choose({ title, body, cancel: null, buttons: [{ label: 'OK', value: null, primary: true }] });
  }

  private async exportTheme(): Promise<void> {
    const t = this.i18n.t;
    let file: unknown = this.files.get(this.id)?.file ?? this.raw;
    if (this.raw && this.unsaved()) {
      const r = await this.dialogs.choose<'save' | 'draft' | 'cancel'>({
        title: t('te.exportQ', { name: this.name() }),
        message: t('te.exportMsg'),
        cancel: 'cancel',
        buttons: [{ label: t('te.cancel'), value: 'cancel' }, { label: t('te.exportDraft'), value: 'draft' }, ...(this.canEdit() ? [{ label: t('te.saveExport'), value: 'save' as const, primary: true }] : [])],
      });
      if (r === 'cancel') return;
      if (r === 'save' && !(await this.save())) return;
      file = this.raw;
    }
    const out = { ...clone(obj(file)), schemaVersion: THEME_SCHEMA_VERSION };
    download(`${this.id}.theme.json`, JSON.stringify(out, null, 2) + '\n', 'application/json');
  }

  private async selectTheme(id: string, force: boolean): Promise<boolean> {
    if (!force && this.raw && id === this.id) return true;
    if (!force && this.raw && !(await this.confirmLeave())) return false;
    const e = this.files.get(id) ?? this.files.get(BASELINE) ?? [...this.files.values()][0];
    this.selectTile(null);
    this.id = e?.file.id ?? id;
    this.raw = e ? (clone(e.file) as unknown as Obj) : { id };
    this.saved = this.lastSnap = this.snap();
    this.hist = [];
    this.fut = [];
    this.groupOpen = false;
    this.draftCache = null;
    this.parentCache = undefined;
    this.errors.clear();
    this.renderList();
    this.renderMain();
    this.drawPreview();
    this.syncHeader();
    emit(this.host, 'ds-theme-select', { id: this.id });
    return true;
  }

  // ---- values: the theme's own value (override) vs the inherited one ----------------------------------------------

  private isBase(): boolean {
    return this.id === BASELINE;
  }

  private parentMerged(): Obj | null {
    if (this.isBase()) return null;
    if (this.parentCache === undefined) {
      const ext = typeof this.raw?.['extends'] === 'string' ? this.raw['extends'] : BASELINE;
      this.parentCache = (this.reg.merged(ext) as unknown as Obj | null) ?? {};
    }
    return this.parentCache;
  }

  private setPath(path: readonly string[], v: unknown): void {
    if (!this.raw || !this.canEdit()) return;
    let o: Obj = this.raw;
    for (const k of path.slice(0, -1)) {
      if (!isObj(o[k])) o[k] = {};
      o = o[k] as Obj;
    }
    const last = path[path.length - 1]!;
    if (v === undefined) delete o[last];
    else o[last] = v;
    // tidy objects left empty by a reset (deepest first)
    for (let i = path.length - 1; i > 0; i--) {
      const parent = i === 1 ? this.raw : getPath(this.raw, path.slice(0, i - 1));
      const key = path[i - 1]!;
      const child = isObj(parent) ? parent[key] : undefined;
      if (isObj(parent) && isObj(child) && !Object.keys(child).length) delete parent[key];
      else break;
    }
    if (this.errors.delete(path.join('.'))) this.renderErrors();
    this.touch();
  }

  private paletteNow(): Record<string, string> {
    return { ...this.draft().palette };
  }

  private show(v: unknown): string {
    const d = this.draft();
    const r = resolveColor(v, d.palette, d.basePalette);
    return typeof r === 'string' ? r : '';
  }

  // ---- main column --------------------------------------------------------------------------------------------------

  private renderMain(): void {
    const t = this.i18n.t;
    for (const o of this.observers) o.disconnect();
    this.observers = [];
    this.rebuilds.clear();
    this.main.replaceChildren();
    if (!this.raw) return;
    this.dlg.classList.toggle('te-ro', !this.canEdit());
    this.roTag.hidden = this.canEdit();
    this.main.style.setProperty('--tz', String(this.zoom));
    const top = h('div', { class: 'te-top' });
    const name = h('input', { class: 'te-name', type: 'text', 'aria-label': t('te.themeName'), dataset: { dirty: 'name' } });
    name.value = this.name();
    name.disabled = !this.canEdit();
    name.addEventListener('change', () => {
      if (!this.raw) return;
      this.raw['name'] = name.value.trim() || this.id;
      this.touch();
    });
    // embedded, the "Read only" tag sits by the name (the title bar with it is hidden)
    top.append(name);
    if (this.presentation() === 'inline') top.append(this.roTag);
    top.append(h('span', { class: 'te-spacer' }));
    // preview zoom: tiles show items at real size (100%); smaller fits more per row
    const zl = h('output', { 'aria-live': 'polite' }, `${Math.round(this.zoom * 100)}%`);
    const step = (d: number): void => {
      this.zoom = Math.round(Math.min(1.5, Math.max(0.5, this.zoom + d)) * 10) / 10;
      zl.textContent = `${Math.round(this.zoom * 100)}%`;
      this.storage.set('teZoom', this.zoom);
      this.main.style.setProperty('--tz', String(this.zoom));
      this.refreshTiles();
    };
    const zoom = h('div', { class: 'te-zoom', role: 'group', 'aria-label': t('te.previewSize'), title: t('te.previewSize') },
      h('span', null, t('te.preview')),
      h('button', { type: 'button', title: t('te.smaller'), 'aria-label': t('te.smaller'), onclick: () => step(-0.1) }, '−'),
      zl,
      h('button', { type: 'button', title: t('te.bigger'), 'aria-label': t('te.bigger'), onclick: () => step(0.1) }, '+'));
    zl.addEventListener('dblclick', () => step(1 - this.zoom));
    const undoT = t('te.undo', { keys: formatKeys('mod+z') }), redoT = t('te.redo', { keys: formatKeys('mod+shift+z') });
    const acts = h('div', { class: 'te-actions' },
      h('span', { class: 'te-unsaved', role: 'status' }, t('te.unsaved')),
      h('button', { type: 'button', class: 'te-undo', title: undoT, 'aria-label': undoT, 'aria-keyshortcuts': 'Control+Z Meta+Z', onclick: () => this.undo() }, icon(ICONS.undo, 15)),
      h('button', { type: 'button', class: 'te-redo', title: redoT, 'aria-label': redoT, 'aria-keyshortcuts': 'Control+Shift+Z Meta+Shift+Z', onclick: () => this.redo() }, icon(ICONS.redo, 15)),
      h('button', { type: 'button', class: 'te-save primary small', title: t('te.saveTitle', { keys: formatKeys('mod+s') }), 'aria-keyshortcuts': 'Control+S Meta+S', onclick: () => void this.save() }, t('te.saveBtn')));
    top.append(zoom, acts);
    this.main.append(top, h('div', { class: 'te-errors', role: 'alert', hidden: true }));

    this.card('palette', t('te.palette'), (box) => this.paletteCard(box), this.isBase() ? t('te.paletteHintBase') : t('te.paletteHintTheme'), null, ['palette']);
    this.card('page', t('te.page'), (box) => this.pageCard(box), null, null, ['appearance', 'font', 'canvas']);
    for (const sec of THEME_SECTIONS) {
      this.main.append(h('div', { class: 'te-type', role: 'heading', 'aria-level': '3', dataset: { dirty: sec.type } }, this.tf(`te.section.${sec.type}`, sec.title)));
      const onOpen = (): void => this.showPreview(sec.type);
      for (const it of sec.items) {
        const tabs = SHAPE_TABS[it.key];
        const dirty = [`${sec.type}.${it.key}`, it.presets ? `${sec.type}.${it.presets}` : '', tabs ? `${sec.type}.${tabs.key}` : ''].filter(Boolean);
        this.card(`${sec.type}.${it.key}`, this.tf(`te.item.${it.key}`, it.label), (box) => this.itemCard(box, sec.type, it), null, onOpen, dirty);
      }
      this.card(`${sec.type}.pagePresets`, t('te.pageCard'), (box) => this.pagePresetsCard(box, sec.type), t('te.pageHint'), onOpen, [`${sec.type}.pagePresets`]);
    }
    this.renderErrors();
    this.applyDirty();
    this.syncHeader();
  }

  private tf(key: string, fallback: string): string {
    const v = this.i18n.t(key);
    return v === key ? fallback : v;
  }

  private showPreview(type: DiagramType): void {
    if (this.preview !== type) this.refit = true;
    this.preview = type;
    this.drawPreview();
  }

  /** A collapsible card; `dirty`: theme paths it shows (highlighted while they have unsaved changes). */
  private card(key: string, title: string, fill: (box: HTMLElement) => void, hint: string | null, onOpen: (() => void) | null, dirty: readonly string[]): void {
    const isOpen = this.openCards.has(key);
    const bodyId = `te-card-${slug(key)}-${this.ctx.idPrefix}`;
    const caret = h('span', { class: 'te-caret', 'aria-hidden': 'true' }, isOpen ? '▾' : '▸');
    const head = h('button', { type: 'button', class: 'te-card-head', 'aria-expanded': String(isOpen), 'aria-controls': bodyId, dataset: { card: key } }, caret, h('span', null, title));
    const n = this.changedCount(key);
    if (n && !this.isBase()) head.append(h('span', { class: 'te-badge' }, this.i18n.t('te.changed', { n })));
    const body = h('div', { class: 'te-card-body', id: bodyId });
    body.hidden = !isOpen;
    const build = (): void => {
      if (hint) body.append(h('div', { class: 'te-hint' }, hint));
      fill(body);
      this.disableIfReadOnly(body);
      this.renderErrors();
      this.applyDirty();
    };
    head.addEventListener('click', () => {
      body.hidden = !body.hidden;
      if (body.hidden) this.openCards.delete(key);
      else this.openCards.add(key);
      caret.textContent = body.hidden ? '▸' : '▾';
      head.setAttribute('aria-expanded', String(!body.hidden));
      if (!body.hidden) {
        if (!body.childElementCount) build();
        onOpen?.();
      }
    });
    if (isOpen) build();
    this.main.append(h('div', { class: 'te-card', dataset: { dirty: dirty.join('|') } }, head, body));
  }

  private disableIfReadOnly(box: HTMLElement): void {
    if (this.canEdit()) return;
    box.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, select, textarea, .te-reset, .te-dot-x, .te-tile-del, .te-tile-add, .te-chip, .seg button').forEach((e) => {
      e.disabled = true;
    });
  }

  private changedCount(key: string): number {
    const raw = this.raw ?? {};
    if (key === 'palette') return Object.keys(obj(raw['palette'])).length;
    if (key === 'page') return ['appearance', 'font'].filter((k) => raw[k] !== undefined).length + Object.keys(obj(raw['canvas'])).length;
    const [type, item] = key.split('.') as [string, string];
    const o = obj(raw[type]);
    if (item === 'pagePresets') return Object.values(obj(o['pagePresets'])).reduce<number>((a, p) => a + Object.keys(obj(p)).length, 0);
    const presets = THEME_SECTIONS.find((s) => s.type === type)?.items.find((i) => i.key === item)?.presets;
    return Object.keys(obj(o[item])).length + (presets ? Object.values(obj(o[presets])).reduce<number>((a, p) => a + Object.keys(obj(p)).length, 0) : 0);
  }

  // ---- palette: colour circles (the name is only a tooltip); click one to change it

  private paletteCard(box: HTMLElement): void {
    const t = this.i18n.t;
    const grid = h('div', { class: 'te-palette', role: 'list' });
    const raw = this.raw ?? {};
    const base = this.isBase() ? obj(raw['palette']) : obj(this.parentMerged()?.['palette']);
    const own = obj(raw['palette']);
    const names = [...new Set([...Object.keys(base), ...Object.keys(own)])];
    const refresh = (): void => {
      box.querySelector('.te-palette')?.remove();
      this.paletteCard(box);
      this.disableIfReadOnly(box);
      this.applyDirty();
    };
    for (const name of names) {
      const v = String(own[name] ?? base[name] ?? '');
      const changed = !this.isBase() && own[name] !== undefined;
      const title = changed ? t('te.colorChanged', { name, value: v, base: String(base[name] ?? '') }) : t('te.colorTitle', { name, value: v });
      const ci = h('input', { type: 'color', 'aria-label': title });
      ci.value = isHex(v) ? v : '#000000';
      const dot = h('label', { class: 'te-dot' + (changed ? ' set' : ''), title, role: 'listitem', dataset: { dirty: `palette.${name}` } }, ci);
      dot.style.setProperty('--c', isHex(v) ? v : '#000');
      ci.addEventListener('input', () => {
        if (!this.raw || !this.canEdit()) return;
        if (!isObj(this.raw['palette'])) this.raw['palette'] = {};
        (this.raw['palette'] as Obj)[name] = ci.value;
        dot.style.setProperty('--c', ci.value);
        dot.classList.toggle('set', !this.isBase());
        this.touch();
      });
      if (changed || this.isBase()) {
        const xt = changed ? t('te.colorBack') : t('te.colorRemove');
        const x = h('button', { type: 'button', class: 'te-dot-x', title: xt, 'aria-label': `${xt} (${name})` }, '×');
        x.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (!changed) this.replaceRefs(name, v);
          this.setPath(['palette', name], undefined);
          refresh();
        });
        dot.append(x);
      }
      grid.append(dot);
    }
    if (this.isBase()) {
      // a new colour: pick it, it gets a generated name
      const ci = h('input', { type: 'color', 'aria-label': t('te.addColor') });
      ci.value = '#888888';
      ci.addEventListener('change', () => {
        if (!this.raw) return;
        const pal = obj(this.raw['palette']);
        let n = 1;
        while (pal[`color-${n}`] !== undefined) n++;
        this.setPath(['palette', `color-${n}`], ci.value);
        refresh();
      });
      grid.append(h('label', { class: 'te-dot te-dot-add', title: t('te.addColor'), role: 'listitem' }, icon(ICONS.plus, 16), ci));
    }
    box.append(grid);
  }

  /** A removed palette colour: references to it become its literal value. */
  private replaceRefs(name: string, value: string): void {
    if (!this.raw) return;
    const uses = (v: unknown): v is string => typeof v === 'string' && (v === `@${name}` || v.startsWith(`@${name}~`));
    const walk = (o: Obj): void => {
      for (const [k, v] of Object.entries(o)) {
        if (isObj(v)) walk(v);
        else if (uses(v)) o[k] = resolveColor(v, { [name]: value });
      }
    };
    for (const [k, v] of Object.entries(this.raw)) if (k !== 'palette' && isObj(v)) walk(v);
  }

  // ---- appearance, font & page

  private pageCard(box: HTMLElement): void {
    const t = this.i18n.t;
    const inherited = this.parentMerged();
    const raw = this.raw ?? {};
    // light or dark theme: a label for pickers, not a switch between variants
    const seg = h('div', { class: 'seg small', role: 'radiogroup', 'aria-label': t('te.appearance') });
    const curAp = raw['appearance'] ?? inherited?.['appearance'] ?? 'light';
    for (const v of ['light', 'dark'] as const) {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(curAp === v), class: curAp === v ? 'on' : '' }, v === 'light' ? t('te.light') : t('te.dark'));
      b.addEventListener('click', () => {
        this.setPath(['appearance'], !this.isBase() && inherited?.['appearance'] === v ? undefined : v);
        seg.querySelectorAll('button').forEach((x) => {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-checked', String(x === b));
        });
      });
      seg.append(b);
    }
    box.append(h('div', { class: 'te-f', dataset: { dirty: 'appearance' } }, h('label', null, t('te.appearance')), seg));
    // the linked theme of the other appearance: shown instead of this one when the UI switches light / dark
    const other = curAp === 'dark' ? 'light' : 'dark';
    const link = h('select', { 'aria-label': t('te.counterpart') });
    link.append(new Option(t('te.counterpartNone'), ''));
    for (const [id, e] of this.files) {
      if (id === this.id || !this.reg.has(id) || (this.reg.get(id).appearance === 'dark' ? 'dark' : 'light') !== other) continue;
      link.append(new Option(e.file.name ?? id, id));
    }
    const curLink = typeof raw['counterpart'] === 'string' ? raw['counterpart'] : '';
    if (curLink && !this.files.has(curLink)) link.append(new Option(curLink, curLink));
    link.value = curLink;
    link.addEventListener('change', () => this.setPath(['counterpart'], link.value || undefined));
    const hint = h('div', { class: 'te-hint' }, curLink ? t('te.counterpartHint', { other: t(other === 'dark' ? 'te.dark' : 'te.light') }) : t('te.counterpartMissing'));
    if (!curLink) hint.classList.add('warn');
    box.append(h('div', { class: 'te-f', dataset: { dirty: 'counterpart' } }, h('label', null, t('te.counterpart')), link), hint);
    const sel = h('select', { 'aria-label': t('te.font') });
    const cur = typeof raw['font'] === 'string' ? raw['font'] : undefined;
    if (!this.isBase()) sel.append(new Option(t('te.inheritFont', { name: fontName(inherited?.['font']) }), ''));
    for (const [v, l] of FONTS) sel.append(new Option(l, v));
    if (cur && !FONTS.some(([v]) => v === cur)) sel.append(new Option(fontName(cur), cur));
    sel.value = cur ?? '';
    sel.addEventListener('change', () => this.setPath(['font'], sel.value || undefined));
    box.append(h('div', { class: 'te-f', dataset: { dirty: 'font' } }, h('label', null, t('te.font')), sel));
    const canvas = obj(inherited?.['canvas']);
    this.fieldRow(box, { label: t('te.pageBg'), type: 'color' }, ['canvas', 'background'], canvas['background']);
    this.fieldRow(box, { label: t('te.pageBorder'), type: 'color' }, ['canvas', 'border'], canvas['border']);
    this.fieldRow(box, { label: t('te.grid'), type: 'text' }, ['canvas', 'grid'], canvas['grid']);
  }

  // ---- item styles + presets: preview tiles; click one to style it with the floating toolbar

  private allPresets(type: DiagramType, key: string): Obj {
    return deepMerge(obj(obj(this.parentMerged()?.[type])[key]), obj(obj(this.raw?.[type])[key]));
  }

  private itemCard(box: HTMLElement, type: DiagramType, it: ThemeSectionItem): void {
    const t = this.i18n.t;
    const gallery = h('div', { class: 'te-tiles', role: 'listbox', 'aria-label': this.tf(`te.item.${it.key}`, it.label), dataset: { kind: it.key } });
    const props = h('div', { class: 'te-props' });
    box.append(gallery, props);
    box.dataset['item'] = `${type}.${it.key}`;
    // nodes / participants: one tab per shape; each shape has its own default style and its own presets
    const tabs = SHAPE_TABS[it.key];
    const curShape = (): string => (tabs ? (this.tabShape[it.key] ??= tabs.def) : '');
    const shapesPath = (shape: string): string => `${type}.${tabs?.key ?? ''}.${shape}`;
    const names = (): string[] => {
      if (!it.presets) return [];
      const all = this.allPresets(type, it.presets);
      return Object.keys(all).filter((n) => !tabs || tabs.of(obj(all[n])) === curShape());
    };
    const strip = tabs ? h('div', { class: 'te-shapes', role: 'tablist', 'aria-label': t('tb.shape') }) : null;
    if (strip) box.insertBefore(strip, gallery);
    const selFor = (preset: string | null): TileSel => {
      const s: TileSel = { type, kind: it.key, preset, fields: it.fields, props };
      if (it.presets) s.presets = it.presets;
      if (tabs) {
        s.shape = curShape();
        s.shapesKey = tabs.key;
      }
      return s;
    };
    const renderStrip = (): void => {
      if (!strip || !tabs) return;
      strip.replaceChildren();
      const ps = it.presets ? this.allPresets(type, it.presets) : {};
      for (const [shape, label0] of tabs.shapes) {
        const label = this.tf(`te.shape.${shape}`, label0);
        const mine = Object.keys(ps).filter((n) => tabs.of(obj(ps[n])) === shape);
        const title = mine.length ? t('te.shapePresets', { label, n: mine.length }) : label;
        const on = shape === curShape();
        const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(on), class: 'te-shape' + (on ? ' on' : ''), title, 'aria-label': title,
          dataset: { dirty: [shapesPath(shape), ...mine.map((n) => `${type}.${it.presets}.${n}`)].join('|') } },
        shapePreview(shape, 22), h('span', { class: 'te-shape-n', 'aria-hidden': 'true' }, mine.length ? String(mine.length) : ''));
        b.addEventListener('click', () => {
          this.tabShape[it.key] = shape;
          this.selectTile(null);
          rebuild();
        });
        strip.append(b);
      }
    };
    const shapeLabel = (): string => {
      const s = curShape();
      return this.tf(`te.shape.${s}`, tabs?.shapes.find(([k]) => k === s)?.[1] ?? s);
    };
    const tile = (preset: string | null): HTMLElement => {
      const s = selFor(preset);
      const dirty = preset === null ? (tabs ? shapesPath(curShape()) : `${type}.${it.key}`) : `${type}.${it.presets}.${preset}`;
      const pic = h('div', { class: 'te-tile-pic', 'aria-hidden': 'true' });
      const capText = preset ?? (tabs ? t('te.shapeDefault', { shape: shapeLabel() }) : t('te.default'));
      const cap = h('div', { class: 'te-tile-cap' }, capText);
      const rawT = obj(this.raw?.[type]);
      if (preset !== null && !this.isBase() && Object.keys(obj(obj(rawT[it.presets ?? ''])[preset])).length) cap.append(h('span', { class: 'te-dotmark', 'aria-hidden': 'true' }));
      if (preset === null && Object.keys(obj(tabs ? obj(rawT[tabs.key])[curShape()] : rawT[it.key])).length && (!this.isBase() || tabs)) cap.append(h('span', { class: 'te-dotmark', 'aria-hidden': 'true' }));
      // WCAG AA: text colour on the fill
      const warn = this.contrastWarning(s);
      if (warn) cap.append(h('span', { class: 'te-warn', title: warn, 'aria-label': warn }, '⚠ AA'));
      const el = h('div', { class: 'te-tile', role: 'option', tabindex: '0', 'aria-selected': 'false', 'aria-label': warn ? `${capText}. ${warn}` : capText,
        dataset: { type, kind: it.key, preset: preset ?? '', shape: tabs ? curShape() : '', dirty } }, pic, cap);
      if (preset !== null && it.presets && !obj(obj(this.parentMerged()?.[type])[it.presets])[preset]) {
        const del = h('button', { type: 'button', class: 'te-tile-del', title: t('te.deletePreset'), 'aria-label': `${t('te.deletePreset')} (${preset})` }, '×');
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          void this.dialogs.confirm(t('te.deletePresetQ', { name: preset }), '', { ok: t('te.delete'), cancel: t('te.cancel'), danger: true }).then((ok) => {
            if (!ok) return;
            this.selectTile(null);
            this.setPath([type, it.presets!, preset], undefined);
            this.flush();
            rebuild();
          });
        });
        el.append(del);
      }
      const pick = (): void => this.selectTile(s);
      el.addEventListener('click', pick);
      el.addEventListener('keydown', (ev) => {
        if (ev.target === el && (ev.key === 'Enter' || ev.key === ' ')) {
          ev.preventDefault();
          pick();
        }
      });
      return el;
    };
    const rebuild = (): void => this.keepTileFocus(gallery, () => {
      gallery.replaceChildren();
      renderStrip();
      gallery.append(tile(null));
      for (const n of names()) gallery.append(tile(n));
      // drawn once in the page: the crop needs the tile width and the item's measured box
      gallery.querySelectorAll<HTMLElement>('.te-tile').forEach((tl) => {
        const pic = tl.querySelector<HTMLElement>('.te-tile-pic');
        if (pic) this.drawTile(pic, gallery, tl.dataset['kind'] ?? it.key, tl.dataset['preset'] || null, tl.dataset['shape'] || undefined);
      });
      if (it.presets) {
        const add = h('button', { type: 'button', class: 'te-tile te-tile-add', title: t('te.addPresetTitle') }, t('te.addPreset'));
        add.disabled = !this.canEdit();
        add.addEventListener('click', () => void this.addPreset(type, it, curShape(), tabs, names(), rebuild, selFor));
        gallery.append(add);
      }
      this.markSelected();
      this.applyDirty();
    });
    this.rebuilds.set(box, rebuild);
    rebuild();
    this.observeWidth(gallery, rebuild);
  }

  private async addPreset(type: DiagramType, it: ThemeSectionItem, shape: string, tabs: ShapeTabs | undefined, existing: readonly string[], rebuild: () => void, selFor: (p: string | null) => TileSel): Promise<void> {
    const t = this.i18n.t;
    const all = it.presets ? Object.keys(this.allPresets(type, it.presets)) : existing;
    const raw = await this.dialogs.prompt(t('te.presetName'), { label: t('te.presetName'), ok: t('te.addPreset').replace(/^\+\s*/, ''), validate: (v) => (all.includes(slug(v)) ? t('te.presetExists') : null) });
    const n = slug(raw ?? '');
    if (!raw || !n || n === 'theme' || all.includes(n) || !it.presets) return;
    // a node / participant preset belongs to the shape tab it was added on
    this.setPath([type, it.presets, n], LINE_KINDS.has(it.key) ? { color: '@azure' } : tabs ? { fill: '@cream', for: shape } : { fill: '@cream' });
    this.flush();
    rebuild();
    this.selectTile(selFor(n));
  }

  /** Tile widths follow the panel width: redraw the crops when they change. */
  private observeWidth(gallery: HTMLElement, rebuild: () => void): void {
    if (typeof ResizeObserver === 'undefined') return;
    let lastW = 0;
    let rt: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      const w = gallery.clientWidth;
      if (!w || Math.abs(w - lastW) < 4) return;
      const first = !lastW;
      lastW = w;
      clearTimeout(rt);
      if (!first) rt = setTimeout(rebuild, 120);
      else rebuild();
    });
    ro.observe(gallery);
    this.observers.push(ro);
  }

  // tiles are drawn with the real renderer at real size × the preview zoom (ui/item-preview)
  private drawTile(pic: HTMLElement, gallery: HTMLElement, kind: string, preset: string | null, shape: string | undefined): void {
    const th = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(gallery).getPropertyValue('--th')) : NaN;
    const opts: Parameters<typeof drawItemPreview>[4] = { zoom: this.zoom, minH: Number.isFinite(th) && th > 0 ? th : 90, ctx: this.ctx };
    if (shape) opts.shape = shape;
    drawItemPreview(pic, kind as PreviewKind, preset, this.draft(), opts);
  }

  private refreshTiles(): void {
    for (const r of this.rebuilds.values()) r();
    if (!this.sel) return;
    // while one of the toolbar's popovers is open (a slider is being dragged) only move the toolbar: rebuilding it
    // would replace the control in the user's hand
    if (this.toolbar.isOpen()) this.toolbar.place();
    else this.toolbar.refresh();
    this.renderProps();
  }

  private selectTile(sel: TileSel | null): void {
    this.sel = sel;
    this.markSelected();
    this.main.querySelectorAll<HTMLElement>('.te-props').forEach((p) => {
      if (!sel || p !== sel.props) p.replaceChildren();
    });
    if (sel) {
      this.showPreview(sel.type);
      this.renderProps();
    } else if (this.viewer) this.drawPreview();
    this.toolbar.refresh();
  }

  private markSelected(): void {
    const s = this.sel;
    this.main.querySelectorAll<HTMLElement>('.te-tile[data-type]').forEach((tl) => {
      const on = !!s && tl.dataset['type'] === s.type && tl.dataset['kind'] === s.kind && tl.dataset['preset'] === (s.preset ?? '') && (tl.dataset['shape'] ?? '') === (s.shape ?? '');
      tl.classList.toggle('on', on);
      tl.setAttribute('aria-selected', String(on));
    });
  }

  /** Everything the toolbar does not cover, for the selected tile. */
  private renderProps(): void {
    const sel = this.sel;
    if (!sel) return;
    const t = this.i18n.t;
    const p = sel.props;
    p.replaceChildren();
    const d = h('details', { class: 'te-allprops' });
    d.open = this.propsOpen || sel.kind === 'page';
    d.addEventListener('toggle', () => {
      if (sel.kind !== 'page') this.propsOpen = d.open;
    });
    const what = sel.preset ?? (sel.shape ? t('te.shapeDefault', { shape: sel.shape }) : t('te.default'));
    d.append(h('summary', null, t('te.allProps', { name: what })));
    if (sel.kind === 'page') this.pageFields(d, sel);
    else this.styleFields(d, sel);
    p.append(d);
    this.disableIfReadOnly(p);
    this.renderErrors();
    this.applyDirty();
  }

  private styleFields(d: HTMLElement, sel: TileSel): void {
    const inherited = obj(this.parentMerged()?.[sel.type]);
    // a node's base: the common node style + its shape's default (in the baseline: as edited)
    const own = obj(this.raw?.[sel.type]);
    const SK = sel.shapesKey ?? '';
    const shapeBase = sel.shape ? (this.isBase() ? { ...obj(own[sel.kind]) } : deepMerge(obj(inherited[sel.kind]), obj(obj(inherited[SK])[sel.shape]))) : {};
    for (const f of sel.fields) {
      const def = FIELD_DEFS[f];
      if (!def) continue;
      const k = def.key ?? f;
      const label = this.tf(`field.${f}`, def.label);
      const ldef: LocalField = { ...def, label };
      if (sel.preset === null && sel.shape) {
        if (k === 'shape') continue;
        this.fieldRow(d, ldef, [sel.type, SK, sel.shape, k], shapeBase[k], true);
      } else if (sel.preset === null) this.fieldRow(d, ldef, [sel.type, sel.kind, k], obj(inherited[sel.kind])[k]);
      else {
        const shapeDef = sel.shape ? (this.isBase() ? obj(obj(own[SK])[sel.shape]) : deepMerge(obj(obj(inherited[SK])[sel.shape]), obj(obj(own[SK])[sel.shape]))) : {};
        const base = this.isBase()
          ? { ...obj(own[sel.kind]), ...shapeDef }[k]
          : deepMerge(deepMerge(obj(inherited[sel.kind]), shapeDef), obj(obj(inherited[sel.presets ?? ''])[sel.preset]))[k];
        this.fieldRow(d, ldef, [sel.type, sel.presets ?? '', sel.preset, k], base, this.isBase());
      }
    }
  }

  // ---- page presets (§8.3 production addition): <type>.pagePresets

  private pagePresetsCard(box: HTMLElement, type: DiagramType): void {
    const t = this.i18n.t;
    const gallery = h('div', { class: 'te-tiles', role: 'listbox', 'aria-label': t('te.pageCard'), dataset: { kind: 'page' } });
    const props = h('div', { class: 'te-props' });
    box.append(gallery, props);
    box.dataset['item'] = `${type}.pagePresets`;
    const selFor = (name: string): TileSel => ({ type, kind: 'page', presets: 'pagePresets', preset: name, fields: [], props });
    const rebuild = (): void => this.keepTileFocus(gallery, () => {
      gallery.replaceChildren();
      const all = this.allPresets(type, 'pagePresets');
      const d = this.draft();
      const color = (v: unknown): string | null => {
        const r = resolveColor(v, d.palette, d.basePalette);
        return isColorLiteral(r) && r !== 'none' && r !== 'transparent' ? r : null;
      };
      for (const [name, p0] of Object.entries(all)) {
        const p = obj(p0);
        const label = typeof p['label'] === 'string' && p['label'] ? p['label'] : name;
        const bg = color(p['background'] ?? d.canvas.background), grid = color(p['grid'] ?? d.canvas.grid), border = color(p['border'] ?? d.canvas.border);
        const pic = h('div', { class: 'te-page-pic' + (bg ? '' : ' clear'), 'aria-hidden': 'true' });
        if (bg) pic.style.setProperty('--pg-bg', bg);
        if (grid) pic.style.setProperty('--pg-grid', grid);
        if (border) pic.style.setProperty('--pg-border', border);
        const facts = [typeof p['ratio'] === 'string' ? p['ratio'] : '', typeof p['routing'] === 'string' ? this.tf(`ptb.routing.${p['routing']}`, String(p['routing'])) : '', p['mirror'] === true ? '⇅' : ''].filter(Boolean).join(' · ');
        if (facts) pic.append(h('span', null, facts));
        const cap = h('div', { class: 'te-tile-cap' }, label);
        if (!this.isBase() && Object.keys(obj(obj(obj(this.raw?.[type])['pagePresets'])[name])).length) cap.append(h('span', { class: 'te-dotmark', 'aria-hidden': 'true' }));
        const el = h('div', { class: 'te-tile', role: 'option', tabindex: '0', 'aria-selected': 'false', 'aria-label': label,
          dataset: { type, kind: 'page', preset: name, shape: '', dirty: `${type}.pagePresets.${name}` } }, pic, cap);
        if (!obj(obj(this.parentMerged()?.[type])['pagePresets'])[name]) {
          const del = h('button', { type: 'button', class: 'te-tile-del', title: t('te.deletePreset'), 'aria-label': `${t('te.deletePreset')} (${label})` }, '×');
          del.addEventListener('click', (ev) => {
            ev.stopPropagation();
            void this.dialogs.confirm(t('te.deletePresetQ', { name: label }), '', { ok: t('te.delete'), cancel: t('te.cancel'), danger: true }).then((ok) => {
              if (!ok) return;
              this.selectTile(null);
              this.setPath([type, 'pagePresets', name], undefined);
              this.flush();
              rebuild();
            });
          });
          el.append(del);
        }
        const pick = (): void => this.selectTile(selFor(name));
        el.addEventListener('click', pick);
        el.addEventListener('keydown', (ev) => {
          if (ev.target === el && (ev.key === 'Enter' || ev.key === ' ')) {
            ev.preventDefault();
            pick();
          }
        });
        gallery.append(el);
      }
      const add = h('button', { type: 'button', class: 'te-tile te-tile-add', title: t('te.pagePresetName') }, t('te.addPreset'));
      add.disabled = !this.canEdit();
      add.addEventListener('click', () => void (async () => {
        const names = Object.keys(this.allPresets(type, 'pagePresets'));
        const label = await this.dialogs.prompt(t('te.pagePresetName'), { label: t('te.pagePresetName'), validate: (v) => (names.includes(slug(v)) ? t('te.presetExists') : null) });
        const n = slug(label ?? '');
        if (!label || !n || names.includes(n)) return;
        this.setPath([type, 'pagePresets', n], { label });
        this.flush();
        rebuild();
        this.selectTile(selFor(n));
      })());
      gallery.append(add);
      this.markSelected();
      this.applyDirty();
    });
    this.rebuilds.set(box, rebuild);
    rebuild();
  }

  /** Redrawing a gallery keeps keyboard focus on the same tile (shortcuts are scoped to the focused component). */
  private keepTileFocus(gallery: HTMLElement, rebuild: () => void): void {
    const a = this.shadow.activeElement;
    const tile = a && gallery.contains(a) ? a.closest<HTMLElement>('.te-tile') : null;
    const key = tile ? `${tile.dataset['kind'] ?? ''}|${tile.dataset['preset'] ?? ''}|${tile.dataset['shape'] ?? ''}` : null;
    rebuild();
    if (key === null) return;
    const next = Array.from(gallery.querySelectorAll<HTMLElement>('.te-tile[data-kind]')).find((x) => `${x.dataset['kind'] ?? ''}|${x.dataset['preset'] ?? ''}|${x.dataset['shape'] ?? ''}` === key);
    (next ?? this.dlg).focus({ preventScroll: true });
  }

  private pageFields(d: HTMLElement, sel: TileSel): void {
    const t = this.i18n.t;
    const name = sel.preset ?? '';
    const inherited = obj(obj(obj(this.parentMerged()?.[sel.type])['pagePresets'])[name]);
    const path = (k: string): string[] => [sel.type, 'pagePresets', name, k];
    const row = (k: string, def: LocalField): void => this.fieldRow(d, def, path(k), inherited[k], true);
    row('label', { label: t('te.ppLabel'), type: 'text' });
    row('background', { label: t('te.ppBackground'), type: 'color' });
    row('grid', { label: t('te.ppGrid'), type: 'text' });
    row('border', { label: t('te.ppBorder'), type: 'color' });
    if (sel.type !== 'sequence') row('routing', { label: t('te.ppRouting'), type: 'select', options: ROUTINGS.map((r) => [r, this.tf(`ptb.routing.${r}`, r)] as const) });
    row('ratio', { label: t('te.ppRatio'), type: 'select', options: [['free', t('te.ppFree')], ...RATIOS.map((r) => [r, r] as const)] });
    row('pad', { label: t('te.ppPad'), type: 'number' });
    if (sel.type === 'sequence') {
      row('gap', { label: t('te.ppGap'), type: 'number' });
      row('rowH', { label: t('te.ppRowH'), type: 'number' });
      row('mirror', { label: t('te.ppMirror'), type: 'bool' });
    }
  }

  // ---- contrast (§8.3: WCAG AA warning per preset tile)

  private effectiveFor(s: TileSel): Obj {
    const all = this.isBase() ? obj(this.raw) : deepMerge(this.parentMerged(), this.raw);
    const tt = obj(all[s.type]);
    const shapeDef = s.shape && s.shapesKey ? obj(obj(tt[s.shapesKey])[s.shape]) : {};
    const base = { ...obj(tt[s.kind]), ...shapeDef };
    return s.preset === null ? base : { ...base, ...obj(obj(tt[s.presets ?? ''])[s.preset]) };
  }

  private contrastWarning(s: TileSel): string | null {
    const key = TEXT_ON_FILL[s.kind];
    if (!key) return null;
    const st = this.effectiveFor(s);
    if (st[key] === undefined) return null;
    const text = this.show(st[key]);
    let fill = st['fill'] === undefined ? '' : this.show(st['fill']);
    if (!fill || fill === 'none' || fill === 'transparent') {
      const d = this.draft();
      fill = this.show(d.canvas.background && d.canvas.background !== 'none' && d.canvas.background !== 'transparent' ? d.canvas.background : d.palette['paper'] ?? '#ffffff');
    }
    const r = contrastRatio(text, fill);
    return r !== null && r < 4.5 ? this.i18n.t('te.lowContrast', { ratio: (Math.floor(r * 10) / 10).toFixed(1) }) : null;
  }

  // ---- what the toolbar edits: the selected tile's style in the theme being edited
  // a shape's default lives in <type>.<shapesKey>.<shape> (flowchart.nodeShapes, sequence.participantShapes);
  // everything else in <type>.<kind> / <type>.<presets>.<name>

  private stylePath(): string[] {
    const s = this.sel!;
    return s.preset === null ? (s.shape ? [s.type, s.shapesKey ?? '', s.shape] : [s.type, s.kind]) : [s.type, s.presets ?? '', s.preset];
  }

  private styleApi(): ToolbarApi {
    const pal = (): Record<string, string> => ({ ...this.paletteNow(), ...(obj(this.raw?.['palette']) as Record<string, string>) });
    const font = (): string => String((this.isBase() ? this.raw?.['font'] : this.raw?.['font'] ?? this.parentMerged()?.['font']) ?? '');
    return {
      selection: () => (this.sel && this.sel.kind !== 'page' ? { kind: this.sel.kind, id: this.sel.preset ?? '' } : null),
      editable: () => this.canEdit(),
      multiCount: () => 1,
      diagramType: () => this.sel?.type,
      eff: (k) => {
        const v = this.sel ? this.effectiveFor(this.sel)[k] : undefined;
        return typeof v === 'string' ? this.show(v) : v;
      },
      effRaw: (k) => (this.sel ? this.effectiveFor(this.sel)[k] : undefined),
      set: (k, v) => {
        if (!this.sel) return;
        const entries = typeof k === 'string' ? [[k, v] as const] : Object.entries(k);
        for (const [key, val] of entries) {
          if (key === 'shape' && this.sel.shape && this.sel.preset === null) continue; // a shape's default keeps its shape
          this.setPath([...this.stylePath(), key], val === null ? undefined : val);
        }
        // tiles and preview redraw after a short pause, so dragging a slider is not interrupted; releasing it ends the
        // undo step at once (commit)
      },
      commit: () => this.endGroup(),
      canReset: () => {
        const own = getPath(this.raw, this.stylePath());
        return isObj(own) && Object.keys(own).length > 0 && !(this.isBase() && this.sel?.preset === null && !this.sel?.shape);
      },
      // a theme drops its overrides; a baseline preset is emptied (it then looks like the default style)
      reset: () => {
        if (!this.sel || (this.isBase() && this.sel.preset === null && !this.sel.shape)) return;
        this.setPath(this.stylePath(), this.isBase() && this.sel.preset !== null ? {} : undefined);
        this.flush();
        this.toolbar.refresh();
      },
      palette: () => Object.entries(pal()).map(([name, value]) => ({ name, value: String(value) })),
      customColor: (hex) => relativeColor(hex, pal()),
      themeFont: font,
      themeFontName: () => fontName(font()),
      edgeEnds: () => ({ start: 'none', end: this.sel && this.effectiveFor(this.sel)['arrow'] === 'none' ? 'none' : 'arrow' }),
      anchorRect: (): Rect | null => {
        const tl = this.main.querySelector('.te-tile.on');
        if (!tl) return null;
        const r = tl.getBoundingClientRect(), b = this.body.getBoundingClientRect(), m = this.main.getBoundingClientRect();
        if (m.height && (r.bottom < m.top || r.top > m.bottom)) return null;
        return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
      },
      inspect: () => {
        const det = this.sel?.props.querySelector('details');
        if (det) det.open = true;
      },
    };
  }

  // One property. In the baseline every value is the theme's own; in a theme, an empty field inherits.
  // presetOfBase: a baseline preset field, which inherits from the baseline item style.
  private fieldRow(host: HTMLElement, def: LocalField, path: readonly string[], inherited: unknown, presetOfBase = false): void {
    const t = this.i18n.t;
    const row = h('div', { class: 'te-f', dataset: { dirty: path.join('.') } });
    const own = (): unknown => getPath(this.raw, path);
    const inheritable = !this.isBase() || presetOfBase;
    row.classList.toggle('set', inheritable && own() !== undefined);
    const id = `te-f-${this.ctx.idPrefix}${path.join('-').replace(/[^\w-]/g, '_')}`;
    row.append(h('label', { for: id }, def.label));
    const ctl = h('div', { class: 'te-ctl' });
    const set = (v: unknown): void => {
      this.setPath(path, v);
      row.classList.toggle('set', inheritable && v !== undefined);
    };
    const cur = (): unknown => own() ?? inherited;
    const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
    if (def.type === 'color') this.colorControl(ctl, id, def.label, cur, own, set, inheritable);
    else if (def.type === 'number' || def.type === 'text') {
      const n = h('input', { id, type: def.type === 'number' ? 'number' : 'text' });
      if (def.step) n.step = String(def.step);
      n.value = str(own());
      n.placeholder = inherited !== undefined && inherited !== null ? String(inherited) : '';
      n.addEventListener('change', () => set(n.value === '' ? undefined : def.type === 'number' ? Number(n.value) : n.value));
      ctl.append(n);
    } else if (def.type === 'range') {
      const r = h('input', { id, type: 'range', min: String(def.min ?? 0), max: String(def.max ?? 1), step: String(def.step ?? 0.01) });
      const c = Number(cur());
      r.value = String(Number.isFinite(c) && cur() !== undefined ? c : ((def.min ?? 0) + (def.max ?? 1)) / 2);
      r.addEventListener('input', () => set(Number(r.value)));
      r.addEventListener('change', () => this.endGroup());
      ctl.append(r);
    } else if (def.type === 'bool' || def.type === 'toggle') {
      // a switch showing the effective value; dimmed while it is inherited
      const sw = h('input', { id, class: 'toggle', type: 'checkbox', role: 'switch' });
      sw.checked = !!cur();
      const inh = inheritable && own() === undefined;
      sw.classList.toggle('inherited', inh);
      sw.title = inh ? t('te.inheritedV', { v: inherited ? t('te.yes') : t('te.no') }) : '';
      sw.addEventListener('change', () => {
        set(sw.checked);
        sw.classList.remove('inherited');
        sw.title = '';
      });
      ctl.append(sw);
    } else {
      const s = h('select', { id });
      const opts = (def.options ?? []).map((o): readonly [string, string] => (typeof o === 'string' ? [o, o] : o));
      const label = (v: unknown): string => opts.find((o) => o[0] === String(v))?.[1] ?? String(v);
      if (inheritable) s.append(new Option(inherited !== undefined ? t('te.inheritOptV', { v: label(inherited) }) : t('te.inheritOpt'), '__inherit'));
      for (const [v, l] of opts) s.append(new Option(l, v));
      s.value = own() !== undefined ? String(own()) : inheritable ? '__inherit' : String(inherited ?? optionValue(opts[0] ?? ''));
      s.addEventListener('change', () => {
        if (s.value === '__inherit') return set(undefined);
        // stored as the theme files store them: booleans and numbers, not their text
        const v = s.value === 'true' ? true : s.value === 'false' ? false : /^\d+(\.\d+)?$/.test(s.value) ? Number(s.value) : s.value;
        set(v);
      });
      ctl.append(s);
    }
    if (inheritable) {
      const r = h('button', { type: 'button', class: 'te-reset', title: t('te.inherit'), 'aria-label': `${t('te.inherit')}: ${def.label}` }, '×');
      r.addEventListener('click', () => {
        set(undefined);
        const fresh = h('div');
        this.fieldRow(fresh, def, path, inherited, presetOfBase);
        const next = fresh.firstElementChild;
        if (next) row.replaceWith(next);
        this.disableIfReadOnly(next as HTMLElement);
        this.applyDirty();
      });
      ctl.append(r);
    }
    row.append(ctl);
    host.append(row);
  }

  // colour: a palette colour (stored "@name"), a literal colour, none / transparent
  private colorControl(ctl: HTMLElement, id: string, field: string, cur: () => unknown, own: () => unknown, set: (v: unknown) => void, inheritable: boolean): void {
    const t = this.i18n.t;
    const chip = h('button', { id, type: 'button', class: 'te-chip', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': t('te.chooseColor', { field }) });
    const label = h('span', { class: 'te-chip-label' });
    const paint = (): void => {
      const v = cur();
      const c = this.show(v);
      if (!v || v === 'none' || v === 'transparent' || !isColorLiteral(c)) chip.style.background = 'repeating-linear-gradient(45deg,#fff 0 4px,#eee 4px 8px)';
      else chip.style.background = c;
      label.textContent = v === undefined || v === null ? '—' : typeof v === 'string' && v[0] === '@' ? v.slice(1) : String(v);
      label.classList.toggle('inherited', inheritable && own() === undefined);
    };
    chip.addEventListener('click', (ev) => {
      ev.preventDefault();
      const pop = h('div', { class: 'te-pop', role: 'dialog', 'aria-label': t('te.chooseColor', { field }) });
      const grid = h('div', { class: 'te-pop-grid', role: 'group', 'aria-label': t('te.paletteTitle') });
      for (const [name, value] of Object.entries(this.paletteNow())) {
        const on = cur() === `@${name}`;
        const b = h('button', { type: 'button', class: 'te-pop-sw' + (on ? ' on' : ''), title: name, 'aria-label': name, 'aria-pressed': String(on) });
        b.style.background = value;
        b.addEventListener('click', () => {
          set(`@${name}`);
          paint();
          this.pops.close(true);
        });
        grid.append(b);
      }
      const ci = h('input', { type: 'color', 'aria-label': t('te.custom') });
      const shown = this.show(cur());
      ci.value = isHex(shown) ? shown : '#888888';
      ci.addEventListener('change', () => {
        set(ci.value);
        paint();
      });
      const none = h('button', { type: 'button', class: 'small' }, t('te.none'));
      none.addEventListener('click', () => {
        set('none');
        paint();
        this.pops.close(true);
      });
      pop.append(h('div', { class: 'te-pop-title' }, t('te.paletteTitle')), grid, h('div', { class: 'te-pop-row' }, ci, h('span', null, t('te.custom')), none));
      this.pops.open(pop, chip);
      const r = chip.getBoundingClientRect();
      const vw = typeof innerWidth === 'number' ? innerWidth : 1024, vh = typeof innerHeight === 'number' ? innerHeight : 768;
      pop.style.left = `${Math.max(8, Math.min(r.left, vw - 250))}px`;
      pop.style.top = `${Math.max(8, Math.min(r.bottom + 4, vh - pop.offsetHeight - 8))}px`;
    });
    paint();
    ctl.append(chip, label);
  }

  // ---- live preview: a sample diagram drawn with the draft; its Mermaid can be edited (Code) ---------------------

  private ensureViewer(): NonNullable<ThemeEditor['viewer']> {
    if (this.viewer) return this.viewer;
    const t = this.i18n.t;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'vw-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('te.samplePreview'));
    const defs = document.createElementNS(NS, 'defs');
    const vp = document.createElementNS(NS, 'g');
    const page = document.createElementNS(NS, 'g');
    const body = document.createElementNS(NS, 'g');
    vp.append(page, body);
    svg.append(defs, vp);
    const pct = h('output', null, '100%');
    const viewport = new Viewport(svg, {
      wheel: 'always',
      panOnDrag: true,
      onChange: (v) => {
        vp.setAttribute('transform', `translate(${v.tx},${v.ty}) scale(${v.k})`);
        pct.textContent = `${Math.round(v.k * 100)}%`;
      },
    });
    const mid = (): [number, number] => [viewport.size.w / 2, viewport.size.h / 2];
    const zoomBar = h('div', { class: 'vw-zoom ds-float', role: 'toolbar', 'aria-label': t('te.preview') },
      h('button', { type: 'button', title: t('zoom.out'), 'aria-label': t('zoom.out'), onclick: () => viewport.zoomAt(1 / 1.2, ...mid()) }, '−'),
      pct,
      h('button', { type: 'button', title: t('zoom.in'), 'aria-label': t('zoom.in'), onclick: () => viewport.zoomAt(1.2, ...mid()) }, '+'),
      h('button', { type: 'button', title: t('zoom.fit'), onclick: () => viewport.fit() }, t('zoom.fitShort')));
    svg.addEventListener('dblclick', () => viewport.fit(), { signal: this.ac.signal });
    const box = h('div', { class: 'te-pbox' }, svg, zoomBar);
    this.viewer = { box, svg, defs, vp, page, body, viewport, pct };
    return this.viewer;
  }

  private drawPreview(): void {
    if (!this.raw) return;
    const t = this.i18n.t;
    const v = this.ensureViewer();
    // keep the code box (and its caret) while it is being typed in
    const keepCode = this.side.querySelector<HTMLTextAreaElement>('.te-code');
    const typing = !!keepCode && this.shadow.activeElement === keepCode && this.showCode;
    const err = h('div', { class: 'te-hint te-perr', role: 'alert' });
    if (!typing) {
      this.side.replaceChildren();
      const tabs = h('div', { class: 'te-ptabs', role: 'tablist', 'aria-label': t('te.samplePreview') });
      for (const type of TYPES) {
        const on = type === this.preview;
        tabs.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(on), class: on ? 'on' : '', onclick: () => {
          this.preview = type;
          this.refit = true;
          this.drawPreview();
        } }, t(`te.${type}`)));
      }
      const codeBtn = h('button', { type: 'button', class: 'te-codebtn' + (this.showCode ? ' on' : ''), title: t('te.codeTitle'), 'aria-pressed': String(this.showCode), onclick: () => {
        this.showCode = !this.showCode;
        this.drawPreview();
      } }, t('te.code'));
      this.side.append(h('div', { class: 'te-phead' }, tabs, codeBtn));
      if (this.showCode) {
        const ta = h('textarea', { class: 'te-code', spellcheck: false, 'aria-label': t('te.sampleCode') });
        ta.value = this.sample(this.preview);
        const reset = h('button', { type: 'button', class: 'link' }, t('te.resetSample'));
        reset.hidden = this.samples[this.preview] === undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        ta.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            const type = this.preview;
            const def = this.o.samples?.[type] ?? DEFAULT_SAMPLES[type];
            if (ta.value.trim() === def.trim()) delete this.samples[type];
            else this.samples[type] = ta.value;
            this.storage.set('teSamples', this.samples);
            reset.hidden = this.samples[type] === undefined;
            this.paint(err);
          }, 200);
        });
        // typing here is not a shortcut, except Esc / ⌘S / ⌘Z handled by the registry (inText)
        reset.addEventListener('click', () => {
          delete this.samples[this.preview];
          this.storage.set('teSamples', this.samples);
          this.drawPreview();
        });
        this.side.append(ta, reset);
      }
      this.side.append(err, v.box, h('div', { class: 'te-hint' }, t('te.previewHint')));
    } else {
      const old = this.side.querySelector('.te-perr');
      if (old) old.replaceWith(err);
    }
    this.paint(err);
  }

  private paint(err: HTMLElement): void {
    const v = this.ensureViewer();
    const t = this.i18n.t;
    try {
      const T = this.draft();
      const src = this.sample(this.preview);
      const { doc } = splitSource(src);
      const model = parse(doc.code);
      if (!model.type) throw new Error(model.diagnostics.find((d) => d.severity === 'error')?.message ?? t('te.notDiagram'));
      const meta = { ...doc.meta, canvas: { ...doc.meta.canvas } };
      delete meta.canvas.theme;
      // a selected page preset: the sample on that page
      if (this.sel?.kind === 'page' && this.sel.preset && this.sel.type === this.preview) meta.canvas.preset = this.sel.preset;
      const rctx = renderContext(this.ctx, T, { code: doc.code, meta });
      const res = render(model, meta, T, rctx);
      patchChildren(v.defs, res.defs);
      patchChildren(v.page, pageScene(res, rctx));
      patchChildren(v.body, res.body);
      v.viewport.setBounds(res.bounds, { fit: this.refit });
      this.refit = false;
      err.textContent = '';
    } catch (e) {
      err.textContent = t('te.previewErr', { msg: e instanceof Error ? e.message : String(e) });
    }
  }
}

const diagText = (d: Diagnostic): string => d.message;

// ---- custom element ------------------------------------------------------------------------------------------------

export class MmdxThemeEditorElement extends ElementBase {
  static observedAttributes = ['theme', 'can-edit', 'can-publish', 'can-delete', 'presentation', 'ui', 'samples'];
  private editor: ThemeEditor | null = null;
  private pending: ThemeEditorOptions = {};

  connectedCallback(): void {
    this.editor = new ThemeEditor(this, { ...this.attrOptions(), ...this.pending });
  }

  disconnectedCallback(): void {
    this.editor?.destroy();
    this.editor = null;
  }

  attributeChangedCallback(): void {
    this.editor?.set(this.attrOptions());
  }

  private attrOptions(): ThemeEditorOptions {
    const o: ThemeEditorOptions = {};
    const a = (n: string): string | null => this.getAttribute(n);
    const bool = (n: string): boolean | undefined => (this.hasAttribute(n) ? a(n) !== 'false' : undefined);
    const theme = a('theme');
    if (theme) o.theme = theme;
    const ce = bool('can-edit'), cp = bool('can-publish'), cd = bool('can-delete');
    if (ce !== undefined) o.canEdit = ce;
    if (cp !== undefined) o.canPublish = cp;
    if (cd !== undefined) o.canDelete = cd;
    const pres = a('presentation');
    if (pres === 'dialog' || pres === 'inline') o.presentation = pres;
    const ui = a('ui');
    if (ui === 'light' || ui === 'dark' || ui === 'auto') o.ui = ui;
    const samples = a('samples');
    if (samples) {
      try {
        const s = JSON.parse(samples) as unknown;
        if (isObj(s)) {
          const out: ThemeSamples = {};
          for (const k of TYPES) if (typeof s[k] === 'string') out[k] = s[k] as string;
          o.samples = out;
        }
      } catch {
        // not JSON: ignored (set the `samples` property instead)
      }
    }
    return o;
  }

  private setOpt(patch: Partial<ThemeEditorOptions>): void {
    if (this.editor) this.editor.set(patch);
    else Object.assign(this.pending, patch);
  }

  /** The imperative editor (null while disconnected). */
  get instance(): ThemeEditor | null {
    return this.editor;
  }
  get store(): ThemeStore | undefined {
    return this.editor?.options.store ?? this.pending.store;
  }
  set store(v: ThemeStore | undefined) {
    if (v) this.setOpt({ store: v });
  }
  get source(): ThemeSource | undefined {
    return this.editor?.options.source ?? this.pending.source;
  }
  set source(v: ThemeSource | undefined) {
    if (v) this.setOpt({ source: v });
  }
  set storage(v: StorageAdapter) {
    this.setOpt({ storage: v });
  }
  get samples(): ThemeSamples | undefined {
    return this.editor?.options.samples ?? this.pending.samples;
  }
  set samples(v: ThemeSamples | undefined) {
    if (v) this.setOpt({ samples: v });
  }
  get theme(): string {
    return this.editor?.themeId ?? this.getAttribute('theme') ?? BASELINE;
  }
  set theme(v: string) {
    this.setAttribute('theme', v);
  }
  /** True while the open theme has unsaved changes. */
  get dirty(): boolean {
    return this.editor?.dirty ?? false;
  }
  /** Resolves when the theme list is loaded. */
  get ready(): Promise<void> {
    return this.editor?.ready ?? Promise.resolve();
  }
  save(): Promise<boolean> {
    return this.editor?.save() ?? Promise.resolve(false);
  }
  select(id: string): Promise<boolean> {
    return this.editor?.select(id) ?? Promise.resolve(false);
  }
  undo(): void {
    this.editor?.undo();
  }
  redo(): void {
    this.editor?.redo();
  }
  open(): void {
    this.editor?.open();
  }
  close(): Promise<boolean> {
    return this.editor?.close() ?? Promise.resolve(true);
  }
}

export function defineThemeEditor(name = 'mmdx-theme-editor'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, class extends MmdxThemeEditorElement {});
}

declare global {
  interface HTMLElementTagNameMap {
    'mmdx-theme-editor': MmdxThemeEditorElement;
  }
}
