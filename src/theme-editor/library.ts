// The theme library (no DOM): the themes of the store and the source, and what is done with them — load, select
// (asking about unsaved changes), save (validated, conflict-checked, light / dark links kept mutual), create,
// duplicate, import, export, revert, delete and publish. Dialogs, toasts, downloads and events go through the ports
// the editor passes in.
import type { ThemeStore } from '../adapters/themes.js';
import type { CoreContext } from '../core/context.js';
import { BUILTIN_THEMES } from '../core/theme/builtin.js';
import { BASELINE, ThemeRegistry } from '../core/theme/registry.js';
import { THEME_SCHEMA_VERSION, type ThemeFile } from '../core/theme/types.js';
import { validateTheme } from '../core/theme/validate.js';
import type { Translate } from '../ui/blocks/block.js';
import type { Dialogs } from '../ui/dialog.js';
import { signal } from '../ui/signal.js';
import type { Draft } from './draft.js';
import type { Entry, ThemeEditorEventMap, ThemeEditorOptions } from './types.js';
import { clone, obj, slug, type Obj } from './util.js';

/** What the library asks of its host: dialogs, messages, a download, events. */
export interface LibraryPorts {
  dialogs: Pick<Dialogs, 'choose' | 'confirm' | 'prompt'>;
  toast(text: string, error?: boolean): void;
  /** An import that failed: the reasons, in a dialog. */
  showErrors(title: string, lines: readonly string[]): Promise<void>;
  download(name: string, text: string): void;
  emit<K extends keyof ThemeEditorEventMap>(type: K, detail: ThemeEditorEventMap[K]['detail'], cancelable?: boolean): boolean;
  options(): Readonly<ThemeEditorOptions>;
  ctx: CoreContext;
  t: Translate;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class ThemeLibrary {
  /** The themes: baseline first, then the store's / source's order. */
  readonly files = signal<ReadonlyMap<string, Entry>>(new Map());
  /** Private registry: built-ins, then the source, then the store (later files win). */
  readonly reg = signal(new ThemeRegistry(BUILTIN_THEMES));
  /** The list is in (a theme asked for before waits for it). */
  loaded = false;
  private destroyed = false;
  private loadSeq = 0;
  private unsubStore: (() => void) | undefined;
  private queued: string | undefined;

  constructor(public store: ThemeStore, private readonly draft: Draft, private readonly ports: LibraryPorts) {}

  canEdit(): boolean {
    return this.ports.options().canEdit !== false;
  }

  /** Loads the list (again, e.g. for another store) and opens `want`, the open theme, the baseline or the first. */
  async load(want?: string): Promise<void> {
    const seq = ++this.loadSeq;
    this.unsubStore?.();
    this.unsubStore = this.store.subscribe?.(() => void this.refresh());
    const files = await this.fetch();
    if (seq !== this.loadSeq || this.destroyed) return;
    this.setFiles(files);
    this.loaded = true;
    const target = this.queued ?? want;
    this.queued = undefined;
    const open = this.draft.current() ? this.draft.id.peek() : undefined;
    await this.select(target && files.has(target) ? target : open && files.has(open) ? open : files.has(BASELINE) ? BASELINE : [...files.keys()][0] ?? BASELINE, true);
  }

  /** A theme asked for before the list is in: opened once it is. */
  queue(id: string): void {
    this.queued = id;
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubStore?.();
  }

  private async fetch(): Promise<Map<string, Entry>> {
    const files = new Map<string, Entry>();
    const src = this.ports.options().source;
    if (src) {
      const infos = await src.list().catch(() => []);
      await Promise.all(infos.map(async (i) => {
        const f = await src.get(i.id).catch(() => null);
        if (f) files.set(f.id, { file: f, inStore: false, inSource: true, sourceFile: f });
      }));
    }
    const store = this.store;
    const infos = await store.list().catch(() => []);
    await Promise.all(infos.map(async (i) => {
      const f = await store.get(i.id).catch(() => null);
      if (!f) return;
      const prev = files.get(f.id);
      const e: Entry = { file: f, inStore: true, inSource: !!prev };
      if (i.version !== undefined) e.version = i.version;
      if (prev?.sourceFile) e.sourceFile = prev.sourceFile;
      if (store.usage) {
        const n = await store.usage(f.id).catch(() => undefined);
        if (n !== undefined) e.usage = n;
      }
      files.set(f.id, e);
    }));
    // baseline first, then the store's / source's order
    const order = [BASELINE, ...infos.map((i) => i.id), ...files.keys()];
    return new Map([...new Set(order)].filter((id) => files.has(id)).map((id) => [id, files.get(id)!]));
  }

  private setFiles(files: ReadonlyMap<string, Entry>): void {
    this.files.set(files);
    this.reg.set(new ThemeRegistry([...BUILTIN_THEMES, ...[...files.values()].map((e) => e.file)]));
  }

  private setEntry(e: Entry): void {
    this.setFiles(new Map(this.files.peek()).set(e.file.id, e));
  }

  private async refresh(): Promise<void> {
    const files = await this.fetch();
    if (!this.destroyed) this.setFiles(files);
  }

  isEdited(e: Entry): boolean {
    return e.inStore && !!e.sourceFile && JSON.stringify(e.sourceFile) !== JSON.stringify(e.file);
  }

  /** Switches to another theme (asking about unsaved changes unless `force`). Resolves false when the user stays. */
  async select(id: string, force: boolean): Promise<boolean> {
    const d = this.draft;
    if (!force && d.current() && id === d.id.peek()) return true;
    if (!force && d.current() && !(await this.confirmLeave())) return false;
    if (this.destroyed) return false;
    const files = this.files.peek();
    const e = files.get(id) ?? files.get(BASELINE) ?? [...files.values()][0];
    d.open(e?.file.id ?? id, e ? (e.file as unknown as Obj) : { id });
    this.ports.emit('mmdx-theme-select', { id: d.id.peek() });
    return true;
  }

  /** Leaving a theme with unsaved changes: save, discard or stay. */
  async confirmLeave(): Promise<boolean> {
    const d = this.draft, t = this.ports.t;
    d.endGroup();
    if (!d.current() || !d.dirty.peek()) return true;
    const r = await this.ports.dialogs.choose<'save' | 'discard' | 'cancel'>({
      title: t('te.unsavedTitle'),
      message: t('te.saveChanges', { name: d.name() }),
      cancel: 'cancel',
      buttons: [{ label: t('te.cancel'), value: 'cancel' }, { label: t('te.dontSave'), value: 'discard', danger: true }, ...(this.canEdit() ? [{ label: t('te.save'), value: 'save' as const, primary: true }] : [])],
    });
    if (r === 'cancel' || this.destroyed) return false;
    if (r === 'save') return this.save();
    d.discard();
    return true;
  }

  /** Validates and saves the draft. Resolves false when nothing was saved; a failed save leaves the draft as it was. */
  async save(): Promise<boolean> {
    const d = this.draft;
    d.endGroup();
    if (!d.current() || !this.canEdit()) return false;
    if (!d.dirty.peek()) return true;
    // validated as a copy: the draft takes the schema version only once it is saved
    const file = { ...d.snapshot()!, schemaVersion: THEME_SCHEMA_VERSION };
    if (!this.checkValid(file)) return false;
    const before = this.files.peek().get(file.id)?.file.counterpart;
    const ok = await this.persist(file);
    if (ok) await this.syncLink(file, before);
    if (ok && !this.destroyed && d.id.peek() === file.id) d.markSaved(file as unknown as Obj);
    return ok;
  }

  /** Schema validation; errors are shown per field. */
  private checkValid(file: unknown): boolean {
    const { theme, diagnostics } = validateTheme(file);
    const bad = diagnostics.filter((x) => x.severity !== 'info');
    this.draft.errors.set(new Map(bad.map((x) => [String(x.params?.['key'] ?? x.code), x.message])));
    if (!theme || bad.length) {
      this.ports.toast(this.ports.t('te.saveErrorsTitle'), true);
      return false;
    }
    return true;
  }

  /** Writes a validated file through the store (mmdx-theme-save first; conflict dialog on a version clash). */
  private async persist(file: ThemeFile, force = false): Promise<boolean> {
    const { t, emit, toast } = this.ports;
    if (!emit('mmdx-theme-save', { theme: clone(file) }, true)) {
      toast(t('te.saveCancelled'));
      return false;
    }
    const entry = this.files.peek().get(file.id);
    let res;
    try {
      res = await this.store.save(clone(file), !force && entry?.inStore && entry.version !== undefined ? { version: entry.version } : {});
    } catch (e) {
      toast(t('te.saveFailed', { msg: message(e) }), true);
      return false;
    }
    if (this.destroyed) return false;
    if ('conflict' in res) {
      const theirs = res.conflict;
      const r = await this.ports.dialogs.choose<'overwrite' | 'reload' | 'cancel'>({
        title: t('te.conflictTitle'),
        message: t('te.conflictMsg', { name: file.name ?? file.id }),
        cancel: 'cancel',
        buttons: [{ label: t('te.cancel'), value: 'cancel' }, { label: t('te.reload'), value: 'reload' }, { label: t('te.overwrite'), value: 'overwrite', danger: true }],
      });
      if (this.destroyed) return false;
      if (r === 'overwrite') return this.persist(file, true);
      if (r === 'reload') {
        const e: Entry = { ...(entry ?? { inStore: true, inSource: false }), file: theirs, inStore: true };
        const info = (await this.store.list().catch(() => [])).find((i) => i.id === theirs.id);
        if (info?.version !== undefined) e.version = info.version;
        this.setEntry(e);
        this.ports.ctx.themes.register(theirs);
        await this.select(theirs.id, true);
      }
      return false;
    }
    this.setEntry({ ...(entry ?? { inStore: true, inSource: false }), file: clone(file), inStore: true, version: res.version });
    // open viewers and editors pick the saved theme up through the shared registry
    this.ports.ctx.themes.register(clone(file));
    emit('mmdx-theme-saved', { theme: clone(file), version: res.version });
    toast(t('te.saved', { name: file.name ?? file.id }));
    return true;
  }

  /**
   * Keeps light / dark links mutual: the newly linked theme links back to this one, and a theme that linked here
   * before is unlinked. Each change is saved through the store like any other edit.
   */
  private async syncLink(file: ThemeFile, before: string | undefined): Promise<void> {
    const now = file.counterpart;
    const files = (): ReadonlyMap<string, Entry> => this.files.peek();
    const write = async (id: string, counterpart: string | undefined): Promise<void> => {
      const e = files().get(id);
      if (!e || e.file.counterpart === counterpart) return;
      const next = clone(e.file);
      if (counterpart === undefined) delete next.counterpart;
      else next.counterpart = counterpart;
      next.schemaVersion = THEME_SCHEMA_VERSION;
      await this.persist(next);
    };
    if (now) {
      // the partner's old partner loses its link: a theme has one counterpart
      const prev = files().get(now)?.file.counterpart;
      if (prev && prev !== file.id && files().get(prev)?.file.counterpart === now) await write(prev, undefined);
      await write(now, file.id);
    }
    if (before && before !== now && files().get(before)?.file.counterpart === file.id) await write(before, undefined);
  }

  async askDiscard(): Promise<void> {
    const t = this.ports.t;
    if (await this.ports.dialogs.confirm(t('te.discard'), t('te.discardQ', { name: this.draft.name() }), { ok: t('te.discard'), cancel: t('te.cancel'), danger: true }))
      if (!this.destroyed) this.draft.discard();
  }

  /** Drops the store's changes on top of the theme file. */
  async revert(): Promise<void> {
    const { t, dialogs } = this.ports;
    const id = this.draft.id.peek();
    if (!(await dialogs.confirm(t('te.revert'), t('te.revertQ', { name: this.draft.name() }), { ok: t('te.revert'), cancel: t('te.cancel'), danger: true })) || this.destroyed) return;
    try {
      await this.store.delete?.(id);
    } catch (e) {
      this.ports.toast(t('te.revertFailed', { msg: message(e) }), true);
      return;
    }
    const e = this.files.peek().get(id);
    if (e?.sourceFile) this.ports.ctx.themes.register(e.sourceFile);
    const files = await this.fetch();
    if (this.destroyed) return;
    this.setFiles(files);
    await this.select(files.has(id) ? id : BASELINE, true);
  }

  async remove(): Promise<void> {
    const { t, dialogs } = this.ports;
    const id = this.draft.id.peek();
    if (!(await dialogs.confirm(t('te.deleteQ', { name: this.draft.name() }), t('te.deleteMsg'), { ok: t('te.delete'), cancel: t('te.cancel'), danger: true })) || this.destroyed) return;
    try {
      await this.store.delete?.(id);
    } catch (e) {
      this.ports.toast(t('te.deleteFailed', { msg: message(e) }), true);
      return;
    }
    this.ports.ctx.themes.unregister(id);
    const files = await this.fetch();
    if (this.destroyed) return;
    this.setFiles(files);
    await this.select(BASELINE, true);
  }

  async publish(): Promise<void> {
    if (this.draft.dirty.peek() && !(await this.save())) return;
    try {
      await this.store.publish?.(this.draft.id.peek());
      this.ports.toast(this.ports.t('te.published', { name: this.draft.name() }));
    } catch (e) {
      this.ports.toast(message(e), true);
    }
  }

  private uniqueId(name: string): string {
    let id = slug(name), n = 2;
    while (this.files.peek().has(id) || id === BASELINE) id = `${slug(name)}-${n++}`;
    return id;
  }

  /** A new theme (extending the baseline), or a copy of `from`. */
  async create(from?: ThemeFile): Promise<void> {
    const { t, dialogs } = this.ports;
    if (!(await this.confirmLeave())) return;
    const name = await dialogs.prompt(t('te.nameTitle'), { label: t('te.nameTitle'), value: from ? t('te.copyName', { name: from.name ?? from.id }) : t('te.nameDefault'), ok: t('te.save') });
    if (!name || this.destroyed) return;
    const id = this.uniqueId(name);
    // a copy of the baseline overrides nothing yet
    const raw: Obj = from && from.id !== BASELINE ? { ...(clone(from) as unknown as Obj), id, name } : { id, name, extends: BASELINE };
    // a copy starts unlinked: its source's counterpart stays linked to the source
    delete raw['counterpart'];
    raw['schemaVersion'] = THEME_SCHEMA_VERSION;
    if (!this.checkValid(raw)) return;
    if (await this.persist(raw as unknown as ThemeFile)) await this.select(id, true);
  }

  /** Imports a theme file's text: validated first; an invalid file is reported and nothing is saved. */
  async importText(text: string): Promise<boolean> {
    const t = this.ports.t;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      await this.ports.showErrors(t('te.invalidTitle'), [t('te.invalidJson', { msg: message(e) })]);
      return false;
    }
    const { theme, diagnostics } = validateTheme(json);
    const bad = diagnostics.filter((x) => x.severity !== 'info');
    if (!theme || bad.length) {
      await this.ports.showErrors(t('te.invalidTitle'), bad.map((x) => x.message));
      return false;
    }
    if (theme.id !== BASELINE && !theme.extends) theme.extends = BASELINE;
    theme.schemaVersion = THEME_SCHEMA_VERSION;
    if (!(await this.confirmLeave())) return false;
    if (!(await this.persist(theme, true))) return false;
    await this.select(theme.id, true);
    return true;
  }

  /** Downloads the theme as a .theme.json file (asking first whether unsaved changes go with it). */
  async exportTheme(): Promise<void> {
    const t = this.ports.t;
    const d = this.draft;
    let file: unknown = this.files.peek().get(d.id.peek())?.file ?? d.current();
    if (d.current() && d.dirty.peek()) {
      const r = await this.ports.dialogs.choose<'save' | 'draft' | 'cancel'>({
        title: t('te.exportQ', { name: d.name() }),
        message: t('te.exportMsg'),
        cancel: 'cancel',
        buttons: [{ label: t('te.cancel'), value: 'cancel' }, { label: t('te.exportDraft'), value: 'draft' }, ...(this.canEdit() ? [{ label: t('te.saveExport'), value: 'save' as const, primary: true }] : [])],
      });
      if (r === 'cancel' || this.destroyed) return;
      if (r === 'save' && !(await this.save())) return;
      file = d.current();
    }
    const out = { ...clone(obj(file)), schemaVersion: THEME_SCHEMA_VERSION };
    this.ports.download(`${d.id.peek()}.theme.json`, JSON.stringify(out, null, 2) + '\n');
  }
}
