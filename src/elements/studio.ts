// <mmdx-studio> (§8.4, UC4): the standalone all-in-one app — editor, theme editor (dialog), file menu, examples
// gallery, appearance toggle — the prototype's index.html, packaged as one element.
import { ElementBase } from './base.js';
import { decodeHash, encodeHash } from '../adapters/share.js';
import { localStorageAdapter, memoryStorage, type StorageAdapter } from '../adapters/storage.js';
import { fetchThemeSource, localStorageThemeStore, type ThemeSource } from '../adapters/themes.js';
import { ensureBuiltinThemes, getShared } from '../config.js';
import { mergeLegacySidecar, joinSource } from '../core/meta/index.js';
import { defineEditor, type DiagramEditor, type MmdxEditorElement } from '../editor/editor.js';
import { download } from '../dom/export.js';
import { h, icon } from '../ui/h.js';
import { ICONS } from '../ui/icons.js';
import { logoMark } from '../ui/logo.js';
import { PopoverManager, Toaster } from '../ui/popover.js';
import { Dialogs, DIALOG_CSS } from '../ui/dialog.js';
import { adoptStyles, ALIASES, BASE, resolveUiScheme, TOKENS, watchUiScheme } from '../ui/styles/base.js';

export interface ExampleInfo {
  id: string;
  title: string;
  file: string;
  thumbnail?: string;
  tags?: string[];
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

const STUDIO_CSS = /* css */ `
:host { display: block; height: 100%; min-height: 480px; }
.studio { display: flex; flex-direction: column; height: 100%; background: var(--ds-bg); color: var(--ds-text); }
.top { height: 48px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; padding: 0 12px; background: var(--ds-panel); border-bottom: 1px solid var(--ds-border); }
.brand { font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.brand .logo { display: flex; --logo-ink: #061958; }
:host([data-ui="dark"]) .brand .logo { --logo-ink: #eef0ff; }
.grp { display: flex; align-items: center; gap: 6px; position: relative; }
/* icon + label on one line */
.top button { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.name { color: var(--ds-muted); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name.dirty::after { content: ' •'; color: var(--ds-warn); }
.spacer { flex: 1; }
.seg { display: inline-flex; border: 1px solid var(--ds-border); border-radius: 7px; overflow: hidden; }
.seg button { border: 0; border-radius: 0; padding: 4px 12px; }
.seg button[aria-pressed=true] { background: var(--ds-accent); color: var(--ds-on-accent); }
.main { flex: 1; min-height: 0; position: relative; }
mmdx-editor { position: absolute; inset: 0; height: auto; min-height: 0; }
.menu-pop { top: 40px; left: 0; }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; max-height: 60vh; overflow: auto; padding: 2px; }
.card { display: flex; flex-direction: column; gap: 6px; text-align: left; padding: 8px; border-radius: 10px; }
.card .thumb { height: 120px; border-radius: 6px; background: var(--ds-surface-2); display: grid; place-items: center; overflow: hidden; }
.card .thumb img { max-width: 100%; max-height: 100%; }
.card .tags { color: var(--ds-muted); font-size: 12px; }
.themes-dialog { position: absolute; inset: 0; z-index: 2000; background: rgba(10,12,20,.32); display: grid; place-items: center; }
.themes-dialog > .box { width: min(1280px, calc(100% - 32px)); height: min(860px, calc(100% - 32px)); background: var(--ds-surface); border-radius: 12px; box-shadow: var(--ds-shadow-lg); display: flex; flex-direction: column; overflow: hidden; }
.themes-dialog .head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--ds-border); }
.themes-dialog mmdx-theme-editor { flex: 1; min-height: 0; }
.drop { position: absolute; inset: 0; z-index: 50; display: none; place-items: center; background: rgba(79,70,229,.08); border: 2px dashed var(--ds-accent); font-size: 16px; color: var(--ds-accent); pointer-events: none; }
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
  private hashTimer: ReturnType<typeof setTimeout> | undefined;
  private ui: 'light' | 'dark' | 'auto';

  constructor(private readonly host: HTMLElement, opts: StudioOptions = {}) {
    this.o = { ...opts };
    this.storage = opts.storage ?? (typeof localStorage !== 'undefined' ? localStorageAdapter() : memoryStorage());
    this.shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    adoptStyles(this.shadow, [TOKENS, ALIASES, BASE, DIALOG_CSS, STUDIO_CSS]);
    defineEditor();
    this.ui = this.storage.get<'light' | 'dark'>('ui') ?? 'auto';

    this.editorEl = document.createElement('mmdx-editor');
    this.editorEl.features = { open: true };
    this.editorEl.setAttribute('ui', this.ui);
    this.nameEl = h('span', { class: 'name', title: 'File name' });
    const newBtn = h('button', { type: 'button', class: 'primary', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => this.openNewMenu(newBtn) }, '＋ New ▾');
    const exBtn = h('button', { type: 'button', onclick: () => void this.openGallery() }, 'Examples');
    const openBtn = h('button', { type: 'button', title: 'Open .mmdx / .mmd / .md / .layout.json', onclick: () => this.pickFiles() }, icon(ICONS.folder), 'Open');
    const modeEdit = h('button', { type: 'button', 'aria-pressed': 'true', onclick: () => this.setMode('edit') }, 'Edit');
    const modeView = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => this.setMode('view') }, 'View');
    const share = h('button', { type: 'button', title: 'Copy a link with the diagram in it', onclick: () => void this.share() }, icon(ICONS.link), 'Share');
    const themesBtn = h('button', { type: 'button', title: 'Edit the diagram themes', onclick: () => void this.openThemeEditor() }, icon(ICONS.palette), 'Theme editor');
    const plainBtn = h('button', { type: 'button', title: 'Render with stock Mermaid (what YouTrack / GitHub show)', onclick: () => void this.editorEl.plainMermaid() }, icon(ICONS.eye), 'Plain Mermaid');
    const top = h('header', { class: 'top', part: 'toolbar' },
      h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, logoMark(24)), 'Diagram Studio'),
      h('div', { class: 'grp' }, newBtn, exBtn, openBtn),
      this.nameEl,
      h('div', { class: 'spacer' }),
      h('div', { class: 'grp seg', role: 'group', 'aria-label': 'Mode' }, modeEdit, modeView),
      h('div', { class: 'grp' }, themesBtn, plainBtn, share));
    const main = h('div', { class: 'main' }, this.editorEl, h('div', { class: 'drop' }, 'Drop a .mmdx / .mmd / .md file'));
    const root = h('div', { class: 'studio' }, top, main);
    this.shadow.append(root);
    this.pops = new PopoverManager(this.shadow);
    this.toaster = new Toaster(root);
    this.dialogs = new Dialogs(this.shadow);
    this.modeButtons = [modeEdit, modeView];

    const sig = { signal: this.ac.signal };
    this.editorEl.addEventListener('ds-change', () => this.persist(), sig);
    this.editorEl.addEventListener('ds-dirty', () => this.nameEl.classList.toggle('dirty', this.editorEl.dirty), sig);
    this.editorEl.addEventListener('ds-edit-themes', () => void this.openThemeEditor(), sig);
    this.editorEl.addEventListener('ds-ui', (ev) => {
      const ui = (ev as CustomEvent<{ ui: 'light' | 'dark' }>).detail.ui;
      this.ui = ui;
      this.storage.set('ui', ui);
      this.applyScheme();
    }, sig);
    // save = download the styled file (the studio has no backend)
    this.editorEl.addEventListener('ds-save', (ev) => {
      ev.preventDefault();
      download(`${this.name}.mmdx`, this.editorEl.getSource());
      this.editorEl.instance?.store.markSaved();
    }, sig);
    root.addEventListener('dragover', (ev) => {
      if (!ev.dataTransfer?.types.includes('Files')) return;
      ev.preventDefault();
      root.classList.add('dragover');
    }, sig);
    root.addEventListener('dragleave', (ev) => {
      if (ev.target === root || !root.contains(ev.relatedTarget as Node)) root.classList.remove('dragover');
    }, sig);
    root.addEventListener('drop', (ev) => {
      root.classList.remove('dragover');
      if (!ev.dataTransfer?.files.length) return;
      ev.preventDefault();
      void this.openFiles(ev.dataTransfer.files);
    }, sig);
    window.addEventListener('hashchange', () => void this.fromHash(), sig);
    this.cleanups.push(watchUiScheme(() => this.applyScheme()));
    this.applyScheme();
    void this.boot();
  }

  private readonly modeButtons: HTMLButtonElement[];

  get editor(): DiagramEditor | undefined {
    return this.editorEl.instance;
  }

  destroy(): void {
    this.ac.abort();
    clearTimeout(this.hashTimer);
    for (const c of this.cleanups) c();
    this.pops.close();
    this.toaster.destroy();
    this.shadow.replaceChildren();
  }

  // ---- boot and persistence -----------------------------------------------------------------------------------------

  private persistModes(): readonly ('local' | 'hash')[] {
    return this.o.persist ?? ['local', 'hash'];
  }

  private async boot(): Promise<void> {
    await this.loadThemes();
    await this.loadExamples();
    if (await this.fromHash()) return;
    const saved = this.persistModes().includes('local') ? this.storage.get<{ src: string; name?: string }>(STORE_KEY) : undefined;
    if (saved && typeof saved.src === 'string' && saved.src.trim()) {
      // restoring the autosaved document is not an unsaved change
      this.open(saved.src, saved.name ?? 'diagram');
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
    // themes edited in this browser layer over the files (A.12 `ds.themes`)
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
        .map((e) => ({ ...e, id: e.id ?? e.file, title: e.title ?? e.file, file: new URL(e.file, base).href }));
    } catch {
      this.examples = [];
    }
  }

  private persist(): void {
    const src = this.editorEl.getSource();
    if (this.persistModes().includes('local')) this.storage.set(STORE_KEY, { src, name: this.name });
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
    const src = await decodeHash(m[1]!);
    if (src === null) {
      this.toaster.show('The link does not contain a valid diagram', { error: true });
      return false;
    }
    if (src !== this.editorEl.getSource()) this.open(src, 'shared-diagram');
    return true;
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

  private open(src: string, name: string, opts: { markSaved?: boolean } = {}): void {
    this.name = name.replace(/\.(mmdx|mmd|md|txt)$/i, '') || 'diagram';
    this.nameEl.textContent = this.name;
    this.editorEl.setSource(src, { history: 'reset' });
    if (opts.markSaved === false) this.editorEl.instance?.store.markSaved('');
    if (this.editorEl.instance) this.editorEl.instance.name = this.editorEl.instance.core.fileName = this.name;
    this.nameEl.classList.toggle('dirty', this.editorEl.dirty);
  }

  private async openExample(ex: ExampleInfo): Promise<void> {
    if (this.editorEl.dirty && !(await this.dialogs.confirm('Discard changes?', 'The current diagram has unsaved changes.', { ok: 'Discard', danger: true }))) return;
    try {
      const r = await fetch(ex.file);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      this.open(await r.text(), ex.file.split('/').pop() ?? ex.id);
    } catch (e) {
      this.toaster.show(`Could not open ${ex.title}: ${e instanceof Error ? e.message : String(e)}`, { error: true });
    }
  }

  private openNewMenu(opener: HTMLElement): void {
    const item = (label: string, type: keyof typeof START): HTMLElement =>
      h('button', { type: 'button', role: 'menuitem', onclick: async () => {
        this.pops.close();
        if (this.editorEl.dirty && !(await this.dialogs.confirm('Discard changes?', 'The current diagram has unsaved changes.', { ok: 'Discard', danger: true }))) return;
        this.open(START[type], `untitled-${type}`);
        this.toaster.show('New diagram — add shapes from the Shapes menu on the left');
      } }, label);
    const pop = h('div', { class: 'ds-menu menu-pop', role: 'menu' },
      item('Flowchart', 'flowchart'), item('Sequence diagram', 'sequence'), item('Entity–relationship (ER) diagram', 'er'));
    opener.parentElement?.append(pop);
    this.pops.open(pop, opener);
  }

  private async openGallery(): Promise<void> {
    if (!this.examples.length) {
      this.toaster.show('No examples configured');
      return;
    }
    let picked: ExampleInfo | null = null;
    const grid = h('div', { class: 'gallery' }, ...this.examples.map((ex) => h('button', { type: 'button', class: 'card', onclick: (ev: Event) => {
      picked = ex;
      (ev.currentTarget as HTMLElement).closest('.ds-dialog')?.querySelector<HTMLButtonElement>('button.primary')?.click();
    } },
      h('div', { class: 'thumb' }, ex.thumbnail ? h('img', { src: ex.thumbnail, alt: '' }) : icon(ICONS.file, 32)),
      h('b', null, ex.title),
      ex.tags?.length ? h('span', { class: 'tags' }, ex.tags.join(' · ')) : null)));
    const v = await this.dialogs.choose<'open' | 'cancel'>({ title: 'Examples', body: grid, cancel: 'cancel', buttons: [{ label: 'Close', value: 'cancel' }, { label: 'Open', value: 'open', primary: true }] });
    if (v === 'open' && picked) await this.openExample(picked);
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

  /** `.mmdx`, `.mmd`, `.md` (first ```mermaid block), `.txt`; a `.json` sidecar is merged (A.8 row 79). */
  async openFiles(files: FileList | File[]): Promise<void> {
    const list = Array.from(files);
    const json = list.find((f) => /\.json$/i.test(f.name));
    const src = list.find((f) => !/\.json$/i.test(f.name));
    if (!src && !json) return;
    if (this.editorEl.dirty && !(await this.dialogs.confirm('Discard changes?', 'The current diagram has unsaved changes.', { ok: 'Discard', danger: true }))) return;
    try {
      let text = src ? await src.text() : this.editorEl.getSource();
      const md = /```mermaid\s*\n([\s\S]*?)```/.exec(text);
      if (src && /\.md$/i.test(src.name) && md) text = md[1]!;
      if (json) {
        const merged = mergeLegacySidecar(text, await json.text());
        text = joinSource(merged.doc);
        if (merged.diagnostics.length) this.toaster.show(`Layout ${json.name}: ${merged.diagnostics[0]!.message}`);
      }
      this.open(text, src?.name ?? this.name);
    } catch (e) {
      this.toaster.show(`Could not open: ${e instanceof Error ? e.message : String(e)}`, { error: true });
    }
  }

  private setMode(m: 'edit' | 'view'): void {
    this.editorEl.readOnly = m === 'view';
    this.modeButtons[0]?.setAttribute('aria-pressed', String(m === 'edit'));
    this.modeButtons[1]?.setAttribute('aria-pressed', String(m === 'view'));
  }

  private applyScheme(): void {
    const s = resolveUiScheme(this.ui === 'auto' ? null : this.ui);
    this.host.setAttribute('data-ui', s);
    this.editorEl.setAttribute('ui', s);
  }

  // ---- theme editor (dialog) ----------------------------------------------------------------------------------------

  private async openThemeEditor(): Promise<void> {
    const mod = await import('./theme-editor.js').catch(() => null);
    if (!mod) {
      this.toaster.show('The theme editor is not available in this build', { error: true });
      return;
    }
    mod.defineThemeEditor();
    const te = document.createElement('mmdx-theme-editor') as HTMLElement & { store?: unknown; source?: unknown };
    const store = localStorageThemeStore(this.storage, this.themeSource);
    te.store = store;
    te.setAttribute('ui', resolveUiScheme(this.ui === 'auto' ? null : this.ui));
    const current = this.editorEl.instance?.core.meta.canvas.theme;
    if (typeof current === 'string') te.setAttribute('theme', current);
    const close = h('button', { type: 'button', 'aria-label': 'Close theme editor', onclick: () => void done() }, icon(ICONS.close));
    const back = h('div', { class: 'themes-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Theme editor' },
      h('div', { class: 'box' }, h('div', { class: 'head' }, h('b', null, 'Diagram themes'), close), te));
    const done = async (): Promise<void> => {
      const dirty = (te as HTMLElement & { dirty?: boolean }).dirty;
      if (dirty && !(await this.dialogs.confirm('Discard theme changes?', 'Unsaved changes to the theme will be lost.', { ok: 'Discard', danger: true }))) return;
      back.remove();
      this.editorEl.instance?.core.afterChange();
    };
    back.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !ev.defaultPrevented) void done();
    });
    // a saved theme is registered in the shared registry by the theme editor: redraw with it
    te.addEventListener('ds-theme-saved', () => this.editorEl.instance?.core.afterChange());
    this.shadow.append(back);
  }
}

// ---- custom element ------------------------------------------------------------------------------------------------

export class MmdxStudioElement extends ElementBase {
  private studio: DiagramStudio | null = null;
  storage?: StorageAdapter;

  connectedCallback(): void {
    const o: StudioOptions = {};
    const ex = this.getAttribute('examples');
    if (ex) o.examples = ex;
    const th = this.getAttribute('themes');
    if (th) o.themes = th;
    const persist = this.getAttribute('persist');
    if (persist !== null) o.persist = persist.split(/\s+/).filter((p): p is 'local' | 'hash' => p === 'local' || p === 'hash');
    const initial = this.getAttribute('initial');
    if (initial) o.initial = initial;
    if (this.storage) o.storage = this.storage;
    this.studio = new DiagramStudio(this, o);
  }

  disconnectedCallback(): void {
    this.studio?.destroy();
    this.studio = null;
  }

  get editor(): DiagramEditor | undefined {
    return this.studio?.editor;
  }

  openFiles(files: FileList | File[]): Promise<void> {
    return this.studio?.openFiles(files) ?? Promise.resolve();
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
