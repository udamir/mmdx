// Storybook: every component (the four elements and the chrome they are built from) and the main features.
import type { StorybookConfig } from '@storybook/web-components-vite';

const config: StorybookConfig = {
  framework: { name: '@storybook/web-components-vite', options: {} },
  stories: ['../stories/**/*.mdx', '../stories/**/*.stories.ts'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  // the studio and `src=` stories fetch the shipped examples and theme manifests, as the site does (under /static:
  // /examples and /themes are the module URLs of the files the stories import)
  staticDirs: [
    { from: '../examples', to: '/static/examples' },
    { from: '../themes', to: '/static/themes' },
  ],
  core: { disableTelemetry: true },
  // stock Mermaid (Plain Mermaid and the viewer fallback) is one large chunk by itself, as on the site
  viteFinal: (config) => ({ ...config, build: { ...config.build, chunkSizeWarningLimit: 3000 } }),
};

export default config;
