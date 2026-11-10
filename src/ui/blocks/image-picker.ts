// ImagePicker (T05 §4.4): the image tool, in three tabs — the host's image library (`library`: a grid of its pictures,
// searched and paged), an upload (`upload`: a drop zone, a file input and paste, with an offer to reduce a picture over
// `maxSide` pixels first) and a URL field checked live against the host's rule (the editor: the image policy, with the
// reason in words). Images are always referenced by URL (no embedding): a library picture's or an uploaded file's
// record gives it. The Library and Upload tabs show only when the host has them; a dropped or pasted file without an
// upload is refused with `onRefused` (the host's toast).
import type { ImageInfo, ImagePage } from '../../adapters/images.js';
import { h } from '../h.js';
import { registerMessages } from '../i18n.js';
import { BLOCK_MESSAGES_MEDIA } from '../messages/blocks-media.js';
import { Scope, type BlockHandle, type Translate } from './block.js';
import { createTabs, TABS_CSS } from './tabs.js';

/** The picture types the file input offers. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'] as const;

/** Where an image comes from: the host's library, an upload, a URL — or an icon instead of a picture. */
export type ImageTab = 'library' | 'upload' | 'url' | 'icon';

export interface ImagePickerProps {
  t: Translate;
  /** The dialog's accessible name (default "Image"; no heading is shown). */
  title?: string;
  /** The URL shown at first (selection mode: the item's image). */
  value?: string;
  /** The submit button's text (default "Add image"). */
  submitLabel?: string;
  /** Why a URL cannot be used (null: it can); called while typing. */
  check(url: string): string | null;
  /** The host's pictures (newest first, paged, filtered by a name); absent: no Library tab. */
  library?: ((o: { cursor?: string; query?: string }) => Promise<ImagePage>) | null;
  /** The URL a library picture's tile shows (its `thumb`, else its `url` resolved; null: a blank tile). */
  thumbUrl?: (image: ImageInfo) => string | null;
  /** Uploads a file and gives its URL; absent: no Upload tab, drop or paste. */
  upload?: ((file: File) => Promise<string>) | null;
  /** The tab shown first (default: the library when there is one, else the URL). */
  tab?: ImageTab;
  /** The content of an Icon tab (an icon picker: an icon as the image's source); absent: no Icon tab. */
  icon?: HTMLElement | null;
  /** The Icon tab is shown (focus its search). */
  onIconTab?(): void;
  /** A file's pixel size (null: unknown), to offer reducing it. */
  measure?: (file: File) => Promise<{ w: number; h: number } | null>;
  /** Re-encodes a file to at most `side` px on its longer side. */
  reduce?: (file: File, side: number) => Promise<File>;
  /** Longer side above which reducing is offered (default 1600). */
  maxSide?: number;
  onSubmit(url: string): void;
  /** Shows "Remove image" (selection mode with an image). */
  onRemove?: (() => void) | null;
  /** A file was dropped or pasted, but there is no upload (or it was not an image): the reason, for a toast. */
  onRefused?(message: string): void;
}

export interface ImagePickerHandle extends BlockHandle<ImagePickerProps> {
  focus(): void;
  /** Takes a file as if dropped (canvas paste). */
  takeFile(file: File): Promise<void>;
  /** Reads the library's first page again (the store changed). */
  refresh(): Promise<void>;
  readonly url: string;
  readonly tab: ImageTab;
}

