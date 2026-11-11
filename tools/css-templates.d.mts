// Types of tools/css-templates.mjs (the build's CSS template minifier).
import type { Plugin as VitePlugin } from 'vite';
import type { Plugin as EsbuildPlugin } from 'esbuild';
export function minifyCss(css: string): string;
export function minifyCssTemplates(code: string): string;
export function cssTemplatesPlugin(): VitePlugin;
export function cssTemplatesEsbuild(): EsbuildPlugin;
