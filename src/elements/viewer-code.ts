// Viewer code view (`controls="code"`): the diagram's Mermaid code without styling, highlighted, with a copy
// button. It covers the diagram, so the viewer keeps its size. Loaded when the view is first
// shown, with its styles (not needed to show a diagram, §R5).
import { stripMermaidStyles } from '../core/strip-styles.js';
import { h } from '../ui/h.js';
import type { I18n } from '../ui/i18n.js';
import { highlightLine } from '../ui/code-editor.js';
import { CODE_TOKENS_CSS } from '../ui/styles/code-tokens.js';

export const CODE_VIEW_CSS = /* css */ `
.code-view { position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; background: var(--ds-surface-2); }
.code-view pre { margin: 0; flex: 1; min-height: 0; overflow: auto; padding: 12px 14px; font: 12.5px/1.55 var(--ds-mono); white-space: pre; tab-size: 2; color: var(--ds-text); }
.code-view pre code { font: inherit; }
.code-view .copy { position: absolute; top: 8px; right: 8px; }
` + CODE_TOKENS_CSS;

/** The code view for `code` (Mermaid without `%%@` metadata). Text goes in as text nodes only. */
export function codeView(code: string, i18n: I18n): HTMLElement {
  const plain = stripMermaidStyles(code);
  const lines = plain.split('\n').map((line) =>
    h('span', null, ...highlightLine(line).map(([cls, text]) => (cls ? h('span', { class: cls }, text) : text)), '\n'));
  const copy = h('button', {
    type: 'button',
    class: 'copy',
    onclick: () => {
      void navigator.clipboard?.writeText(plain).then(() => {
        copy.textContent = i18n.t('codeView.copied');
      });
    },
  }, i18n.t('codeView.copy'));
  return h('div', { class: 'code-view', part: 'code' },
    h('pre', { tabindex: '0', 'aria-label': i18n.t('codeView.label') }, h('code', null, ...lines)),
    copy);
}
