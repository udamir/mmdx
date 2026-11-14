// Icons written as label tokens (T05, shared by every kind that writes them: the flowchart, mindmap nodes, T10's
// participants, entities and states): a `pack:name` token at the start of a label (`fa:fa-car Car`,
// `azure:computer-vision Vision`); Font Awesome in Mermaid's own form, which stock Mermaid draws.
import { isFaPack, splitIconName } from './names.js';

export type IsIconToken = (token: string) => boolean;

/** Font Awesome's form only (no registry at hand). */
export const faOnly: IsIconToken = (t) => /^fa[bklrs]?:fa-[\w-]+$/.test(t);

/** How a label writes an icon: `fa:fa-car` for Font Awesome (Mermaid's form), `pack:name` for the rest. */
export function iconToken(name: string): string {
  const [pack, icon] = splitIconName(name);
  return isFaPack(pack) && !icon.startsWith('fa-') ? `${pack}:fa-${icon}` : name;
}

/** The canonical name of a label token (`fa:fa-car` → `fa:car`). */
const tokenName = (token: string): string => {
  const [pack, icon] = splitIconName(token);
  return isFaPack(pack) && icon.startsWith('fa-') ? `${pack}:${icon.slice(3)}` : token;
};

const LEADING = /^\s*([a-z][\w-]*:[a-z0-9][\w-]*)(?=\s|$)\s*/i;

/** A label's leading icon token and the rest of the label (null: it starts with none). */
export function leadingIcon(label: string, isIcon: IsIconToken = faOnly): { token: string; name: string; rest: string } | null {
  const m = LEADING.exec(label);
  if (!m || !isIcon(m[1]!)) return null;
  return { token: m[1]!, name: tokenName(m[1]!), rest: label.slice(m[0].length) };
}

/** The label with `name`'s token at its start, replacing a leading token it has (null: without one). */
export function withIconToken(label: string, name: string | null, isIcon: IsIconToken = faOnly): string {
  const rest = leadingIcon(label, isIcon)?.rest ?? label.replace(/^\s+/, '');
  if (!name) return rest;
  return rest ? `${iconToken(name)} ${rest}` : iconToken(name);
}

