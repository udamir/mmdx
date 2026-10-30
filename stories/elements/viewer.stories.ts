import type { Meta, StoryObj } from '@storybook/web-components-vite';
import '../../src/viewer.js';
import { example, SMALL_ER, SMALL_FLOW, SMALL_SEQUENCE, THEME_IDS, uiArg } from '../support.js';

type ViewerArgs = {
  source: string;
  theme: string;
  themeDark: string;
  fit: 'width' | 'contain' | 'none';
  controls: string[];
  interactive: boolean;
  labels: boolean;
  hoverHighlight: boolean;
  wheel: 'ctrl' | 'always' | 'never';
  fallback: 'mermaid' | 'source' | 'error';
  ui: 'light' | 'dark' | 'auto';
  height: number;
  label: string;
};

/** Builds an `<mmdx-viewer>` from the args (attributes for options, the `source` property for the diagram). */
function viewer(a: Partial<ViewerArgs>, src?: string): HTMLElement {
  const el = document.createElement('mmdx-viewer') as HTMLElement & { source?: string };
  if (a.theme) el.setAttribute('theme', a.theme);
  if (a.themeDark) el.setAttribute('theme-dark', a.themeDark);
  if (a.fit) el.setAttribute('fit', a.fit);
  if (a.controls) el.setAttribute('controls', a.controls.length ? a.controls.join(' ') : 'none');
  if (a.interactive === false) el.setAttribute('interactive', 'false');
  if (a.labels) el.setAttribute('labels', '');
  if (a.hoverHighlight) el.setAttribute('hover-highlight', '');
  if (a.wheel) el.setAttribute('wheel', a.wheel);
  if (a.fallback) el.setAttribute('fallback', a.fallback);
  if (a.ui) el.setAttribute('ui', a.ui);
  if (a.label) el.setAttribute('label', a.label);
  if (a.height) el.style.height = `${a.height}px`;
  if (src) el.setAttribute('src', src);
  else el.source = a.source ?? SMALL_FLOW;
  for (const type of ['ds-render', 'ds-error', 'ds-link', 'ds-fullscreen'])
    el.addEventListener(type, (e) => console.info(type, (e as CustomEvent).detail));
  return el;
}

const frame = (...children: Node[]): HTMLElement => {
  const d = document.createElement('div');
  d.style.cssText = 'padding:16px;display:grid;gap:16px;';
  d.append(...children);
  return d;
};

const meta: Meta<ViewerArgs> = {
  title: 'Elements/Viewer',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`<mmdx-viewer>` renders a styled Mermaid diagram (flowchart, sequence, ER) read-only: pan and zoom, layers, ' +
          'a pen overlay, a code view (the Mermaid code without styles), export and fullscreen. Import `mmdx/viewer`; the source comes from an inline ' +
          '`<script type="text/mermaid">`, the `src` attribute or the `source` property. Events: `ds-render`, `ds-error`, ' +
          '`ds-link`, `ds-fullscreen` (logged to the console here).',
      },
    },
  },
  render: (a) => frame(viewer(a)),
  argTypes: {
    source: { control: 'text', description: 'Mermaid source, with the `%%@` layout metadata.' },
    theme: { control: 'select', options: THEME_IDS },
    themeDark: { control: 'select', options: ['', ...THEME_IDS], description: 'Theme used when the page is dark (`theme-dark`).' },
    fit: { control: 'inline-radio', options: ['width', 'contain', 'none'] },
    controls: { control: 'check', options: ['zoom', 'layers', 'pen', 'code', 'export', 'fullscreen'] },
    wheel: { control: 'inline-radio', options: ['ctrl', 'always', 'never'] },
    fallback: { control: 'inline-radio', options: ['mermaid', 'source', 'error'], description: 'What to show for diagram types mmdx does not render.' },
    ui: uiArg,
    height: { control: { type: 'number', min: 0, step: 20 }, description: 'Fixed height in px (0 = natural height).' },
  },
  args: {
    source: SMALL_FLOW,
    theme: 'default-light',
    fit: 'width',
    controls: ['zoom', 'fullscreen'],
    interactive: true,
    labels: false,
    hoverHighlight: false,
    wheel: 'ctrl',
    fallback: 'mermaid',
    ui: 'light',
    height: 0,
    label: '',
  },
};
export default meta;

