import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createBanner, createEmptyState, createErrorCard, MESSAGES_CSS } from '../../src/ui/blocks/messages.js';
import { createI18n } from '../../src/ui/i18n.js';
import { chromeHost } from '../support.js';

type Args = { tone: 'info' | 'warn' | 'error'; ui: 'light' | 'dark' };

const BROKEN = `flowchart LR
  a([Start]) --> b{Valid?}
  b -->|yes| c[Process
  b -->|no| d[Reject]
  c --> `;

/** The three messages, as the canvas overlay and the top-center slot show them. */
function messages(a: Args): HTMLElement {
  const { t } = createI18n();
  const { host, root } = chromeHost([MESSAGES_CSS, '.col{display:flex;flex-direction:column;gap:20px;align-items:flex-start;} h3{margin:0;font:600 12px system-ui;color:var(--mmdx-muted);}'], { ui: a.ui });
  const col = document.createElement('div');
  col.className = 'col';
  const head = (s: string): HTMLElement => Object.assign(document.createElement('h3'), { textContent: s });
  const banner = createBanner({ text: 'The diagram type changed between the versions: only the code is compared.', tone: a.tone });
  const card = createErrorCard({ title: t('error.title'), diagnostics: ['line 3: unclosed "[" in a node label', 'line 5: a connection has no target'], source: BROKEN, badLines: [2, 4], t });
  const empty = createEmptyState({ text: 'No changes between these versions', action: { label: 'Pick other versions', onClick: () => void (empty.el.querySelector('p')!.textContent = 'Picked') } });
  col.append(head('Banner'), banner.el, head('ErrorCard'), card.el, head('EmptyState'), empty.el);
  root.append(col);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/Messages',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`createBanner` (a one-line status, hidden while empty; info / warn / error tones), `createErrorCard` (why a ' +
          'diagram cannot be shown: diagnostics, the numbered source with the bad lines marked, Copy source) and ' +
          '`createEmptyState` (a muted line with an optional action).',
      },
    },
  },
  render: (a) => messages(a),
  argTypes: { tone: { control: 'inline-radio', options: ['info', 'warn', 'error'] }, ui: { control: 'inline-radio', options: ['light', 'dark'] } },
  args: { tone: 'warn', ui: 'light' },
};
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const Dark: Story = { args: { ui: 'dark' } };
