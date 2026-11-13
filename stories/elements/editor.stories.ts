import type { Meta, StoryObj } from '@storybook/web-components-vite';
import '../../src/editor.js';
import { memoryDocumentAdapter } from '../../src/adapters/documents.js';
import { DEFAULT_FEATURES, type EditorFeatures } from '../../src/editor/core.js';
import type { MmdxEditorElement } from '../../src/elements/editor.js';
import { example, exampleHistory, SMALL_ER, SMALL_FLOW, SMALL_SEQUENCE, uiArg } from '../support.js';

type Toggle = Exclude<keyof EditorFeatures, 'exportFormats'>;
const TOGGLES = Object.keys(DEFAULT_FEATURES).filter((k): k is Toggle => k !== 'exportFormats');

type EditorArgs = {
  source: string;
  readOnly: boolean;
  ui: 'light' | 'dark' | 'auto';
  name: string;
  height: number;
  exportFormats: string[];
  /** An example whose version history the editor gets (its History button), or none. */
  historyOf: string;
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
  schemeToggle: 'Light / dark toggle in the view bar (off when the host controls the scheme).',
  export: 'Export menu.',
  help: 'Shortcut help popup.',
  fullscreen: 'Fullscreen toggle.',
  history: 'History button in the tool dock (shown when the editor has a `history`): the version panel — an older version read-only, a comparison with the current one, Restore.',
};

function editor(a: Partial<EditorArgs>): HTMLElement {
  const el = document.createElement('mmdx-editor') as MmdxEditorElement;
  const features: Partial<EditorFeatures> = {};
  for (const k of TOGGLES) if (a[k] !== undefined) features[k] = a[k];
  if (a.exportFormats) features.exportFormats = a.exportFormats as EditorFeatures['exportFormats'];
  el.features = features;
  const versions = a.historyOf ? exampleHistory(a.historyOf) : null;
  el.adapter = memoryDocumentAdapter(versions ? versions[0]!.source : a.source ?? SMALL_FLOW, a.name || 'diagram');
  if (versions) el.history = versions;
  if (a.readOnly) el.setAttribute('read-only', '');
  if (a.ui) el.setAttribute('ui', a.ui);
  if (a.name) el.setAttribute('name', a.name);
  el.style.cssText = `display:block;height:${a.height ?? 640}px;`;
  for (const type of ['mmdx-change', 'mmdx-dirty', 'mmdx-save', 'mmdx-saved', 'mmdx-selection', 'mmdx-export', 'mmdx-conflict'])
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
          'through `adapter` (here `memoryDocumentAdapter`) or `value`. Every feature can be switched off with `features`. ' +
          'Give it the document\'s versions through `history` and the tool dock gets a History button: the version panel ' +
          'opens next to the Code panel (the diagram stays editable); an older version shows read-only in the editor itself ' +
          '(select, copy, export), the Compare tab compares a version with the current one on the same canvas, and Restore ' +
          'brings one back.',
      },
    },
  },
  render: (a) => editor(a),
  argTypes: {
    source: { control: 'text' },
    ui: uiArg,
    height: { control: { type: 'number', min: 320, step: 40 } },
    exportFormats: { control: 'check', options: ['mmdx', 'mmd', 'svg', 'png'] },
    historyOf: { control: 'select', options: ['', 'production-microservices', 'docker-deploy-sequence', 'atom-schema-er', 'microservice-patterns', 'fusion-services', 'simple-flow', 'product-mindmap', 'study-notes', 'order-lifecycle', 'traffic-light'], description: 'Give the editor the version history of an example (overrides `source` with its newest version): the History button in the tool dock.' },
    ...Object.fromEntries(TOGGLES.map((k) => [k, { control: 'boolean', description: FEATURE_DOCS[k], table: { category: 'features' } }])),
  },
  args: {
    source: example('production-microservices'),
    readOnly: false,
    name: 'diagram',
    height: 640,
    exportFormats: [...DEFAULT_FEATURES.exportFormats],
    historyOf: '',
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

/** A mindmap (T08): Tab adds a child, Enter a sibling, drag a node onto another to re-parent it, Space folds a branch. */
export const Mindmap: Story = { args: { source: example('product-mindmap') } };

export const MindmapHistory: Story = { name: 'With history: mindmap', args: { historyOf: 'product-mindmap' } };

/** A state diagram (T09): the States menu (state, start, end, choice, fork, join, composite, note), connect from the dots, ⌘G makes a composite, Properties edit a state's kind and description rows. */
export const StateDiagram: Story = { name: 'State diagram', args: { source: example('order-lifecycle') } };

export const StateHistory: Story = { name: 'With history: state diagram', args: { historyOf: 'order-lifecycle' } };

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

export const WithHistory: Story = {
  name: 'With history',
  args: { historyOf: 'production-microservices' },
  parameters: { docs: { description: { story: 'The editor has the six versions of the example: History in the tool dock (or ⇧H) opens the version panel. Pick an older version to see it read-only, or the Compare tab to see what changed against the current one; Back (Esc) returns to the current version, and Restore opens an older one in the editor (undo brings the current diagram back).' } } },
};

export const SequenceHistory: Story = { name: 'With history: sequence diagram', args: { historyOf: 'docker-deploy-sequence' } };

export const ErHistory: Story = { name: 'With history: ER diagram', args: { historyOf: 'atom-schema-er' } };

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
