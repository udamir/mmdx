// <mmdx-studio> (§8.4, UC4): the standalone all-in-one app — editor, theme editor (dialog), file menu, examples
// gallery, appearance toggle — the prototype's index.html, packaged as one element. The studio gives the editor the
// open document's versions (an example's bundled history and the versions saved here), shown by the editor's History.
import { createOverlayScroll, OVERLAY_SCROLL_CSS } from '../ui/blocks/overlay-scroll.js';
import { MmdxElement, warnOnce, words, type AttrSpec, type Patch } from './base.js';
import { decodeHash, encodeHash } from '../adapters/share.js';
import { localStorageAdapter, memoryStorage, type StorageAdapter } from '../adapters/storage.js';
import { fetchThemeSource, localStorageThemeStore, type ThemeSource } from '../adapters/themes.js';
import { ensureBuiltinThemes, getShared } from '../config.js';
import { defineEditor, type DiagramEditor, type MmdxEditorElement } from '../editor/editor.js';
import { readDocumentFiles } from '../editor/modules/chrome/document.js';
import { download } from '../dom/export.js';
import { renderSource, standaloneSvg } from '../core/pipeline.js';
import { contentId, type HistoryAdapter, type StaticVersion } from '../adapters/history.js';
import type { BlockHandle } from '../ui/blocks/block.js';
import { createSegmented, type SegmentedOption, type SegmentedProps } from '../ui/blocks/segmented.js';
import { MENU_CSS, openMenu } from '../ui/blocks/menu.js';
import { h, icon } from '../ui/h.js';
import { signal } from '../ui/signal.js';
import { ICONS } from '../ui/icons.js';
import { logoMark } from '../ui/logo.js';
import { PopoverManager, Toaster } from '../ui/popover.js';
import { Dialogs, DIALOG_CSS } from '../ui/dialog.js';
import { adoptStyles, ALIASES, BASE, resolveUiScheme, TOKENS, watchUiScheme } from '../ui/styles/base.js';

/** The studio's mode switch: the editor's Edit and View, and Diff (its History, compared with the version before). */
export type StudioMode = 'edit' | 'view' | 'diff';

export interface ExampleInfo {
  id: string;
  title: string;
  file: string;
  thumbnail?: string;
  tags?: string[];
  /** A history file of the example: `{ versions: [{ id, message, author?, date?, source }] }`, newest first. */
  history?: string;
}

export interface StudioOptions {
  /** Examples manifest URL: `{ examples: [{ id, title, file, thumbnail?, tags? }] }`. */
  examples?: string;
  /** Theme manifest URL (`themes/index.json`). `?themes=<url>` on the page overrides it (A.8 row 70). */
  themes?: string;
  /** `local`: keep the last document in storage; `hash`: the document travels in the URL (`#d=…`). */
  persist?: readonly ('local' | 'hash')[];
  /** Example id to open when nothing is stored. */
  initial?: string;
  storage?: StorageAdapter;
}

const START: Record<'flowchart' | 'sequence' | 'er', string> = { flowchart: 'flowchart TB\n', sequence: 'sequenceDiagram\n', er: 'erDiagram\n' };
const HASH_LIMIT = 8 * 1024;
const STORE_KEY = 'studio.doc';
/** Versions saved in the studio, per document (browser storage, never the server). */
const VERSIONS_KEY = 'studio.versions';
const MAX_VERSIONS = 30;

