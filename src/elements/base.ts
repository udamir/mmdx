// Importing an element module must not throw outside a browser (SSR frameworks import components on the server;
// Node build scripts import entry points). Elements extend this instead of HTMLElement directly.
export const ElementBase: typeof HTMLElement =
  typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as unknown as typeof HTMLElement);
