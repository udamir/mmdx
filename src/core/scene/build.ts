// Small constructors so renderers read like the markup they describe.
import type { ItemRef } from '../types.js';
import type { SafeUrl } from '../validate.js';
import type { SceneDef, SceneGroup, SceneLink, SceneNode, SceneShape, SceneText, SvgAttrs, TextLine } from './types.js';

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
