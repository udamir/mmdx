#!/usr/bin/env node
// mmdx-icons (T04 §4.9): builds an Iconify JSON icon pack from a cloud provider's official SVG download, with the icon
// names Mermaid Chart writes, for `configure({ iconPacks })` and Mermaid's `registerIconPacks`:
//
//   npx mmdx-icons build --from ./Azure_Public_Service_Icons --prefix azure --naming azure --out azure.json
//
// `--naming` is a provider (azure, aws, gcp: tools/icons/naming/<provider>.json) or a naming table of your own (a JSON
// file); `--dry-run` prints the names without writing. The packs are not part of mmdx: the providers' terms allow the
// icons in diagrams, not their redistribution in a library.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackFromDir, planNames, readNaming, svgFiles } from './icons/convert.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = `Usage: mmdx-icons build --from <dir> --prefix <name> --naming <azure|aws|gcp|table.json> [--out <file.json>] [--name <title>] [--dry-run]`;

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '--help' || a === '-h') o[a.replace(/^-+/, '')] = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o._.push(a);
  }
  return o;
}

function fail(msg) {
  console.error(`mmdx-icons: ${msg}\n${USAGE}`);
  process.exit(1);
}

const o = args(process.argv.slice(2));
if (o.help || o.h) {
  console.log(USAGE);
  process.exit(0);
}
if (o._[0] !== 'build') fail('the only command is "build"');
if (!o.from || !existsSync(o.from) || !statSync(o.from).isDirectory()) fail('--from must be a folder of SVG files');
if (!o.prefix || !/^[a-z][\w-]*$/i.test(o.prefix)) fail('--prefix must be a pack name (letters, digits, - and _)');
if (!o.naming) fail('--naming is required');
const table = /^[\w-]+$/.test(o.naming) ? join(HERE, 'icons', 'naming', `${o.naming}.json`) : o.naming;
if (!existsSync(table)) fail(`no naming table "${o.naming}" (azure, aws, gcp or a JSON file)`);
const naming = readNaming(readFileSync(table, 'utf8'));

if (o['dry-run']) {
  const plan = planNames(svgFiles(o.from), naming);
  for (const { file, name } of plan.names) console.log(`${o.prefix}:${name}\t${file}`);
  for (const d of plan.dropped) console.log(`# ${d.file}: ${o.prefix}:${d.name} is ${d.kept}`);
  for (const f of plan.skipped) console.log(`# skipped ${f}`);
  process.exit(0);
}

if (!o.out) fail('--out is required (or --dry-run)');
const r = buildPackFromDir(o.from, { prefix: o.prefix, naming, ...(o.name ? { name: o.name } : {}) });
writeFileSync(o.out, `${JSON.stringify(r.pack)}\n`);
for (const e of r.errors) console.warn(`mmdx-icons: ${e.file}: ${e.error}`);
console.log(`mmdx-icons: ${Object.keys(r.pack.icons).length} icons → ${o.out} (${r.dropped.length} duplicates: other sizes, variants or categories; ${r.skipped.length} skipped, ${r.errors.length} failed)`);
