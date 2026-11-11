// What the host gives the editor (A10g): its image store and its upload of pictures. Signals, set by the element from
// its options and properties; the core and the image tool read them.
import { signal } from '../../reactive/signal.js';
import type { ImageStore } from '../../ports.js';

export type Upload = (file: File) => Promise<{ url: string }>;

export class HostServices {
  /** The host's upload of a dropped, pasted or chosen picture: the URL the image references; null: by URL only. */
  readonly uploadImage = signal<Upload | null>(null);
  /** The host's image store (the image tool's Library; uploads go to it first); null: no library. */
  readonly images = signal<ImageStore | null>(null);

  /** Where an upload goes: the image store, else the host's upload (null: images by URL only). */
  upload(): Upload | null {
    const store = this.images.peek();
    return store ? (file) => store.put(file, { name: file.name }) : this.uploadImage.peek();
  }
}