export const IMAGE_PICKER_CSS = /* css */ `${TABS_CSS}
.imp { width: 340px; max-width: calc(100vw - 24px); display: flex; flex-direction: column; gap: 8px; }
.imp-tabs { gap: 2px; padding: 2px; border-radius: 10px; background: var(--mmdx-float-2); }
.imp-tabs [role=tab] { flex: 1; border: 0; background: none; padding: 5px 8px; font-size: 12px; border-radius: 8px; color: var(--mmdx-text-2); }
.imp-tabs [role=tab][aria-selected=true] { background: var(--mmdx-float); color: var(--mmdx-accent); font-weight: 600; box-shadow: 0 1px 2px rgba(20, 30, 60, .12); }
.imp-panel { display: flex; flex-direction: column; gap: 8px; }
.imp-panel[hidden] { display: none; }
.imp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; max-height: 236px; overflow-y: auto; align-content: start; }
.imp-tile { aspect-ratio: 1; padding: 0; border: 1px solid var(--mmdx-border); border-radius: var(--mmdx-radius); background: var(--mmdx-surface-2, transparent); overflow: hidden; }
.imp-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
.imp-tile[aria-current=true] { outline: 2px solid var(--mmdx-accent); outline-offset: 1px; }
.imp-tile[aria-disabled=true] { opacity: .45; }
.imp-empty { font-size: 12px; color: var(--mmdx-muted); padding: 10px 0; text-align: center; }
.imp-more { align-self: center; }
.imp.imp-wide { width: 300px; }
.imp .ip { width: auto; }
.imp .ip-title { display: none; }
.imp-row { display: flex; gap: 6px; }
.imp-url { flex: 1; min-width: 0; }
.imp-url[aria-invalid=true] { border-color: var(--mmdx-danger); }
.imp-error { color: var(--mmdx-danger); font-size: 12px; min-height: 0; }
.imp-drop { border: 1.5px dashed var(--mmdx-border); border-radius: var(--mmdx-radius); padding: 14px 10px; text-align: center; font-size: 12px; color: var(--mmdx-muted); }
.imp-drop.over { border-color: var(--mmdx-accent); background: var(--mmdx-accent-2); }
.imp-drop button { border: 0; background: none; color: var(--mmdx-accent); padding: 0; text-decoration: underline; }
.imp-status { font-size: 12px; }
.imp-offer { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12px; }
.imp-foot { display: flex; justify-content: flex-end; }
`;

const isImage = (f: File): boolean => /^image\//.test(f.type);

