/// <reference types="vite/client" />
// Shared story fixtures: the shipped examples and themes, and a shadow-root host for the chrome pieces
// (they are styled for the components' shadow roots, through the --ds-* tokens).
import { ALIASES, adoptStyles, BASE, TOKENS } from '../src/ui/styles/base.js';
import { BUILTIN_THEMES } from '../src/core/theme/builtin.js';
import type { ThemeFile } from '../src/core/theme/types.js';
import themeIndex from '../themes/index.json';

const raw = import.meta.glob<string>('../examples/*.mmd', { eager: true, query: '?raw', import: 'default' });

/** Example sources by file name without the extension (`production-microservices`, …). */
export const EXAMPLES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(raw).map(([path, src]) => [path.replace(/^.*\/|\.mmd$/g, ''), src]),
);

export const example = (name: string): string => {
  const src = EXAMPLES[name];
  if (src === undefined) throw new Error(`No example "${name}"`);
  return src;
};

/** Every shipped theme: the two built-ins plus the theme files (the built-ins' JSON is imported by src already). */
export const THEME_FILES: readonly ThemeFile[] = [
  ...BUILTIN_THEMES,
  ...Object.values(import.meta.glob<ThemeFile>(['../themes/*.theme.json', '!**/default-*.theme.json'], { eager: true, import: 'default' })),
];

/** Theme ids in manifest order. */
export const THEME_IDS: readonly string[] = themeIndex.themes.map((f) => f.replace(/\.theme\.json$/, ''));

export const SMALL_FLOW = `flowchart LR
  a([Start]) --> b{Valid?}
  b -->|yes| c[Process]
  b -->|no| d[Reject]
  c --> e[(Store)]`;

export const SMALL_SEQUENCE = `sequenceDiagram
  autonumber
  participant U as User
  participant A as API
  participant D as Database
  U->>A: GET /orders
  activate A
  A->>D: select orders
  D-->>A: rows
  A-->>U: 200 OK
  deactivate A
  Note over U,A: cached for 60 s`;

export const SMALL_ER = `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  PRODUCT ||--o{ LINE_ITEM : "ordered in"
  CUSTOMER {
    string id PK
    string name
    string email
  }
  ORDER {
    string id PK
    string customer_id FK
    date created
  }
  LINE_ITEM {
    string order_id FK
    string product_id FK
    int quantity
  }
  PRODUCT {
    string id PK
    string title
    decimal price
  }`;

/**
 * A host element with an open shadow root that has the chrome tokens and the given component CSS adopted.
 * `ui` sets the light / dark chrome scheme, as on the elements.
 */
export function chromeHost(css: readonly string[], opts: { ui?: 'light' | 'dark'; style?: string } = {}): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement('div');
  host.dataset['ui'] = opts.ui ?? 'light';
  host.style.cssText = `display:block;position:relative;box-sizing:border-box;min-height:100vh;padding:24px;${opts.style ?? ''}`;
  const root = host.attachShadow({ mode: 'open' });
  adoptStyles(root, [TOKENS, ALIASES, BASE, ':host{background:var(--ds-bg);}', ...css]);
  return { host, root };
}

/** Light / dark chrome control shared by the stories. */
export const uiArg = {
  control: 'inline-radio',
  options: ['light', 'dark', 'auto'],
  description: 'Chrome colour scheme (`ui` attribute).',
} as const;
