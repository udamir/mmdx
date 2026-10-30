// Shareable links (§8.4): the document travels in the URL hash as `#d=<deflate-raw + base64url>`.

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeHash(src: string): Promise<string | null> {
  if (typeof CompressionStream === 'undefined') return null;
  return b64url(await pipe(new TextEncoder().encode(src), new CompressionStream('deflate-raw')));
}

export async function decodeHash(s: string): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const bytes = await pipe(unb64url(s), new DecompressionStream('deflate-raw'));
    if (bytes.length > 1024 * 1024) return null;
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