export function createImagePicker(props: ImagePickerProps): ImagePickerHandle {
  registerMessages(BLOCK_MESSAGES_MEDIA);
  let p = { ...props };
  const scope = new Scope();
  const el = h('div', { class: 'imp', role: 'dialog' });
  // the library: a search, the grid, "Load more"
  const search = h('input', { type: 'search', class: 'imp-search', autocomplete: 'off', spellcheck: false });
  const grid = h('div', { class: 'imp-grid', role: 'list' });
  const empty = h('div', { class: 'imp-empty', role: 'status' });
  const more = h('button', { type: 'button', class: 'imp-more' });
  const input = h('input', { type: 'url', class: 'imp-url', autocomplete: 'off', spellcheck: false });
  const submit = h('button', { type: 'button', class: 'primary' });
  const error = h('div', { class: 'imp-error', role: 'alert' });
  const fileInput = h('input', { type: 'file', accept: IMAGE_TYPES.join(','), hidden: true });
  const choose = h('button', { type: 'button' });
  const drop = h('div', { class: 'imp-drop' });
  const status = h('div', { class: 'imp-status', role: 'status' });
  const offer = h('div', { class: 'imp-offer' });
  const foot = h('div', { class: 'imp-foot' });
  const panels: Record<ImageTab, HTMLElement> = {
    library: h('div', { class: 'imp-panel', role: 'tabpanel', dataset: { panel: 'library' } }, search, grid, empty, more),
    upload: h('div', { class: 'imp-panel', role: 'tabpanel', dataset: { panel: 'upload' } }, drop, fileInput, status, offer),
    url: h('div', { class: 'imp-panel', role: 'tabpanel', dataset: { panel: 'url' } }, h('div', { class: 'imp-row' }, input, submit), error),
    icon: h('div', { class: 'imp-panel', role: 'tabpanel', dataset: { panel: 'icon' } }),
  };
  const tabsOf = (): ImageTab[] => [...(p.library ? ['library' as const] : []), ...(p.upload ? ['upload' as const] : []), 'url', ...(p.icon ? ['icon' as const] : [])];
  let tab: ImageTab = p.tab && tabsOf().includes(p.tab) ? p.tab : tabsOf()[0]!;
  const tabs = createTabs<ImageTab>({ label: '', class: 'imp-tabs', tabs: [], value: tab, onChange: (v) => show(v) });
  scope.add(() => tabs.destroy());
  // no visible heading: the tabs say where the image comes from (the title is the dialog's accessible name)
  el.append(tabs.el, panels.library, panels.upload, panels.url, panels.icon, foot);
  let busy = false;

  // ---- library: pages of the host's pictures; a click takes one
  let page: { next?: string; query: string; seq: number } = { query: '', seq: 0 };
  const tile = (img: ImageInfo): HTMLElement => {
    const t = p.t;
    const why = p.check(img.url);
    const name = img.name ?? img.id;
    const src = p.thumbUrl ? p.thumbUrl(img) : img.thumb ?? img.url;
    const b = h('button', { type: 'button', class: 'imp-tile', role: 'listitem', title: why ? `${name} — ${why}` : name, 'aria-label': name, dataset: { id: img.id } },
      src ? h('img', { src, alt: '', loading: 'lazy', decoding: 'async', draggable: false }) : null);
    if (img.url === (p.value ?? '')) b.setAttribute('aria-current', 'true');
    if (why) b.setAttribute('aria-disabled', 'true');
    b.addEventListener('click', () => {
      if (why) {
        status.textContent = '';
        empty.textContent = t('image.libraryBlocked', { name, why });
        return;
      }
      p.onSubmit(img.url);
    });
    return b;
  };
  const load = async (append: boolean): Promise<void> => {
    const t = p.t;
    if (!p.library) return;
    const seq = ++page.seq;
    const query = search.value.trim();
    more.hidden = true;
    empty.textContent = t('image.libraryLoading');
    try {
      const r = await p.library({ ...(append && page.next ? { cursor: page.next } : {}), ...(query ? { query } : {}) });
      if (seq !== page.seq) return;
      page = { ...(r.next ? { next: r.next } : {}), query, seq };
      if (!append) grid.replaceChildren();
      grid.append(...r.images.map(tile));
      empty.textContent = grid.childElementCount ? '' : query ? t('image.libraryNone', { query }) : t('image.libraryEmpty');
      more.hidden = !r.next;
    } catch (e) {
      if (seq !== page.seq) return;
      empty.textContent = t('image.libraryFailed', { msg: e instanceof Error ? e.message : String(e) });
    }
  };
  let loaded = false;
  const show = (v: ImageTab): void => {
    tab = v;
    tabs.update({ value: v });
    for (const [k, panel] of Object.entries(panels)) panel.hidden = k !== v;
    if (v === 'library' && !loaded) {
      loaded = true;
      void load(false);
    }
    // the picture's Remove belongs to the picture tabs (the icon picker has its own)
    foot.hidden = !p.onRemove || v === 'icon';
    if (v === 'icon') p.onIconTab?.();
  };

  const validate = (show: boolean): string | null => {
    const url = input.value.trim();
    const why = url ? p.check(url) : null;
    input.setAttribute('aria-invalid', String(!!why && show));
    error.textContent = show && why ? why : '';
    submit.disabled = !url || !!why || busy;
    return url && !why ? url : null;
  };

  const send = async (file: File): Promise<void> => {
    const t = p.t;
    if (!p.upload) return void p.onRefused?.(t('image.noUpload'));
    busy = true;
    status.textContent = t('image.uploading', { name: file.name });
    validate(false);
    try {
      const url = await p.upload(file);
      status.textContent = '';
      busy = false;
      input.value = url;
      if (validate(true)) p.onSubmit(url);
    } catch (e) {
      busy = false;
      status.textContent = t('image.uploadFailed', { msg: e instanceof Error ? e.message : String(e) });
      validate(true);
    }
  };

  const takeFile = async (file: File): Promise<void> => {
    const t = p.t;
    offer.replaceChildren();
    if (!p.upload) return void p.onRefused?.(t('image.noUpload'));
    if (tab !== 'upload') show('upload');
    if (!isImage(file)) return void p.onRefused?.(t('image.notImage', { name: file.name }));
    const max = p.maxSide ?? 1600;
    const size = p.measure && p.reduce && file.type !== 'image/svg+xml' ? await p.measure(file).catch(() => null) : null;
    if (size && Math.max(size.w, size.h) > max && p.reduce) {
      const reduce = p.reduce;
      const small = h('button', { type: 'button', class: 'primary' }, t('image.reduce', { n: max }));
      const asIs = h('button', { type: 'button' }, t('image.asIs'));
      small.addEventListener('click', () => {
        offer.replaceChildren();
        void reduce(file, max).then(send, (e: unknown) => (status.textContent = t('image.uploadFailed', { msg: e instanceof Error ? e.message : String(e) })));
      });
      asIs.addEventListener('click', () => {
        offer.replaceChildren();
        void send(file);
      });
      offer.append(h('span', null, t('image.big', { name: file.name, w: size.w, h: size.h })), small, asIs);
      small.focus();
      return;
    }
    await send(file);
  };

  const render = (): void => {
    const t = p.t;
    el.setAttribute('aria-label', p.title ?? t('image.title'));
    input.placeholder = t('image.urlPlaceholder');
    input.setAttribute('aria-label', t('image.url'));
    submit.textContent = p.submitLabel ?? t('image.add');
    choose.textContent = t('image.choose');
    drop.replaceChildren(h('div', null, t('image.drop'), ' ', choose), h('div', null, t('image.types')));
    drop.hidden = !p.upload;
    search.placeholder = t('image.librarySearch');
    search.setAttribute('aria-label', t('image.librarySearch'));
    grid.setAttribute('aria-label', t('image.library'));
    more.textContent = t('image.libraryMore');
    const names: Record<ImageTab, string> = { library: t('image.tabLibrary'), upload: t('image.tabUpload'), url: t('image.tabUrl'), icon: t('image.tabIcon') };
    el.classList.toggle('imp-wide', !!p.icon);
    if (p.icon && p.icon.parentElement !== panels.icon) panels.icon.replaceChildren(p.icon);
    const list = tabsOf();
    if (!list.includes(tab)) tab = list[0]!;
    tabs.update({ label: t('image.source'), tabs: list.map((v) => ({ value: v, label: names[v] })), value: tab });
    tabs.el.hidden = list.length < 2;
    show(tab);
    foot.replaceChildren();
    if (p.onRemove) {
      const rm = h('button', { type: 'button', class: 'danger' }, t('image.remove'));
      rm.addEventListener('click', () => p.onRemove?.());
      foot.append(rm);
    }
    foot.hidden = !p.onRemove || tab === 'icon';
    validate(!!input.value);
  };

  input.value = p.value ?? '';
  scope.on(input, 'input', () => validate(true));
  scope.on(input, 'keydown', (ev: KeyboardEvent) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const url = validate(true);
    if (url) p.onSubmit(url);
  });
  scope.on(submit, 'click', () => {
    const url = validate(true);
    if (url) p.onSubmit(url);
  });
  scope.on(choose, 'click', () => fileInput.click());
  let typing = 0;
  scope.on(search, 'input', () => {
    clearTimeout(typing);
    typing = window.setTimeout(() => void load(false), 250);
  });
  scope.add(() => clearTimeout(typing));
  scope.on(search, 'keydown', (ev: KeyboardEvent) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    clearTimeout(typing);
    void load(false);
  });
  scope.on(more, 'click', () => void load(true));
  scope.on(fileInput, 'change', () => {
    const f = fileInput.files?.[0];
    if (f) void takeFile(f);
    fileInput.value = '';
  });
  scope.on(drop, 'dragover', (ev: DragEvent) => {
    ev.preventDefault();
    drop.classList.add('over');
  });
  scope.on(drop, 'dragleave', () => drop.classList.remove('over'));
  scope.on(el, 'drop', (ev: DragEvent) => {
    ev.preventDefault();
    drop.classList.remove('over');
    const f = ev.dataTransfer?.files?.[0];
    if (f) void takeFile(f);
  });
  // a picture on the clipboard (the paste event needs no permission prompt)
  scope.on(el, 'paste', (ev: ClipboardEvent) => {
    const f = [...(ev.clipboardData?.files ?? [])].find(isImage);
    if (!f) return;
    ev.preventDefault();
    void takeFile(f);
  });
  render();

  return {
    el,
    get url() {
      return input.value.trim();
    },
    get tab() {
      return tab;
    },
    focus: () => (tab === 'icon' ? p.onIconTab?.() : (tab === 'library' ? search : tab === 'upload' ? choose : input).focus()),
    takeFile,
    refresh: () => (loaded ? load(false) : Promise.resolve()),
    update(next) {
      p = { ...p, ...next };
      if (next?.value !== undefined) input.value = next.value;
      render();
    },
    destroy() {
      scope.dispose();
      el.remove();
    },
  };
}
