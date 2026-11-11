// The theme editor (§8.3, UC3): the composition of the theme library (library.ts), the draft (draft.ts, signals) and
// the views — the theme list, the main column (header, palette and page cards, item and page-preset galleries, field
// rows), the floating style toolbar and the live preview. Effects keep the views in step with the draft; edits redraw
// the tiles they affect and the preview after a short pause. Can be mounted into any element; <mmdx-theme-editor>
// wraps it.
import { memoryThemeStore } from '../adapters/themes.js';
import { ComponentShell } from '../view/component-shell.js';
import { Owner } from '../reactive/owner.js';
import { type StorageAdapter } from '../ports.js';
import { ensureBuiltinThemes } from '../platform/themes.js';
import type { CoreContext } from '../core/context.js';
import { THEME_SECTIONS } from '../core/schema/style-fields.js';
import { BUILTIN_THEMES } from '../core/theme/builtin.js';
import type { ThemeFile } from '../core/theme/types.js';
import type { DiagramType } from '../core/types.js';
import { download } from '../dom/export.js';
import { Scope } from '../ui/blocks/block.js';
import { COLOR_PICKER_CSS } from '../ui/blocks/color-picker.js';
import { DISCLOSURE_CSS } from '../ui/blocks/disclosure.js';
import { MENU_CSS } from '../ui/blocks/menu.js';
import { SEGMENTED_CSS } from '../ui/blocks/segmented.js';
import { TABS_CSS } from '../ui/blocks/tabs.js';
import { TILE_GALLERY_CSS } from '../ui/blocks/tile-gallery.js';
import { TOOLBAR_CSS as BAR_CSS } from '../ui/blocks/toolbar.js';
import { ZOOM_BAR_CSS } from '../ui/blocks/zoom-bar.js';
import { DIALOG_CSS, Dialogs } from '../ui/kit/dialog.js';
import { h } from '../ui/kit/h.js';
import { registerMessages, type I18n } from '../i18n.js';
import { THEME_EDITOR_MESSAGES } from './messages.js';
import { TOOLBAR_MESSAGES } from '../ui/messages/toolbar.js';
import { PopoverManager, Toaster } from '../ui/kit/popover.js';
import { formatKeys } from '../ui/kit/keys.js';
import { ShortcutRegistry } from '../view/keymap.js';
import { effect, signal, untracked } from '../reactive/signal.js';
import { createStyleToolbar, type StyleToolbarHandle } from '../ui/diagram/style-toolbar.js';
import { ALIASES, adoptStyles, BASE, TOKENS } from '../ui/kit/base.js';
import { THEME_EDITOR_CSS } from './styles.js';
import { TOOLBAR_CSS } from '../ui/diagram/toolbar-styles.js';
import { card } from './cards/card.js';
import { pageCard } from './cards/page.js';
import { paletteCard } from './cards/palette.js';
import { SHAPE_TABS, TOOLBAR_EXCLUDE, UNDRAWN } from './constants.js';
import { Draft } from './draft.js';
import type { Env, GalleryRef } from './env.js';
import { disableIfReadOnly, renderErrors } from './fields.js';
import { itemGallery, pagePresetGallery } from './gallery.js';
import { header } from './header.js';
import { ThemeLibrary } from './library.js';
import { listView, type ListView } from './list-view.js';
import { createPreview, type Preview } from './preview.js';
import { renderProps } from './props.js';
import { styleApi } from './toolbar-api.js';
import type { ThemeEditorOptions, TileSel } from './types.js';
import { derived, emit, isObj } from './util.js';

export class ThemeEditor {
  readonly ctx: CoreContext;
  /** Resolves when the theme list is loaded and the first theme is open. */
  ready: Promise<void>;
  private o: ThemeEditorOptions;
  /** The shadow root, i18n, context, storage, popovers, dialogs, scheme and events (A8: the kernel's component shell, without a scene kernel). */
  private readonly shell: ComponentShell;
  private readonly storage: StorageAdapter;
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
  private readonly toolbar: StyleToolbarHandle;
  private readonly dialogs: Dialogs;
  private readonly pops: PopoverManager;
  private readonly toaster: Toaster;
  private readonly keys = new ShortcutRegistry();
  private readonly ac = new AbortController();
  private readonly owner = new Owner('theme editor');
  private readonly draft: Draft;
  private readonly lib: ThemeLibrary;
  private readonly env: Env;
  private readonly listView: ListView;
  private readonly preview: Preview;

