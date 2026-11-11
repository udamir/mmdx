// The studio's examples gallery (5.6, R8): a dialog of the examples as cards, each with its thumbnail or a preview of
// its newest version rendered in the editor's theme (once per theme, one per task so the dialog stays responsive).
import type { StaticVersion } from '../adapters/history.js';
import type { CoreContext } from '../core/context.js';
import { renderSource, standaloneSvg } from '../core/pipeline.js';
import { createOverlayScroll } from '../ui/kit/overlay-scroll.js';
import { h, icon } from '../ui/kit/h.js';
import { I_file } from '../ui/kit/icons.js';
import type { Dialogs } from '../ui/kit/dialog.js';

export interface ExampleInfo {
  id: string;
  title: string;
  file: string;
  thumbnail?: string;
  tags?: string[];
  /** A history file of the example: `{ versions: [{ id, message, author?, date?, source }] }`, newest first. */
  history?: string;
}

export interface GalleryHost {
  dialogs: Dialogs;
  examples(): readonly ExampleInfo[];
  /** An example's history, newest first (its newest version is what the preview shows). */
  history(ex: ExampleInfo): Promise<StaticVersion[]>;
  /** The editor's theme and context, for the previews (null: no editor yet). */
  look(): { theme: string; ctx: CoreContext } | null;
  alive(): boolean;
}

export class ExamplesGallery {
  /** Previews as SVG images, by example and theme (a failed one is tried again next time). */
  private readonly previews = new Map<string, Promise<string | null>>();

  constructor(private readonly o: GalleryHost) {}

  /** Shows the gallery; the example chosen (Open, or a card), else null. */
  async pick(): Promise<ExampleInfo | null> {
    let picked: ExampleInfo | null = null;
    // a preview of each example (its own thumbnail, else its newest version rendered here), the file icon meanwhile
    let open = true;
    const thumbOf = (ex: ExampleInfo): HTMLElement => {
      if (ex.thumbnail) return h('div', { class: 'thumb' }, h('img', { src: ex.thumbnail, alt: '' }));
      const box = h('div', { class: 'thumb loading' }, icon(I_file, 32));
      void this.preview(ex).then((url) => {
        box.classList.remove('loading');
        if (url && open) box.replaceChildren(h('img', { src: url, alt: '' }));
      });
      return box;
    };
    const grid = h('div', { class: 'gallery' }, ...this.o.examples().map((ex) => h('button', { type: 'button', class: 'card', onclick: (ev: Event) => {
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
    const v = await this.o.dialogs.choose<'open' | 'cancel'>({ title: 'Examples', body: box, class: 'examples', cancel: 'cancel', buttons: [{ label: 'Close', value: 'cancel' }, { label: 'Open', value: 'open', primary: true }] });
    open = false;
    scroll.destroy();
    return v === 'open' ? picked : null;
  }

  private preview(ex: ExampleInfo): Promise<string | null> {
    const look = this.o.look();
    if (!look) return Promise.resolve(null);
    const { theme, ctx } = look;
    const key = `${ex.id}|${theme}`;
    let p = this.previews.get(key);
    if (!p) {
      p = (async (): Promise<string | null> => {
        let src = (await this.o.history(ex))[0]?.source;
        if (src === undefined) {
          const r = await fetch(ex.file);
          if (!r.ok) return null;
          src = await r.text();
        }
        // one preview per task: the dialog stays responsive while they render
        await new Promise((r) => setTimeout(r, 0));
        if (!this.o.alive()) return null;
        const svg = standaloneSvg(renderSource(src, ctx, { theme }), ctx);
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
}
