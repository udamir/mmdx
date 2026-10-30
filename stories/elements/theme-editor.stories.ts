import type { Meta, StoryObj } from '@storybook/web-components-vite';
import '../../src/theme-editor.js';
import { memoryThemeStore } from '../../src/adapters/themes.js';
import { memoryStorage } from '../../src/adapters/storage.js';
import type { MmdxThemeEditorElement } from '../../src/elements/theme-editor.js';
import { SMALL_ER, SMALL_FLOW, SMALL_SEQUENCE, THEME_FILES, THEME_IDS, uiArg } from '../support.js';

type ThemeEditorArgs = {
  theme: string;
  canEdit: boolean;
  canDelete: boolean;
  canPublish: boolean;
  presentation: 'inline' | 'dialog';
  ui: 'light' | 'dark' | 'auto';
  customSamples: boolean;
};

function themeEditor(a: Partial<ThemeEditorArgs>): HTMLElement {
  const el = document.createElement('mmdx-theme-editor') as MmdxThemeEditorElement;
  // every shipped theme, editable in memory (nothing is written anywhere)
  el.store = memoryThemeStore(THEME_FILES);
  el.storage = memoryStorage();
  if (a.customSamples) el.samples = { flowchart: SMALL_FLOW, sequence: SMALL_SEQUENCE, er: SMALL_ER };
  if (a.theme) el.setAttribute('theme', a.theme);
  el.setAttribute('can-edit', String(a.canEdit ?? true));
  el.setAttribute('can-delete', String(a.canDelete ?? true));
  el.setAttribute('can-publish', String(a.canPublish ?? false));
  if (a.presentation) el.setAttribute('presentation', a.presentation);
  if (a.ui) el.setAttribute('ui', a.ui);
  el.style.cssText = 'display:block;height:720px;';
  for (const type of ['ds-theme-save', 'ds-theme-saved', 'ds-theme-dirty', 'ds-theme-select', 'ds-theme-close'])
    el.addEventListener(type, (e) => console.info(type, (e as CustomEvent).detail));
  return el;
}

const meta: Meta<ThemeEditorArgs> = {
  title: 'Elements/Theme editor',
  tags: ['autodocs'],
  parameters: {
    docs: {
      story: { inline: false, iframeHeight: 760 },
      description: {
        component:
          '`<mmdx-theme-editor>` edits diagram themes: palette, fonts, presets per item type (with live previews), page ' +
          'presets per diagram type, and sample diagrams. Themes come from a `store` (here in memory, seeded with the ' +
          'shipped themes); `can-edit`, `can-delete` and `can-publish` gate the actions. Import `mmdx/theme-editor`.',
      },
    },
  },
  render: (a) => themeEditor(a),
  argTypes: {
    theme: { control: 'select', options: THEME_IDS },
    presentation: { control: 'inline-radio', options: ['inline', 'dialog'] },
    ui: uiArg,
    customSamples: { control: 'boolean', description: 'Pass small custom `samples` for the preview instead of the defaults.' },
  },
  args: { theme: 'default-light', canEdit: true, canDelete: true, canPublish: false, presentation: 'inline', ui: 'light', customSamples: false },
};
export default meta;

type Story = StoryObj<ThemeEditorArgs>;

export const Default: Story = {};

export const DarkTheme: Story = { name: 'Editing a dark theme', args: { theme: 'default-dark', ui: 'dark' } };

export const ReadOnly: Story = {
  name: 'Read-only (can-edit=false)',
  args: { canEdit: false, canDelete: false },
};

export const Publish: Story = { name: 'With publish', args: { canPublish: true } };

export const CustomSamples: Story = { name: 'Custom samples', args: { customSamples: true, theme: 'github-light' } };

export const Dialog: Story = {
  name: 'Dialog presentation',
  args: { presentation: 'dialog' },
  parameters: { docs: { description: { story: 'Shown as a modal over the page, as the studio opens it; Esc or the close button asks about unsaved changes.' } } },
};
