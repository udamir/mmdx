// Generates dark and light diagram themes (themes/<id>.theme.json) from popular open-source colour schemes.
//
//   node tools/build-themes.mjs
//
// Each scheme gives its own roles — background layers, text, comment, border and accents — and they are mapped onto
// the studio palette that every Default Light style and preset refers to:
//   - neutrals (page, item surface, group surface, borders, text) come straight from the scheme;
//   - item fills (node / table / participant presets, notes, blocks…) are the scheme's accents blended into its
//     background, so every preset is a distinct *filled* colour with the scheme's text on top;
//   - lines and highlights (links, messages, error colours…) use the pure accents.
// Every fill is checked against the text colour (WCAG AA, 4.5:1) and toned down until it passes.
import { readFileSync, writeFileSync } from 'node:fs';

// ---------------------------------------------------------------- schemes (official palettes)
const SCHEMES = [
  {
    id: 'dracula', counterpart: 'rose-pine-dawn', name: 'Dracula', source: 'https://draculatheme.com/spec', license: 'MIT',
    bg: '#282a36', surface: '#303241', surface2: '#2c2e3b', border: '#6272a4', frame: '#6272a4',
    fg: '#f8f8f2', fg2: '#e2e2dc', subtle: '#a3acd0', comment: '#6272a4',
    red: '#ff5555', orange: '#ffb86c', yellow: '#f1fa8c', green: '#50fa7b', teal: '#8be9fd', cyan: '#8be9fd', blue: '#8be9fd', purple: '#bd93f9', pink: '#ff79c6',
    // Dracula has no blue: its cyan doubles as blue, and lines in "blue" roles take purple to stay distinct
    blueLine: '#bd93f9',
  },
  {
    id: 'catppuccin-mocha', counterpart: 'catppuccin-latte', name: 'Catppuccin Mocha', source: 'https://github.com/catppuccin/palette', license: 'MIT',
    bg: '#1e1e2e', surface: '#313244', surface2: '#252536', border: '#585b70', frame: '#6c7086',
    fg: '#cdd6f4', fg2: '#bac2de', subtle: '#a6adc8', comment: '#7f849c',
    red: '#f38ba8', orange: '#fab387', yellow: '#f9e2af', green: '#a6e3a1', teal: '#94e2d5', cyan: '#89dceb', blue: '#89b4fa', purple: '#cba6f7', pink: '#f5c2e7',
  },
  {
    id: 'github-dark', counterpart: 'github-light', name: 'GitHub Dark', source: 'https://github.com/primer/primitives', license: 'MIT',
    // Primer's dark neutral scale: page n1, groups n2, items n3, borders n7, text n12; accents are the "step 3" colours
    // GitHub uses for text and lines on dark backgrounds
    bg: '#0d1117', surface: '#212830', surface2: '#151b23', border: '#3d444d', frame: '#656c76',
    fg: '#f0f6fc', fg2: '#b7bdc8', subtle: '#9198a1', comment: '#656c76',
    // no teal in the base scales: a blue–green mix, as in GitHub Light
    red: '#ff7b72', orange: '#f0883e', yellow: '#d29922', green: '#3fb950', teal: '#4cb0a8', cyan: '#4cb0a8', blue: '#58a6ff', purple: '#be8fff', pink: '#f778ba',
  },
];