const STUDIO_CSS = /* css */ `
:host { display: block; height: 100%; min-height: 480px; }
.studio { display: flex; flex-direction: column; height: 100%; background: var(--mmdx-bg); color: var(--mmdx-text); }
.top { height: 48px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 0 12px; background: var(--mmdx-panel); border-bottom: 1px solid var(--mmdx-border); }
.brand { font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.brand .logo { display: flex; --logo-ink: #061958; }
:host([data-ui="dark"]) .brand .logo { --logo-ink: #eef0ff; }
.grp { display: flex; align-items: center; gap: 6px; position: relative; }
/* icon + label on one line */
.top button { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.name { color: var(--mmdx-muted); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name.dirty::after { content: ' •'; color: var(--mmdx-warn); }
.spacer { flex: 1; }
.seg { display: inline-flex; border: 1px solid var(--mmdx-border); border-radius: 7px; overflow: hidden; }
.seg button { border: 0; border-radius: 0; padding: 4px 12px; }
.seg button[aria-pressed=true] { background: var(--mmdx-accent); color: var(--mmdx-on-accent); }
.main { flex: 1; min-height: 0; position: relative; }
mmdx-editor { position: absolute; inset: 0; height: auto; min-height: 0; }
.gallery-box { position: relative; }
.mmdx-dialog.examples { width: min(860px, calc(100% - 32px)); }
.gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; max-height: 70vh; overflow: auto; padding: 2px; }
.card { display: flex; flex-direction: column; gap: 6px; text-align: left; padding: 8px; border-radius: 10px; }
.card .thumb { aspect-ratio: 4 / 3; border-radius: 6px; background: var(--mmdx-surface-2); display: grid; place-items: center; overflow: hidden; position: relative; }
.card .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; padding: 10px; box-sizing: border-box; }
.card .thumb.loading { opacity: .6; }
.card .tags { color: var(--mmdx-muted); font-size: 12px; }
.themes-dialog { position: absolute; inset: 0; z-index: 2000; background: rgba(10,12,20,.32); display: grid; place-items: center; }
.themes-dialog > .box { width: min(1280px, calc(100% - 32px)); height: min(860px, calc(100% - 32px)); background: var(--mmdx-surface); border-radius: 12px; box-shadow: var(--mmdx-shadow-lg); display: flex; flex-direction: column; overflow: hidden; }
.themes-dialog .head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--mmdx-border); }
.themes-dialog mmdx-theme-editor { flex: 1; min-height: 0; }
.drop { position: absolute; inset: 0; z-index: 50; display: none; place-items: center; background: rgba(79,70,229,.08); border: 2px dashed var(--mmdx-accent); font-size: 16px; color: var(--mmdx-accent); pointer-events: none; }
.studio.dragover .drop { display: grid; }
`;

export class DiagramStudio {
  private readonly shadow: ShadowRoot;
  private readonly o: StudioOptions;
  private readonly storage: StorageAdapter;
  private readonly editorEl: MmdxEditorElement;
  private readonly nameEl: HTMLElement;
  private readonly pops: PopoverManager;
  private readonly toaster: Toaster;
  private readonly dialogs: Dialogs;
  private readonly ac = new AbortController();
  private readonly cleanups: (() => void)[] = [];
  private examples: ExampleInfo[] = [];
  private themeSource: ThemeSource | undefined;
  private name = 'diagram';
  /** Which document is open (`example:<id>`, `file:<name>`): the key of its saved versions. */
  private docKey = 'file:diagram';
  /** The bundled history of the open example, newest first. */
  private bundled: StaticVersion[] = [];
  /** The editor's History source: this document's versions, read fresh every time it opens. */
  private history!: HistoryAdapter;
  private hashTimer: ReturnType<typeof setTimeout> | undefined;
  private ui: 'light' | 'dark' | 'auto';
  /** Bumps on every document opened: a slow load (an example, a file, a link) started before gives up. */
  private openSeq = 0;
  private destroyed = false;

