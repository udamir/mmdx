import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { createSchemeToggle, SCHEME_TOGGLE_CSS, type Scheme } from '../../src/ui/blocks/scheme-toggle.js';
import { createI18n } from '../../src/ui/i18n.js';
import { signal } from '../../src/ui/signal.js';
import { chromeHost, SYSTEM_UI } from '../support.js';

type Args = { ui: Scheme };

/** The toggle in a view-params-like card; picking a scheme switches the story's own chrome. */
function schemeToggle(a: Args): HTMLElement {
  const { t } = createI18n();
  const { host, root } = chromeHost([SCHEME_TOGGLE_CSS,
    '.card{display:inline-flex;padding:4px;background:var(--mmdx-float);border:1px solid var(--mmdx-float-line);border-radius:12px;box-shadow:0 4px 16px rgba(20,30,60,.10);}'], { ui: a.ui });
  const scheme = signal<Scheme>(a.ui);
  const toggle = createSchemeToggle({ scheme, t, onChange: (v) => {
    scheme.set(v);
    host.dataset['ui'] = v;
  } });
  const card = document.createElement('div');
  card.className = 'card';
  card.append(toggle.el);
  root.append(card);
  return host;
}

const meta: Meta<Args> = {
  title: 'Blocks/SchemeToggle',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The light / dark chrome toggle (`createSchemeToggle`): a radio group of a sun and a moon. Only the chrome ' +
          'changes. The checked radio is in the Tab order; arrow keys switch.',
      },
    },
  },
  render: (a) => schemeToggle(a),
  argTypes: { ui: { control: 'inline-radio', options: ['light', 'dark'] } },
  args: { ui: SYSTEM_UI },
};
export default meta;

type Story = StoryObj<Args>;

export const Light: Story = {};
export const Dark: Story = { args: { ui: 'dark' } };
