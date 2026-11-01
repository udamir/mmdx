// The portal theme: VitePress's default theme, the page's light / dark mode handed to the mmdx chrome, and <MmdxDemo>.
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import Layout from './Layout.vue';
import MmdxDemo from './MmdxDemo.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('MmdxDemo', MmdxDemo);
  },
} satisfies Theme;