  constructor(private readonly host: HTMLElement, opts: StudioOptions = {}) {
    this.o = { ...opts };
    this.storage = opts.storage ?? (typeof localStorage !== 'undefined' ? localStorageAdapter() : memoryStorage());
    this.shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    adoptStyles(this.shadow, [TOKENS, ALIASES, BASE, DIALOG_CSS, MENU_CSS, OVERLAY_SCROLL_CSS, STUDIO_CSS]);
    defineEditor();
    this.ui = this.storage.get<'light' | 'dark'>('ui') ?? 'auto';

    this.editorEl = document.createElement('mmdx-editor');
    this.editorEl.features = { open: true };
    this.editorEl.setAttribute('ui', this.ui);
    this.nameEl = h('span', { class: 'name', title: 'File name' });
    const newBtn = h('button', { type: 'button', class: 'primary', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => this.openNewMenu(newBtn) }, '＋ New ▾');
    const exBtn = h('button', { type: 'button', onclick: () => void this.openGallery() }, 'Examples');
    const openBtn = h('button', { type: 'button', title: 'Open .mmdx / .mmd / .md / .layout.json', onclick: () => this.pickFiles() }, icon(ICONS.folder), 'Open');
    const modeSwitch = (this.modeSwitch = createSegmented<StudioMode>({
      label: 'Mode', options: this.modeOptions(), value: this.mode, buttonClass: 'mode', f: 'mode',
      onChange: (m) => this.setMode(m),
    }));
    const saveVersion = h('button', { type: 'button', title: 'Record the current diagram as a version in its history (see History in the tool dock)', onclick: () => void this.saveVersion() }, icon(ICONS.save), 'Save version');
    const share = h('button', { type: 'button', title: 'Copy a link with the diagram in it', onclick: () => void this.share() }, icon(ICONS.link), 'Share');
    const themesBtn = h('button', { type: 'button', title: 'Edit the diagram themes', onclick: () => void this.openThemeEditor() }, icon(ICONS.palette), 'Theme editor');
    const plainBtn = h('button', { type: 'button', title: 'Render with stock Mermaid (what YouTrack / GitHub show)', onclick: () => void this.editorEl.plainMermaid() }, icon(ICONS.eye), 'Plain Mermaid');
    const top = h('header', { class: 'top', part: 'toolbar' },
      h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, logoMark(24)), 'Diagram Studio'),
      h('div', { class: 'grp' }, newBtn, exBtn, openBtn),
      this.nameEl,
      h('div', { class: 'spacer' }),
      h('div', { class: 'grp seg' }, modeSwitch.el),
      h('div', { class: 'grp' }, saveVersion, themesBtn, plainBtn, share));
    const main = h('div', { class: 'main' }, this.editorEl, h('div', { class: 'drop' }, 'Drop a .mmdx / .mmd / .md file'));
    const root = h('div', { class: 'studio' }, top, main);
    this.shadow.append(root);
    this.pops = new PopoverManager(this.shadow);
    this.toaster = new Toaster(root);
    this.dialogs = new Dialogs(this.shadow, getShared().i18n.t);
    this.history = this.historyAdapter();

    const sig = { signal: this.ac.signal };
    this.editorEl.addEventListener('mmdx-change', () => this.persist(), sig);
    this.editorEl.addEventListener('mmdx-dirty', () => this.nameEl.classList.toggle('dirty', this.editorEl.dirty), sig);
    this.editorEl.addEventListener('mmdx-edit-themes', () => void this.openThemeEditor(), sig);
    // Diff is a comparison in the editor's History: the switch follows what History shows, whoever picks it (the
    // version panel, Esc, Back); the panel alone (nothing picked, or a version as it is) keeps Edit / View
    const docMode = (): StudioMode => (this.editorEl.readOnly ? 'view' : 'edit');
    this.editorEl.addEventListener('mmdx-history-show', (ev) => this.mode.set((ev as CustomEvent<{ shown: string }>).detail.shown === 'compare' ? 'diff' : docMode()), sig);
    this.editorEl.addEventListener('mmdx-history-close', () => this.mode.set(docMode()), sig);
    this.editorEl.addEventListener('mmdx-ui', (ev) => {
      const ui = (ev as CustomEvent<{ ui: 'light' | 'dark' }>).detail.ui;
      this.ui = ui;
      this.storage.set('ui', ui);
      this.applyScheme();
    }, sig);
    // save = download the styled file (the studio has no backend) and record a version in the history
    this.editorEl.addEventListener('mmdx-save', (ev) => {
      ev.preventDefault();
      const src = this.editorEl.getSource();
      download(`${this.name}.mmdx`, src);
      this.recordVersion(src, `Saved ${this.name}.mmdx`);
      this.editorEl.instance?.markSaved();
    }, sig);
    // files dropped on the editor or opened from its menu: the studio opens them (its name, versions, unsaved check)
    const off = this.editorEl.instance?.core.provide('openFiles', (files) => this.openFiles(files));
    if (off) this.cleanups.push(off);
    // what the editor took (a drop on its canvas) is not opened again here
    root.addEventListener('dragover', (ev) => {
      if (ev.defaultPrevented || !ev.dataTransfer?.types.includes('Files')) return;
      ev.preventDefault();
      root.classList.add('dragover');
    }, sig);
    root.addEventListener('dragleave', (ev) => {
      if (ev.target === root || !root.contains(ev.relatedTarget as Node)) root.classList.remove('dragover');
    }, sig);
    root.addEventListener('drop', (ev) => {
      root.classList.remove('dragover');
      if (ev.defaultPrevented || !ev.dataTransfer?.files.length) return;
      ev.preventDefault();
      void this.openFiles(ev.dataTransfer.files);
    }, sig);
    window.addEventListener('hashchange', () => void this.fromHash(), sig);
    this.cleanups.push(watchUiScheme(() => this.applyScheme()));
    this.applyScheme();
    void this.boot();
  }

  /** Edit / View of the editor, or Diff (its History); the mode switch in the top bar follows it. */
  private readonly mode = signal<StudioMode>('edit');
  private readonly modeSwitch: BlockHandle<SegmentedProps<StudioMode>>;

  get editor(): DiagramEditor | undefined {
    return this.editorEl.instance ?? undefined;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ac.abort();
    clearTimeout(this.hashTimer);
    for (const c of this.cleanups.splice(0)) c();
    this.pops.close();
    this.toaster.destroy();
    this.shadow.replaceChildren();
  }

  // ---- boot and persistence -----------------------------------------------------------------------------------------

  private persistModes(): readonly ('local' | 'hash')[] {
    return this.o.persist ?? ['local', 'hash'];
  }

  private async boot(): Promise<void> {
    const seq = this.openSeq;
    // the user may open something (or the studio go away) while the themes, the examples or the link load
    const stale = (): boolean => this.destroyed || seq !== this.openSeq;
    await this.loadThemes();
    if (stale()) return;
    await this.loadExamples();
    if (stale()) return;
    if (await this.fromHash()) return;
    if (stale()) return;
    const saved = this.persistModes().includes('local') ? this.storage.get<{ src: string; name?: string; key?: string }>(STORE_KEY) : undefined;
    if (saved && typeof saved.src === 'string' && saved.src.trim()) {
      // restoring the autosaved document is not an unsaved change
      this.open(saved.src, saved.name ?? 'diagram', { key: typeof saved.key === 'string' ? saved.key : undefined });
      return;
    }
    const ex = this.examples.find((e) => e.id === this.o.initial) ?? this.examples[0];
    if (ex) await this.openExample(ex);
    else this.open(START.flowchart, 'untitled-flowchart');
  }

  private async loadThemes(): Promise<void> {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('themes') : null;
    const url = q ?? this.o.themes;
    const shared = getShared();
    const base = url ? fetchThemeSource(url) : undefined;
    // themes edited in this browser layer over the files (A.12 `mmdx.themes`)
    const store = localStorageThemeStore(this.storage, base);
    this.themeSource = store;
    try {
      for (const info of await store.list()) shared.themes.register(await store.get(info.id));
    } catch (e) {
      this.toaster.show(`Themes could not be loaded: ${e instanceof Error ? e.message : String(e)}`, { error: true });
    }
    await ensureBuiltinThemes();
  }

  private async loadExamples(): Promise<void> {
    if (!this.o.examples) return;
    try {
      const base = new URL(this.o.examples, location.href);
      const r = await fetch(base);
      const m = (await r.json()) as { examples?: unknown };
      const list = Array.isArray(m.examples) ? m.examples : [];
      this.examples = list.filter((e): e is ExampleInfo => !!e && typeof e === 'object' && typeof (e as ExampleInfo).file === 'string')
        .map((e) => ({ ...e, id: e.id ?? e.file, title: e.title ?? e.file, file: new URL(e.file, base).href, ...(typeof e.history === 'string' ? { history: new URL(e.history, base).href } : {}) }));
    } catch {
      this.examples = [];
    }
  }

  private persist(): void {
    const src = this.editorEl.getSource();
    if (this.persistModes().includes('local')) this.storage.set(STORE_KEY, { src, name: this.name, key: this.docKey });
    if (this.persistModes().includes('hash')) {
      clearTimeout(this.hashTimer);
      this.hashTimer = setTimeout(() => void this.toHash(src), 600);
    }
  }

  private async toHash(src: string): Promise<void> {
    const enc = await encodeHash(src);
    const next = enc && enc.length <= HASH_LIMIT ? `#d=${enc}` : '';
    if (location.hash === next || (!next && !location.hash.startsWith('#d='))) return;
    history.replaceState(null, '', next ? next : location.pathname + location.search);
  }

  private async fromHash(): Promise<boolean> {
    if (!this.persistModes().includes('hash')) return false;
    const m = /^#d=([\w-]+)$/.exec(location.hash);
    if (!m) return false;
    const seq = this.openSeq;
    const src = await decodeHash(m[1]!);
    if (this.destroyed || seq !== this.openSeq) return false;
    if (src === null) {
      this.toaster.show('The link does not contain a valid diagram', { error: true });
      return false;
    }
    // the studio keeps the open document in the link: one that is this browser's own document or an example opens as
    // that document (its name, saved versions and history), anything else as a shared diagram
    const known = await this.knownSource(src);
    if (this.destroyed || seq !== this.openSeq) return true;
    if (src !== this.editorEl.getSource()) this.open(src, known?.name ?? 'shared-diagram', { key: known?.key ?? 'shared:shared-diagram' });
    return true;
  }

  /** The document a source is: the autosaved one of this browser, or an example (its file or one of its versions). */
  private async knownSource(src: string): Promise<{ key: string; name: string } | null> {
    const saved = this.persistModes().includes('local') ? this.storage.get<{ src: string; name?: string; key?: string }>(STORE_KEY) : undefined;
    if (saved?.src === src && typeof saved.key === 'string') return { key: saved.key, name: saved.name ?? 'diagram' };
    for (const ex of this.examples) {
      const name = ex.file.split('/').pop() ?? ex.id;
      try {
        if ((await this.fetchHistory(ex)).some((v) => v.source === src)) return { key: `example:${ex.id}`, name };
        const r = await fetch(ex.file);
        if (r.ok && (await r.text()) === src) return { key: `example:${ex.id}`, name };
      } catch {
        // an example that does not load is not this one
      }
    }
    return null;
  }

  private async share(): Promise<void> {
    const src = this.editorEl.getSource();
    const enc = await encodeHash(src);
    if (!enc || enc.length > HASH_LIMIT) {
      const choice = await this.dialogs.choose<'download' | 'copy' | 'cancel'>({
        title: 'Too large for a link',
        message: 'This diagram is too large to share in a URL. Download the file or copy its source instead.',
        cancel: 'cancel',
        buttons: [{ label: 'Copy source', value: 'copy' }, { label: 'Download .mmdx', value: 'download', primary: true }],
      });
      if (choice === 'download') download(`${this.name}.mmdx`, src);
      if (choice === 'copy') await navigator.clipboard?.writeText(src);
      return;
    }
    const url = `${location.origin}${location.pathname}${location.search}#d=${enc}`;
    try {
      await navigator.clipboard.writeText(url);
      this.toaster.show('Link copied');
    } catch {
      await this.dialogs.prompt('Copy this link', { value: url, ok: 'Close' });
    }
  }

  // ---- documents --------------------------------------------------------------------------------------------------

  private open(src: string, name: string, opts: { markSaved?: boolean; key?: string | undefined } = {}): void {
    if (this.destroyed) return;
    this.openSeq++;
    this.name = name.replace(/\.(mmdx|mmd|md|txt)$/i, '') || 'diagram';
    this.docKey = opts.key ?? `file:${this.name}`;
    this.bundled = [];
    this.editorEl.instance?.toggleHistory(false);
    this.syncHistory();
    void this.loadBundled().then(() => {
      if (!this.destroyed) this.syncHistory();
    });
    this.nameEl.textContent = this.name;
    this.editorEl.setSource(src, { history: 'reset' });
    if (opts.markSaved === false) this.editorEl.instance?.markSaved('');
    if (this.editorEl.instance) this.editorEl.instance.fileName = this.name;
    this.nameEl.classList.toggle('dirty', this.editorEl.dirty);
  }

  private async openExample(ex: ExampleInfo): Promise<void> {
    const seq = this.openSeq;
    if (this.editorEl.dirty && !(await this.dialogs.confirm('Discard changes?', 'The current diagram has unsaved changes.', { ok: 'Discard', danger: true }))) return;
    try {
      // an example with a history opens at its newest version (the example file is where the history starts)
      const key = `example:${ex.id}`;
      const newest = (await this.fetchHistory(ex))[0];
      let src = newest?.source;
      if (src === undefined) {
        const r = await fetch(ex.file);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        src = await r.text();
      }
      // something else was opened while the example loaded: it stays
      if (this.destroyed || seq !== this.openSeq) return;
      this.open(src, ex.file.split('/').pop() ?? ex.id, { key });
    } catch (e) {
      this.toaster.show(`Could not open ${ex.title}: ${e instanceof Error ? e.message : String(e)}`, { error: true });
    }
  }

  private openNewMenu(opener: HTMLElement): void {
    const item = (label: string, type: keyof typeof START) => ({
      label,
      run: async (): Promise<void> => {
        const seq = this.openSeq;
        if (this.editorEl.dirty && !(await this.dialogs.confirm('Discard changes?', 'The current diagram has unsaved changes.', { ok: 'Discard', danger: true }))) return;
        if (seq !== this.openSeq) return;
        this.open(START[type], `untitled-${type}`);
        this.toaster.show('New diagram — add shapes from the Shapes menu on the left');
      },
    });
    openMenu({
      popovers: this.pops, opener, label: 'New diagram', align: 'left', within: this.host,
      entries: [item('Flowchart', 'flowchart'), item('Sequence diagram', 'sequence'), item('Entity–relationship (ER) diagram', 'er')].map((e) => ({ label: e.label, run: () => void e.run() })),
    });
  }

  private async openGallery(): Promise<void> {
    if (!this.examples.length) {
      this.toaster.show('No examples configured');
      return;
    }
    let picked: ExampleInfo | null = null;
    // a preview of each example (its own thumbnail, else its newest version rendered here), the file icon meanwhile
    let open = true;
    const thumbOf = (ex: ExampleInfo): HTMLElement => {
      if (ex.thumbnail) return h('div', { class: 'thumb' }, h('img', { src: ex.thumbnail, alt: '' }));
      const box = h('div', { class: 'thumb loading' }, icon(ICONS.file, 32));
      void this.preview(ex).then((url) => {
        box.classList.remove('loading');
        if (url && open) box.replaceChildren(h('img', { src: url, alt: '' }));
      });
      return box;
    };
    const grid = h('div', { class: 'gallery' }, ...this.examples.map((ex) => h('button', { type: 'button', class: 'card', onclick: (ev: Event) => {
      picked = ex;
      (ev.currentTarget as HTMLElement).closest('.mmdx-dialog')?.querySelector<HTMLButtonElement>('button.primary')?.click();
    } },
      thumbOf(ex),
      h('b', null, ex.title),
      ex.tags?.length ? h('span', { class: 'tags' }, ex.tags.join(' · ')) : null)));
    // the panels' thin scrollbar over the cards
    const scroll = createOverlayScroll(h('div', { class: 'gallery-box' }, grid));
    const box = grid.parentElement!;
    box.append(...scroll.thumbs);
    const v = await this.dialogs.choose<'open' | 'cancel'>({ title: 'Examples', body: box, class: 'examples', cancel: 'cancel', buttons: [{ label: 'Close', value: 'cancel' }, { label: 'Open', value: 'open', primary: true }] });
    open = false;
    scroll.destroy();
    if (v === 'open' && picked) await this.openExample(picked);
  }

  /** Previews of the examples (the newest version, in the editor's theme) as SVG images, rendered once per theme. */
  private readonly previews = new Map<string, Promise<string | null>>();

  private preview(ex: ExampleInfo): Promise<string | null> {
    const core = this.editorEl.instance?.core;
    if (!core) return Promise.resolve(null);
    const theme = core.shownTheme();
    const key = `${ex.id}|${theme}`;
    let p = this.previews.get(key);
    if (!p) {
      p = (async (): Promise<string | null> => {
        let src = (await this.fetchHistory(ex))[0]?.source;
        if (src === undefined) {
          const r = await fetch(ex.file);
          if (!r.ok) return null;
          src = await r.text();
        }
        // one preview per task: the dialog stays responsive while they render
        await new Promise((r) => setTimeout(r, 0));
        if (this.destroyed) return null;
        const svg = standaloneSvg(renderSource(src, core.ctx, { theme }), core.ctx);
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      })().catch(() => null).then((url) => {
        // a failed one is tried again next time
        if (!url) this.previews.delete(key);
        return url;
      });
      this.previews.set(key, p);
    }
    return p;
  }

  private pickFiles(): void {
    const input = h('input', { type: 'file', accept: '.mmdx,.mmd,.md,.txt,.json', multiple: true, style: 'display:none' });
    input.addEventListener('change', () => {
      if (input.files?.length) void this.openFiles(input.files);
      input.remove();
    });
    this.shadow.append(input);
    input.click();
  }

  /**
   * `.mmdx`, `.mmd`, `.md` (first ```mermaid block), `.txt`; a `.json` sidecar is merged (A.8 row 79). The one path for
   * files in the studio: its Open button, drops anywhere (the editor's canvas included) and the editor's ⋯ menu.
   */
  async openFiles(files: FileList | File[]): Promise<void> {
    const list = Array.from(files);
    if (!list.length) return;
    const seq = this.openSeq;
    if (this.editorEl.dirty && !(await this.dialogs.confirm('Discard changes?', 'The current diagram has unsaved changes.', { ok: 'Discard', danger: true }))) return;
    try {
      const read = await readDocumentFiles(list, () => this.editorEl.getSource());
      if (!read || this.destroyed || seq !== this.openSeq) return;
      const d = read.sidecar?.diagnostics[0];
      if (d) this.toaster.show(`Layout ${read.sidecar!.name}: ${d.message}`);
      this.open(read.source, read.name ?? this.name);
    } catch (e) {
      this.toaster.show(`Could not open: ${e instanceof Error ? e.message : String(e)}`, { error: true });
    }
  }

  private modeOptions(): SegmentedOption<StudioMode>[] {
    const diff = !!this.editorEl?.history;
    return [
      { value: 'edit', label: 'Edit' },
      { value: 'view', label: 'View' },
      { value: 'diff', label: 'Diff', disabled: !diff, tip: diff ? 'Compare with the previous version (History)' : 'Save a version to compare with it' },
    ];
  }

  /** Diff opens the editor's History on the newest change compared (the working copy or the newest version against the one before); Edit / View leave it. */
  private setMode(m: StudioMode): void {
    if (m === 'diff') {
      this.editorEl.toggleHistory(true, { compare: true });
      return;
    }
    // Edit / View leave what History shows (a comparison or a version); the panel alone stays open
    const p = this.editorEl.historySession?.pair;
    if (this.mode.peek() === 'diff' || (p && (p.base || p.viewing))) this.editorEl.toggleHistory(false);
    this.editorEl.readOnly = m === 'view';
    this.mode.set(m);
  }

  // ---- history ------------------------------------------------------------------------------------------------------

  /** The example's bundled history (when the open document is an example that has one). */
  private async loadBundled(): Promise<void> {
    const key = this.docKey;
    const ex = key.startsWith('example:') ? this.examples.find((e) => `example:${e.id}` === key) : undefined;
    if (!ex) return;
    const list = await this.fetchHistory(ex);
    if (!this.destroyed && key === this.docKey) this.bundled = list;
  }

  private readonly histories = new Map<string, Promise<StaticVersion[]>>();

  /** An example's history file (fetched once), newest first; empty when it has none or it cannot be read. */
  private fetchHistory(ex: ExampleInfo): Promise<StaticVersion[]> {
    if (!ex.history) return Promise.resolve([]);
    let p = this.histories.get(ex.history);
    if (!p) {
      p = fetch(ex.history).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const m = (await r.json()) as { versions?: unknown };
        return (Array.isArray(m.versions) ? m.versions : []).filter((v): v is StaticVersion =>
          !!v && typeof v === 'object' && typeof (v as StaticVersion).id === 'string' && typeof (v as StaticVersion).source === 'string');
      }).catch(() => []);
      this.histories.set(ex.history, p);
    }
    return p;
  }

  private saved(): StaticVersion[] {
    const all = this.storage.get<Record<string, StaticVersion[]>>(VERSIONS_KEY) ?? {};
    const list = all[this.docKey];
    return Array.isArray(list) ? list.filter((v) => v && typeof v.id === 'string' && typeof v.source === 'string') : [];
  }

  /** Records a version of the open document (newest first; the same source twice in a row is one version). */
  private recordVersion(src: string, message: string): boolean {
    const list = this.saved();
    const newest = list[0]?.source ?? this.bundled[0]?.source;
    if (newest === src) return false;
    const all = this.storage.get<Record<string, StaticVersion[]>>(VERSIONS_KEY) ?? {};
    const v: StaticVersion = { id: contentId(`${Date.now()}\n${src}`), message, author: 'You', date: new Date().toISOString(), source: src };
    all[this.docKey] = [v, ...list].slice(0, MAX_VERSIONS);
    this.storage.set(VERSIONS_KEY, all);
    this.syncHistory();
    return true;
  }

  private async saveVersion(): Promise<void> {
    const message = await this.dialogs.prompt('Save version', { label: 'What changed?', value: '', ok: 'Save version' });
    if (message === null) return;
    const ok = this.recordVersion(this.editorEl.getSource(), message.trim() || 'Saved version');
    this.toaster.show(ok ? 'Version saved — see it in History (tool dock)' : 'Nothing changed since the last version');
  }

  /** The editor shows History once the document has a version. */
  private syncHistory(): void {
    this.editorEl.history = this.saved().length || this.bundled.length ? this.history : null;
    this.modeSwitch?.update({ options: this.modeOptions() });
  }

  /** The open document's versions, newest first: the ones saved here, then the example's bundled history. */
  private historyAdapter(): HistoryAdapter {
    const all = (): StaticVersion[] => [...this.saved(), ...this.bundled];
    return {
      list: async () => ({ versions: all().map(({ source: _s, ...v }) => v) }),
      load: async (id) => {
        const v = all().find((x) => x.id === id);
        if (!v) throw new Error(`Unknown version ${id}`);
        return v.source;
      },
    };
  }

  private applyScheme(): void {
    const s = resolveUiScheme(this.ui === 'auto' ? null : this.ui);
    this.host.setAttribute('data-ui', s);
    this.editorEl.setAttribute('ui', s);
  }

  // ---- theme editor (dialog) ----------------------------------------------------------------------------------------

  private async openThemeEditor(): Promise<void> {
    const mod = await import('./theme-editor.js').catch(() => null);
    if (this.destroyed) return;
    if (!mod) {
      this.toaster.show('The theme editor is not available in this build', { error: true });
      return;
    }
    mod.defineThemeEditor();
    const te = document.createElement('mmdx-theme-editor') as HTMLElement & { store?: unknown; source?: unknown };
    const store = localStorageThemeStore(this.storage, this.themeSource);
    te.store = store;
    te.setAttribute('ui', resolveUiScheme(this.ui === 'auto' ? null : this.ui));
    // the theme the diagram is shown in (component state, §7.5; documents no longer carry one)
    const current = this.editorEl.instance?.theme;
    if (current) te.setAttribute('theme', current);
    const close = h('button', { type: 'button', 'aria-label': 'Close theme editor', onclick: () => void done() }, icon(ICONS.close));
    const back = h('div', { class: 'themes-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Theme editor' },
      h('div', { class: 'box' }, h('div', { class: 'head' }, h('b', null, 'Diagram themes'), close), te));
    const done = async (): Promise<void> => {
      const dirty = (te as HTMLElement & { dirty?: boolean }).dirty;
      if (dirty && !(await this.dialogs.confirm('Discard theme changes?', 'Unsaved changes to the theme will be lost.', { ok: 'Discard', danger: true }))) return;
      back.remove();
      this.editorEl.instance?.redraw();
    };
    back.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !ev.defaultPrevented) void done();
    });
    // a saved theme is registered in the shared registry by the theme editor: redraw with it
    te.addEventListener('mmdx-theme-saved', () => this.editorEl.instance?.redraw());
    this.shadow.append(back);
  }
}

