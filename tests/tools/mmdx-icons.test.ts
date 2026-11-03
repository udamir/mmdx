// The cloud icon pack converter (T04.8): Mermaid Chart-compatible names from the providers' official file names
// (table-driven, with overrides), categories and keywords from folders and file names, the size and variant that wins,
// SVG normalisation (view box, inlined class rules, prefixed ids), and the pack it builds — which mmdx's registry then
// draws.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createIconRegistry } from '../../src/core/icons/index.js';
import type { IconifyJSON } from '../../src/core/icons/types.js';
import { buildPack, categoryOf, iconName, keywordsOf, normalizeSvg, planNames, readNaming } from '../../tools/icons/convert.mjs';

const ROOT = join(__dirname, '../..');
const table = (p: string): ReturnType<typeof readNaming> => readNaming(readFileSync(join(ROOT, 'tools/icons/naming', `${p}.json`), 'utf8'));
const AZURE = table('azure'), AWS = table('aws'), GCP = table('gcp');

describe('naming tables', () => {
  it('Azure: the number and icon-service- go, the rest is kebab-cased', () => {
    const cases: [string, string][] = [
      ['Azure_Public_Service_Icons/Icons/ai + machine learning/10044-icon-service-Computer-Vision.svg', 'computer-vision'],
      ['Icons/compute/10021-icon-service-Virtual-Machine.svg', 'virtual-machine'],
      ['Icons/databases/10121-icon-service-Azure-Cosmos-DB.svg', 'azure-cosmos-db'],
      ['Icons/web/10035-icon-service-App-Services.svg', 'app-services'],
      ['Icons/storage/10086-icon-service-Storage-Accounts-(Classic).svg', 'storage-accounts-classic'],
      ['Icons/other/02371-icon-service-Azure-Monitor-Pipeline.svg', 'azure-monitor-pipeline'],
    ];
    for (const [file, name] of cases) expect(iconName(file, AZURE), file).toBe(name);
    expect(categoryOf('Azure_Public_Service_Icons/Icons/ai + machine learning/10044-icon-service-Computer-Vision.svg', AZURE)).toBe('Ai Machine Learning');
    expect(keywordsOf('Icons/ai + machine learning/10044-icon-service-Computer-Vision.svg', AZURE, 'computer-vision')).toEqual(['ai', 'machine', 'learning']);
    expect(keywordsOf('A/Arch_Compute/64/Arch_Amazon-EC2_64.svg', AWS, 'amazon-ec2')).toEqual(['compute']);
  });

  it('AWS: Arch_ / Res_ prefixes, sizes and Light / Dark go; the largest size and Light win', () => {
    const cases: [string, string][] = [
      ['Architecture-Service-Icons_02072025/Arch_Compute/64/Arch_Amazon-EC2_64.svg', 'amazon-ec2'],
      ['Architecture-Service-Icons_02072025/Arch_Storage/48/Arch_Amazon-Simple-Storage-Service_48.svg', 'amazon-simple-storage-service'],
      ['Resource-Icons_02072025/Res_Compute/Res_Amazon-EC2_Instance_48.svg', 'amazon-ec2-instance'],
      ['Resource-Icons_02072025/Res_General-Icons/Res_48_Light/Res_Users_48_Light.svg', 'users'],
      ['Category-Icons_02072025/Arch-Category_64/Arch-Category_Compute_64.svg', 'category-compute'],
      ['Architecture-Service-Icons_02072025/Arch_App-Integration/64/Arch_AWS-Step-Functions_64@5x.svg', 'aws-step-functions'],
    ];
    for (const [file, name] of cases) expect(iconName(file, AWS), file).toBe(name);
    expect(categoryOf('Architecture-Service-Icons_02072025/Arch_App-Integration/64/Arch_AWS-Step-Functions_64.svg', AWS)).toBe('App Integration');
    const plan = planNames([
      'A/Arch_Compute/16/Arch_Amazon-EC2_16.svg',
      'A/Arch_Compute/64/Arch_Amazon-EC2_64.svg',
      'A/Arch_Compute/32/Arch_Amazon-EC2_32.svg',
      'R/Res_General-Icons/Res_Users_48_Dark.svg',
      'R/Res_General-Icons/Res_Users_48_Light.svg',
      'R/.DS_Store.svg',
    ], AWS);
    expect(plan.names).toEqual([
      { file: 'A/Arch_Compute/64/Arch_Amazon-EC2_64.svg', name: 'amazon-ec2' },
      { file: 'R/Res_General-Icons/Res_Users_48_Light.svg', name: 'users' },
    ]);
    expect(plan.dropped).toHaveLength(3);
    expect(plan.skipped).toEqual(['R/.DS_Store.svg']);
  });

  it('Google Cloud: size and colour suffixes go, CamelCase is split', () => {
    const cases: [string, string][] = [
      ['compute_engine/SVG/ComputeEngine-512-color-rgb.svg', 'compute-engine'],
      ['Cloud Run/SVG/CloudRun-512-color.svg', 'cloud-run'],
      ['bigquery/SVG/BigQuery-512-color.svg', 'big-query'],
      ['core/cloud_run.svg', 'cloud-run'],
      ['AI/VertexAI-512-color.svg', 'vertex-ai'],
    ];
    for (const [file, name] of cases) expect(iconName(file, GCP), file).toBe(name);
    expect(categoryOf('compute_engine/SVG/ComputeEngine-512-color-rgb.svg', GCP)).toBe('');
    expect(planNames(['x/SVG/CloudRun-512-color.svg', 'x/SVG/CloudRun-512-color-rgb.svg'], GCP).names).toEqual([{ file: 'x/SVG/CloudRun-512-color-rgb.svg', name: 'cloud-run' }]);
  });

  it('overrides win; tables are checked', () => {
    const n = readNaming({ strip: ['^\\d+-icon-service-'], overrides: { '10044-icon-service-Computer-Vision': 'vision' } });
    expect(iconName('x/10044-icon-service-Computer-Vision.svg', n)).toBe('vision');
    expect(() => readNaming({ strip: 'x' })).toThrow(/strip/);
    expect(() => readNaming({ overrides: [] })).toThrow(/overrides/);
  });
});

