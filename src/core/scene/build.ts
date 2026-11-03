// Small constructors so renderers read like the markup they describe.
import type { ItemRef } from '../types.js';
import type { SafeImageUrl, SafeUrl } from '../validate.js';
import type { SceneDef, SceneGroup, SceneImage, SceneLink, SceneNode, SceneShape, SceneText, SceneTitle, SvgAttrs, TextLine } from './types.js';

export function g(attrs: SvgAttrs, children: SceneNode[], opts: { key?: string; item?: ItemRef } = {}): SceneGroup {
  const n: SceneGroup = { t: 'g', attrs, children };
  if (opts.key !== undefined) n.key = opts.key;
  if (opts.item) n.item = opts.item;
  return n;
}

export function el(t: SceneShape['t'], attrs: SvgAttrs, key?: string): SceneShape {
  const n: SceneShape = { t, attrs };
  if (key !== undefined) n.key = key;
  return n;
}

export function text(attrs: SvgAttrs, lines: TextLine[], key?: string): SceneText {
  const n: SceneText = { t: 'text', attrs, lines };
  if (key !== undefined) n.key = key;
  return n;
}

export function link(href: SafeUrl, children: SceneNode[]): SceneLink {
  return { t: 'a', href, children };
}

export function image(href: SafeImageUrl, attrs: SvgAttrs, key?: string): SceneImage {
  const n: SceneImage = { t: 'image', attrs, href };
  if (key !== undefined) n.key = key;
  return n;
}

/** An item's tooltip (`<title>`, the first child of its group) or a `<desc>`. */
export function title(text: string, t: SceneTitle['t'] = 'title'): SceneTitle {
  return { t, attrs: {}, text, key: t };
}

export function def(t: SceneDef['t'], attrs: SvgAttrs, children: SceneNode[], key?: string): SceneDef {
  const n: SceneDef = { t, attrs, children };
  if (key !== undefined) n.key = key;
  return n;
}

/** Walks a scene depth first. */
export function walk(n: SceneNode, f: (n: SceneNode) => void): void {
  f(n);
  if (n.t === 'g' || n.t === 'a' || n.t === 'marker' || n.t === 'pattern' || n.t === 'clipPath') for (const c of n.children) walk(c, f);
}
