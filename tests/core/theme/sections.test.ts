// The theme sections against the kinds' declarations (A11a, with A17): the base theme holds, for each item kind a
// diagram type declares (OpsKind.theme.slots), its defaults at the slot (the other themes are merged over it, so they
// hold only what they change), and every theme's presets at `<slot>Presets` hold only look and layout keys of the
// metadata registry (META_KEYS) with values its cleaners accept — the keys a preset may set.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPS as ER } from '../../../src/core/kinds/er-ops.js';
import { OPS as FLOW } from '../../../src/core/kinds/flowchart-ops.js';
import { OPS as MIND } from '../../../src/core/kinds/mindmap-ops.js';
import { OPS as SEQ } from '../../../src/core/kinds/sequence-ops.js';
import { OPS as STATE } from '../../../src/core/kinds/state-ops.js';
import { CLEANERS, DROP, classOf, keyDef } from '../../../src/core/meta/keys.js';
import { BASE_THEME_ID } from '../../../src/core/theme/builtin-ids.js';

const DIR = join(__dirname, '../../../themes');
const THEMES = readdirSync(DIR).filter((f) => f.endsWith('.theme.json')).map((f) => [f, JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Record<string, unknown>] as const);
const at = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o);

/** Keys a theme preset may set beyond the registry's look keys: the preset's own label (shown in pickers). */
const PRESET_EXTRA = new Set(['label']);
/** The theme every other one is merged over. */
const BASE = BASE_THEME_ID;

describe('theme sections against the kinds\' declarations', () => {
  const slots = [FLOW, SEQ, ER, MIND, STATE].flatMap((k) => Object.entries(k.theme.slots).map(([kind, slot]) => ({ type: k.type, kind, slot: slot! })));

  it('the kinds declare their slots', () => {
    expect(slots.length).toBeGreaterThan(15);
  });

  it.each(THEMES)('%s: the declared slots (the base theme: with defaults); presets hold only look keys with valid values', (file, theme) => {
    const bad: string[] = [];
    for (const { slot } of slots) {
      if (file === `${BASE}.theme.json` && (!at(theme, slot) || typeof at(theme, slot) !== 'object')) bad.push(`${slot}: no defaults`);
      const presets = at(theme, `${slot}Presets`);
      if (presets === undefined) continue;
      for (const [name, p] of Object.entries(presets as Record<string, Record<string, unknown>>))
        for (const [k, v] of Object.entries(p)) {
          if (PRESET_EXTRA.has(k)) continue;
          if (!keyDef(k)) bad.push(`${slot}Presets.${name}.${k}: not a registry key`);
          else if (classOf(k) !== 'look' && classOf(k) !== 'layout') bad.push(`${slot}Presets.${name}.${k}: a ${classOf(k)} key`);
          else if (CLEANERS[k]!(v) === DROP) bad.push(`${slot}Presets.${name}.${k}: ${JSON.stringify(v)} is not accepted`);
        }
    }
    expect(bad).toEqual([]);
  });
});
