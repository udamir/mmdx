import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { diffDiagrams } from '../../src/core/diff/all.js';
import { changeKey } from '../../src/core/diff/merge.js';
import { CHANGE_LIST_CSS, createChangeList } from '../../src/ui/blocks/change-list.js';
import { createI18n } from '../../src/ui/i18n.js';
import { DIFF_TOKENS } from '../../src/ui/styles/diff.js';
import { chromeHost, exampleHistory, SYSTEM_UI } from '../support.js';

type Args = { example: string; ui: 'light' | 'dark' };

/** Colour values of the example sources: hex colours show as swatches (palette names are not resolved here). */
const color = (v: unknown): string | undefined => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : undefined);

/** The changes between the two newest versions of an example's history, in a panel-sized card. */
function changeList(a: Args): HTMLElement {
  const { host, root } = chromeHost([DIFF_TOKENS, CHANGE_LIST_CSS, '.card{width:340px;max-height:520px;overflow:auto;background:var(--mmdx-surface);border:1px solid var(--mmdx-border);border-radius:14px;box-shadow:var(--mmdx-shadow);} .log{font:12px ui-monospace,monospace;color:var(--mmdx-muted);margin-top:12px;}'], { ui: a.ui });
  const versions = exampleHistory(a.example);
  const diff = diffDiagrams(versions[1]?.source ?? '', versions[0]?.source ?? '');
  const changes = diff.items.filter((c) => c.status !== 'unchanged');
  const log = document.createElement('div');
  log.className = 'log';
  const cl = createChangeList({
    doc: diff.doc, changes, keyOf: changeKey, selected: null, colorBefore: color, colorAfter: color, t: createI18n().t, part: 'change-list',
    onSelect: (key) => {
      cl.select(key);
      log.textContent = `selected: ${key ?? '(none)'}`;
    },
  });
  const card = document.createElement('div');
  card.className = 'card';
  card.append(cl.el);
  root.append(card, log);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/ChangeList',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The change rows of a diff: mark icons in the highlight colours, kind and label, the diagram-wide field changes above. ' +
          'A listbox: arrow keys, Home and End move along the rows; clicking selects (again: clears), and `select(key)` moves the ' +
          'selection in place so the focus stays. Here: the two newest versions of an example history.',
      },
    },
  },
  render: (a) => changeList(a),
  argTypes: {
    example: { control: 'select', options: ['production-microservices', 'docker-deploy-sequence', 'atom-schema-er', 'fusion-services', 'microservice-patterns', 'simple-flow'] },
    ui: { control: 'inline-radio', options: ['light', 'dark'] },
  },
  args: { example: 'production-microservices', ui: SYSTEM_UI },
};
export default meta;

type Story = StoryObj<Args>;

export const Flowchart: Story = {};
export const Sequence: Story = { args: { example: 'docker-deploy-sequence' } };
export const EntityRelationship: Story = { name: 'ER diagram', args: { example: 'atom-schema-er' } };
export const Dark: Story = { args: { ui: 'dark' } };