  // view state
  private readonly sel = signal<TileSel | null>(null);
  /** The selected page preset (the preview shows its type's sample on that page). */
  private readonly pagePreset = signal<{ type: DiagramType; preset: string } | null>(null, (a, b) => a?.type === b?.type && a?.preset === b?.preset);
  private readonly previewType = signal<DiagramType>('flowchart');
  private readonly samples = signal<Readonly<Record<string, string>>>({});
  private readonly zoom = signal(1);
  /** Bumps when edits should show in the preview (after a pause). */
  private readonly view = signal(0);
  /** Bumps when options the views show change (canEdit, canDelete, canPublish). */
  private readonly rev = signal(0);
  private mainScope = new Scope();
  private viewT: ReturnType<typeof setTimeout> | undefined;
  private laidOut = false;
  private destroyed = false;

  constructor(private readonly host: HTMLElement, options: ThemeEditorOptions = {}) {
    registerMessages(THEME_EDITOR_MESSAGES);
    void ensureBuiltinThemes();
    registerMessages(TOOLBAR_MESSAGES);
    this.o = { ...options };
    const shell = (this.shell = new ComponentShell(host, { product: 'theme-editor', storage: options.storage, ctx: options.ctx, ui: options.ui }));
    this.i18n = shell.i18n;
    this.ctx = shell.ctx;
    this.storage = shell.storage;
    this.shadow = shell.shadow;
    adoptStyles(this.shadow, [TOKENS, ALIASES, BASE, DIALOG_CSS, TOOLBAR_CSS, BAR_CSS, ZOOM_BAR_CSS, TABS_CSS, SEGMENTED_CSS, MENU_CSS, DISCLOSURE_CSS, TILE_GALLERY_CSS, COLOR_PICKER_CSS, THEME_EDITOR_CSS]);
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
    this.dialogs = shell.dialogs;
    this.pops = shell.popovers;
    this.toaster = new Toaster(this.shadow);

    // the draft reads the library's registry (created next) only when it resolves
    this.draft = new Draft(derived(() => this.lib.reg()), () => this.canEdit());
    this.lib = new ThemeLibrary(options.store ?? memoryThemeStore(BUILTIN_THEMES), this.draft, {
      dialogs: this.dialogs,
      toast: (text, error) => this.toaster.show(text, error ? { error: true } : {}),
      showErrors: (title, lines) => this.showErrors(title, lines),
      download: (name, text) => download(name, text, 'application/json'),
      emit: (type, detail, cancelable) => emit(this.host, type, detail, cancelable),
      options: () => this.o,
      ctx: this.ctx,
      t,
    });
    const galleries = new Set<GalleryRef>();
    this.env = {
      t, tf: (key, fallback) => {
        const v = t(key);
        return v === key ? fallback : v;
      },
      ctx: this.ctx, shadow: this.shadow, dlg: this.dlg, main: this.main, body: this.body,
      draft: this.draft, lib: this.lib, dialogs: this.dialogs, pops: this.pops,
      sel: this.sel, zoom: this.zoom, tabShape: {}, openCards: new Set(['palette']), galleries,
      scope: () => this.mainScope,
      canEdit: () => this.canEdit(),
      presentation: () => this.presentation(),
      selectTile: (s) => this.selectTile(s),
      showPreview: (type) => this.previewType.set(type),
      decorate: (root) => this.decorate(root),
      flush: () => this.flush(),
      renderProps: () => renderProps(this.env),
    };

    this.layout(); // before the toolbar: it scopes its listeners to the root node of its host
    // the canvas's floating style toolbar, editing the selected tile's style
    this.toolbar = createStyleToolbar(this.body, styleApi(this.env, () => this.toolbar), { exclude: TOOLBAR_EXCLUDE, reset: true, i18n: this.i18n });
    const sig = { signal: this.ac.signal };
    this.main.addEventListener('scroll', () => this.toolbar.place(), sig);
    this.main.addEventListener('pointerdown', (ev) => {
      const t0 = ev.composedPath()[0] as Element;
      if (!t0.closest?.('.te-tile, .te-tile-del, .mtb, .te-props')) this.selectTile(null);
    }, sig);
    this.fileInput.addEventListener('change', () => void this.importFile(), sig);
    this.frame.addEventListener('pointerdown', (ev) => {
      if (ev.target === this.frame && this.presentation() === 'dialog') void this.close();
    }, sig);
    this.preview = createPreview(this.env, this.side, {
      type: this.previewType, samples: this.samples, hostSamples: () => this.o.samples, view: this.view,
      pagePreset: derived(() => {
        const p = this.pagePreset();
        return p && p.type === this.previewType() ? p.preset : null;
      }),
      keep: (samples) => this.storage.set('teSamples', samples),
    });
    this.listView = listView(this.env, this.list, () => this.o, () => this.fileInput.click());
    this.wire();
    this.wireKeys();
    this.owner.add(effect(() => void this.host.setAttribute('data-ui', shell.scheme())));
    this.ready = this.lib.load(options.theme);
  }

