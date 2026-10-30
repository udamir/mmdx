import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { CODE_EDITOR_CSS, createCodeEditor, highlightLine, highlightMetaLine } from '../../src/ui/code-editor.js';
import { chromeHost, example } from '../support.js';

type CodeArgs = { value: string; lineNumbers: boolean; meta: boolean; markers: boolean; readOnly: boolean; ui: 'light' | 'dark' };

const BAD = `flowchart LR
  a[Start] --> b[Next]
  style a fill:#zzz,stroke-width:abc
  style ghost fill:#fff
  linkStyle 5 stroke:#f00`;

const MARKERS = new Map<number, readonly string[]>([
  [3, ['"#zzz" is not a colour', '"abc" is not a number for stroke-width']],
  [4, ['"ghost" is not defined']],
  [5, ['linkStyle 5: there are only 1 links']],
]);

function codeEditor(a: CodeArgs): HTMLElement {
  const { host, root } = chromeHost([CODE_EDITOR_CSS, '.box{position:relative;height:420px;border:1px solid var(--ds-border);background:var(--ds-surface);border-radius:8px;overflow:hidden;} .box .cm{height:100%;}'], { ui: a.ui });
  const box = document.createElement('div');
  box.className = 'box';
  const ed = createCodeEditor({
    value: a.value,
    lineNumbers: a.lineNumbers,
    highlightLine: a.meta ? highlightMetaLine : highlightLine,
    label: a.meta ? 'Layout metadata' : 'Mermaid code',
    tipHost: () => box,
    onInput: (v) => console.info('input', v.length, 'chars'),
  });
  ed.readOnly = a.readOnly;
  box.append(ed.el);
  root.append(box);
  queueMicrotask(() => {
    ed.refresh();
    if (a.markers) ed.setMarkers(MARKERS);
  });
  return host;
}

const meta: Meta<CodeArgs> = {
  title: 'UI/Code editor',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The lightweight code editor of the code panel and the theme editor: a textarea over a highlighted layer, ' +
          'line numbers, issue markers with tooltips in the gutter, and a highlighter for Mermaid or for the `%%@` metadata.',
      },
    },
  },
  render: (a) => codeEditor(a),
  argTypes: { value: { control: 'text' }, ui: { control: 'inline-radio', options: ['light', 'dark'] } },
  args: { value: example('production-microservices'), lineNumbers: true, meta: false, markers: false, readOnly: false, ui: 'light' },
};
export default meta;

type Story = StoryObj<CodeArgs>;

export const Mermaid: Story = {};

export const Metadata: Story = {
  name: 'Layout metadata',
  args: { value: example('production-microservices').split('\n').filter((l) => l.startsWith('%%')).join('\n'), meta: true },
};

export const IssueMarkers: Story = {
  name: 'Issue markers',
  args: { value: BAD, markers: true },
  parameters: { docs: { description: { story: 'Hover a gutter marker for the messages.' } } },
};

export const NoGutter: Story = { name: 'Without line numbers', args: { lineNumbers: false } };

export const ReadOnly: Story = { name: 'Read-only', args: { readOnly: true } };

export const Dark: Story = { args: { ui: 'dark' } };
