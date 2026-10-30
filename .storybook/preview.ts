import type { Preview } from '@storybook/web-components-vite';
import { configure } from '../src/config.js';
import { memoryThemeStore } from '../src/adapters/themes.js';
import { createDefaultRegistry } from '../src/core/theme/builtin.js';
import { THEME_FILES } from '../stories/support.js';

// all shipped themes, in one shared registry and theme source (no fetch), so every story can name any of them
const themes = createDefaultRegistry();
for (const f of THEME_FILES) if (!themes.has(f.id)) themes.register(f);
configure({ themes, themeSource: memoryThemeStore(THEME_FILES) });

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true, sort: 'requiredFirst' },
    options: {
      storySort: { order: ['Introduction', 'Elements', ['Viewer', 'Editor', 'Theme editor', 'Studio', 'Markdown'], 'UI', 'Core'] },
    },
  },
};

export default preview;
