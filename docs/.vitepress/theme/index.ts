// The portal theme: VitePress's default theme, the page's light / dark mode handed to the mmdx chrome, <MmdxDemo> and
// the shape catalogue's table (<ShapeCatalog>).
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import Layout from './Layout.vue';
import MmdxDemo from './MmdxDemo.vue';
import ShapeCatalog from './ShapeCatalog.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('MmdxDemo', MmdxDemo);
    app.component('ShapeCatalog', ShapeCatalog);
  },
} satisfies Theme;
