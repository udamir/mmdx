import type { Meta, StoryObj } from '@storybook/web-components-vite';
import '../../src/editor.js';
import { memoryDocumentAdapter } from '../../src/adapters/documents.js';
import { DEFAULT_FEATURES, type EditorFeatures } from '../../src/editor/core.js';
import type { MmdxEditorElement } from '../../src/editor/editor.js';
import { example, SMALL_ER, SMALL_FLOW, SMALL_SEQUENCE, uiArg } from '../support.js';

type Toggle = Exclude<keyof EditorFeatures, 'exportFormats'>;
const TOGGLES = Object.keys(DEFAULT_FEATURES).filter((k): k is Toggle => k !== 'exportFormats');

type EditorArgs = {
  source: string;
  readOnly: boolean;
  ui: 'light' | 'dark' | 'auto';
  name: string;
  height: number;
  exportFormats: string[];
} & Record<Toggle, boolean>;

const FEATURE_DOCS: Readonly<Record<Toggle, string>> = {
  codePanel: 'Left panel with the Mermaid code (gutter error markers, filter, problems list).',
  metadataTab: 'Metadata tab of the code panel (the `%%@` layout lines, live applied).',
  properties: 'Right properties panel for the selection.',
  layers: 'Layers panel (visibility, lock, order).',
  pen: 'Pen overlay for free-hand notes.',
  copyStyle: 'Copy / paste style between items.',
  styleToolbar: 'Floating style toolbar above the selection.',
  pageToolbar: 'Page bar (type, direction, preset, background, border, size, routing…), opened from the type badge.',
  autoLayout: 'Auto-layout action.',
  plainMermaid: 'Plain Mermaid compare view (stock Mermaid render of the portable source).',
  open: 'Open-file action.',
  themePicker: 'Theme picker in the view bar.',
  export: 'Export menu.',
  help: 'Shortcut help popup.',
  fullscreen: 'Fullscreen toggle.',
};

function editor(a: Partial<EditorArgs>): HTMLElement {
  const el = document.createElement('mmdx-editor') as MmdxEditorElement;
  const features: Partial<EditorFeatures> = {};
  for (const k of TOGGLES) if (a[k] !== undefined) features[k] = a[k];
  if (a.exportFormats) features.exportFormats = a.exportFormats as EditorFeatures['exportFormats'];
  el.features = features;
  el.adapter = memoryDocumentAdapter(a.source ?? SMALL_FLOW, a.name || 'diagram');
  if (a.readOnly) el.setAttribute('read-only', '');
  if (a.ui) el.setAttribute('ui', a.ui);
  if (a.name) el.setAttribute('name', a.name);
  el.style.cssText = `display:block;height:${a.height ?? 640}px;`;
  for (const type of ['ds-change', 'ds-dirty', 'ds-save', 'ds-saved', 'ds-selection', 'ds-export', 'ds-conflict'])
    el.addEventListener(type, (e) => console.info(type, (e as CustomEvent).detail));
  return el;
}

const meta: Meta<EditorArgs> = {
  title: 'Elements/Editor',
  tags: ['autodocs'],
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 680 },
      description: {
        component:
          '`<mmdx-editor>` is the visual editor: drag shapes from the left toolbar, connect, group, restyle, edit the Mermaid ' +
          'and the layout metadata side by side, with undo / redo and export. Import `mmdx/editor`; give it a document ' +
          'through `adapter` (here `memoryDocumentAdapter`) or `value`. Every feature can be switched off with `features`.',
      },
    },
  },
  render: (a) => editor(a),
  argTypes: {
    source: { control: 'text' },
    ui: uiArg,
    height: { control: { type: 'number', min: 320, step: 40 } },
    exportFormats: { control: 'check', options: ['mmdx', 'mmd', 'svg', 'png'] },
    ...Object.fromEntries(TOGGLES.map((k) => [k, { control: 'boolean', description: FEATURE_DOCS[k], table: { category: 'features' } }])),
  },
  args: {
    source: example('production-microservices'),
    readOnly: false,
    ui: 'light',
    name: 'diagram',
    height: 640,
    exportFormats: [...DEFAULT_FEATURES.exportFormats],
    ...Object.fromEntries(TOGGLES.map((k) => [k, DEFAULT_FEATURES[k] as boolean])),
  },
};
export default meta;

type Story = StoryObj<EditorArgs>;

export const Flowchart: Story = {};

export const Sequence: Story = { args: { source: example('docker-deploy-sequence') } };

export const EntityRelationship: Story = { name: 'ER diagram', args: { source: example('atom-schema-er') } };

export const SmallSequence: Story = { name: 'Sequence: activations, notes, autonumber', args: { source: SMALL_SEQUENCE } };

export const SmallEr: Story = { name: 'ER: tables and relations', args: { source: SMALL_ER } };

export const AutoLayout: Story = {
  name: 'Pure Mermaid (auto layout)',
  args: { source: example('simple-flow') },
  parameters: { docs: { description: { story: 'No layout metadata: positions come from the auto layout until something is moved.' } } },
};

export const Groups: Story = { name: 'Nested groups and local styles', args: { source: example('microservice-patterns') } };

export const Empty: Story = {
  name: 'Empty page',
  args: { source: 'flowchart TB\n' },
  parameters: { docs: { description: { story: 'A new diagram: the page is centred with the "drag shapes here" hint.' } } },
};

export const WithProblems: Story = {
  name: 'Code problems',
  args: {
    source: `flowchart LR
  a[Start] --> b[Next]
  style a fill:#zzz,stroke-width:abc
  style ghost fill:#fff
  class b missingClass
  linkStyle 5 stroke:#f00
`,
  },
  parameters: { docs: { description: { story: 'Invalid style statements: gutter markers, the problems panel, the issues bar on the canvas and the badge on the code icon.' } } },
};

export const ReadOnly: Story = { name: 'Read-only', args: { readOnly: true } };

export const Dark: Story = { name: 'Dark chrome', args: { ui: 'dark' } };

export const Minimal: Story = {
  name: 'Minimal (features off)',
  args: Object.fromEntries(TOGGLES.map((k) => [k, false])) as Record<Toggle, boolean>,
  parameters: { docs: { description: { story: 'Only the canvas: every optional feature switched off.' } } },
};

export const CanvasOnly: Story = {
  name: 'Canvas with style toolbar only',
  args: { ...Object.fromEntries(TOGGLES.map((k) => [k, false])), styleToolbar: true, pageToolbar: true } as Partial<EditorArgs>,
};

export const SmallFlow: Story = { name: 'Small flowchart', args: { source: SMALL_FLOW, height: 480 } };
