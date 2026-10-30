// Build step: minify the CSS in `/* css */ \`…\`` template literals (component styles live in TS strings, §10).
// Only whitespace and comments are touched; interpolations (`${…}`) are left alone.
const RE = /\/\*\s*css\s*\*\/\s*`([^`]*)`/g;

export function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/:\s+/g, ':')
    .replace(/;}/g, '}')
    .trim();
}

export const minifyCssTemplates = (code) => code.replace(RE, (_m, css) => (css.includes('${') ? `\`${css}\`` : `\`${minifyCss(css)}\``));

/** Vite / Rollup plugin. */
export function cssTemplatesPlugin() {
  return {
    name: 'mmdx-css-templates',
    transform(code, id) {
      if (!/\/src\/.*\.ts$/.test(id) || !code.includes('/* css */')) return null;
      return { code: minifyCssTemplates(code), map: null };
    },
  };
}

/** esbuild plugin. */
export function cssTemplatesEsbuild() {
  return {
    name: 'mmdx-css-templates',
    setup(b) {
      b.onLoad({ filter: /\/src\/.*\.ts$/ }, async (args) => {
        const { readFile } = await import('node:fs/promises');
        const code = await readFile(args.path, 'utf8');
        return { contents: code.includes('/* css */') ? minifyCssTemplates(code) : code, loader: 'ts' };
      });
    },
  };
}
