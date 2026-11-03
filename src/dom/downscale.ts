// Pictures reduced before an upload (T05 §4.4): a file's pixel size, and a copy at most `side` px on its longer side,
// re-encoded through a canvas (WebP where the browser writes it, else PNG; JPEG stays JPEG). Browser only; the image
// tool offers it for pictures over 1600 px.

/** Decodes a file into something a canvas draws (an ImageBitmap where available, else an <img>). */
async function decode(file: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; done(): void }> {
  if (typeof createImageBitmap === 'function') {
    const b = await createImageBitmap(file);
    return { img: b, w: b.width, h: b.height, done: () => b.close() };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return { img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

/** The file's width and height in pixels (null: it does not decode here). */
export async function imageSize(file: File): Promise<{ w: number; h: number } | null> {
  try {
    const d = await decode(file);
    d.done();
    return d.w && d.h ? { w: d.w, h: d.h } : null;
  } catch {
    return null;
  }
}

/** A copy of the picture at most `side` px on its longer side (the file itself when it is no larger). */
export async function reduceImage(file: File, side: number): Promise<File> {
  const d = await decode(file);
  try {
    const k = Math.min(1, side / Math.max(d.w, d.h));
    if (k >= 1) return file;
    const w = Math.max(1, Math.round(d.w * k)), h = Math.max(1, Math.round(d.h * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) return file;
    g.imageSmoothingQuality = 'high';
    g.drawImage(d.img, 0, 0, w, h);
    const want = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    let blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, want, 0.9));
    // a browser that cannot write WebP gives PNG
    if (!blob) blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return file;
    const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1] ?? 'png';
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${ext}`, { type: blob.type });
  } finally {
    d.done();
  }
}