  // ---- public API -------------------------------------------------------------------------------------------------

  get options(): Readonly<ThemeEditorOptions> {
    return this.o;
  }

  /** The draft differs from the saved theme. */
  get dirty(): boolean {
    return !!this.draft.current() && this.draft.dirty.peek();
  }

  /** Id of the theme being edited. */
  get themeId(): string {
    return this.draft.id.peek();
  }

  /** A copy of the draft. */
  get draftTheme(): ThemeFile | null {
    return this.draft.snapshot();
  }

  /**
   * Changes options. Resolves with the id of the theme open once what the patch asked for is done: a `theme` asked for
   * before the list loaded opens when it is in; a switch the user cancels (unsaved changes) keeps the open theme.
   */
  set(patch: Partial<ThemeEditorOptions>): Promise<string> {
    const prev = this.o;
    this.o = { ...this.o, ...patch };
    const id = (): string => this.draft.id.peek();
    if ('ui' in patch) this.shell.setUi(this.o.ui);
    if ('presentation' in patch && patch.presentation !== prev.presentation) this.layout();
    if ('storage' in patch && patch.storage) {
      this.shell.setStorage(patch.storage);
      this.readPrefs();
    }
    if (('store' in patch && patch.store && patch.store !== prev.store) || ('source' in patch && patch.source !== prev.source)) {
      if (patch.store) this.lib.store = patch.store;
      this.ready = this.lib.load(this.o.theme ?? id());
      return this.ready.then(id);
    }
    let done: Promise<unknown> = Promise.resolve();
    if ('theme' in patch && patch.theme) {
      // before the list is in, the theme waits for it
      if (!this.lib.loaded) {
        this.lib.queue(patch.theme);
        done = this.ready;
      } else if (patch.theme !== id()) done = this.lib.select(patch.theme, false);
    }
    if ('canEdit' in patch || 'canDelete' in patch || 'canPublish' in patch) this.rev.update((n) => n + 1);
    if ('samples' in patch) this.view.update((n) => n + 1);
    return done.then(id);
  }

  /** Validates and saves the draft. Resolves false when nothing was saved. */
  save(): Promise<boolean> {
    return this.lib.save();
  }

  undo(): void {
    this.draft.undo();
  }

  redo(): void {
    this.draft.redo();
  }

  /** Switches to another theme (asks about unsaved changes). */
  select(id: string, opts: { force?: boolean } = {}): Promise<boolean> {
    return this.lib.select(id, opts.force ?? false);
  }

  /** Drops the unsaved changes. */
  discard(): void {
    this.draft.discard();
  }

  /** Imports a theme file's text: validated first; an invalid file is reported and nothing is saved. */
  importText(text: string): Promise<boolean> {
    return this.lib.importText(text);
  }

  open(): void {
    this.frame.hidden = false;
    queueMicrotask(() => this.dlg.focus());
  }

  /** Dialog presentation: closes after asking about unsaved changes. Resolves false when the user stays. */
  async close(): Promise<boolean> {
    if (this.presentation() !== 'dialog') return true;
    if (!(await this.lib.confirmLeave()) || this.destroyed) return false;
    this.frame.hidden = true;
    emit(this.host, 'mmdx-theme-close', { id: this.draft.id.peek() });
    return true;
  }

