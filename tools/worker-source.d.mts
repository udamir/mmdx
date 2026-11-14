// Types of tools/worker-source.mjs (the render worker's inline source and the icon stub for it).
import type { Plugin as VitePlugin } from 'vite';
import type { Plugin as EsbuildPlugin } from 'esbuild';
export function noBuiltinIconsEsbuild(): EsbuildPlugin;
export function noBuiltinIcons(): VitePlugin;
export function renderWorkerSource(): Promise<string>;
export function workerSourcePlugin(): VitePlugin;
