import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildMerged, DEL_CLOSE, DEL_OPEN, INS_CLOSE, INS_OPEN, mergeText, stripMarks } from '../../../apps/studio-site/diff/merge.js';
import { diffModels } from '../../../src/core/diff/index.js';
import { splitSource } from '../../../src/core/meta/index.js';
import type { ErModel, FlowchartModel, SequenceModel, SupportedModel } from '../../../src/core/model.js';
import { parse } from '../../../src/core/parse/index.js';

const load = (name: string) => {
  const [a, b] = ['before', 'after'].map((s) => splitSource(readFileSync(`apps/studio-site/diff-samples/${name}.${s}.mmd`, 'utf8')).doc);
  const ma = parse(a!.code) as SupportedModel, mb = parse(b!.code) as SupportedModel;
  return buildMerged(diffModels(ma, mb, a!.meta, b!.meta), ma, mb, a!.meta, b!.meta)!;
};

describe('mergeText', () => {
  it('marks removed and added words', () => {
    expect(mergeText('Load Balancer', 'Load Balancer (L7)')).toBe(`Load Balancer ${INS_OPEN}(L7)${INS_CLOSE}`);
    const m = mergeText('GET Request to inspect network by name', 'GET /networks/{name}');
    expect(m).toBe(`GET ${DEL_OPEN}Request to inspect network by name${DEL_CLOSE} ${INS_OPEN}/networks/{name}${INS_CLOSE}`);
    expect(mergeText('same', 'same')).toBe('same');
    expect(mergeText('Order\nservice', 'Order\nworker')).toBe(`Order\n${DEL_OPEN}service${DEL_CLOSE} ${INS_OPEN}worker${INS_CLOSE}`);
  });
});

describe('buildMerged', () => {
  it('flowchart: keeps removed nodes and edges, marks relabels', () => {
    const m = load('architecture');
    const f = m.model as FlowchartModel;
    expect(f.nodes.get('desktop~del')?.label).toBe(`${DEL_OPEN}Desktop${DEL_CLOSE}`);
    expect(f.edges.find((e) => e.id === 'desktop->gw~del')).toMatchObject({ from: 'desktop~del', to: 'gw' });
    expect(stripMarks(f.nodes.get('lb')!.label)).toBe('Load Balancer (L7)');
    expect(m.meta.nodes?.['desktop~del']).toMatchObject({ x: 665, y: 110 });
    expect(m.status.get('node:desktop~del')?.status).toBe('removed');
  });

  it('sequence: removed messages stay in order next to their old neighbours', () => {
    const s = load('sequence').model as SequenceModel;
    const texts = s.items.filter((x) => x.kind === 'message').map((x) => (x.kind === 'message' ? stripMarks(x.text) : ''));
    const i = texts.indexOf('Parsing volume from description file');
    expect(texts[i - 1]).toBe('Parsing volume');
    expect(texts[i + 1]).toBe('Save volume to Repository');
  });

  it('ER: removed attributes return in place, changed types are marked', () => {
    const m = load('schema').model as ErModel;
    const names = m.entities.get('user')!.attrs.map((a) => a.name);
    // like a text diff: removed rows first, then the added ones
    expect(names.map(stripMarks)).toEqual(['id', 'username', 'email', 'sha1_password', 'salt', 'password_hash', 'last_login_at']);
    expect(names[3]).toBe(`${DEL_OPEN}sha1_password${DEL_CLOSE}`);
    expect(names[5]).toBe(`${INS_OPEN}password_hash${INS_CLOSE}`);
    expect(m.entities.get('acl_group_i18n')!.attrs[0]!.type).toContain(DEL_OPEN);
  });
});
