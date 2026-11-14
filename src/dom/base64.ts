// Bytes as base64 (X20, 4.12): the inlined fonts and images of a PNG export, the memory image store's data URLs.

/** Base64 of the bytes, read in chunks (a spread of a large array overflows the call stack). */
export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
