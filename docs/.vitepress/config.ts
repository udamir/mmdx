// The documentation portal (VitePress). GitHub Pages serves it at /mmdx/, with the studio demo at /mmdx/studio/ and
// Storybook at /mmdx/storybook/ (tools/pages.mjs puts the three builds together); override with DOCS_BASE=/ for other hosts.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitepress';
// @ts-expect-error plain ESM build helper without type declarations
import { cssTemplatesPlugin } from '../../tools/css-templates.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const base = process.env['DOCS_BASE'] ?? '/mmdx/';
const pkg = JSON.parse(readFileSync(resolve(repo, 'package.json'), 'utf8')) as { version: string };

// VitePress 1 builds with Vite 5, which does not resolve the `.js` specifiers of src/ to their `.ts` files in a worker's
// `new URL('./render-worker.js', import.meta.url)` (Vite 7, used by the library, the site and Storybook, does)
function jsToTs(): Plugin {
  return {
    name: 'mmdx-js-to-ts',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.endsWith('.js')) return null;
      const file = isAbsolute(source) ? source : resolve(importer ? dirname(importer) : repo, source);
      const ts = file.replace(/\.js$/, '.ts');
      return file.startsWith(resolve(repo, 'src')) && !existsSync(file) && existsSync(ts) ? ts : null;
    },
  };
}

// pages outside VitePress (target="_self" makes the router leave them to the browser)
const studio = { text: 'Demo', link: '/studio/', target: '_self' };
const storybook = { text: 'Storybook', link: '/storybook/', target: '_self' };

export default defineConfig({
  title: 'Mermaid Studio',
  titleTemplate: ':title — Mermaid Studio',
  description: 'Visual editor, viewer, theme editor and visual diff for Mermaid diagrams, as framework-agnostic web components.',
  base,
  cleanUrls: false,
  lastUpdated: true,
  // the demo and Storybook are separate builds next to the portal
  ignoreDeadLinks: [/^\/(studio|storybook)\//],
  head: [
    ['link', { rel: 'icon', href: `${base}favicon.svg`, type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#061958' }],
  ],
  markdown: {
    // a ```mermaid block is a live <mmdx-viewer>; ```mmdx (or mmd) shows the code itself, highlighted as Mermaid
    config(md) {
      const fence = md.renderer.rules.fence!;
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const t = tokens[idx]!;
        const [lang, ...rest] = t.info.trim().split(/\s+/);
        if (lang !== 'mermaid') return fence(tokens, idx, options, env, self);
        const attrs = rest.join(' ').replace(/[^\w\s="-]/g, '');
        return `<MmdxDemo code="${encodeURIComponent(t.content.replace(/\n$/, ''))}" ${attrs} />\n`;
      };
      // VitePress leaves links with a target as they are, so [studio](/studio/){target="_self"} gets the base here
      const linkOpen = md.renderer.rules.link_open!;
      md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const t = tokens[idx]!;
        const href = t.attrGet('href');
        if (t.attrGet('target') && href?.startsWith('/') && !href.startsWith(base)) t.attrSet('href', `${base}${href.slice(1)}`);
        return linkOpen(tokens, idx, options, env, self);
      };
    },
    languageAlias: { mmdx: 'mermaid', mmd: 'mermaid' },
  },
  vite: {
    plugins: [cssTemplatesPlugin(), jsToTs()],
    worker: { format: 'es', plugins: () => [cssTemplatesPlugin(), jsToTs()] },
    server: { fs: { allow: [repo] } },
    // stock Mermaid (the viewer's fallback) is one large chunk by itself, as on the demo site
    build: { chunkSizeWarningLimit: 3000 },
  },
  vue: {
    template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('mmdx-') } },
  },
  themeConfig: {
    logo: { light: '/logo.svg', dark: '/logo-dark.svg', alt: 'Mermaid Studio' },
    siteTitle: 'Mermaid Studio',
    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: 'Components', link: '/components/', activeMatch: '/components/' },
      { text: 'API', link: '/api/', activeMatch: '/api/' },
      studio,
      storybook,
      {
        text: `v${pkg.version}`,
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'npm', link: 'https://www.npmjs.com/package/@mmdx/studio' },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Mermaid Studio?', link: '/guide/introduction' },
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'The .mmdx format', link: '/guide/mmdx-format' },
          ],
        },
        {
          text: 'Using mmdx',
          items: [
            { text: 'Themes', link: '/guide/themes' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Saving documents', link: '/guide/documents' },
            { text: 'Version history', link: '/guide/history' },
            { text: 'Reviewing changes in CI', link: '/guide/ci' },
            { text: 'Server-side rendering', link: '/guide/ssr' },
          ],
        },
        {
          text: 'Integrations',
          items: [
            { text: 'Frameworks', link: '/guide/frameworks' },
            { text: 'Markdown and docs sites', link: '/guide/markdown' },
            { text: 'Sandboxed iframes', link: '/guide/sandboxed-iframes' },
            { text: 'Styling', link: '/guide/styling' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Security', link: '/guide/security' },
            { text: 'Browser support and limits', link: '/guide/browser-support' },
            { text: 'Architecture', link: '/guide/architecture' },
            { text: 'Contributing', link: '/guide/contributing' },
          ],
        },
      ],
      '/components/': [
        {
          text: 'Components',
          items: [
            { text: 'Overview', link: '/components/' },
            { text: '&lt;mmdx-viewer&gt;', link: '/components/viewer' },
            { text: '&lt;mmdx-editor&gt;', link: '/components/editor' },
            { text: '&lt;mmdx-diff&gt;', link: '/components/diff' },
            { text: '&lt;mmdx-theme-editor&gt;', link: '/components/theme-editor' },
            { text: '&lt;mmdx-studio&gt;', link: '/components/studio' },
          ],
        },
        {
          text: 'More',
          items: [
            { text: 'Playgrounds', link: '/components/playgrounds' },
            storybook,
          ],
        },
      ],
      '/api/': [
        {
          text: 'API reference',
          items: [
            { text: 'Entry points', link: '/api/' },
            { text: '@mmdx/studio/core', link: '/api/core' },
            { text: '@mmdx/studio/adapters', link: '/api/adapters' },
            { text: 'Configuration and themes', link: '/api/configuration' },
            { text: '@mmdx/studio/markdown', link: '/api/markdown' },
            { text: '@mmdx/studio/react', link: '/api/react' },
            { text: '@mmdx/studio/worker-inline', link: '/api/worker-inline' },
            { text: 'Events', link: '/api/events' },
            { text: 'Theme file', link: '/api/theme-file' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/udamir/mmdx' }],
    editLink: { pattern: 'https://github.com/udamir/mmdx/edit/master/docs/:path', text: 'Edit this page on GitHub' },
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    footer: { message: 'Released under the MIT License.', copyright: 'Copyright © Damir Yusipov' },
  },
});
