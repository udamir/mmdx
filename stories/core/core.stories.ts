/// <reference types="vite/client" />
import type { Meta, StoryObj } from '@storybook/web-components-vite';
import '../../src/viewer.js';
import { instanceContext } from '../../src/config.js';
import { renderToSvg } from '../../src/core/pipeline.js';
import { diffDiagrams, ignoreFacets, type ItemChange } from '../../src/core/diff/index.js';
import { EXAMPLES, SMALL_FLOW, THEME_IDS } from '../support.js';

const diffRaw = import.meta.glob<string>('../../apps/studio-site/diff-samples/*.mmd', { eager: true, query: '?raw', import: 'default' });
const diffSample = (name: string, side: 'before' | 'after'): string => diffRaw[`../../apps/studio-site/diff-samples/${name}.${side}.mmd`] ?? '';
const DIFF_SAMPLES = ['architecture', 'restyle', 'sequence', 'schema', 'small'];

type CoreArgs = { example: string; theme: string; sample: string; ignoreContent: boolean; ignoreLayout: boolean; ignoreStyle: boolean };

const meta: Meta<CoreArgs> = {
  title: 'Core',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The DOM-free core (`mmdx/core`): parse Mermaid with the `%%@` layout metadata, lay out, theme and render to an ' +
          'SVG string (server-side rendering, exports), and the semantic diagram diff used for merge request review.',
      },
    },
  },
  argTypes: {
    example: { control: 'select', options: Object.keys(EXAMPLES) },
    theme: { control: 'select', options: THEME_IDS },
    sample: { control: 'select', options: DIFF_SAMPLES },
  },
  args: { example: 'production-microservices', theme: 'default-light', sample: 'architecture', ignoreContent: false, ignoreLayout: false, ignoreStyle: false },
};
export default meta;

type Story = StoryObj<CoreArgs>;

export const RenderToSvg: Story = {
  name: 'renderToSvg()',
  parameters: { controls: { include: ['example', 'theme'] } },
  render: (a) => {
    const out = document.createElement('div');
    out.style.cssText = 'padding:16px;';
    out.textContent = 'Rendering…';
    // the string an SSR or an export produces, inserted as an <img> so nothing in it can run
    const ctx = instanceContext();
    void renderToSvg(EXAMPLES[a.example] ?? SMALL_FLOW, { theme: a.theme, ctx }).then((svg) => {
      const img = new Image();
      img.alt = a.example;
      img.style.cssText = 'max-width:100%;border:1px solid #dde1e7;border-radius:8px;';
      img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const note = document.createElement('p');
      note.style.cssText = 'font:12px system-ui;color:#6b7385;';
      note.textContent = `${(svg.length / 1024).toFixed(1)} KB of standalone SVG`;
      out.replaceChildren(note, img);
    });
    return out;
  },
};

const STATUS_COLOUR: Readonly<Record<string, string>> = { added: '#1d8a3c', removed: '#c62828', changed: '#8a5a00' };

function changeRow(c: ItemChange): HTMLElement {
  const li = document.createElement('li');
  li.style.cssText = 'padding:4px 0;border-bottom:1px solid #eceef2;';
  const status = document.createElement('b');
  status.textContent = c.status;
  status.style.color = STATUS_COLOUR[c.status] ?? '#3a4152';
  const what = document.createElement('span');
  what.textContent = ` ${c.kind} “${c.label}”${c.beforeId && c.beforeId !== c.id ? ` (was ${c.beforeId})` : ''}`;
  const fields = document.createElement('div');
  fields.style.cssText = 'font:12px ui-monospace,monospace;color:#6b7385;';
  fields.textContent = c.fields.map((f) => `${f.facet}: ${f.field}`).join(' · ');
  li.append(status, what, fields);
  return li;
}

export const SemanticDiff: Story = {
  name: 'Semantic diagram diff',
  parameters: {
    controls: { include: ['sample', 'ignoreContent', 'ignoreLayout', 'ignoreStyle'] },
    docs: { description: { story: '`diffDiagrams(before, after)` matches items across versions (renames, shifted sequence ids) and classifies each change as content, layout or style; each facet can be ignored. The full review UI is the `diff.html` page of the studio site.' } },
  },
  render: (a) => {
    const before = diffSample(a.sample, 'before'), after = diffSample(a.sample, 'after');
    const diff = ignoreFacets(diffDiagrams(before, after), { content: a.ignoreContent, layout: a.ignoreLayout, style: a.ignoreStyle });
    const root = document.createElement('div');
    root.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 340px;gap:12px;padding:12px;font:13px system-ui;height:100vh;box-sizing:border-box;';
    const side = (title: string, src: string): HTMLElement => {
      const col = document.createElement('section');
      col.style.cssText = 'display:flex;flex-direction:column;min-height:0;';
      const h = document.createElement('h3');
      h.textContent = title;
      h.style.margin = '0 0 6px';
      const v = document.createElement('mmdx-viewer') as HTMLElement & { source?: string };
      v.setAttribute('fit', 'contain');
      v.setAttribute('controls', 'zoom');
      v.style.cssText = 'flex:1;min-height:0;border:1px solid #dde1e7;border-radius:8px;';
      v.source = src;
      col.append(h, v);
      return col;
    };
    const panel = document.createElement('aside');
    panel.style.cssText = 'overflow:auto;';
    const c = diff.counts;
    const summary = document.createElement('p');
    summary.textContent = `${c.added} added · ${c.removed} removed · ${c.changed} changed — content ${c.content}, layout ${c.layout}, style ${c.style}`;
    const list = document.createElement('ul');
    list.style.cssText = 'list-style:none;padding:0;margin:0;';
    list.append(...diff.items.filter((i) => i.status !== 'unchanged').map(changeRow));
    const docChanges = document.createElement('p');
    docChanges.style.cssText = 'font:12px ui-monospace,monospace;color:#6b7385;';
    docChanges.textContent = diff.doc.length ? `Diagram: ${diff.doc.map((f) => `${f.facet}: ${f.field}`).join(' · ')}` : '';
    panel.append(summary, docChanges, list);
    root.append(side('Before', before), side('After', after), panel);
    return root;
  },
};