// Light schemes: the same roles; fills are tints of the accents over the item surface (dark text on top), lines are the
// accents darkened toward the text only as far as needed to stand out on the light page.
const LIGHT_SCHEMES = [
  {
    id: 'github-light', counterpart: 'github-dark', name: 'GitHub Light', source: 'https://github.com/primer/primitives', license: 'MIT',
    bg: '#ffffff', surface: '#ffffff', surface2: '#f6f8fa', border: '#818b98', frame: '#59636e',
    fg: '#1f2328', fg2: '#454c54', subtle: '#59636e', comment: '#818b98',
    // Primer's base scales have no teal: a blue–green mix
    red: '#cf222e', orange: '#bc4c00', yellow: '#9a6700', green: '#1a7f37', teal: '#127489', cyan: '#127489', blue: '#0969da', purple: '#8250df', pink: '#bf3989',
  },
  {
    id: 'catppuccin-latte', counterpart: 'catppuccin-mocha', name: 'Catppuccin Latte', source: 'https://github.com/catppuccin/palette', license: 'MIT',
    // items sit a step lighter than the page (base), groups a step darker (mantle)
    bg: '#eff1f5', surface: '#f8f9fb', surface2: '#e6e9ef', border: '#9ca0b0', frame: '#8c8fa1',
    fg: '#4c4f69', fg2: '#5c5f77', subtle: '#6c6f85', comment: '#8c8fa1',
    red: '#d20f39', orange: '#fe640b', yellow: '#df8e1d', green: '#40a02b', teal: '#179299', cyan: '#04a5e5', blue: '#1e66f5', purple: '#8839ef', pink: '#ea76cb',
  },
  {
    id: 'rose-pine-dawn', counterpart: 'dracula', name: 'Rosé Pine Dawn', source: 'https://github.com/rose-pine/neovim', license: 'MIT',
    bg: '#faf4ed', surface: '#fffaf3', surface2: '#f2e9e1', border: '#9893a5', frame: '#797593',
    fg: '#464261', fg2: '#575279', subtle: '#797593', comment: '#9893a5',
    // Rosé Pine has no green and no blue: pine (deep teal) takes green, a deeper pine blue, foam the cyan roles
    red: '#b4637a', orange: '#d7827e', yellow: '#ea9d34', green: '#286983', teal: '#56949f', cyan: '#56949f', blue: '#1f5a8a', purple: '#907aa9', pink: '#d7827e',
  },
].map((s) => ({ ...s, appearance: 'light' }));

// ---------------------------------------------------------------- colour helpers
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v * t + rgb(b)[i] * (1 - t))); // t of a over b
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ---------------------------------------------------------------- mapping onto the studio palette
// fills: [accent, share of the accent over the page background]; toned down until the text reads at 4.5:1
const FILLS = {
  cream: ['yellow', 0.16], butter: ['yellow', 0.22], gold: ['yellow', 0.34], sand: ['orange', 0.16],
  peach: ['orange', 0.24], apricot: ['orange', 0.28], orange: ['orange', 0.4], ochre: ['yellow', 0.3],
  lime: ['lime', 0.26], 'pale-lime': ['green', 0.08], green: ['green', 0.26], moss: ['green', 0.32], sage: ['green', 0.16],
  mint: ['teal', 0.26], ice: ['cyan', 0.24], sky: ['blue', 0.26], cornflower: ['blue', 0.32], 'pale-blue': ['blue', 0.14],
  blue: ['blue', 0.5], violet: ['purple', 0.32], lilac: ['purple', 0.24], lavender: ['purple', 0.2],
  pink: ['pink', 0.24], rose: ['red', 0.24], 'pale-rose': ['red', 0.12],
};

function build(s) {
  const light = s.appearance === 'light';
  const acc = { ...s, lime: mix(s.yellow, s.green, 0.5) };
  if (light) return buildLight(s, acc);
  // Blending a (pastel) accent into the page lightens it, so the text check would wash it out to grey. Blending it into
  // a darkened page instead carries more of the accent at the same brightness: more colour, same text contrast.
  const deep = mix(s.bg, '#000000', 0.55);
  const fill = (name) => {
    const [a, share] = FILLS[name];
    let t = Math.min(0.85, share * 1.9), c = mix(acc[a], deep, t);
    while (contrast(s.fg, c) < 4.5 && t > 0.02) { t -= 0.02; c = mix(acc[a], deep, t); }
    return c;
  };
  const palette = {
    paper: s.surface, ink: s.fg, line: s.fg2, charcoal: s.fg, title: s.fg, slate: s.subtle, grey: mix(s.fg, s.bg, 0.16),
    muted: s.comment, frame: s.frame, silver: s.border, smoke: s.surface2, mist: s.surface2,
    ...Object.fromEntries(Object.keys(FILLS).map((n) => [n, fill(n)])),
    // lines and highlights: the pure accents
    red: s.red, coral: mix(s.red, s.fg, 0.75), rust: s.orange, brown: mix(s.orange, s.red, 0.6), bronze: s.yellow,
    emerald: s.green, jade: s.teal, forest: mix(s.green, s.fg, 0.8), teal: s.cyan, azure: s.blueLine || s.blue,
    iris: s.purple, magenta: s.pink,
    border: s.border,
  };
  return shell(s, palette, { background: s.bg, grid: 'rgba(255,255,255,0.06)' });
}