// ---- custom element ------------------------------------------------------------------------------------------------

/** Attributes, read when the studio is created. */
const ATTRS: Readonly<Record<string, AttrSpec<StudioOptions>>> = {
  examples: ['examples', (v) => v || undefined], themes: ['themes', (v) => v || undefined], initial: ['initial', (v) => v || undefined],
  persist: ['persist', (v) => (v === null ? undefined : words(v).filter((p) => p === 'local' || p === 'hash'))],
};

export class MmdxStudioElement extends MmdxElement<StudioOptions, DiagramStudio> {
  protected attrs(): typeof ATTRS {
    return ATTRS;
  }

  protected create(o: StudioOptions): DiagramStudio {
    return new DiagramStudio(this, o);
  }

  protected apply(_s: DiagramStudio, patch: Patch<StudioOptions>): void {
    for (const k of Object.keys(patch)) warnOnce(`studio: \`${k}\` is read when the studio is created`);
  }

  get storage(): StorageAdapter | undefined {
    return this.props.storage;
  }
  set storage(v: StorageAdapter | undefined) {
    this.setOpt({ storage: v });
  }

  get editor(): DiagramEditor | undefined {
    return this.live?.editor;
  }

  openFiles(files: FileList | File[]): Promise<void> {
    return this.live?.openFiles(files) ?? Promise.resolve();
  }
}

export function defineStudio(name = 'mmdx-studio'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, class extends MmdxStudioElement {});
}

declare global {
  interface HTMLElementTagNameMap {
    'mmdx-studio': MmdxStudioElement;
  }
}
