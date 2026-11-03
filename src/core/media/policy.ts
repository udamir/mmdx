// The image policy check (T03): the one place a URL from diagram content becomes a `SafeImageUrl`. The policy's type
// and default live in validate.ts with the link policy (every context carries them); this module is only loaded by
// the code that draws content images, so a page without them does not download it.
import { DEFAULT_IMAGE_POLICY, type ImageDataType, type ImagePolicy, type SafeImageUrl } from '../validate.js';

/** Why an image URL was refused (the `reason` of the `image.blocked` diagnostic). */
export type ImageBlockReason = 'invalid' | 'protocol' | 'data-off' | 'data-type' | 'data-size' | 'host' | 'relative';

const DATA_URL = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)((?:;[a-z0-9-]+=[a-z0-9.+-]+)*);base64,([a-z0-9+/]*={0,2})$/i;

/** `host` against an allow-list entry: exact, or `*.example.com` for its subdomains. */
const hostMatches = (host: string, pattern: string): boolean => {
  const p = pattern.trim().toLowerCase();
  return p.startsWith('*.') ? host.endsWith(p.slice(1)) && host.length > p.length - 1 : host === p;
};

/**
 * Checks an image URL from diagram content against the policy: the same syntax checks as `safeUrl` (no control
 * characters, whitespace or backslash; at most 2048 characters except `data:`), the protocol, for `data:` a base64
 * payload of an accepted type within `maxDataBytes`, the host allow-list, and relative URLs only when enabled (never
 * protocol-relative `//host`).
 */
export function checkImageUrl(raw: unknown, policy: ImagePolicy = DEFAULT_IMAGE_POLICY): { url: SafeImageUrl } | { reason: ImageBlockReason } {
  if (typeof raw !== 'string') return { reason: 'invalid' };
  const s = raw.trim();
  // eslint-disable-next-line no-control-regex
  if (!s || /[\u0000-\u001f\u007f\s\\]/.test(s)) return { reason: 'invalid' };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!scheme) {
    if (s.length > 2048 || s.startsWith('//')) return { reason: 'invalid' };
    return policy.relative ? { url: s as SafeImageUrl } : { reason: 'relative' };
  }
  const proto = scheme[1]!.toLowerCase() + ':';
  if (proto === 'data:') {
    if (!policy.protocols.includes('data:')) return { reason: 'data-off' };
    // the base64 text of maxDataBytes, plus room for the header: longer cannot fit (and is not matched at all)
    if (s.length > Math.ceil(policy.maxDataBytes / 3) * 4 + 256) return { reason: 'data-size' };
    const m = DATA_URL.exec(s);
    if (!m) return { reason: 'invalid' };
    if (!policy.dataTypes.includes(m[1]!.toLowerCase() as ImageDataType)) return { reason: 'data-type' };
    const b64 = m[3]!;
    if (b64.length % 4) return { reason: 'invalid' };
    const bytes = (b64.length / 4) * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
    return bytes > policy.maxDataBytes ? { reason: 'data-size' } : { url: s as SafeImageUrl };
  }
  if (s.length > 2048) return { reason: 'invalid' };
  if (proto !== 'https:' && proto !== 'http:') return { reason: 'protocol' };
  if (!policy.protocols.includes(proto)) return { reason: 'protocol' };
  // authority: no user info (`https://trusted@evil`), a host name or address, an optional port
  const auth = /^https?:\/\/([^/?#]*)/i.exec(s)?.[1] ?? '';
  const host = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.exec(auth)?.[1]?.toLowerCase();
  if (!host) return { reason: 'invalid' };
  if (policy.hosts && !policy.hosts.some((p) => hostMatches(host, p))) return { reason: 'host' };
  return { url: s as SafeImageUrl };
}

/** The URL if the image policy accepts it, else null (`checkImageUrl` gives the reason). */
export function safeImageUrl(raw: unknown, policy: ImagePolicy = DEFAULT_IMAGE_POLICY): SafeImageUrl | null {
  const r = checkImageUrl(raw, policy);
  return 'url' in r ? r.url : null;
}
