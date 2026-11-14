// Icon references (T04 §4.3): how diagrams write an icon, read into a canonical `pack:name`. Label tokens
// (`fa:fa-car Car`, `azure:computer-vision Vision`) are icons only for a registered pack or Font Awesome (Mermaid's
// regex), so `Note: …` or `http://…` are never misread; an icon node's value (`@{ icon: "logos:aws-ec2" }`) is any
// `pack:name`; mindmap `::icon(…)` takes CSS classes (`fa fa-car`, `fa-solid fa-car`, `mdi mdi-skull-outline`).
// scan.ts finds every reference in a source or a model (SSR preload, the render worker).

import type { IconForm, IconLookup } from './types.js';

/**
 * A label token candidate: `pack:name` standing on its own (`fa:fa-car Car`, `azure:computer-vision`), not part of a
 * URL, a time or a longer word. Whether it is an icon depends on the pack (`isIconToken`).
 */
export const ICON_TOKEN = /(^|[^\w:/.-])([a-z][\w-]*:[a-z0-9][\w-]*)(?![\w:])/gi;

/** Mermaid's Font Awesome token: `fa:fa-car`, `fab:fa-github` (`fa`, `fab`, `fak`, `fal`, `far`, `fas`). */
const FA_TOKEN = /^(fa[bklrs]?):fa-([\w-]+)$/;
const PACK_NAME = /^[a-z0-9][\w-]*$/i;
const NODE_NAME = /^([a-z][\w-]*):([\w][\w.-]*)$/i;

/** Font Awesome pack names (the styles): their `fa-` names fall back to built-in look-alikes. */
export const isFaPack = (pack: string): boolean => /^fa[bklrs]?$/.test(pack);

/** `pack:name` → [pack, name]. */
export function splitIconName(name: string): [pack: string, icon: string] {
  const i = name.indexOf(':');
  return i < 0 ? ['', name] : [name.slice(0, i), name.slice(i + 1)];
}

/** Font Awesome class names → pack (`fa-solid` → `fas`). */
const FA_STYLE: Record<string, string> = {
  fa: 'fa', fas: 'fas', far: 'far', fab: 'fab', fal: 'fal', fak: 'fak',
  'fa-solid': 'fas', 'fa-regular': 'far', 'fa-brands': 'fab', 'fa-light': 'fal', 'fa-kit': 'fak',
};
/** Font Awesome classes that size or animate an icon rather than name it. */
const FA_MODIFIER = /^fa-(?:\d+x|[2-9]xs|xs|sm|lg|xl|2xl|fw|spin|pulse|spin-pulse|spin-reverse|beat|fade|beat-fade|bounce|flip|shake|border|inverse|li|ul|pull-left|pull-right|rotate-\d+|flip-horizontal|flip-vertical|flip-both|stack-1x|stack-2x|stack)$/;

/** CSS classes → `pack:name` (`fa fa-car`, `fab fa-github`, `fa-solid fa-car`, `mdi mdi-skull`); a `pack:name` too. */
function fromClasses(s: string): string | null {
  const cls = s.trim().split(/\s+/).filter(Boolean);
  if (cls.length === 1 && NODE_NAME.test(cls[0]!)) return cls[0]!;
  let style: string | null = null, name: string | null = null;
  for (const c of cls) {
    const st = FA_STYLE[c.toLowerCase()];
    if (st) {
      style ??= st;
      continue;
    }
    if (c.startsWith('fa-') && !FA_MODIFIER.test(c)) name ??= c.slice(3);
  }
  if (name) return PACK_NAME.test(name) ? `${style ?? 'fa'}:${name}` : null;
  // `mdi mdi-skull-outline`: a class names its pack and the next one the icon with that prefix
  for (const c of cls) {
    if (!PACK_NAME.test(c)) continue;
    const icon = cls.find((x) => x.startsWith(`${c}-`) && x.length > c.length + 1);
    if (icon) return `${c}:${icon.slice(c.length + 1)}`;
  }
  return null;
}

/**
 * The canonical `pack:name` of a reference, by its syntax alone (`fa:fa-car` → `fa:car`); null when it is not one.
 * Label tokens of other packs need the pack registered as well (`isIconToken`).
 */
export function parseIconRef(written: string, form: IconForm = 'token'): string | null {
  const s = written.trim();
  if (form === 'class') return fromClasses(s);
  const fa = FA_TOKEN.exec(s);
  if (fa) return `${fa[1]}:${fa[2]}`;
  return NODE_NAME.test(s) ? s : null;
}

/** Whether a label token is an icon: Font Awesome's form always (as in Mermaid), other prefixes when registered. */
export const isIconToken = (written: string, has: (pack: string) => boolean): boolean => FA_TOKEN.test(written) || (NODE_NAME.test(written) && has(splitIconName(written)[0]));

/** A lookup with no icons (a render context that draws none: portable export's styles, tests). */
export const NO_ICONS: IconLookup = { resolve: () => null, get: () => ({ status: 'missing', reason: 'pack' }) };
