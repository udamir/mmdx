// Types of convert.mjs (the cloud icon pack converter), for the tests.
export interface Naming {
  provider: string;
  strip: RegExp[];
  camelCase: boolean;
  skip: RegExp[];
  prefer: RegExp[];
  categoryStrip: RegExp[];
  categorySkip: RegExp[];
  overrides: Record<string, string>;
}
export interface PackIcon {
  body: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}
export interface Pack {
  prefix: string;
  info: { name: string; palette: boolean };
  width: number;
  height: number;
  icons: Record<string, PackIcon>;
  categories?: Record<string, string[]>;
  keywords?: Record<string, string[]>;
}
export function readNaming(json: string | object): Naming;
export function iconName(file: string, naming: Naming): string;
export function categoryOf(file: string, naming: Naming): string;
export function keywordsOf(file: string, naming: Naming, name: string): string[];
export function normalizeSvg(svg: string, idPrefix: string): { body: string; left: number; top: number; width: number; height: number };
export function svgFiles(dir: string): string[];
export function planNames(files: readonly string[], naming: Naming): {
  names: { file: string; name: string }[];
  skipped: string[];
  dropped: { file: string; name: string; kept: string }[];
};
export function buildPack(files: readonly string[], read: (file: string) => string, o: { prefix: string; naming: Naming; name?: string }): {
  pack: Pack;
  skipped: string[];
  dropped: { file: string; name: string; kept: string }[];
  errors: { file: string; error: string }[];
};
export function buildPackFromDir(dir: string, o: { prefix: string; naming: Naming; name?: string }): ReturnType<typeof buildPack>;