// light: tints over the item surface; lines darkened toward the text until 3:1 on the page (WCAG, graphics)
function buildLight(s, acc) {
  const fill = (name) => {
    const [a, share] = FILLS[name];
    let t = Math.min(0.6, share * 1.15), c = mix(acc[a], s.surface, t);
    while (contrast(s.fg, c) < 4.5 && t > 0.02) { t -= 0.02; c = mix(acc[a], s.surface, t); }
    return c;
  };
  const ink = (c) => { let k = 1, out = c; while (contrast(out, s.bg) < 3 && k > 0.05) { k -= 0.05; out = mix(c, s.fg, k); } return out; };
  const palette = {
    paper: s.surface, ink: s.fg, line: s.fg2, charcoal: s.fg, title: s.fg, slate: s.subtle, grey: mix(s.fg, s.surface, 0.14),
    muted: s.comment, frame: s.frame, silver: s.border, smoke: s.surface2, mist: s.surface2,
    ...Object.fromEntries(Object.keys(FILLS).map((n) => [n, fill(n)])),
    red: ink(s.red), coral: ink(mix(s.red, s.orange, 0.7)), rust: ink(s.orange), brown: ink(mix(s.orange, s.fg, 0.6)), bronze: ink(s.yellow),
    emerald: ink(s.green), jade: ink(s.teal), forest: ink(mix(s.green, s.fg, 0.7)), teal: ink(s.cyan), azure: ink(s.blue),
    iris: ink(s.purple), magenta: ink(s.pink),
    border: s.border,
  };
  // the page grid stays Baseline's (a dark tint): only the page colour changes
  return shell(s, palette, { background: s.bg });
}

function shell(s, palette, grid) {
  const page = { background: s.bg };
  return {
    id: s.id,
    name: `${s.name}`,
    extends: 'default-light',
    appearance: s.appearance || 'dark',
    // the theme of the other appearance shown when the UI switches between light and dark
    counterpart: s.counterpart,
    source: `${s.source} (${s.license}) — generated by tools/build-themes.mjs`,
    palette,
    canvas: { background: s.bg },
    flowchart: {
      pagePresets: { whiteboard: page, grid, technical: grid, slide: page },
      node: { stroke: '@border' },
      groupPresets: { wrapper: { stroke: '@border' }, proxy: { stroke: '@border' }, frame: { stroke: '@border' } },
    },
    sequence: {
      pagePresets: { document: page, spacious: page, mirrored: page },
      participant: { stroke: '@border' }, activation: { stroke: '@border' }, note: { stroke: '@border' }, block: { stroke: '@border' },
      lifeline: { color: '@muted' }, message: { color: '@line' },
    },
    er: {
      pagePresets: { whiteboard: page, schema: grid, slide: page },
      entity: { stroke: '@border' }, rel: { color: '@line' },
    },
  };
}

// ---------------------------------------------------------------- write + report
const root = new URL('../themes/', import.meta.url);
// the manifest lists exactly the house pair and the generated themes, in pairs (light then its dark counterpart)
const HOUSE = ['default-light.theme.json', 'default-dark.theme.json'];
const index = { themes: [...HOUSE] };
for (const s of [...SCHEMES, ...LIGHT_SCHEMES]) {
  const t = build(s);
  writeFileSync(new URL(`${s.id}.theme.json`, root), JSON.stringify(t, null, 2) + '\n');
  index.themes.push(`${s.id}.theme.json`);
  const fills = Object.keys(FILLS).map((n) => contrast(s.fg, t.palette[n]));
  const lines = ['red', 'coral', 'rust', 'bronze', 'emerald', 'jade', 'teal', 'azure', 'iris', 'magenta', 'line'].map((n) => contrast(t.palette[n], s.bg));
  console.log(`${s.id.padEnd(17)} ${(s.appearance || 'dark').padEnd(5)} text/page ${contrast(s.fg, s.bg).toFixed(1)}  text/fills min ${Math.min(...fills).toFixed(2)}  lines/page min ${Math.min(...lines).toFixed(2)}  border/page ${contrast(s.border, s.bg).toFixed(2)}`);
}
// pairs side by side: each light theme, then its dark counterpart
index.themes = [...HOUSE, ...LIGHT_SCHEMES.flatMap((l) => [`${l.id}.theme.json`, `${l.counterpart}.theme.json`])];
writeFileSync(new URL('index.json', root), JSON.stringify(index, null, 2) + '\n');
