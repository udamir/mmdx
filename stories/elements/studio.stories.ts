import type { Meta, StoryObj } from '@storybook/web-components-vite';
import '../../src/studio.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { MmdxStudioElement } from '../../src/elements/studio.js';

type StudioArgs = { initial: string };

function studio(a: StudioArgs): HTMLElement {
  const el = document.createElement('mmdx-studio') as MmdxStudioElement;
  // the shipped manifests (served by Storybook next to the stories); nothing persists between reloads
  el.setAttribute('examples', 'static/examples/index.json');
  el.setAttribute('themes', 'static/themes/index.json');
  el.setAttribute('persist', '');
  if (a.initial) el.setAttribute('initial', a.initial);
  el.storage = memoryStorage();
  el.style.cssText = 'display:block;height:100vh;';
  return el;
}

const meta: Meta<StudioArgs> = {
  title: 'Elements/Studio',
  tags: ['autodocs'],
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 760 },
      description: {
        component:
          '`<mmdx-studio>` is the standalone app (the GitHub Pages site): the editor with New / Open / examples, ' +
          'Share (the document in the URL hash), Export, the theme editor, Plain Mermaid and the Edit / View switch. ' +
          'Import `mmdx/studio`.',
      },
    },
  },
  render: (a) => studio(a),
  argTypes: {
    initial: {
      control: 'select',
      options: ['production-microservices', 'docker-deploy-sequence', 'atom-schema-er', 'microservice-patterns', 'fusion-services', 'simple-flow'],
      description: 'Example opened on start.',
    },
  },
  args: { initial: 'production-microservices' },
};
export default meta;

type Story = StoryObj<StudioArgs>;

export const Studio: Story = {};

export const SequenceExample: Story = { name: 'Opened on a sequence example', args: { initial: 'docker-deploy-sequence' } };

export const ErExample: Story = { name: 'Opened on an ER example', args: { initial: 'atom-schema-er' } };
