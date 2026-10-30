import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { upgradeMermaidBlocks } from '../../src/viewer.js';
import { diagramHtml } from '../../src/markdown/index.js';
import { SMALL_FLOW, SMALL_SEQUENCE, THEME_FILES, THEME_IDS } from '../support.js';

type MarkdownArgs = { theme: string; controls: string[] };

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** An article as a CMS renders it: prose with ```mermaid code blocks. */
function article(): HTMLElement {
  const el = document.createElement('article');
  el.style.cssText = 'max-width:760px;margin:0 auto;padding:24px;font:15px/1.6 system-ui;';
  el.innerHTML = `
    <h2>Ordering service</h2>
    <p>The request path, as a CMS renders a fenced <code>mermaid</code> block:</p>
    <pre><code class="language-mermaid">${esc(SMALL_FLOW)}</code></pre>
    <p>And the call sequence:</p>
    <pre><code class="language-mermaid">${esc(SMALL_SEQUENCE)}</code></pre>
    <p>A type mmdx does not draw falls back to stock Mermaid:</p>
    <pre class="mermaid">pie title Pets
  "Dogs" : 386
  "Cats" : 85</pre>`;
  return el;
}

const meta: Meta<MarkdownArgs> = {
  title: 'Elements/Markdown',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Markdown integration (`mmdx/markdown`): at run time `upgradeMermaidBlocks()` replaces Mermaid code blocks with ' +
          'viewers; at build time `diagramHtml()` (used by the rehype and markdown-it plugins) emits a viewer with the ' +
          'pre-rendered SVG, readable without JavaScript and hydrated when the viewer loads.',
      },
    },
  },
  argTypes: {
    theme: { control: 'select', options: THEME_IDS },
    controls: { control: 'check', options: ['zoom', 'layers', 'pen', 'code', 'export', 'fullscreen'] },
  },
  args: { theme: 'default-light', controls: ['zoom', 'fullscreen'] },
};
export default meta;

type Story = StoryObj<MarkdownArgs>;

export const RuntimeUpgrade: Story = {
  name: 'Run-time upgrade of code blocks',
  render: (a) => {
    const el = article();
    upgradeMermaidBlocks(el, { theme: a.theme, controls: a.controls as never });
    return el;
  },
};

export const BeforeUpgrade: Story = { name: 'The same article before the upgrade', render: () => article() };

export const BuildTime: Story = {
  name: 'Build-time HTML (server-rendered SVG)',
  render: (a) => {
    const el = document.createElement('article');
    el.style.cssText = 'max-width:760px;margin:0 auto;padding:24px;font:15px/1.6 system-ui;';
    const opts = { theme: a.theme, themes: THEME_FILES, attrs: { controls: a.controls.join(' ') || 'none' } };
    el.innerHTML = `<p>Output of <code>diagramHtml()</code>, then hydrated by the viewer:</p>${diagramHtml(SMALL_FLOW, opts)}`;
    return el;
  },
};
