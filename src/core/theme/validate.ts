// Theme file validation (§8.3, §12). Theme JSON may come from a store the host does not control: every style value
// goes through the same validators as `%%@` metadata, fonts must be family names, palette entries must be colour
// literals. Invalid values are dropped with a diagnostic; unknown keys are kept (renderers never read them).
import { sanitizeStyleObject } from '../meta/sanitize.js';
import { currentThemeId } from './builtin-ids.js';
import { diag } from '../types.js';
import type { Diagnostic } from '../types.js';
import { cleanFontFamily, isColorLiteral } from '../validate.js';
import { THEME_SCHEMA_VERSION } from './types.js';
import type { ThemeFile } from './types.js';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

const bad = (path: string, why = 'invalid value'): Diagnostic =>
  diag('warning', 'theme.bad-value', `${why} for "${path}" — ignored`, undefined, { params: { key: path } });

/** Steps that turn a theme file of `schemaVersion` n into n + 1. None yet: a file without the field is v1. */
const UPGRADES: Readonly<Record<number, (t: ThemeFile) => ThemeFile>> = {};

export function migrateTheme(file: ThemeFile): ThemeFile {
  const from = file.schemaVersion ?? 1;
  if (!Number.isInteger(from) || from >= THEME_SCHEMA_VERSION) return file;
  let t = file;
  for (let v = Math.max(1, from); v < THEME_SCHEMA_VERSION; v++) t = UPGRADES[v]?.(t) ?? t;
  return t;
}

function cleanStyle(v: unknown, path: string, out: Diagnostic[]): Record<string, unknown> | undefined {
  if (!isObj(v)) {
    out.push(bad(path));
    return undefined;
  }
  const r = sanitizeStyleObject(v);
  for (const p of r.dropped) out.push(bad(`${path}.${p}`));
  return r.value;
}

function cleanRecord(v: unknown, path: string, out: Diagnostic[]): Record<string, unknown> | undefined {
  if (!isObj(v)) {
    out.push(bad(path));
    return undefined;
  }
  const res: Record<string, unknown> = {};
  for (const [name, s] of Object.entries(v)) {
    const c = cleanStyle(s, `${path}.${name}`, out);
    if (c) res[name] = c;
  }
  return res;
}

// flowchart / sequence / er: item blocks are style objects; `…Presets`, `…Shapes` and `pagePresets` are records of
// them; `sequence.layout` holds numbers checked by the same table.
function cleanSection(v: unknown, path: string, out: Diagnostic[]): Record<string, unknown> | undefined {
  if (!isObj(v)) {
    out.push(bad(path));
    return undefined;
  }
  const res: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    const c = /(?:Presets|Shapes)$/.test(k) ? cleanRecord(x, `${path}.${k}`, out) : cleanStyle(x, `${path}.${k}`, out);
    if (c) res[k] = c;
  }
  return res;
}

const SECTIONS = new Set(['flowchart', 'sequence', 'er']);

/**
 * Validates and cleans a theme file. `theme` is null when the input cannot be a theme at all (not an object, no
 * id); otherwise it is a deep copy without the values that failed, migrated to the current schema version.
 */
export function validateTheme(input: unknown): { theme: ThemeFile | null; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  if (!isObj(input)) return { theme: null, diagnostics: [diag('error', 'theme.not-object', 'a theme file must be a JSON object')] };
  const id = input['id'];
  if (typeof id !== 'string' || !id.trim() || id.length > 100 || /[\u0000-\u001f\u007f]/.test(id))
    return { theme: null, diagnostics: [diag('error', 'theme.missing-id', 'a theme needs an "id"')] };

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    switch (k) {
      case 'id':
        // earlier ids of the built-in themes (baseline, studio-dark) become the current ones
        out[k] = currentThemeId(v as string);
        break;
      case 'name':
        if (typeof v === 'string' && v.length <= 200) out[k] = v.replace(CONTROL, '');
        else diagnostics.push(bad(k));
        break;
      case 'extends':
        if (typeof v === 'string' && v.length <= 200) out[k] = currentThemeId(v.replace(CONTROL, ''));
        else diagnostics.push(bad(k));
        break;
      case 'appearance':
        if (v === 'light' || v === 'dark') out[k] = v;
        else diagnostics.push(bad(k));
        break;
      case 'counterpart':
        // the linked theme of the other appearance: an id, never the theme itself
        if (typeof v === 'string' && /^[\w.-]{1,100}$/.test(v) && currentThemeId(v) !== currentThemeId(id)) out[k] = currentThemeId(v);
        else diagnostics.push(bad(k, 'not a theme id'));
        break;
      case 'schemaVersion':
        if (Number.isInteger(v) && (v as number) >= 1) out[k] = v;
        else diagnostics.push(bad(k));
        break;
      case 'font':
        if (cleanFontFamily(v) !== undefined) out[k] = v;
        else diagnostics.push(bad(k, 'not a font family list'));
        break;
      case 'palette': {
        if (!isObj(v)) {
          diagnostics.push(bad(k));
          break;
        }
        const pal: Record<string, string> = {};
        for (const [name, c] of Object.entries(v)) {
          // palette entries are what references resolve to: literal colours under referenceable names
          if (/^[\w-]+$/.test(name) && isColorLiteral(c)) pal[name] = c;
          else diagnostics.push(bad(`palette.${name}`));
        }
        out[k] = pal;
        break;
      }
      case 'canvas': {
        const c = cleanStyle(v, k, diagnostics);
        if (c) out[k] = c;
        break;
      }
      default:
        if (SECTIONS.has(k)) {
          const c = cleanSection(v, k, diagnostics);
          if (c) out[k] = c;
        } else out[k] = clone(v);
    }
  }
  const theme = out as unknown as ThemeFile;
  if ((theme.schemaVersion ?? 1) > THEME_SCHEMA_VERSION)
    diagnostics.push(diag('info', 'theme.newer-version', `theme schema version ${theme.schemaVersion} is newer than this component (${THEME_SCHEMA_VERSION})`));
  return { theme: migrateTheme(theme), diagnostics };
}
