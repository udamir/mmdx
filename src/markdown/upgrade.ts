// Run-time upgrade (§11.4): finds `pre > code.language-mermaid` blocks rendered by a CMS and replaces them with
// <mmdx-viewer> elements. The code text is read through textContent and handed over as a property: never as HTML.
import { defineViewer, type ViewerOptions } from '../elements/viewer.js';

export function upgradeMermaidBlocks(root: ParentNode = document, opts: Partial<Pick<ViewerOptions, 'theme' | 'themeDark' | 'controls' | 'fit'>> & { tag?: string } = {}): HTMLElement[] {
  const tag = opts.tag ?? 'mmdx-viewer';
  if (tag === 'mmdx-viewer') defineViewer();
  const out: HTMLElement[] = [];
  for (const code of Array.from(root.querySelectorAll('pre > code.language-mermaid, pre > code.lang-mermaid, pre.mermaid'))) {
    const pre = code.localName === 'pre' ? code : code.parentElement;
    if (!pre || !pre.parentNode) continue;
    const el = document.createElement(tag) as HTMLElement & { source?: string };
    if (opts.theme) el.setAttribute('theme', opts.theme);
    if (opts.themeDark) el.setAttribute('theme-dark', opts.themeDark);
    if (opts.fit) el.setAttribute('fit', opts.fit);
    if (opts.controls) el.setAttribute('controls', opts.controls.length ? opts.controls.join(' ') : 'none');
    el.source = code.textContent ?? '';
    pre.replaceWith(el);
    out.push(el);
  }
  return out;
}