type Story = StoryObj<ViewerArgs>;

export const Flowchart: Story = {};

export const Sequence: Story = { args: { source: SMALL_SEQUENCE } };

export const EntityRelationship: Story = { name: 'ER diagram', args: { source: SMALL_ER } };

export const AllControls: Story = {
  name: 'All controls',
  args: { source: example('production-microservices'), controls: ['zoom', 'layers', 'pen', 'code', 'export', 'fullscreen'] },
  parameters: { docs: { description: { story: 'Zoom, layers, pen (draw on top of the diagram), code view (the Mermaid code without metadata and styles, with Copy), export (SVG / PNG / Mermaid) and fullscreen.' } } },
};

export const ContainInFixedBox: Story = {
  name: 'Fit: contain in a fixed box',
  args: { source: example('docker-deploy-sequence'), fit: 'contain', height: 360, controls: ['zoom', 'layers', 'code'] },
};

export const NaturalSize: Story = { name: 'Fit: none (natural size)', args: { fit: 'none', height: 360 } };

export const NonInteractive: Story = {
  name: 'Non-interactive',
  args: { source: example('atom-schema-er'), interactive: false, controls: [] },
  parameters: { docs: { description: { story: 'A static picture: no pan, zoom, hover or selection.' } } },
};

export const HoverHighlight: Story = {
  name: 'Hover highlight and labels',
  args: { source: example('fusion-services'), hoverHighlight: true, labels: true, controls: ['zoom', 'code'] },
};

export const WheelAlways: Story = { name: 'Wheel zoom without Ctrl', args: { wheel: 'always', height: 400, fit: 'contain' } };

export const DarkChrome: Story = {
  name: 'Dark chrome and theme',
  args: { ui: 'dark', theme: 'default-dark', controls: ['zoom', 'layers', 'export', 'fullscreen'], source: example('production-microservices') },
  parameters: { backgrounds: { default: 'dark' } },
  render: (a) => {
    const f = frame(viewer(a));
    f.style.background = '#121418';
    return f;
  },
};

export const ThemeGallery: Story = {
  name: 'Every theme',
  render: (a) =>
    frame(
      ...THEME_IDS.flatMap((id) => {
        const h = document.createElement('h3');
        h.textContent = id;
        h.style.cssText = 'margin:8px 0 0;font:600 14px system-ui;';
        return [h, viewer({ ...a, theme: id, fit: 'contain', height: 300, controls: [] })];
      }),
    ),
  args: { source: SMALL_FLOW },
};

export const FromSrc: Story = {
  name: 'Loaded from src',
  render: (a) => frame(viewer(a, 'static/examples/microservice-patterns.mmd')),
  args: { controls: ['zoom', 'layers', 'fullscreen'] },
};

export const InlineScript: Story = {
  name: 'Inline <script type="text/mermaid">',
  render: () => {
    const host = document.createElement('div');
    host.style.padding = '16px';
    host.innerHTML = `<mmdx-viewer controls="zoom fullscreen"><script type="text/mermaid">
flowchart LR
  a([Start]) --> b{Valid?}
  b -->|yes| c[Process]
  b -->|no| d[Reject]
  click c href "https://mermaid.js.org"
</script></mmdx-viewer>`;
    return host;
  },
};

export const UnsupportedSource: Story = {
  name: 'Unsupported type: source fallback',
  args: { source: 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85', fallback: 'source' },
};

export const UnsupportedMermaid: Story = {
  name: 'Unsupported type: stock Mermaid fallback',
  args: { source: 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85', fallback: 'mermaid' },
};

export const Broken: Story = {
  name: 'Syntax error',
  args: { source: 'flowchart LR\n  a --> \n  b[unclosed --> c', fallback: 'error' },
};

export const Sanitised: Story = {
  name: 'Unsafe input is sanitised',
  args: {
    source: `flowchart LR
  A["<img src=x onerror=alert(1)>"] --> B
  style A fill:red" onmouseover="alert(2)
  click B href "javascript:alert(3)"`,
  },
  parameters: { docs: { description: { story: 'HTML in labels is text, style values are validated and `javascript:` links are dropped.' } } },
};
