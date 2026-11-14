import type { Preview } from '@storybook/web-components-vite';
import { UPDATE_GLOBALS } from 'storybook/internal/core-events';
import { themes as sbThemes } from 'storybook/theming';
import { configure } from '../src/platform/config.js';
import { memoryThemeStore } from '../src/adapters/themes.js';
import { createDefaultRegistry } from '../src/core/theme/builtin.js';
import { SYSTEM_UI, THEME_FILES } from '../stories/support.js';

// all shipped themes, in one shared registry and theme source (no fetch), so every story can name any of them
const themes = createDefaultRegistry();
for (const f of THEME_FILES) if (!themes.has(f.id)) themes.register(f);
// stock Mermaid for Plain Mermaid and the fallback renderer: a bundled page names its loader (no run-time resolve)
configure({ themes, themeSource: memoryThemeStore(THEME_FILES), mermaid: () => import('mermaid') });

type Scheme = 'light' | 'dark';
type Globals = Record<string, unknown> | undefined;

const schemeOf = (globals: Globals): Scheme => ((globals?.['backgrounds'] as { value?: string } | undefined)?.value === 'dark' ? 'dark' : 'light');
const mark = (scheme: Scheme): void => {
  const html = document.documentElement;
  html.dataset['theme'] = scheme;
  html.style.colorScheme = scheme;
};

// A docs page shows some stories in frames (`docs.story.inline: false`). Each frame is a preview of its own that never
// hears the toolbar, so a framed story takes the scheme from the globals of the docs page's preview (which only the
// toolbar changes), and reloads when the toolbar changes it to another scheme than the one the frame shows.
type PreviewWindow = Window & {
  __STORYBOOK_PREVIEW__?: { storyStoreValue?: { userGlobals: { get(): Globals } } };
  __STORYBOOK_ADDONS_CHANNEL__?: { on(event: string, listener: () => void): void };
};
const docsPage = ((): PreviewWindow | null => {
  try {
    const w = window.parent as PreviewWindow;
    return w !== window && w.document.getElementById('storybook-docs') ? w : null;
  } catch {
    return null;
  }
})();
const docsScheme = (): Scheme | undefined => {
  const globals = docsPage?.__STORYBOOK_PREVIEW__?.storyStoreValue?.userGlobals.get();
  return globals ? schemeOf(globals) : undefined;
};
let shown: Scheme | undefined;
// (a frame that reloaded leaves its listener behind on the docs page: it must not throw)
docsPage?.__STORYBOOK_ADDONS_CHANNEL__?.on(UPDATE_GLOBALS, () => {
  try {
    setTimeout(() => {
      const s = docsScheme();
      if (shown && s && s !== shown) location.reload();
    });
  } catch {
    // the frame is gone
  }
});

const preview: Preview = {
  // Storybook's light / dark is the backgrounds toolbar, starting in the system's scheme
  initialGlobals: { backgrounds: { value: SYSTEM_UI } },
  decorators: [
    // the stories follow Storybook's light / dark: a story without its own `ui` gets it, and so does its diagram theme
    // when the story names one (`schemeTheme`); elements with ui="auto" follow <html data-theme>
    (story, ctx) => {
      const scheme = docsScheme() ?? schemeOf(ctx.globals);
      shown = scheme;
      mark(scheme);
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
