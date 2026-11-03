// ImagePicker (T05 §4.4): the image tool. Images are always referenced by URL (no embedding): a URL field checked live
// against the host's rule (the editor: the image policy, with the reason in words), and — only when the host can
// upload (`upload`) — a drop zone, a file input and paste, with an offer to reduce a picture over `maxSide` pixels
// before it is uploaded. Without `upload` the URL field is the only way in, and a dropped or pasted file is refused
// with `onRefused` (the host's toast).
import { h } from '../h.js';
import { registerMessages } from '../i18n.js';
import { BLOCK_MESSAGES_MEDIA } from '../messages/blocks-media.js';
import { Scope, type BlockHandle, type Translate } from './block.js';

/** The picture types the file input offers. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'] as const;

export interface ImagePickerProps {
  t: Translate;
  /** The heading (default "Image"). */
  title?: string;
  /** The URL shown at first (selection mode: the item's image). */
  value?: string;
  /** The submit button's text (default "Add image"). */
  submitLabel?: string;
  /** Why a URL cannot be used (null: it can); called while typing. */
  check(url: string): string | null;
  /** Uploads a file and gives its URL; absent: no drop zone, file input or paste. */
  upload?: ((file: File) => Promise<string>) | null;
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
  readonly url: string;
}

export const IMAGE_PICKER_CSS = /* css */ `
.imp { width: 340px; max-width: calc(100vw - 24px); display: flex; flex-direction: column; gap: 8px; }
.imp-title { font-weight: 600; font-size: 13px; }
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
  const title = h('div', { class: 'imp-title' });
  const input = h('input', { type: 'url', class: 'imp-url', autocomplete: 'off', spellcheck: false });
  const submit = h('button', { type: 'button', class: 'primary' });
  const error = h('div', { class: 'imp-error', role: 'alert' });
  const fileInput = h('input', { type: 'file', accept: IMAGE_TYPES.join(','), hidden: true });
  const choose = h('button', { type: 'button' });
  const drop = h('div', { class: 'imp-drop' });
  const status = h('div', { class: 'imp-status', role: 'status' });
  const offer = h('div', { class: 'imp-offer' });
  const foot = h('div', { class: 'imp-foot' });
  el.append(title, h('div', { class: 'imp-row' }, input, submit), error, drop, fileInput, status, offer, foot);
  let busy = false;

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
    title.textContent = p.title ?? t('image.title');
    el.setAttribute('aria-label', p.title ?? t('image.title'));
    input.placeholder = t('image.urlPlaceholder');
    input.setAttribute('aria-label', t('image.url'));
    submit.textContent = p.submitLabel ?? t('image.add');
    choose.textContent = t('image.choose');
    drop.replaceChildren(h('div', null, t('image.drop'), ' ', choose), h('div', null, t('image.types')));
    drop.hidden = !p.upload;
    foot.replaceChildren();
    if (p.onRemove) {
      const rm = h('button', { type: 'button', class: 'danger' }, t('image.remove'));
      rm.addEventListener('click', () => p.onRemove?.());
      foot.append(rm);
    }
    foot.hidden = !p.onRemove;
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
    focus: () => input.focus(),
    takeFile,
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
