import type { Preview } from '@storybook/web-components-vite';
import { themes as sbThemes } from 'storybook/theming';
import { configure } from '../src/config.js';
import { memoryThemeStore } from '../src/adapters/themes.js';
import { createDefaultRegistry } from '../src/core/theme/builtin.js';
import { SYSTEM_UI, THEME_FILES } from '../stories/support.js';

// all shipped themes, in one shared registry and theme source (no fetch), so every story can name any of them
const themes = createDefaultRegistry();
for (const f of THEME_FILES) if (!themes.has(f.id)) themes.register(f);
configure({ themes, themeSource: memoryThemeStore(THEME_FILES) });

type Scheme = 'light' | 'dark';

const preview: Preview = {
  // Storybook's light / dark is the backgrounds toolbar, starting in the system's scheme
  initialGlobals: { backgrounds: { value: SYSTEM_UI } },
  decorators: [
    // the stories follow Storybook's light / dark: a story without its own `ui` gets it, and so does its diagram theme
    // when the story names one (`schemeTheme`); elements with ui="auto" follow <html data-theme>
    (story, ctx) => {
      const scheme: Scheme = (ctx.globals['backgrounds'] as { value?: string } | undefined)?.value === 'dark' ? 'dark' : 'light';
      const html = document.documentElement;
      html.dataset['theme'] = scheme;
      html.style.colorScheme = scheme;
      const args = { ...ctx.args };
      if ('ui' in ctx.argTypes && args['ui'] === undefined) args['ui'] = scheme;
      if (ctx.parameters['schemeTheme'] && args['theme'] === undefined) args['theme'] = `default-${scheme}`;
      return story({ args });
    },
  ],
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true, sort: 'requiredFirst' },
    backgrounds: {
      options: {
        light: { name: 'Light', value: '#ffffff' },
        dark: { name: 'Dark', value: '#1b1c1d' },
      },
    },
    // the docs pages follow the system's light / dark
    docs: { theme: SYSTEM_UI === 'dark' ? sbThemes.dark : sbThemes.light },
    options: {
      storySort: { order: ['Introduction', 'Elements', ['Viewer', 'Editor', 'Theme editor', 'Studio', 'Markdown'], 'UI', 'Core'] },
    },
  },
};

export default preview;