describe('normalizeSvg', () => {
  it('reads the view box, inlines class rules, prefixes ids and drops metadata', () => {
    const svg = `<?xml version="1.0"?><!-- c --><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="18" height="18" viewBox="0 0 18 18">
      <title>Computer Vision</title><defs><style>.a{fill:url(#b);}.c,.d{fill:#fff}</style><linearGradient id="b"><stop offset="0" stop-color="#32bedd"/></linearGradient></defs>
      <path class="a" d="M0 0h18v18z"/><circle class="c" style="opacity:.5" cx="9" cy="9" r="3" data-name="x"/><use xlink:href="#b"/></svg>`;
    expect(normalizeSvg(svg, 'azure-cv-')).toEqual({
      body: '<defs><linearGradient id="azure-cv-b"><stop offset="0" stop-color="#32bedd"/></linearGradient></defs><path d="M0 0h18v18z" style="fill:url(#azure-cv-b)"/><circle cx="9" cy="9" r="3" style="fill:#fff;opacity:.5"/><use xlink:href="#azure-cv-b"/>',
      left: 0, top: 0, width: 18, height: 18,
    });
    expect(normalizeSvg('<svg width="48px" height="32px"><rect width="4" height="4"/></svg>', 'p-')).toMatchObject({ width: 48, height: 32 });
    expect(() => normalizeSvg('<html/>', 'p-')).toThrow();
    expect(() => normalizeSvg('<svg><path/></svg>', 'p-')).toThrow(/size/);
  });
});

describe('buildPack', () => {
  const files: Record<string, string> = {
    'Icons/ai + machine learning/10044-icon-service-Computer-Vision.svg': '<svg viewBox="0 0 18 18"><defs><linearGradient id="a"><stop offset="0" stop-color="#32bedd"/></linearGradient></defs><path fill="url(#a)" d="M0 0h18v18z"/></svg>',
    'Icons/compute/10021-icon-service-Virtual-Machine.svg': '<svg viewBox="0 0 18 18"><path fill="#0078d4" d="M1 1h16v16z"/></svg>',
    'Icons/compute/10022-icon-service-Wide.svg': '<svg viewBox="0 0 36 18"><path fill="#0078d4" d="M1 1h34v16z"/></svg>',
    'Icons/compute/10023-icon-service-Broken.svg': 'not svg',
  };

  it('builds an Iconify pack that the registry draws (azure:computer-vision)', async () => {
    const r = buildPack(Object.keys(files), (f) => files[f]!, { prefix: 'azure', naming: AZURE });
    expect(r.errors).toEqual([{ file: 'Icons/compute/10023-icon-service-Broken.svg', error: 'not an SVG document' }]);
    expect(r.pack).toMatchObject({ prefix: 'azure', width: 18, height: 18, info: { name: 'Azure icons', palette: true } });
    expect(Object.keys(r.pack.icons).sort()).toEqual(['computer-vision', 'virtual-machine', 'wide']);
    expect(r.pack.icons['wide']).toMatchObject({ width: 36 });
    expect(r.pack.icons['computer-vision']).not.toHaveProperty('width');
    expect(r.pack.categories).toEqual({ 'Ai Machine Learning': ['computer-vision'], Compute: ['virtual-machine', 'wide'] });
    const reg = createIconRegistry([{ name: 'azure', icons: r.pack as IconifyJSON }], { builtin: false });
    expect(reg.resolve('azure:computer-vision Vision')).toBeNull();
    expect(reg.resolve('azure:computer-vision')).toBe('azure:computer-vision');
    expect(reg.get('azure:computer-vision')).toMatchObject({ status: 'ready', icon: { mono: false, width: 18 } });
  });

  it('the CLI writes the pack (and lists names with --dry-run)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mmdx-icons-'));
    try {
      for (const [f, svg] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, 'in', f)), { recursive: true });
        writeFileSync(join(dir, 'in', f), svg);
      }
      const cli = join(ROOT, 'tools/mmdx-icons.mjs');
      const out = join(dir, 'azure.json');
      const log = execFileSync(process.execPath, [cli, 'build', '--from', join(dir, 'in'), '--prefix', 'azure', '--naming', 'azure', '--out', out], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      expect(log).toMatch(/3 icons/);
      expect(Object.keys((JSON.parse(readFileSync(out, 'utf8')) as IconifyJSON).icons).sort()).toEqual(['computer-vision', 'virtual-machine', 'wide']);
      const dry = execFileSync(process.execPath, [cli, 'build', '--from', join(dir, 'in'), '--prefix', 'azure', '--naming', 'azure', '--dry-run'], { encoding: 'utf8' });
      expect(dry).toContain('azure:computer-vision\tIcons/ai + machine learning/10044-icon-service-Computer-Vision.svg');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