  /** Releases everything: open dialogs are cancelled, timers and listeners stopped, the DOM removed. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this.viewT);
    this.lib.destroy();
    this.dialogs.destroy();
    this.ac.abort();
    this.owner.dispose();
    this.mainScope.dispose();
    this.listView.destroy();
    this.preview.destroy();
    this.toolbar.destroy();
    this.pops.close();
    this.toaster.destroy();
    this.shell.destroy();
    this.draft.dispose();
    this.frame.remove();
  }

  // ---- setup ------------------------------------------------------------------------------------------------------

  private presentation(): 'inline' | 'dialog' {
    return this.o.presentation === 'dialog' ? 'dialog' : 'inline';
  }

  private canEdit(): boolean {
    return this.o.canEdit !== false;
  }

  /** Inline: a region filling the host. Dialog: a modal over the page (a closed one stays closed). */
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
    this.frame.className = dialog ? 'te-overlay' : 'te-inline';
    this.frame.style.height = dialog ? '' : '100%';
    this.frame.append(this.dlg);
    // shown when first laid out and when embedded; a dialog the user closed stays closed
    this.frame.hidden = dialog && this.laidOut ? this.frame.hidden : false;
    this.laidOut = true;
  }

  private readPrefs(): void {
    const s = this.storage.get<unknown>('teSamples');
    const samples: Record<string, string> = {};
    if (isObj(s)) for (const [k, v] of Object.entries(s)) if (typeof v === 'string') samples[k] = v;
    this.samples.set(samples);
    const z = Number(this.storage.get<unknown>('teZoom'));
    this.zoom.set(Number.isFinite(z) && z > 0 ? Math.min(1.5, Math.max(0.5, z)) : 1);
  }

  /** The effects that keep the views in step with the draft and the library. */
  private wire(): void {
    const fx = (f: () => void): void => this.owner.effect(f);
    // the main column: a theme opened, undo / redo / discard, or the options it shows changed
    fx(() => {
      this.draft.epoch();
      this.rev();
      untracked(() => this.renderMain());
    });
    // the theme list
    fx(() => {
      this.lib.files();
      this.draft.id();
      this.draft.dirty();
      this.rev();
      untracked(() => this.listView.render());
    });
    // unsaved changes are marked: elements carry data-dirty="path|path…" (paths into the theme)
    fx(() => {
      this.draft.changed();
      untracked(() => this.marks(this.dlg));
    });
    fx(() => {
      this.draft.errors();
      untracked(() => renderErrors(this.env));
    });
    // edits: tiles and the preview follow after a short pause, so dragging a slider is not interrupted
    fx(() => {
      this.draft.version();
      untracked(() => {
        clearTimeout(this.viewT);
        this.viewT = setTimeout(() => this.refreshView(), 120);
      });
    });
    let dirty = false;
    fx(() => {
      const d = this.draft.dirty();
      if (d === dirty) return;
      dirty = d;
      emit(this.host, 'mmdx-theme-dirty', { id: this.draft.id.peek(), dirty: d });
    });
  }

  private wireKeys(): void {
    const t = this.i18n.t;
    this.keys.add(
      { id: 'save', keys: ['mod+s'], label: t('te.saveBtn'), group: 'theme', inText: true, run: () => void this.save() },
      { id: 'undo', keys: ['mod+z'], label: t('te.undo', { keys: formatKeys('mod+z') }), group: 'theme', run: () => this.undo() },
      { id: 'redo', keys: ['mod+shift+z', 'mod+y'], label: t('te.redo', { keys: formatKeys('mod+shift+z') }), group: 'theme', run: () => this.redo() },
      // Esc: colour picker / menu → style toolbar popover → selected tile → the dialog
      {
        id: 'esc', keys: ['escape'], label: 'Esc', group: 'theme', inText: true, run: () => {
          if (this.pops.isOpen) this.pops.close(true);
          else if (this.toolbar.isOpen()) this.toolbar.close(true);
          else if (this.sel.peek()) this.selectTile(null);
          else if (this.presentation() === 'dialog') void this.close();
          else return false;
          return true;
        },
      },
    );
    // keys typed in the editor never reach the page behind it
    this.dlg.addEventListener('keydown', (ev) => {
      if (this.shadow.querySelector('.mmdx-dialog-back')) return;
      this.keys.handle(ev, true);
    }, { signal: this.ac.signal });
  }

  // ---- views ------------------------------------------------------------------------------------------------------

  /** The main column, rebuilt from the draft (its cards keep their open state). */
  private renderMain(): void {
    const t = this.i18n.t;
    const env = this.env;
    this.mainScope.dispose();
    this.mainScope = new Scope();
    // built from the draft as it is: nothing is left to catch up with
    clearTimeout(this.viewT);
    this.draft.takeTouched();
    this.selectTile(null);
    this.main.replaceChildren();
    if (!this.draft.current()) {
      this.main.append(h('div', { class: 'te-loading' }, t('te.loading')));
      return;
    }
    this.dlg.classList.toggle('te-ro', !this.canEdit());
    this.roTag.hidden = this.canEdit();
    this.main.style.setProperty('--tz', String(this.zoom.peek()));
    this.main.append(header(env, this.roTag, { save: () => void this.save(), undo: () => this.undo(), redo: () => this.redo(), zoomed: () => this.zoomed() }), h('div', { class: 'te-errors', role: 'alert', hidden: true }));
    const base = this.draft.isBase();
    this.main.append(
      card(env, { key: 'palette', title: t('te.palette'), fill: (box) => paletteCard(env, box), hint: base ? t('te.paletteHintBase') : t('te.paletteHintTheme'), dirty: ['palette'] }),
      card(env, { key: 'page', title: t('te.page'), fill: (box) => pageCard(env, box), dirty: ['appearance', 'font', 'canvas'] }),
    );
    for (const sec of THEME_SECTIONS) {
      this.main.append(h('div', { class: 'te-type', role: 'heading', 'aria-level': '3', dataset: { dirty: sec.type } }, env.tf(`te.section.${sec.type}`, sec.title)));
      const onOpen = (): void => this.previewType.set(sec.type);
      for (const it of sec.items) {
        const tabs = SHAPE_TABS[it.preview ?? it.key];
        const dirty = [`${sec.type}.${it.key}`, it.presets ? `${sec.type}.${it.presets}` : '', tabs ? `${sec.type}.${tabs.key}` : ''].filter(Boolean);
        this.main.append(card(env, { key: `${sec.type}.${it.key}`, title: env.tf(`te.item.${sec.type}.${it.key}`, env.tf(`te.item.${it.key}`, it.label)), fill: (box) => itemGallery(env, box, sec.type, it), onOpen, dirty }));
      }
      this.main.append(card(env, { key: `${sec.type}.pagePresets`, title: t('te.pageCard'), fill: (box) => pagePresetGallery(env, box, sec.type), hint: t('te.pageHint'), onOpen, dirty: [`${sec.type}.pagePresets`] }));
    }
    this.decorate(this.main);
  }

  /** Unsaved-change marks, field errors and the read-only state of `root`'s elements. */
  private decorate(root: Element): void {
    this.marks(root);
    renderErrors(this.env, root);
    disableIfReadOnly(this.env, root);
  }

  private marks(root: Element): void {
    const els = [...root.querySelectorAll<HTMLElement>('[data-dirty]')];
    if (root instanceof HTMLElement && root.dataset['dirty'] !== undefined) els.push(root);
    for (const e of els) e.classList.toggle('dirty', (e.dataset['dirty'] ?? '').split('|').some((p) => !!p && this.draft.isChanged(p)));
  }

  /** The draft's changes since the last time: the tiles they affect, the preview and the selected tile's toolbar. */
  private refreshView(): void {
    clearTimeout(this.viewT);
    const paths = this.draft.takeTouched();
    if (![...paths].some((p) => !UNDRAWN.has(p.split('.')[0]!))) return;
    for (const g of [...this.env.galleries]) g.refresh(paths);
    this.view.update((n) => n + 1);
    const s = this.sel.peek();
    if (!s) return;
    // while one of the toolbar's popovers is open (a slider is being dragged) only move the toolbar: rebuilding it
    // would replace the control in the user's hand
    if (this.toolbar.isOpen()) this.toolbar.place();
    else this.toolbar.refresh();
    // the properties follow, unless they are being edited
    if (!s.props.contains(this.shadow.activeElement)) renderProps(this.env);
  }

  private flush(): void {
    this.draft.endGroup();
    this.refreshView();
  }

  /** The tile zoom changed: kept in the UI storage; every tile is redrawn. */
  private zoomed(): void {
    this.storage.set('teZoom', this.zoom.peek());
    this.main.style.setProperty('--tz', String(this.zoom.peek()));
    for (const g of [...this.env.galleries]) g.refresh(null);
  }

  private selectTile(s: TileSel | null): void {
    this.sel.set(s);
    this.pagePreset.set(s?.kind === 'page' && s.preset ? { type: s.type, preset: s.preset } : null);
    this.main.querySelectorAll<HTMLElement>('.te-props').forEach((p) => {
      if (!s || p !== s.props) p.replaceChildren();
    });
    if (s) {
      this.previewType.set(s.type);
      renderProps(this.env);
    }
    this.toolbar.refresh();
  }

  private async importFile(): Promise<void> {
    const f = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (f) await this.lib.importText(await f.text());
  }

  private async showErrors(title: string, lines: readonly string[]): Promise<void> {
    const t = this.i18n.t;
    const body = h('div', null, h('p', null, t('te.importErrors')), h('ul', { class: 'te-import-errors' }, ...lines.slice(0, 30).map((l) => h('li', null, l))));
    await this.dialogs.choose({ title, body, cancel: null, buttons: [{ label: 'OK', value: null, primary: true }] });
  }
}
